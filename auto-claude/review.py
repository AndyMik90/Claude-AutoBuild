"""
Human Review Checkpoint System
==============================

Provides a mandatory human review checkpoint between spec creation (spec_runner.py)
and build execution (run.py). Users can review the spec.md and implementation_plan.json,
provide feedback, request changes, or explicitly approve before any code is written.

Design Principles:
- Block automatic build start until human approval is given
- Persist approval state in review_state.json
- Detect spec changes after approval (requires re-approval)
- Support both interactive and auto-approve modes
- Graceful Ctrl+C handling

State Persistence File:
    specs/XXX-feature/review_state.json

Usage:
    # Programmatic use
    from review import ReviewState, run_review_checkpoint

    state = ReviewState.load(spec_dir)
    if not state.is_approved():
        state = run_review_checkpoint(spec_dir)

    # CLI use (for manual review)
    python auto-claude/review.py --spec-dir auto-claude/specs/001-feature
"""

import hashlib
import json
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from ui import (
    Icons,
    icon,
    box,
    bold,
    muted,
    highlight,
    success,
    warning,
    info,
    error,
    print_status,
    print_header,
    select_menu,
    MenuOption,
)


# State file name
REVIEW_STATE_FILE = "review_state.json"


def _compute_file_hash(file_path: Path) -> str:
    """Compute MD5 hash of a file's contents for change detection."""
    if not file_path.exists():
        return ""
    try:
        content = file_path.read_text(encoding="utf-8")
        return hashlib.md5(content.encode("utf-8")).hexdigest()
    except (IOError, UnicodeDecodeError):
        return ""


def _compute_spec_hash(spec_dir: Path) -> str:
    """
    Compute a combined hash of spec.md and implementation_plan.json.
    Used to detect changes after approval.
    """
    spec_hash = _compute_file_hash(spec_dir / "spec.md")
    plan_hash = _compute_file_hash(spec_dir / "implementation_plan.json")
    combined = f"{spec_hash}:{plan_hash}"
    return hashlib.md5(combined.encode("utf-8")).hexdigest()


