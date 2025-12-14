"""
QA Validation Loop
==================

Implements the self-validating QA loop:
1. QA Agent reviews completed implementation
2. If issues found → Coder Agent fixes
3. QA Agent re-reviews
4. Loop continues until approved or max iterations reached

This ensures production-quality output before sign-off.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from claude_agent_sdk import ClaudeSDKClient

from client import create_client
from progress import count_subtasks, is_build_complete
from linear_updater import (
    is_linear_enabled,
    LinearTaskState,
    linear_qa_started,
    linear_qa_approved,
    linear_qa_rejected,
    linear_qa_max_iterations,
)
from task_logger import (
    TaskLogger,
    LogPhase,
    LogEntryType,
    get_task_logger,
)


# Configuration
MAX_QA_ITERATIONS = 50
QA_PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_implementation_plan(spec_dir: Path) -> Optional[dict]:
    """Load the implementation plan JSON."""
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return None
    try:
        with open(plan_file) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return None


def save_implementation_plan(spec_dir: Path, plan: dict) -> bool:
    """Save the implementation plan JSON."""
    plan_file = spec_dir / "implementation_plan.json"
    try:
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)
        return True
    except IOError:
        return False


def get_qa_signoff_status(spec_dir: Path) -> Optional[dict]:
    """Get the current QA sign-off status from implementation plan."""
    plan = load_implementation_plan(spec_dir)
    if not plan:
        return None
    return plan.get("qa_signoff")


def is_qa_approved(spec_dir: Path) -> bool:
    """Check if QA has approved the build."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return False
    return status.get("status") == "approved"


def is_qa_rejected(spec_dir: Path) -> bool:
    """Check if QA has rejected the build (needs fixes)."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return False
    return status.get("status") == "rejected"


def is_fixes_applied(spec_dir: Path) -> bool:
    """Check if fixes have been applied and ready for re-validation."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return False
    return status.get("status") == "fixes_applied" and status.get("ready_for_qa_revalidation", False)


