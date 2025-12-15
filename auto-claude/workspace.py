#!/usr/bin/env python3
"""
Workspace Management - Per-Spec Architecture
=============================================

Handles workspace isolation through Git worktrees, where each spec
gets its own isolated worktree in .worktrees/{spec-name}/.

Key changes from old design:
- Each spec has its own worktree (not shared)
- Worktree path: .worktrees/{spec-name}/
- Branch name: auto-claude/{spec-name}
- Fixed: get_existing_build_worktree() now properly checks spec_name
- Fixed: finalize_workspace() skips prompts in auto_continue mode

Terminology mapping (technical -> user-friendly):
- worktree -> "separate workspace"
- branch -> "version of your project"
- uncommitted changes -> "unsaved work"
- merge -> "add to your project"
- working directory -> "your project"
"""

import shutil
import subprocess
import sys
from enum import Enum
from pathlib import Path

from ui import (
    Icons,
    MenuOption,
    bold,
    box,
    error,
    highlight,
    icon,
    info,
    muted,
    print_status,
    select_menu,
    success,
    warning,
)
from worktree import WorktreeInfo, WorktreeManager


class WorkspaceMode(Enum):
    """How auto-claude should work."""

    ISOLATED = "isolated"  # Work in a separate worktree (safe)
    DIRECT = "direct"  # Work directly in user's project


class WorkspaceChoice(Enum):
    """User's choice after build completes."""

    MERGE = "merge"  # Add changes to project
    REVIEW = "review"  # Show what changed
    TEST = "test"  # Test the feature in the staging worktree
    LATER = "later"  # Decide later


def has_uncommitted_changes(project_dir: Path) -> bool:
    """Check if user has unsaved work."""
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    return bool(result.stdout.strip())


def get_current_branch(project_dir: Path) -> str:
    """Get the current branch name."""
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def get_existing_build_worktree(project_dir: Path, spec_name: str) -> Path | None:
    """
    Check if there's an existing worktree for this specific spec.

    Args:
        project_dir: The main project directory
        spec_name: The spec folder name (e.g., "001-feature-name")

    Returns:
        Path to the worktree if it exists for this spec, None otherwise
    """
    # Per-spec worktree path: .worktrees/{spec-name}/
    worktree_path = project_dir / ".worktrees" / spec_name
    if worktree_path.exists():
        return worktree_path
    return None


def choose_workspace(
    project_dir: Path,
    spec_name: str,
    force_isolated: bool = False,
    force_direct: bool = False,
    auto_continue: bool = False,
) -> WorkspaceMode:
    """
    Let user choose where auto-claude should work.

    Uses simple, non-technical language. Safe defaults.

    Args:
        project_dir: The project directory
        spec_name: Name of the spec being built
        force_isolated: Skip prompts and use isolated mode
        force_direct: Skip prompts and use direct mode
        auto_continue: Non-interactive mode (for UI integration) - skip all prompts

    Returns:
        WorkspaceMode indicating where to work
    """
    # Handle forced modes
    if force_isolated:
        return WorkspaceMode.ISOLATED
    if force_direct:
        return WorkspaceMode.DIRECT

    # Non-interactive mode: default to isolated for safety
    if auto_continue:
        print("Auto-continue: Using isolated workspace for safety.")
        return WorkspaceMode.ISOLATED

    # Check for unsaved work
    has_unsaved = has_uncommitted_changes(project_dir)

    if has_unsaved:
        # Unsaved work detected - use isolated mode for safety
        content = [
            success(f"{icon(Icons.SHIELD)} YOUR WORK IS PROTECTED"),
            "",
            "You have unsaved work in your project.",
            "",
            "To keep your work safe, the AI will build in a",
            "separate workspace. Your current files won't be",
            "touched until you're ready.",
        ]
        print()
        print(box(content, width=60, style="heavy"))
        print()

        try:
            input("Press Enter to continue...")
        except KeyboardInterrupt:
            print()
            print_status("Cancelled.", "info")
            sys.exit(0)

        return WorkspaceMode.ISOLATED

    # Clean working directory - give choice with enhanced menu
    options = [
        MenuOption(
            key="isolated",
            label="Separate workspace (Recommended)",
            icon=Icons.SHIELD,
            description="Your current files stay untouched. Easy to review and undo.",
        ),
        MenuOption(
            key="direct",
            label="Right here in your project",
            icon=Icons.LIGHTNING,
            description="Changes happen directly. Best if you're not working on anything else.",
        ),
    ]

    choice = select_menu(
        title="Where should the AI build your feature?",
        options=options,
        allow_quit=True,
    )

    if choice is None:
        print()
        print_status("Cancelled.", "info")
        sys.exit(0)

    if choice == "direct":
        print()
        print_status("Working directly in your project.", "info")
        return WorkspaceMode.DIRECT
    else:
        print()
        print_status("Using a separate workspace for safety.", "success")
        return WorkspaceMode.ISOLATED


