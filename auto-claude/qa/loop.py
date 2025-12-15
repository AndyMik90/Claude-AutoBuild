"""
QA Validation Loop Orchestration
=================================

Main QA loop that coordinates reviewer and fixer sessions until
approval or max iterations.
"""

import time as time_module
from pathlib import Path

from client import create_client
from linear_updater import (
    LinearTaskState,
    is_linear_enabled,
    linear_qa_approved,
    linear_qa_max_iterations,
    linear_qa_rejected,
    linear_qa_started,
)
from progress import count_subtasks, is_build_complete
from task_logger import (
    LogPhase,
    get_task_logger,
)

from .criteria import (
    get_qa_iteration_count,
    get_qa_signoff_status,
    is_qa_approved,
)
from .fixer import run_qa_fixer_session
from .report import (
    create_manual_test_plan,
    escalate_to_human,
    get_iteration_history,
    get_recurring_issue_summary,
    has_recurring_issues,
    is_no_test_project,
    record_iteration,
)
from .reviewer import run_qa_agent_session

# Configuration
MAX_QA_ITERATIONS = 50


# =============================================================================
# QA VALIDATION LOOP
# =============================================================================


async def run_qa_validation_loop(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    verbose: bool = False,
) -> bool:
    """
    Run the full QA validation loop.

    This is the self-validating loop:
    1. QA Agent reviews
    2. If rejected → Fixer Agent fixes
    3. QA Agent re-reviews
    4. Loop until approved or max iterations

    Enhanced with:
    - Iteration tracking with detailed history
    - Recurring issue detection (3+ occurrences → human escalation)
    - No-test project handling

    Args:
        project_dir: Project root directory
        spec_dir: Spec directory
        model: Claude model to use
        verbose: Whether to show detailed output

    Returns:
        True if QA approved, False otherwise
    """
    print("\n" + "=" * 70)
    print("  QA VALIDATION LOOP")
    print("  Self-validating quality assurance")
    print("=" * 70)

    # Initialize task logger for the validation phase
    task_logger = get_task_logger(spec_dir)

    # Verify build is complete
    if not is_build_complete(spec_dir):
        print("\n❌ Build is not complete. Cannot run QA validation.")
        completed, total = count_subtasks(spec_dir)
        print(f"   Progress: {completed}/{total} subtasks completed")
        return False

    # Check if already approved
    if is_qa_approved(spec_dir):
        print("\n✅ Build already approved by QA.")
        return True

    # Check for no-test projects
    if is_no_test_project(spec_dir, project_dir):
        print("\n⚠️  No test framework detected in project.")
        print("Creating manual test plan...")
        manual_plan = create_manual_test_plan(spec_dir, spec_dir.name)
        print(f"📝 Manual test plan created: {manual_plan}")
        print("\nNote: Automated testing will be limited for this project.")

    # Start validation phase in task logger
    if task_logger:
        task_logger.start_phase(LogPhase.VALIDATION, "Starting QA validation...")

    # Check Linear integration status
    linear_task = None
    if is_linear_enabled():
        linear_task = LinearTaskState.load(spec_dir)
        if linear_task and linear_task.task_id:
            print(f"Linear task: {linear_task.task_id}")
            # Update Linear to "In Review" when QA starts
            await linear_qa_started(spec_dir)
            print("Linear task moved to 'In Review'")

    qa_iteration = get_qa_iteration_count(spec_dir)

    while qa_iteration < MAX_QA_ITERATIONS:
        qa_iteration += 1
        iteration_start = time_module.time()

        print(f"\n--- QA Iteration {qa_iteration}/{MAX_QA_ITERATIONS} ---")

        # Run QA reviewer
        client = create_client(project_dir, spec_dir, model)

        async with client:
            status, response = await run_qa_agent_session(
                client, spec_dir, qa_iteration, MAX_QA_ITERATIONS, verbose
            )

        iteration_duration = time_module.time() - iteration_start

        if status == "approved":
            # Record successful iteration
            record_iteration(spec_dir, qa_iteration, "approved", [], iteration_duration)

            print("\n" + "=" * 70)
            print("  ✅ QA APPROVED")
            print("=" * 70)
            print("\nAll acceptance criteria verified.")
            print("The implementation is production-ready.")
            print("\nNext steps:")
            print("  1. Review the auto-claude/* branch")
            print("  2. Create a PR and merge to main")

            # End validation phase successfully
            if task_logger:
                task_logger.end_phase(
                    LogPhase.VALIDATION,
                    success=True,
                    message="QA validation passed - all criteria met",
                )

            # Update Linear: QA approved, awaiting human review
            if linear_task and linear_task.task_id:
                await linear_qa_approved(spec_dir)
                print("\nLinear: Task marked as QA approved, awaiting human review")

            return True

        elif status == "rejected":
            print(f"\n❌ QA found issues. Iteration {qa_iteration}/{MAX_QA_ITERATIONS}")

            # Get issues from QA report
            qa_status = get_qa_signoff_status(spec_dir)
            current_issues = qa_status.get("issues_found", []) if qa_status else []

            # Record rejected iteration
            record_iteration(
                spec_dir, qa_iteration, "rejected", current_issues, iteration_duration
            )

            # Check for recurring issues
            history = get_iteration_history(spec_dir)
            has_recurring, recurring_issues = has_recurring_issues(
                current_issues, history
            )

            if has_recurring:
                from .report import RECURRING_ISSUE_THRESHOLD

                print(
                    f"\n⚠️  Recurring issues detected ({len(recurring_issues)} issue(s) appeared {RECURRING_ISSUE_THRESHOLD}+ times)"
                )
                print("Escalating to human review due to recurring issues...")

                # Create escalation file
                await escalate_to_human(spec_dir, recurring_issues, qa_iteration)

                # End validation phase
                if task_logger:
                    task_logger.end_phase(
                        LogPhase.VALIDATION,
                        success=False,
                        message=f"QA escalated to human after {qa_iteration} iterations due to recurring issues",
                    )

                # Update Linear
                if linear_task and linear_task.task_id:
                    await linear_qa_max_iterations(spec_dir, qa_iteration)
                    print(
                        "\nLinear: Task marked as needing human intervention (recurring issues)"
                    )

                return False

            # Record rejection in Linear
            if linear_task and linear_task.task_id:
                issues_count = len(current_issues)
                await linear_qa_rejected(spec_dir, issues_count, qa_iteration)

            if qa_iteration >= MAX_QA_ITERATIONS:
                print("\n⚠️  Maximum QA iterations reached.")
                print("Escalating to human review.")
                break

            # Run fixer
            print("\nRunning QA Fixer Agent...")

            fix_client = create_client(project_dir, spec_dir, model)

            async with fix_client:
                fix_status, fix_response = await run_qa_fixer_session(
                    fix_client, spec_dir, qa_iteration, verbose
                )

            if fix_status == "error":
                print(f"\n❌ Fixer encountered error: {fix_response}")
                record_iteration(
                    spec_dir,
                    qa_iteration,
                    "error",
                    [{"title": "Fixer error", "description": fix_response}],
                )
                break

            print("\n✅ Fixes applied. Re-running QA validation...")

        elif status == "error":
            print(f"\n❌ QA error: {response}")
            record_iteration(
                spec_dir,
                qa_iteration,
                "error",
                [{"title": "QA error", "description": response}],
            )
            print("Retrying...")

    # Max iterations reached without approval
    print("\n" + "=" * 70)
    print("  ⚠️  QA VALIDATION INCOMPLETE")
    print("=" * 70)
    print(f"\nReached maximum iterations ({MAX_QA_ITERATIONS}) without approval.")
    print("\nRemaining issues require human review:")

    # Show iteration summary
    history = get_iteration_history(spec_dir)
    summary = get_recurring_issue_summary(history)
    if summary["total_issues"] > 0:
        print("\n📊 Iteration Summary:")
        print(f"   Total iterations: {len(history)}")
        print(f"   Total issues found: {summary['total_issues']}")
        print(f"   Unique issues: {summary['unique_issues']}")
        if summary.get("most_common"):
            print("   Most common issues:")
            for issue in summary["most_common"][:3]:
                print(f"     - {issue['title']} ({issue['occurrences']} occurrences)")

    # End validation phase as failed
    if task_logger:
        task_logger.end_phase(
            LogPhase.VALIDATION,
            success=False,
            message=f"QA validation incomplete after {qa_iteration} iterations",
        )

    # Show the fix request file if it exists
    fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    if fix_request_file.exists():
        print(f"\nSee: {fix_request_file}")

    qa_report_file = spec_dir / "qa_report.md"
    if qa_report_file.exists():
        print(f"See: {qa_report_file}")

    # Update Linear: max iterations reached, needs human intervention
    if linear_task and linear_task.task_id:
        await linear_qa_max_iterations(spec_dir, qa_iteration)
        print("\nLinear: Task marked as needing human intervention")

    print("\nManual intervention required.")
    return False