@dataclass
class ReviewState:
    """
    Tracks human review status for a spec.

    Attributes:
        approved: Whether the spec has been approved for build
        approved_by: Who approved (username or 'auto' for --auto-approve)
        approved_at: ISO timestamp of approval
        feedback: List of feedback comments from review sessions
        spec_hash: Hash of spec files at time of approval (for change detection)
        review_count: Number of review sessions conducted
    """
    approved: bool = False
    approved_by: str = ""
    approved_at: str = ""
    feedback: list[str] = field(default_factory=list)
    spec_hash: str = ""
    review_count: int = 0

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "approved": self.approved,
            "approved_by": self.approved_by,
            "approved_at": self.approved_at,
            "feedback": self.feedback,
            "spec_hash": self.spec_hash,
            "review_count": self.review_count,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ReviewState":
        """Create from dictionary."""
        return cls(
            approved=data.get("approved", False),
            approved_by=data.get("approved_by", ""),
            approved_at=data.get("approved_at", ""),
            feedback=data.get("feedback", []),
            spec_hash=data.get("spec_hash", ""),
            review_count=data.get("review_count", 0),
        )

    def save(self, spec_dir: Path) -> None:
        """Save state to the spec directory."""
        state_file = Path(spec_dir) / REVIEW_STATE_FILE
        with open(state_file, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, spec_dir: Path) -> "ReviewState":
        """
        Load state from the spec directory.

        Returns a new empty ReviewState if file doesn't exist or is invalid.
        """
        state_file = Path(spec_dir) / REVIEW_STATE_FILE
        if not state_file.exists():
            return cls()

        try:
            with open(state_file, "r") as f:
                return cls.from_dict(json.load(f))
        except (json.JSONDecodeError, IOError):
            return cls()

    def is_approved(self) -> bool:
        """Check if the spec is approved (simple check)."""
        return self.approved

    def is_approval_valid(self, spec_dir: Path) -> bool:
        """
        Check if the approval is still valid (spec hasn't changed).

        Returns False if:
        - Not approved
        - spec.md or implementation_plan.json changed since approval
        """
        if not self.approved:
            return False

        if not self.spec_hash:
            # Legacy approval without hash - treat as valid
            return True

        current_hash = _compute_spec_hash(spec_dir)
        return self.spec_hash == current_hash

    def approve(
        self,
        spec_dir: Path,
        approved_by: str = "user",
        auto_save: bool = True,
    ) -> None:
        """
        Mark the spec as approved and compute the current hash.

        Args:
            spec_dir: Spec directory path
            approved_by: Who is approving ('user', 'auto', or username)
            auto_save: Whether to automatically save after approval
        """
        self.approved = True
        self.approved_by = approved_by
        self.approved_at = datetime.now().isoformat()
        self.spec_hash = _compute_spec_hash(spec_dir)
        self.review_count += 1

        if auto_save:
            self.save(spec_dir)

    def reject(self, spec_dir: Path, auto_save: bool = True) -> None:
        """
        Mark the spec as not approved.

        Args:
            spec_dir: Spec directory path
            auto_save: Whether to automatically save after rejection
        """
        self.approved = False
        self.approved_by = ""
        self.approved_at = ""
        self.spec_hash = ""
        self.review_count += 1

        if auto_save:
            self.save(spec_dir)

    def add_feedback(
        self,
        feedback: str,
        spec_dir: Optional[Path] = None,
        auto_save: bool = True,
    ) -> None:
        """
        Add a feedback comment.

        Args:
            feedback: The feedback text to add
            spec_dir: Spec directory path (required if auto_save=True)
            auto_save: Whether to automatically save after adding feedback
        """
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        self.feedback.append(f"[{timestamp}] {feedback}")

        if auto_save and spec_dir:
            self.save(spec_dir)

    def invalidate(self, spec_dir: Path, auto_save: bool = True) -> None:
        """
        Invalidate the current approval (e.g., when spec changes).

        Keeps the feedback history but clears approval status.

        Args:
            spec_dir: Spec directory path
            auto_save: Whether to automatically save
        """
        self.approved = False
        self.approved_at = ""
        self.spec_hash = ""
        # Keep approved_by and feedback as history

        if auto_save:
            self.save(spec_dir)


def get_review_status_summary(spec_dir: Path) -> dict:
    """
    Get a summary of the review status for display.

    Returns:
        Dictionary with status information
    """
    state = ReviewState.load(spec_dir)
    current_hash = _compute_spec_hash(spec_dir)

    return {
        "approved": state.approved,
        "valid": state.is_approval_valid(spec_dir),
        "approved_by": state.approved_by,
        "approved_at": state.approved_at,
        "review_count": state.review_count,
        "feedback_count": len(state.feedback),
        "spec_changed": state.spec_hash != current_hash if state.spec_hash else False,
    }


# =============================================================================
# Display Functions
# =============================================================================

def _extract_section(content: str, header: str, next_header_pattern: str = r"^## ") -> str:
    """
    Extract content from a markdown section.

    Args:
        content: Full markdown content
        header: Header to find (e.g., "## Overview")
        next_header_pattern: Regex pattern for next section header

    Returns:
        Content of the section (without the header), or empty string if not found
    """
    # Find the header
    header_pattern = rf"^{re.escape(header)}\s*$"
    match = re.search(header_pattern, content, re.MULTILINE)
    if not match:
        return ""

    # Get content from after the header
    start = match.end()
    remaining = content[start:]

    # Find the next section header
    next_match = re.search(next_header_pattern, remaining, re.MULTILINE)
    if next_match:
        section = remaining[:next_match.start()]
    else:
        section = remaining

    return section.strip()


def _truncate_text(text: str, max_lines: int = 5, max_chars: int = 300) -> str:
    """Truncate text to fit display constraints."""
    lines = text.split("\n")
    truncated_lines = lines[:max_lines]
    result = "\n".join(truncated_lines)

    if len(result) > max_chars:
        result = result[:max_chars - 3] + "..."
    elif len(lines) > max_lines:
        result += "\n..."

    return result