def copy_spec_to_worktree(
    source_spec_dir: Path,
    worktree_path: Path,
    spec_name: str,
) -> Path:
    """
    Copy spec files into the worktree so the AI can access them.

    The AI's filesystem is restricted to the worktree, so spec files
    must be copied inside for access.

    Args:
        source_spec_dir: Original spec directory (may be outside worktree)
        worktree_path: Path to the worktree
        spec_name: Name of the spec folder

    Returns:
        Path to the spec directory inside the worktree
    """
    # Determine target location inside worktree
    # Use .auto-claude/specs/{spec_name}/ as the standard location
    # Note: auto-claude/ is source code, .auto-claude/ is the installed instance
    target_spec_dir = worktree_path / ".auto-claude" / "specs" / spec_name

    # Create parent directories if needed
    target_spec_dir.parent.mkdir(parents=True, exist_ok=True)

    # Copy spec files (overwrite if exists to get latest)
    if target_spec_dir.exists():
        shutil.rmtree(target_spec_dir)

    shutil.copytree(source_spec_dir, target_spec_dir)

    return target_spec_dir


def setup_workspace(
    project_dir: Path,
    spec_name: str,
    mode: WorkspaceMode,
    source_spec_dir: Path | None = None,
) -> tuple[Path, WorktreeManager | None, Path | None]:
    """
    Set up the workspace based on user's choice.

    Uses per-spec worktrees - each spec gets its own isolated worktree.

    Args:
        project_dir: The project directory
        spec_name: Name of the spec being built (e.g., "001-feature-name")
        mode: The workspace mode to use
        source_spec_dir: Optional source spec directory to copy to worktree

    Returns:
        Tuple of (working_directory, worktree_manager or None, localized_spec_dir or None)

        When using isolated mode with source_spec_dir:
        - working_directory: Path to the worktree
        - worktree_manager: Manager for the worktree
        - localized_spec_dir: Path to spec files INSIDE the worktree (accessible to AI)
    """
    if mode == WorkspaceMode.DIRECT:
        # Work directly in project - spec_dir stays as-is
        return project_dir, None, source_spec_dir

    # Create isolated workspace using per-spec worktree
    print()
    print_status("Setting up separate workspace...", "progress")

    manager = WorktreeManager(project_dir)
    manager.setup()

    # Get or create worktree for THIS SPECIFIC SPEC
    worktree_info = manager.get_or_create_worktree(spec_name)

    # Copy spec files to worktree if provided
    localized_spec_dir = None
    if source_spec_dir and source_spec_dir.exists():
        localized_spec_dir = copy_spec_to_worktree(
            source_spec_dir, worktree_info.path, spec_name
        )
        print_status("Spec files copied to workspace", "success")

    print_status(f"Workspace ready: {worktree_info.path.name}", "success")
    print()

    return worktree_info.path, manager, localized_spec_dir