def get_qa_iteration_count(spec_dir: Path) -> int:
    """Get the number of QA iterations so far."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return 0
    return status.get("qa_session", 0)


def load_qa_reviewer_prompt() -> str:
    """Load the QA reviewer agent prompt."""
    prompt_file = QA_PROMPTS_DIR / "qa_reviewer.md"
    if not prompt_file.exists():
        raise FileNotFoundError(f"QA reviewer prompt not found: {prompt_file}")
    return prompt_file.read_text()


def load_qa_fixer_prompt() -> str:
    """Load the QA fixer agent prompt."""
    prompt_file = QA_PROMPTS_DIR / "qa_fixer.md"
    if not prompt_file.exists():
        raise FileNotFoundError(f"QA fixer prompt not found: {prompt_file}")
    return prompt_file.read_text()


def should_run_qa(spec_dir: Path) -> bool:
    """
    Determine if QA validation should run.

    QA should run when:
    - All subtasks are completed
    - QA has not yet approved
    """
    if not is_build_complete(spec_dir):
        return False

    if is_qa_approved(spec_dir):
        return False

    return True


def should_run_fixes(spec_dir: Path) -> bool:
    """
    Determine if QA fixes should run.

    Fixes should run when:
    - QA has rejected the build
    - Max iterations not reached
    """
    if not is_qa_rejected(spec_dir):
        return False

    iterations = get_qa_iteration_count(spec_dir)
    if iterations >= MAX_QA_ITERATIONS:
        return False

    return True


async def run_qa_agent_session(
    client: ClaudeSDKClient,
    spec_dir: Path,
    qa_session: int,
    verbose: bool = False,
) -> tuple[str, str]:
    """
    Run a QA reviewer agent session.

    Args:
        client: Claude SDK client
        spec_dir: Spec directory
        qa_session: QA iteration number
        verbose: Whether to show detailed output

    Returns:
        (status, response_text) where status is:
        - "approved" if QA approves
        - "rejected" if QA finds issues
        - "error" if an error occurred
    """
    print(f"\n{'=' * 70}")
    print(f"  QA REVIEWER SESSION {qa_session}")
    print(f"  Validating all acceptance criteria...")
    print(f"{'=' * 70}\n")

    # Get task logger for streaming markers
    task_logger = get_task_logger(spec_dir)
    current_tool = None

    # Load QA prompt
    prompt = load_qa_reviewer_prompt()

    # Add session context - use full path so agent can find files
    prompt += f"\n\n---\n\n**QA Session**: {qa_session}\n"
    prompt += f"**Spec Directory**: {spec_dir}\n"
    prompt += f"**Spec Name**: {spec_dir.name}\n"
    prompt += f"**Max Iterations**: {MAX_QA_ITERATIONS}\n"
    prompt += f"\n**IMPORTANT**: All spec files (spec.md, implementation_plan.json, etc.) are located in: `{spec_dir}/`\n"
    prompt += f"Use the full path when reading files, e.g.: `cat {spec_dir}/spec.md`\n"

    try:
        await client.query(prompt)

        response_text = ""
        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                        # Log text to task logger (persist without double-printing)
                        if task_logger and block.text.strip():
                            task_logger.log(block.text, LogEntryType.TEXT, LogPhase.VALIDATION, print_to_console=False)
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        tool_name = block.name
                        tool_input = None

                        # Extract tool input for display
                        if hasattr(block, "input") and block.input:
                            inp = block.input
                            if isinstance(inp, dict):
                                if "file_path" in inp:
                                    fp = inp["file_path"]
                                    if len(fp) > 50:
                                        fp = "..." + fp[-47:]
                                    tool_input = fp
                                elif "pattern" in inp:
                                    tool_input = f"pattern: {inp['pattern']}"

                        # Log tool start (handles printing)
                        if task_logger:
                            task_logger.tool_start(tool_name, tool_input, LogPhase.VALIDATION, print_to_console=True)
                        else:
                            print(f"\n[QA Tool: {tool_name}]", flush=True)

                        if verbose and hasattr(block, "input"):
                            input_str = str(block.input)
                            if len(input_str) > 300:
                                print(f"   Input: {input_str[:300]}...", flush=True)
                            else:
                                print(f"   Input: {input_str}", flush=True)
                        current_tool = tool_name

            elif msg_type == "UserMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "ToolResultBlock":
                        is_error = getattr(block, "is_error", False)
                        result_content = getattr(block, "content", "")

                        if is_error:
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                            if task_logger and current_tool:
                                # Store full error in detail for expandable view
                                task_logger.tool_end(current_tool, success=False, result=error_str[:100], detail=str(result_content), phase=LogPhase.VALIDATION)
                        else:
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)
                            if task_logger and current_tool:
                                # Store full result in detail for expandable view
                                detail_content = None
                                if current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                                    result_str = str(result_content)
                                    if len(result_str) < 50000:
                                        detail_content = result_str
                                task_logger.tool_end(current_tool, success=True, detail=detail_content, phase=LogPhase.VALIDATION)

                        current_tool = None

        print("\n" + "-" * 70 + "\n")

        # Check the QA result from implementation_plan.json
        status = get_qa_signoff_status(spec_dir)
        if status and status.get("status") == "approved":
            return "approved", response_text
        elif status and status.get("status") == "rejected":
            return "rejected", response_text
        else:
            # Agent didn't update the status properly
            return "error", "QA agent did not update implementation_plan.json"

    except Exception as e:
        print(f"Error during QA session: {e}")
        if task_logger:
            task_logger.log_error(f"QA session error: {e}", LogPhase.VALIDATION)
        return "error", str(e)


async def run_qa_fixer_session(
    client: ClaudeSDKClient,
    spec_dir: Path,
    fix_session: int,
    verbose: bool = False,
) -> tuple[str, str]:
    """
    Run a QA fixer agent session.

    Args:
        client: Claude SDK client
        spec_dir: Spec directory
        fix_session: Fix iteration number
        verbose: Whether to show detailed output

    Returns:
        (status, response_text) where status is:
        - "fixed" if fixes were applied
        - "error" if an error occurred
    """
    print(f"\n{'=' * 70}")
    print(f"  QA FIXER SESSION {fix_session}")
    print(f"  Applying fixes from QA_FIX_REQUEST.md...")
    print(f"{'=' * 70}\n")

    # Get task logger for streaming markers
    task_logger = get_task_logger(spec_dir)
    current_tool = None

    # Check that fix request file exists
    fix_request_file = spec_dir / "QA_FIX_REQUEST.md"
    if not fix_request_file.exists():
        return "error", "QA_FIX_REQUEST.md not found"

    # Load fixer prompt
    prompt = load_qa_fixer_prompt()

    # Add session context - use full path so agent can find files
    prompt += f"\n\n---\n\n**Fix Session**: {fix_session}\n"
    prompt += f"**Spec Directory**: {spec_dir}\n"
    prompt += f"**Spec Name**: {spec_dir.name}\n"
    prompt += f"\n**IMPORTANT**: All spec files are located in: `{spec_dir}/`\n"
    prompt += f"The fix request file is at: `{spec_dir}/QA_FIX_REQUEST.md`\n"

    try:
        await client.query(prompt)

        response_text = ""
        async for msg in client.receive_response():
            msg_type = type(msg).__name__

            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text
                        print(block.text, end="", flush=True)
                        # Log text to task logger (persist without double-printing)
                        if task_logger and block.text.strip():
                            task_logger.log(block.text, LogEntryType.TEXT, LogPhase.VALIDATION, print_to_console=False)
                    elif block_type == "ToolUseBlock" and hasattr(block, "name"):
                        tool_name = block.name
                        tool_input = None

                        if hasattr(block, "input") and block.input:
                            inp = block.input
                            if isinstance(inp, dict):
                                if "file_path" in inp:
                                    fp = inp["file_path"]
                                    if len(fp) > 50:
                                        fp = "..." + fp[-47:]
                                    tool_input = fp
                                elif "command" in inp:
                                    cmd = inp["command"]
                                    if len(cmd) > 50:
                                        cmd = cmd[:47] + "..."
                                    tool_input = cmd

                        # Log tool start (handles printing)
                        if task_logger:
                            task_logger.tool_start(tool_name, tool_input, LogPhase.VALIDATION, print_to_console=True)
                        else:
                            print(f"\n[Fixer Tool: {tool_name}]", flush=True)

                        if verbose and hasattr(block, "input"):
                            input_str = str(block.input)
                            if len(input_str) > 300:
                                print(f"   Input: {input_str[:300]}...", flush=True)
                            else:
                                print(f"   Input: {input_str}", flush=True)
                        current_tool = tool_name

            elif msg_type == "UserMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__

                    if block_type == "ToolResultBlock":
                        is_error = getattr(block, "is_error", False)
                        result_content = getattr(block, "content", "")

                        if is_error:
                            error_str = str(result_content)[:500]
                            print(f"   [Error] {error_str}", flush=True)
                            if task_logger and current_tool:
                                # Store full error in detail for expandable view
                                task_logger.tool_end(current_tool, success=False, result=error_str[:100], detail=str(result_content), phase=LogPhase.VALIDATION)
                        else:
                            if verbose:
                                result_str = str(result_content)[:200]
                                print(f"   [Done] {result_str}", flush=True)
                            else:
                                print("   [Done]", flush=True)
                            if task_logger and current_tool:
                                # Store full result in detail for expandable view
                                detail_content = None
                                if current_tool in ("Read", "Grep", "Bash", "Edit", "Write"):
                                    result_str = str(result_content)
                                    if len(result_str) < 50000:
                                        detail_content = result_str
                                task_logger.tool_end(current_tool, success=True, detail=detail_content, phase=LogPhase.VALIDATION)

                        current_tool = None

        print("\n" + "-" * 70 + "\n")

        # Check if fixes were applied
        status = get_qa_signoff_status(spec_dir)
        if status and status.get("ready_for_qa_revalidation"):
            return "fixed", response_text
        else:
            # Fixer didn't update the status properly, but we'll trust it worked
            return "fixed", response_text

    except Exception as e:
        print(f"Error during fixer session: {e}")
        if task_logger:
            task_logger.log_error(f"QA fixer error: {e}", LogPhase.VALIDATION)
        return "error", str(e)


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

        print(f"\n--- QA Iteration {qa_iteration}/{MAX_QA_ITERATIONS} ---")

        # Run QA reviewer
        client = create_client(project_dir, spec_dir, model)

        async with client:
            status, response = await run_qa_agent_session(
                client, spec_dir, qa_iteration, verbose
            )

        if status == "approved":
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
                task_logger.end_phase(LogPhase.VALIDATION, success=True, message="QA validation passed - all criteria met")

            # Update Linear: QA approved, awaiting human review
            if linear_task and linear_task.task_id:
                await linear_qa_approved(spec_dir)
                print("\nLinear: Task marked as QA approved, awaiting human review")

            return True

        elif status == "rejected":
            print(f"\n❌ QA found issues. Iteration {qa_iteration}/{MAX_QA_ITERATIONS}")

            # Record rejection in Linear
            if linear_task and linear_task.task_id:
                # Count issues from QA report if available
                qa_status = get_qa_signoff_status(spec_dir)
                issues_count = len(qa_status.get("issues_found", [])) if qa_status else 0
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
                break

            print("\n✅ Fixes applied. Re-running QA validation...")

        elif status == "error":
            print(f"\n❌ QA error: {response}")
            print("Retrying...")

    # Max iterations reached without approval
    print("\n" + "=" * 70)
    print("  ⚠️  QA VALIDATION INCOMPLETE")
    print("=" * 70)
    print(f"\nReached maximum iterations ({MAX_QA_ITERATIONS}) without approval.")
    print("\nRemaining issues require human review:")

    # End validation phase as failed
    if task_logger:
        task_logger.end_phase(LogPhase.VALIDATION, success=False, message=f"QA validation incomplete after {qa_iteration} iterations")

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


def print_qa_status(spec_dir: Path) -> None:
    """Print the current QA status."""
    status = get_qa_signoff_status(spec_dir)

    if not status:
        print("QA Status: Not started")
        return

    qa_status = status.get("status", "unknown")
    qa_session = status.get("qa_session", 0)
    timestamp = status.get("timestamp", "unknown")

    print(f"QA Status: {qa_status.upper()}")
    print(f"QA Sessions: {qa_session}")
    print(f"Last Updated: {timestamp}")

    if qa_status == "approved":
        tests = status.get("tests_passed", {})
        print(f"Tests: Unit {tests.get('unit', '?')}, Integration {tests.get('integration', '?')}, E2E {tests.get('e2e', '?')}")
    elif qa_status == "rejected":
        issues = status.get("issues_found", [])
        print(f"Issues Found: {len(issues)}")
        for issue in issues[:3]:  # Show first 3
            print(f"  - {issue.get('title', 'Unknown')}: {issue.get('type', 'unknown')}")
        if len(issues) > 3:
            print(f"  ... and {len(issues) - 3} more")
