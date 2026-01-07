"""
Review Orchestration
====================

Main review checkpoint logic including interactive menu, user prompts,
and file editing capabilities.
"""

import os
import subprocess
import sys
from datetime import datetime
from enum import Enum
from pathlib import Path

from ui import (
    Icons,
    MenuOption,
    bold,
    box,
    error,
    icon,
    muted,
    print_status,
    select_menu,
    success,
    warning,
)

from .formatters import (
    display_plan_summary,
    display_review_status,
    display_spec_summary,
)
from .state import ReviewState


class ReviewChoice(Enum):
    """User choices during review checkpoint."""

    APPROVE = "approve"  # Approve and proceed to build
    EDIT_SPEC = "edit_spec"  # Edit spec.md
    EDIT_PLAN = "edit_plan"  # Edit implementation_plan.json
    FEEDBACK = "feedback"  # Add feedback comment
    REJECT = "reject"  # Reject and exit


def get_review_menu_options() -> list[MenuOption]:
    """
    Get the menu options for the review checkpoint.

    Returns:
        List of MenuOption objects for the review menu
    """
    return [
        MenuOption(
            key=ReviewChoice.APPROVE.value,
            label="Approve and start build",
            icon=Icons.SUCCESS,
            description="The plan looks good, proceed with implementation",
        ),
        MenuOption(
            key=ReviewChoice.EDIT_SPEC.value,
            label="Edit specification (spec.md)",
            icon=Icons.EDIT,
            description="Open spec.md in your editor to make changes",
        ),
        MenuOption(
            key=ReviewChoice.EDIT_PLAN.value,
            label="Edit implementation plan",
            icon=Icons.DOCUMENT,
            description="Open implementation_plan.json in your editor",
        ),
        MenuOption(
            key=ReviewChoice.FEEDBACK.value,
            label="Add feedback",
            icon=Icons.CLIPBOARD,
            description="Add a comment without approving or rejecting",
        ),
        MenuOption(
            key=ReviewChoice.REJECT.value,
            label="Reject and exit",
            icon=Icons.ERROR,
            description="Stop here without starting build",
        ),
    ]


def prompt_feedback() -> str | None:
    """
    Prompt user to enter feedback text.

    Returns:
        Feedback text or None if cancelled
    """
    print()
    print(muted("Enter your feedback (press Enter twice to finish, Ctrl+C to cancel):"))
    print()

    lines = []
    try:
        while True:
            line = input()
            if line == "" and lines and lines[-1] == "":
                # Two consecutive empty lines = done
                break
            lines.append(line)
    except (EOFError, KeyboardInterrupt):
        print()
        return None

    # Remove trailing empty lines
    while lines and lines[-1] == "":
        lines.pop()

    feedback = "\n".join(lines).strip()
    return feedback if feedback else None


def open_file_in_editor(file_path: Path) -> bool:
    """
    Open a file in the user's preferred editor.

    Uses $EDITOR environment variable, falling back to common editors.
    For VS Code and VS Code Insiders, uses --wait flag to block until closed.

    Args:
        file_path: Path to the file to edit

    Returns:
        True if editor opened successfully, False otherwise
    """
    file_path = Path(file_path)
    if not file_path.exists():
        print_status(f"File not found: {file_path}", "error")
        return False

    # Get editor from environment or use fallbacks
    editor = os.environ.get("EDITOR", "")
    if not editor:
        # Try common editors in order
        for candidate in ["code", "nano", "vim", "vi"]:
            try:
                subprocess.run(
                    ["which", candidate],
                    capture_output=True,
                    check=True,
                )
                editor = candidate
                break
            except subprocess.CalledProcessError:
                continue

    if not editor:
        print_status("No editor found. Set $EDITOR environment variable.", "error")
        print(muted(f"  File to edit: {file_path}"))
        return False

    print()
    print_status(f"Opening {file_path.name} in {editor}...", "info")

    try:
        # Use --wait flag for VS Code to block until closed
        if editor in ("code", "code-insiders"):
            subprocess.run([editor, "--wait", str(file_path)], check=True)
        else:
            subprocess.run([editor, str(file_path)], check=True)
        return True
    except subprocess.CalledProcessError as e:
        print_status(f"Editor failed: {e}", "error")
        return False
    except FileNotFoundError:
        print_status(f"Editor not found: {editor}", "error")
        return False