def show_build_summary(manager: WorktreeManager, spec_name: str) -> None:
    """Show a summary of what was built."""
    summary = manager.get_change_summary(spec_name)
    files = manager.get_changed_files(spec_name)

    total = summary["new_files"] + summary["modified_files"] + summary["deleted_files"]

    if total == 0:
        print_status("No changes were made.", "info")
        return

    print()
    print(bold("What was built:"))
    if summary["new_files"] > 0:
        print(
            success(
                f"  + {summary['new_files']} new file{'s' if summary['new_files'] != 1 else ''}"
            )
        )
    if summary["modified_files"] > 0:
        print(
            info(
                f"  ~ {summary['modified_files']} modified file{'s' if summary['modified_files'] != 1 else ''}"
            )
        )
    if summary["deleted_files"] > 0:
        print(
            error(
                f"  - {summary['deleted_files']} deleted file{'s' if summary['deleted_files'] != 1 else ''}"
            )
        )


def show_changed_files(manager: WorktreeManager, spec_name: str) -> None:
    """Show detailed list of changed files."""
    files = manager.get_changed_files(spec_name)

    if not files:
        print_status("No changes.", "info")
        return

    print()
    print(bold("Changed files:"))
    for status, filepath in files:
        if status == "A":
            print(success(f"  + {filepath}"))
        elif status == "M":
            print(info(f"  ~ {filepath}"))
        elif status == "D":
            print(error(f"  - {filepath}"))
        else:
            print(f"  {status} {filepath}")


def finalize_workspace(
    project_dir: Path,
    spec_name: str,
    manager: WorktreeManager | None,
    auto_continue: bool = False,
) -> WorkspaceChoice:
    """
    Handle post-build workflow - let user decide what to do with changes.

    Safe design:
    - No "discard" option (requires separate --discard command)
    - Default is "test" - encourages testing before merging
    - Everything is preserved until user explicitly merges or discards

    Args:
        project_dir: The project directory
        spec_name: Name of the spec that was built
        manager: The worktree manager (None if direct mode was used)
        auto_continue: If True, skip interactive prompts (UI mode)

    Returns:
        WorkspaceChoice indicating what user wants to do
    """
    if manager is None:
        # Direct mode - nothing to finalize
        content = [
            success(f"{icon(Icons.SUCCESS)} BUILD COMPLETE!"),
            "",
            "Changes were made directly to your project.",
            muted("Use 'git status' to see what changed."),
        ]
        print()
        print(box(content, width=60, style="heavy"))
        return WorkspaceChoice.MERGE  # Already merged

    # In auto_continue mode (UI), skip interactive prompts
    # The worktree stays for the UI to manage
    if auto_continue:
        worktree_info = manager.get_worktree_info(spec_name)
        if worktree_info:
            print()
            print(success(f"Build complete in worktree: {worktree_info.path}"))
            print(muted("Worktree preserved for UI review."))
        return WorkspaceChoice.LATER

    # Isolated mode - show options with testing as the recommended path
    content = [
        success(f"{icon(Icons.SUCCESS)} BUILD COMPLETE!"),
        "",
        "The AI built your feature in a separate workspace.",
    ]
    print()
    print(box(content, width=60, style="heavy"))

    show_build_summary(manager, spec_name)

    # Get the worktree path for test instructions
    worktree_info = manager.get_worktree_info(spec_name)
    staging_path = worktree_info.path if worktree_info else None

    # Enhanced menu for post-build options
    options = [
        MenuOption(
            key="test",
            label="Test the feature (Recommended)",
            icon=Icons.PLAY,
            description="Run the app and try it out before adding to your project",
        ),
        MenuOption(
            key="merge",
            label="Add to my project now",
            icon=Icons.SUCCESS,
            description="Merge the changes into your files immediately",
        ),
        MenuOption(
            key="review",
            label="Review what changed",
            icon=Icons.FILE,
            description="See exactly what files were modified",
        ),
        MenuOption(
            key="later",
            label="Decide later",
            icon=Icons.PAUSE,
            description="Your build is saved - you can come back anytime",
        ),
    ]

    print()
    choice = select_menu(
        title="What would you like to do?",
        options=options,
        allow_quit=False,
    )

    if choice == "test":
        return WorkspaceChoice.TEST
    elif choice == "merge":
        return WorkspaceChoice.MERGE
    elif choice == "review":
        return WorkspaceChoice.REVIEW
    else:
        return WorkspaceChoice.LATER