def _extract_table_rows(content: str, table_header: str) -> list[tuple[str, str, str]]:
    """
    Extract rows from a markdown table.

    Returns list of tuples with table cell values.
    """
    rows = []
    in_table = False
    header_found = False

    for line in content.split("\n"):
        line = line.strip()

        # Look for table header row containing the specified text
        if table_header.lower() in line.lower() and "|" in line:
            in_table = True
            header_found = True
            continue

        # Skip separator line
        if in_table and header_found and re.match(r"^\|[\s\-:|]+\|$", line):
            header_found = False
            continue

        # Parse table rows
        if in_table and line.startswith("|") and line.endswith("|"):
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if len(cells) >= 2:
                rows.append(tuple(cells[:3]) if len(cells) >= 3 else (*cells, ""))

        # End of table
        elif in_table and not line.startswith("|") and line:
            break

    return rows


def display_spec_summary(spec_dir: Path) -> None:
    """
    Display key sections of spec.md for human review.

    Extracts and displays:
    - Overview
    - Workflow Type
    - Files to Modify
    - Success Criteria

    Uses formatted boxes for readability.

    Args:
        spec_dir: Path to the spec directory
    """
    spec_file = Path(spec_dir) / "spec.md"

    if not spec_file.exists():
        print_status("spec.md not found", "error")
        return

    try:
        content = spec_file.read_text(encoding="utf-8")
    except (IOError, UnicodeDecodeError) as e:
        print_status(f"Could not read spec.md: {e}", "error")
        return

    # Extract the title from first H1
    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    title = title_match.group(1) if title_match else "Specification"

    # Build summary content
    summary_lines = []

    # Title
    summary_lines.append(bold(f"{icon(Icons.DOCUMENT)} {title}"))
    summary_lines.append("")

    # Overview
    overview = _extract_section(content, "## Overview")
    if overview:
        summary_lines.append(highlight("Overview:"))
        truncated = _truncate_text(overview, max_lines=4, max_chars=250)
        for line in truncated.split("\n"):
            summary_lines.append(f"  {line}")
        summary_lines.append("")

    # Workflow Type
    workflow_section = _extract_section(content, "## Workflow Type")
    if workflow_section:
        # Extract just the type value
        type_match = re.search(r"\*\*Type\*\*:\s*(\w+)", workflow_section)
        if type_match:
            summary_lines.append(f"{muted('Workflow:')} {type_match.group(1)}")

    # Files to Modify
    files_section = _extract_section(content, "## Files to Modify")
    if files_section:
        files = _extract_table_rows(files_section, "File")
        if files:
            summary_lines.append("")
            summary_lines.append(highlight("Files to Modify:"))
            for row in files[:6]:  # Show max 6 files
                filename = row[0] if row else ""
                # Strip markdown formatting
                filename = re.sub(r"`([^`]+)`", r"\1", filename)
                if filename:
                    summary_lines.append(f"  {icon(Icons.FILE)} {filename}")
            if len(files) > 6:
                summary_lines.append(f"  {muted(f'... and {len(files) - 6} more')}")

    # Files to Create
    create_section = _extract_section(content, "## Files to Create")
    if create_section:
        files = _extract_table_rows(create_section, "File")
        if files:
            summary_lines.append("")
            summary_lines.append(highlight("Files to Create:"))
            for row in files[:4]:
                filename = row[0] if row else ""
                filename = re.sub(r"`([^`]+)`", r"\1", filename)
                if filename:
                    summary_lines.append(success(f"  + {filename}"))

    # Success Criteria
    criteria = _extract_section(content, "## Success Criteria")
    if criteria:
        summary_lines.append("")
        summary_lines.append(highlight("Success Criteria:"))
        # Extract checkbox items
        checkboxes = re.findall(r"^\s*[-*]\s*\[[ x]\]\s*(.+)$", criteria, re.MULTILINE)
        for item in checkboxes[:5]:
            summary_lines.append(f"  {icon(Icons.PENDING)} {item[:60]}{'...' if len(item) > 60 else ''}")
        if len(checkboxes) > 5:
            summary_lines.append(f"  {muted(f'... and {len(checkboxes) - 5} more')}")

    # Print the summary box
    print()
    print(box(summary_lines, width=80, style="heavy"))


