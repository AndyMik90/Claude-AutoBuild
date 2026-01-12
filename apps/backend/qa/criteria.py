"""
QA Acceptance Criteria Handling
================================

Manages acceptance criteria validation and status tracking.
"""

import json
import time
from pathlib import Path

from progress import is_build_complete

# =============================================================================
# IMPLEMENTATION PLAN I/O
# =============================================================================


def load_implementation_plan(spec_dir: Path) -> dict | None:
    """Load the implementation plan JSON."""
    plan_file = spec_dir / "implementation_plan.json"
    if not plan_file.exists():
        return None
    try:
        with open(plan_file) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def save_implementation_plan(spec_dir: Path, plan: dict) -> bool:
    """Save the implementation plan JSON."""
    plan_file = spec_dir / "implementation_plan.json"
    try:
        with open(plan_file, "w") as f:
            json.dump(plan, f, indent=2)
        return True
    except OSError:
        return False


# =============================================================================
# QA SIGN-OFF STATUS
# =============================================================================


def get_qa_signoff_status(spec_dir: Path) -> dict | None:
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
    return status.get("status") == "fixes_applied" and status.get(
        "ready_for_qa_revalidation", False
    )


def get_qa_iteration_count(spec_dir: Path) -> int:
    """Get the number of QA iterations so far."""
    status = get_qa_signoff_status(spec_dir)
    if not status:
        return 0
    return status.get("qa_session", 0)


def collect_qa_screenshots(spec_dir: Path, max_age_seconds: int = 600) -> list[str]:
    """
    Collect screenshot files generated during the QA session BY THE AGENT.

    SECURITY: Excludes user-provided feedback screenshots from qa-feedback-screenshots/.
    Only collects screenshots created by Playwright or other automated QA tools.

    Args:
        spec_dir: Spec directory where screenshots are saved
        max_age_seconds: Only include screenshots created within this timeframe (default: 10 minutes)

    Returns:
        List of screenshot paths relative to spec_dir
    """
    screenshots = []
    current_time = time.time()

    # Look for .png files in spec_dir
    if spec_dir.exists():
        for file_path in spec_dir.glob("**/*.png"):
            if file_path.is_file():
                # SECURITY: Exclude user-provided feedback screenshots
                rel_path = file_path.relative_to(spec_dir)
                if str(rel_path).startswith("qa-feedback-screenshots/"):
                    continue

                # Check file age
                file_age = current_time - file_path.stat().st_mtime
                if file_age <= max_age_seconds:
                    # Store path relative to spec_dir
                    screenshots.append(str(rel_path))

    return sorted(screenshots)


def save_qa_screenshots_to_plan(spec_dir: Path, max_age_seconds: int = 600) -> bool:
    """
    Collect recent screenshots and add them to qa_signoff in implementation_plan.json.

    Args:
        spec_dir: Spec directory
        max_age_seconds: Only include screenshots created within this timeframe

    Returns:
        True if screenshots were saved successfully
    """
    plan = load_implementation_plan(spec_dir)
    if not plan or "qa_signoff" not in plan:
        return False

    # Collect screenshots
    screenshots = collect_qa_screenshots(spec_dir, max_age_seconds)

    # Add to qa_signoff
    plan["qa_signoff"]["screenshots"] = screenshots

    # Save plan
    return save_implementation_plan(spec_dir, plan)


# =============================================================================
# QA READINESS CHECKS
# =============================================================================


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
    from .loop import MAX_QA_ITERATIONS

    if not is_qa_rejected(spec_dir):
        return False

    iterations = get_qa_iteration_count(spec_dir)
    if iterations >= MAX_QA_ITERATIONS:
        return False

    return True


# =============================================================================
# STATUS DISPLAY
# =============================================================================


def print_qa_status(spec_dir: Path) -> None:
    """Print the current QA status."""
    from .report import get_iteration_history, get_recurring_issue_summary

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
        print(
            f"Tests: Unit {tests.get('unit', '?')}, Integration {tests.get('integration', '?')}, E2E {tests.get('e2e', '?')}"
        )
    elif qa_status == "rejected":
        issues = status.get("issues_found", [])
        print(f"Issues Found: {len(issues)}")
        for issue in issues[:3]:  # Show first 3
            print(
                f"  - {issue.get('title', 'Unknown')}: {issue.get('type', 'unknown')}"
            )
        if len(issues) > 3:
            print(f"  ... and {len(issues) - 3} more")

    # Show iteration history summary
    history = get_iteration_history(spec_dir)
    if history:
        summary = get_recurring_issue_summary(history)
        print("\nIteration History:")
        print(f"  Total iterations: {len(history)}")
        print(f"  Approved: {summary.get('iterations_approved', 0)}")
        print(f"  Rejected: {summary.get('iterations_rejected', 0)}")
        if summary.get("most_common"):
            print("  Most common issues:")
            for issue in summary["most_common"][:3]:
                print(f"    - {issue['title']} ({issue['occurrences']} occurrences)")