def handle_workspace_choice(
    choice: WorkspaceChoice,
    project_dir: Path,
    spec_name: str,
    manager: WorktreeManager,
) -> None:
    """
    Execute the user's choice.

    Args:
        choice: What the user wants to do
        project_dir: The project directory
        spec_name: Name of the spec
        manager: The worktree manager
    """
    worktree_info = manager.get_worktree_info(spec_name)
    staging_path = worktree_info.path if worktree_info else None

    if choice == WorkspaceChoice.TEST:
        # Show testing instructions
        content = [
            bold(f"{icon(Icons.PLAY)} TEST YOUR FEATURE"),
            "",
            "Your feature is ready to test in a separate workspace.",
        ]
        print()
        print(box(content, width=60, style="heavy"))

        print()
        print("To test it, open a NEW terminal and run:")
        print()
        if staging_path:
            print(highlight(f"  cd {staging_path}"))
        else:
            print(highlight(f"  cd {project_dir}/.worktrees/{spec_name}"))

        # Show likely test/run commands
        if staging_path:
            commands = manager.get_test_commands(spec_name)
            print()
            print("Then run your project:")
            for cmd in commands[:2]:  # Show top 2 commands
                print(f"  {cmd}")

        print()
        print(muted("-" * 60))
        print()
        print("When you're done testing:")
        print(highlight(f"  python auto-claude/run.py --spec {spec_name} --merge"))
        print()
        print("To discard (if you don't like it):")
        print(muted(f"  python auto-claude/run.py --spec {spec_name} --discard"))
        print()

    elif choice == WorkspaceChoice.MERGE:
        print()
        print_status("Adding changes to your project...", "progress")
        success_result = manager.merge_worktree(spec_name, delete_after=True)

        if success_result:
            print()
            print_status("Your feature has been added to your project.", "success")
        else:
            print()
            print_status("There was a conflict merging the changes.", "error")
            print(muted("Your build is still saved in the separate workspace."))
            print(muted("You may need to merge manually or ask for help."))

    elif choice == WorkspaceChoice.REVIEW:
        show_changed_files(manager, spec_name)
        print()
        print(muted("-" * 60))
        print()
        print("To see full details of changes:")
        if worktree_info:
            print(
                muted(
                    f"  git diff {worktree_info.base_branch}...{worktree_info.branch}"
                )
            )
        print()
        print("To test the feature:")
        if staging_path:
            print(highlight(f"  cd {staging_path}"))
        print()
        print("To add these changes to your project:")
        print(highlight(f"  python auto-claude/run.py --spec {spec_name} --merge"))
        print()

    else:  # LATER
        print()
        print_status("No problem! Your build is saved.", "success")
        print()
        print("To test the feature:")
        if staging_path:
            print(highlight(f"  cd {staging_path}"))
        else:
            print(highlight(f"  cd {project_dir}/.worktrees/{spec_name}"))
        print()
        print("When you're ready to add it:")
        print(highlight(f"  python auto-claude/run.py --spec {spec_name} --merge"))
        print()
        print("To see what was built:")
        print(muted(f"  python auto-claude/run.py --spec {spec_name} --review"))
        print()