def display_plan_summary(spec_dir: Path) -> None:
    """
    Display summary of implementation_plan.json for human review.

    Shows:
    - Phase count and names
    - Subtask count per phase
    - Total work estimate
    - Services involved

    Args:
        spec_dir: Path to the spec directory
    """
    plan_file = Path(spec_dir) / "implementation_plan.json"

    if not plan_file.exists():
        print_status("implementation_plan.json not found", "error")
        return

    try:
        with open(plan_file, "r") as f:
            plan = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print_status(f"Could not read implementation_plan.json: {e}", "error")
        return

    # Build summary content
    summary_lines = []

    feature_name = plan.get("feature", "Implementation Plan")
    summary_lines.append(bold(f"{icon(Icons.GEAR)} {feature_name}"))
    summary_lines.append("")

    # Overall stats
    phases = plan.get("phases", [])
    total_subtasks = sum(len(p.get("subtasks", [])) for p in phases)
    completed_subtasks = sum(
        1 for p in phases
        for c in p.get("subtasks", [])
        if c.get("status") == "completed"
    )
    services = plan.get("services_involved", [])

    summary_lines.append(f"{muted('Phases:')} {len(phases)}")
    summary_lines.append(f"{muted('Subtasks:')} {completed_subtasks}/{total_subtasks} completed")
    if services:
        summary_lines.append(f"{muted('Services:')} {', '.join(services)}")

    # Phases breakdown
    if phases:
        summary_lines.append("")
        summary_lines.append(highlight("Implementation Phases:"))

        for phase in phases:
            phase_num = phase.get("phase", "?")
            phase_name = phase.get("name", "Unknown")
            subtasks = phase.get("subtasks", [])
            subtask_count = len(subtasks)
            completed = sum(1 for c in subtasks if c.get("status") == "completed")

            # Determine phase status icon
            if completed == subtask_count and subtask_count > 0:
                status_icon = icon(Icons.SUCCESS)
                phase_display = success(f"Phase {phase_num}: {phase_name}")
            elif completed > 0:
                status_icon = icon(Icons.IN_PROGRESS)
                phase_display = info(f"Phase {phase_num}: {phase_name}")
            else:
                status_icon = icon(Icons.PENDING)
                phase_display = f"Phase {phase_num}: {phase_name}"

            summary_lines.append(f"  {status_icon} {phase_display} ({completed}/{subtask_count} subtasks)")

            # Show subtask details for non-completed phases
            if completed < subtask_count:
                for subtask in subtasks[:3]:  # Show max 3 subtasks
                    subtask_id = subtask.get("id", "")
                    subtask_desc = subtask.get("description", "")
                    subtask_status = subtask.get("status", "pending")

                    if subtask_status == "completed":
                        status_str = success(icon(Icons.SUCCESS))
                    elif subtask_status == "in_progress":
                        status_str = info(icon(Icons.IN_PROGRESS))
                    else:
                        status_str = muted(icon(Icons.PENDING))

                    # Truncate description
                    desc_short = subtask_desc[:50] + "..." if len(subtask_desc) > 50 else subtask_desc
                    summary_lines.append(f"      {status_str} {muted(subtask_id)}: {desc_short}")

                if len(subtasks) > 3:
                    remaining = len(subtasks) - 3
                    summary_lines.append(f"      {muted(f'... {remaining} more subtasks')}")

    # Parallelism info
    summary_section = plan.get("summary", {})
    parallelism = summary_section.get("parallelism", {})
    if parallelism:
        recommended_workers = parallelism.get("recommended_workers", 1)
        if recommended_workers > 1:
            summary_lines.append("")
            summary_lines.append(
                f"{icon(Icons.LIGHTNING)} {highlight('Parallel execution supported:')} "
                f"{recommended_workers} workers recommended"
            )

    # Print the summary box
    print()
    print(box(summary_lines, width=80, style="light"))