def run_review_checkpoint(
    spec_dir: Path,
    auto_approve: bool = False,
) -> ReviewState:
    """
    Run the human review checkpoint for a spec.

    Displays spec summary and implementation plan, then prompts user to
    approve, edit, provide feedback, or reject the spec before build starts.

    Args:
        spec_dir: Path to the spec directory
        auto_approve: If True, skip interactive review and auto-approve

    Returns:
        Updated ReviewState after user interaction

    Raises:
        SystemExit: If user chooses to reject or cancels with Ctrl+C
    """
    spec_dir = Path(spec_dir)
    state = ReviewState.load(spec_dir)

    # Handle auto-approve mode
    if auto_approve:
        state.approve(spec_dir, approved_by="auto")
        print_status("Auto-approved (--auto-approve flag)", "success")
        return state

    # Check if already approved and still valid
    if state.is_approval_valid(spec_dir):
        content = [
            success(f"{icon(Icons.SUCCESS)} ALREADY APPROVED"),
            "",
            f"{muted('Approved by:')} {state.approved_by}",
        ]
        if state.approved_at:
            try:
                dt = datetime.fromisoformat(state.approved_at)
                formatted = dt.strftime("%Y-%m-%d %H:%M")
                content.append(f"{muted('Approved at:')} {formatted}")
            except ValueError:
                pass
        print()
        print(box(content, width=60, style="light"))
        print()
        return state

    # If previously approved but spec changed, inform user
    if state.approved and not state.is_approval_valid(spec_dir):
        content = [
            warning(f"{icon(Icons.WARNING)} SPEC CHANGED SINCE APPROVAL"),
            "",
            "The specification has been modified since it was approved.",
            "Please review and re-approve before building.",
        ]
        print()
        print(box(content, width=60, style="heavy"))
        # Invalidate the old approval
        state.invalidate(spec_dir)

    # Display header
    content = [
        bold(f"{icon(Icons.SEARCH)} HUMAN REVIEW CHECKPOINT"),
        "",
        "Please review the specification and implementation plan",
        "before the autonomous build begins.",
    ]
    print()
    print(box(content, width=70, style="heavy"))

    # Main review loop with graceful Ctrl+C handling
    try:
        while True:
            # Display spec and plan summaries
            display_spec_summary(spec_dir)
            display_plan_summary(spec_dir)

            # Show current review status
            display_review_status(spec_dir)

            # Show menu
            options = get_review_menu_options()
            choice = select_menu(
                title="Review Implementation Plan",
                options=options,
                subtitle="What would you like to do?",
                allow_quit=True,
            )

            # Handle quit (Ctrl+C or 'q')
            if choice is None:
                print()
                print_status("Review paused. Your feedback has been saved.", "info")
                print(muted("Run review again to continue."))
                state.save(spec_dir)
                sys.exit(0)

            # Handle user choice
            if choice == ReviewChoice.APPROVE.value:
                state.approve(spec_dir, approved_by="user")
                print()
                print_status("Spec approved! Ready to start build.", "success")
                return state

            elif choice == ReviewChoice.EDIT_SPEC.value:
                spec_file = spec_dir / "spec.md"
                if not spec_file.exists():
                    print_status("spec.md not found", "error")
                    continue
                open_file_in_editor(spec_file)
                # After editing, invalidate any previous approval
                if state.approved:
                    state.invalidate(spec_dir)
                print()
                print_status("spec.md updated. Please re-review.", "info")
                continue

            elif choice == ReviewChoice.EDIT_PLAN.value:
                plan_file = spec_dir / "implementation_plan.json"
                if not plan_file.exists():
                    print_status("implementation_plan.json not found", "error")
                    continue
                open_file_in_editor(plan_file)
                # After editing, invalidate any previous approval
                if state.approved:
                    state.invalidate(spec_dir)
                print()
                print_status("Implementation plan updated. Please re-review.", "info")
                continue

            elif choice == ReviewChoice.FEEDBACK.value:
                feedback = prompt_feedback()
                if feedback:
                    state.add_feedback(feedback, spec_dir)
                    print()
                    print_status("Feedback saved.", "success")
                else:
                    print()
                    print_status("No feedback added.", "info")
                continue

            elif choice == ReviewChoice.REJECT.value:
                state.reject(spec_dir)
                print()
                content = [
                    error(f"{icon(Icons.ERROR)} SPEC REJECTED"),
                    "",
                    "The build will not proceed.",
                    muted("You can edit the spec and try again later."),
                ]
                print(box(content, width=60, style="heavy"))
                sys.exit(1)

    except KeyboardInterrupt:
        # Graceful Ctrl+C handling - save state and exit cleanly
        print()
        print_status("Review interrupted. Your feedback has been saved.", "info")
        print(muted("Run review again to continue."))
        state.save(spec_dir)
        sys.exit(0)