def merge_existing_build(
    project_dir: Path, spec_name: str, no_commit: bool = False
) -> bool:
    """
    Merge an existing build into the project.

    Called when user runs: python auto-claude/run.py --spec X --merge

    Args:
        project_dir: The project directory
        spec_name: Name of the spec
        no_commit: If True, merge changes but don't commit (stage only for review in IDE)

    Returns:
        True if merge succeeded
    """
    worktree_path = get_existing_build_worktree(project_dir, spec_name)

    if not worktree_path:
        print()
        print_status(f"No existing build found for '{spec_name}'.", "warning")
        print()
        print("To start a new build:")
        print(highlight(f"  python auto-claude/run.py --spec {spec_name}"))
        return False

    if no_commit:
        content = [
            bold(f"{icon(Icons.SUCCESS)} STAGING BUILD FOR REVIEW"),
            "",
            muted("Changes will be staged but NOT committed."),
            muted("Review in your IDE, then commit when ready."),
        ]
    else:
        content = [
            bold(f"{icon(Icons.SUCCESS)} ADDING BUILD TO YOUR PROJECT"),
        ]
    print()
    print(box(content, width=60, style="heavy"))

    manager = WorktreeManager(project_dir)

    show_build_summary(manager, spec_name)
    print()

    success_result = manager.merge_worktree(
        spec_name, delete_after=True, no_commit=no_commit
    )

    if success_result:
        print()
        if no_commit:
            print_status("Changes are staged in your working directory.", "success")
            print()
            print("Review the changes in your IDE, then commit:")
            print(highlight("  git commit -m 'your commit message'"))
            print()
            print("Or discard if not satisfied:")
            print(muted("  git reset --hard HEAD"))
        else:
            print_status("Your feature has been added to your project.", "success")
        return True
    else:
        print()
        print_status("There was a conflict merging the changes.", "error")
        print(muted("You may need to merge manually."))
        return False


def review_existing_build(project_dir: Path, spec_name: str) -> bool:
    """
    Show what an existing build contains.

    Called when user runs: python auto-claude/run.py --spec X --review

    Args:
        project_dir: The project directory
        spec_name: Name of the spec

    Returns:
        True if build exists
    """
    worktree_path = get_existing_build_worktree(project_dir, spec_name)

    if not worktree_path:
        print()
        print_status(f"No existing build found for '{spec_name}'.", "warning")
        print()
        print("To start a new build:")
        print(highlight(f"  python auto-claude/run.py --spec {spec_name}"))
        return False

    content = [
        bold(f"{icon(Icons.FILE)} BUILD CONTENTS"),
    ]
    print()
    print(box(content, width=60, style="heavy"))

    manager = WorktreeManager(project_dir)
    worktree_info = manager.get_worktree_info(spec_name)

    show_build_summary(manager, spec_name)
    show_changed_files(manager, spec_name)

    print()
    print(muted("-" * 60))
    print()
    print("To test the feature:")
    print(highlight(f"  cd {worktree_path}"))
    print()
    print("To add these changes to your project:")
    print(highlight(f"  python auto-claude/run.py --spec {spec_name} --merge"))
    print()
    print("To see full diff:")
    if worktree_info:
        print(muted(f"  git diff {worktree_info.base_branch}...{worktree_info.branch}"))
    print()

    return True


def discard_existing_build(project_dir: Path, spec_name: str) -> bool:
    """
    Discard an existing build (with confirmation).

    Called when user runs: python auto-claude/run.py --spec X --discard

    Requires typing "delete" to confirm - prevents accidents.

    Args:
        project_dir: The project directory
        spec_name: Name of the spec

    Returns:
        True if discarded
    """
    worktree_path = get_existing_build_worktree(project_dir, spec_name)

    if not worktree_path:
        print()
        print_status(f"No existing build found for '{spec_name}'.", "warning")
        return False

    content = [
        warning(f"{icon(Icons.WARNING)} DELETE BUILD RESULTS?"),
        "",
        "This will permanently delete all work for this build.",
    ]
    print()
    print(box(content, width=60, style="heavy"))

    manager = WorktreeManager(project_dir)

    show_build_summary(manager, spec_name)

    print()
    print(f"Are you sure? Type {highlight('delete')} to confirm: ", end="")

    try:
        confirmation = input().strip().lower()
    except KeyboardInterrupt:
        print()
        print_status("Cancelled. Your build is still saved.", "info")
        return False

    if confirmation != "delete":
        print()
        print_status("Cancelled. Your build is still saved.", "info")
        return False

    # Actually delete
    manager.remove_worktree(spec_name, delete_branch=True)

    print()
    print_status("Build deleted.", "success")
    return True