def display_review_status(spec_dir: Path) -> None:
    """
    Display the current review/approval status.

    Shows whether spec is approved, by whom, and if changes have been detected.

    Args:
        spec_dir: Path to the spec directory
    """
    status = get_review_status_summary(spec_dir)
    state = ReviewState.load(spec_dir)

    content = []

    if status["approved"]:
        if status["valid"]:
            content.append(success(f"{icon(Icons.SUCCESS)} APPROVED"))
            content.append("")
            content.append(f"{muted('Approved by:')} {status['approved_by']}")
            if status["approved_at"]:
                # Format the timestamp nicely
                try:
                    dt = datetime.fromisoformat(status["approved_at"])
                    formatted = dt.strftime("%Y-%m-%d %H:%M")
                    content.append(f"{muted('Approved at:')} {formatted}")
                except ValueError:
                    content.append(f"{muted('Approved at:')} {status['approved_at']}")
        else:
            content.append(warning(f"{icon(Icons.WARNING)} APPROVAL STALE"))
            content.append("")
            content.append("The spec has been modified since approval.")
            content.append("Re-approval is required before building.")
    else:
        content.append(info(f"{icon(Icons.INFO)} NOT YET APPROVED"))
        content.append("")
        content.append("This spec requires human review before building.")

    # Show review history
    if status["review_count"] > 0:
        content.append("")
        content.append(f"{muted('Review sessions:')} {status['review_count']}")

    # Show feedback if any
    if state.feedback:
        content.append("")
        content.append(highlight("Recent Feedback:"))
        for fb in state.feedback[-3:]:  # Show last 3 feedback items
            content.append(f"  {muted('•')} {fb[:60]}{'...' if len(fb) > 60 else ''}")

    print()
    print(box(content, width=60, style="light"))


# =============================================================================
# Review Menu and User Interaction
# =============================================================================

class ReviewChoice(Enum):
    """User choices during review checkpoint."""
    APPROVE = "approve"          # Approve and proceed to build
    EDIT_SPEC = "edit_spec"      # Edit spec.md
    EDIT_PLAN = "edit_plan"      # Edit implementation_plan.json
    FEEDBACK = "feedback"        # Add feedback comment
    REJECT = "reject"            # Reject and exit


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


def _prompt_feedback() -> Optional[str]:
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
                feedback = _prompt_feedback()
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
    import os
    import subprocess

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


# =============================================================================
# CLI Entry Point
# =============================================================================

def main():
    """CLI entry point for manual review."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Human review checkpoint for auto-claude specs"
    )
    parser.add_argument(
        "--spec-dir",
        type=str,
        required=True,
        help="Path to the spec directory",
    )
    parser.add_argument(
        "--auto-approve",
        action="store_true",
        help="Skip interactive review and auto-approve",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Show review status without interactive prompt",
    )

    args = parser.parse_args()

    spec_dir = Path(args.spec_dir)
    if not spec_dir.exists():
        print_status(f"Spec directory not found: {spec_dir}", "error")
        sys.exit(1)

    if args.status:
        # Just show status
        display_review_status(spec_dir)
        state = ReviewState.load(spec_dir)
        if state.is_approval_valid(spec_dir):
            print()
            print_status("Ready to build.", "success")
            sys.exit(0)
        else:
            print()
            print_status("Review required before building.", "warning")
            sys.exit(1)

    # Run interactive review
    try:
        state = run_review_checkpoint(spec_dir, auto_approve=args.auto_approve)
        if state.is_approved():
            sys.exit(0)
        else:
            sys.exit(1)
    except KeyboardInterrupt:
        print()
        print_status("Review interrupted. Your feedback has been saved.", "info")
        sys.exit(0)


if __name__ == "__main__":
    main()