def check_existing_build(project_dir: Path, spec_name: str) -> bool:
    """
    Check if there's an existing build and offer options.

    Returns True if user wants to continue with existing build,
    False if they want to start fresh (after discarding).
    """
    worktree_path = get_existing_build_worktree(project_dir, spec_name)

    if not worktree_path:
        return False  # No existing build

    content = [
        info(f"{icon(Icons.INFO)} EXISTING BUILD FOUND"),
        "",
        "There's already a build in progress for this spec.",
    ]
    print()
    print(box(content, width=60, style="heavy"))

    options = [
        MenuOption(
            key="continue",
            label="Continue where it left off",
            icon=Icons.PLAY,
            description="Resume building from the last checkpoint",
        ),
        MenuOption(
            key="review",
            label="Review what was built",
            icon=Icons.FILE,
            description="See the files that were created/modified",
        ),
        MenuOption(
            key="merge",
            label="Add to my project now",
            icon=Icons.SUCCESS,
            description="Merge the existing build into your project",
        ),
        MenuOption(
            key="fresh",
            label="Start fresh",
            icon=Icons.ERROR,
            description="Discard current build and start over",
        ),
    ]

    print()
    choice = select_menu(
        title="What would you like to do?",
        options=options,
        allow_quit=True,
    )

    if choice is None:
        print()
        print_status("Cancelled.", "info")
        sys.exit(0)

    if choice == "continue":
        return True  # Continue with existing
    elif choice == "review":
        review_existing_build(project_dir, spec_name)
        print()
        input("Press Enter to continue building...")
        return True
    elif choice == "merge":
        merge_existing_build(project_dir, spec_name)
        return False  # Start fresh after merge
    elif choice == "fresh":
        discarded = discard_existing_build(project_dir, spec_name)
        return not discarded  # If discarded, start fresh
    else:
        return True  # Default to continue


def list_all_worktrees(project_dir: Path) -> list[WorktreeInfo]:
    """
    List all spec worktrees in the project.

    Args:
        project_dir: Main project directory

    Returns:
        List of WorktreeInfo for each spec worktree
    """
    manager = WorktreeManager(project_dir)
    return manager.list_all_worktrees()


def cleanup_all_worktrees(project_dir: Path, confirm: bool = True) -> bool:
    """
    Remove all worktrees and their branches.

    Args:
        project_dir: Main project directory
        confirm: Whether to ask for confirmation

    Returns:
        True if cleanup succeeded
    """
    manager = WorktreeManager(project_dir)
    worktrees = manager.list_all_worktrees()

    if not worktrees:
        print_status("No worktrees found.", "info")
        return True

    print()
    print("=" * 70)
    print("  CLEANUP ALL WORKTREES")
    print("=" * 70)

    content = [
        warning(f"{icon(Icons.WARNING)} THIS WILL DELETE ALL BUILD WORKTREES"),
        "",
        "The following will be removed:",
    ]
    for wt in worktrees:
        content.append(f"  - {wt.spec_name} ({wt.branch})")

    print()
    print(box(content, width=70, style="heavy"))

    if confirm:
        print()
        response = input("  Type 'cleanup' to confirm: ").strip()
        if response != "cleanup":
            print_status("Cleanup cancelled.", "info")
            return False

    manager.cleanup_all()

    print()
    print_status("All worktrees cleaned up.", "success")
    return True
