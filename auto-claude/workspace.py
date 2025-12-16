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

import json
import shutil
import subprocess
import sys
from enum import Enum
from pathlib import Path
from typing import Optional

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

# Import debug utilities
try:
    from debug import debug, debug_detailed, debug_verbose, debug_success, debug_error, debug_warning, is_debug_enabled
except ImportError:
    def debug(*args, **kwargs): pass
    def debug_detailed(*args, **kwargs): pass
    def debug_verbose(*args, **kwargs): pass
    def debug_success(*args, **kwargs): pass
    def debug_error(*args, **kwargs): pass
    def debug_warning(*args, **kwargs): pass
    def is_debug_enabled(): return False

# Import merge system
from merge import (
    MergeOrchestrator,
    MergeDecision,
    ConflictSeverity,
    FileEvolutionTracker,
    FileTimelineTracker,
)

# Track if we've already tried to install the git hook this session
_git_hook_check_done = False

MODULE = "workspace"


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

    # Ensure timeline tracking hook is installed (once per session)
    _ensure_timeline_hook_installed(project_dir)

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

    # Initialize FileTimelineTracker for this task
    _initialize_timeline_tracking(
        project_dir=project_dir,
        spec_name=spec_name,
        worktree_path=worktree_info.path,
        source_spec_dir=localized_spec_dir or source_spec_dir,
    )

    return worktree_info.path, manager, localized_spec_dir


def _ensure_timeline_hook_installed(project_dir: Path) -> None:
    """
    Ensure the FileTimelineTracker git post-commit hook is installed.

    This enables tracking human commits to main branch for drift detection.
    Called once per session during first workspace setup.
    """
    global _git_hook_check_done
    if _git_hook_check_done:
        return

    _git_hook_check_done = True

    try:
        git_dir = project_dir / ".git"
        if not git_dir.exists():
            return  # Not a git repo

        # Handle worktrees (where .git is a file, not directory)
        if git_dir.is_file():
            content = git_dir.read_text().strip()
            if content.startswith("gitdir:"):
                git_dir = Path(content.split(":", 1)[1].strip())
            else:
                return

        hook_path = git_dir / "hooks" / "post-commit"

        # Check if hook already installed
        if hook_path.exists():
            if "FileTimelineTracker" in hook_path.read_text():
                debug(MODULE, "FileTimelineTracker hook already installed")
                return

        # Auto-install the hook (silent, non-intrusive)
        from merge.install_hook import install_hook
        install_hook(project_dir)
        debug(MODULE, "Auto-installed FileTimelineTracker git hook")

    except Exception as e:
        # Non-fatal - hook installation is optional
        debug_warning(MODULE, f"Could not auto-install timeline hook: {e}")


def _initialize_timeline_tracking(
    project_dir: Path,
    spec_name: str,
    worktree_path: Path,
    source_spec_dir: Path | None = None,
) -> None:
    """
    Initialize FileTimelineTracker for a new task.

    This registers the task's branch point and the files it intends to modify,
    enabling intent-aware merge conflict resolution later.
    """
    try:
        tracker = FileTimelineTracker(project_dir)

        # Get task intent from implementation plan
        task_intent = ""
        task_title = spec_name
        files_to_modify = []

        if source_spec_dir:
            plan_path = source_spec_dir / "implementation_plan.json"
            if plan_path.exists():
                import json
                with open(plan_path) as f:
                    plan = json.load(f)
                task_title = plan.get("title", spec_name)
                task_intent = plan.get("description", "")

                # Extract files from phases/subtasks
                for phase in plan.get("phases", []):
                    for subtask in phase.get("subtasks", []):
                        files_to_modify.extend(subtask.get("files", []))

        # Get the current branch point commit
        import subprocess
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=project_dir,
            capture_output=True,
            text=True,
        )
        branch_point = result.stdout.strip() if result.returncode == 0 else None

        if files_to_modify and branch_point:
            # Register the task with known files
            tracker.on_task_start(
                task_id=spec_name,
                files_to_modify=list(set(files_to_modify)),  # Dedupe
                branch_point_commit=branch_point,
                task_intent=task_intent,
                task_title=task_title,
            )
            debug(MODULE, f"Timeline tracking initialized for {spec_name}",
                  files_tracked=len(files_to_modify),
                  branch_point=branch_point[:8] if branch_point else None)
        else:
            # Initialize retroactively from worktree if no plan
            tracker.initialize_from_worktree(
                task_id=spec_name,
                worktree_path=worktree_path,
                task_intent=task_intent,
                task_title=task_title,
            )

    except Exception as e:
        # Non-fatal - timeline tracking is supplementary
        debug_warning(MODULE, f"Could not initialize timeline tracking: {e}")
        print(muted(f"  Note: Timeline tracking could not be initialized: {e}"))


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
    project_dir: Path,
    spec_name: str,
    no_commit: bool = False,
    use_smart_merge: bool = True,
) -> bool:
    """
    Merge an existing build into the project using intent-aware merge.

    Called when user runs: python auto-claude/run.py --spec X --merge

    This uses the MergeOrchestrator to:
    1. Analyze semantic changes from the task
    2. Detect potential conflicts with main branch
    3. Auto-merge compatible changes
    4. Use AI for ambiguous conflicts (if enabled)
    5. Fall back to git merge for remaining changes

    Args:
        project_dir: The project directory
        spec_name: Name of the spec
        no_commit: If True, merge changes but don't commit (stage only for review in IDE)
        use_smart_merge: If True, use intent-aware merge (default True)

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

    # Try smart merge first if enabled
    if use_smart_merge:
        smart_result = _try_smart_merge(
            project_dir, spec_name, worktree_path, manager, no_commit=no_commit
        )

        if smart_result is not None:
            # Smart merge handled it (success or identified conflicts)
            if smart_result.get("success"):
                # Check if smart merge resolved git conflicts directly
                if smart_result.get("stats", {}).get("ai_assisted"):
                    # AI resolved git conflicts - changes are already staged
                    _print_merge_success(no_commit, smart_result.get("stats"))

                    # Cleanup the worktree since merge is done
                    try:
                        manager.remove_worktree(spec_name, delete_branch=True)
                    except Exception:
                        pass  # Best effort cleanup

                    return True
                else:
                    # No git conflicts, do standard git merge
                    success_result = manager.merge_worktree(
                        spec_name, delete_after=True, no_commit=no_commit
                    )
                    if success_result:
                        _print_merge_success(no_commit, smart_result.get("stats"))
                        return True
            elif smart_result.get("git_conflicts"):
                # Had git conflicts that AI couldn't fully resolve
                resolved = smart_result.get("resolved", [])
                remaining = smart_result.get("conflicts", [])

                if resolved:
                    print()
                    print_status(f"AI resolved {len(resolved)} file(s)", "success")

                if remaining:
                    print()
                    print_status(
                        f"{len(remaining)} conflict(s) require manual resolution:",
                        "warning"
                    )
                    _print_conflict_info(smart_result)

                    # Changes for resolved files are staged, remaining need manual work
                    print()
                    print("The resolved files are staged. For remaining conflicts:")
                    print(muted("  1. Manually resolve the conflicting files"))
                    print(muted("  2. git add <resolved-files>"))
                    print(muted("  3. git commit"))
                    return False
            elif smart_result.get("conflicts"):
                # Has semantic conflicts that need resolution
                _print_conflict_info(smart_result)
                print()
                print(muted("Attempting git merge anyway..."))
                print()

    # Fall back to standard git merge
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


def _try_smart_merge(
    project_dir: Path,
    spec_name: str,
    worktree_path: Path,
    manager: WorktreeManager,
    no_commit: bool = False,
) -> Optional[dict]:
    """
    Try to use the intent-aware merge system.

    This handles both semantic conflicts (parallel tasks) and git conflicts
    (branch divergence) by using AI to intelligently merge files.

    Uses a lock file to prevent concurrent merges for the same spec.

    Returns:
        Dict with results, or None if smart merge not applicable
    """
    # Quick Win 5: Acquire merge lock to prevent concurrent operations
    try:
        with MergeLock(project_dir, spec_name):
            return _try_smart_merge_inner(
                project_dir, spec_name, worktree_path, manager, no_commit
            )
    except MergeLockError as e:
        print(warning(f"  {e}"))
        return {
            "success": False,
            "error": str(e),
            "conflicts": [],
        }


def _try_smart_merge_inner(
    project_dir: Path,
    spec_name: str,
    worktree_path: Path,
    manager: WorktreeManager,
    no_commit: bool = False,
) -> Optional[dict]:
    """Inner implementation of smart merge (called with lock held)."""
    debug(MODULE, "=== SMART MERGE START ===",
          spec_name=spec_name,
          worktree_path=str(worktree_path),
          no_commit=no_commit)

    try:
        print(muted("  Analyzing changes with intent-aware merge..."))

        # Capture worktree state in FileTimelineTracker before merge
        try:
            timeline_tracker = FileTimelineTracker(project_dir)
            timeline_tracker.capture_worktree_state(spec_name, worktree_path)
            debug(MODULE, "Captured worktree state for timeline tracking")
        except Exception as e:
            debug_warning(MODULE, f"Could not capture worktree state: {e}")

        # Initialize the orchestrator
        debug(MODULE, "Initializing MergeOrchestrator",
              project_dir=str(project_dir),
              enable_ai=True)
        orchestrator = MergeOrchestrator(
            project_dir,
            enable_ai=True,  # Enable AI for ambiguous conflicts
            dry_run=False,
        )

        # Refresh evolution data from the worktree
        debug(MODULE, "Refreshing evolution data from git",
              spec_name=spec_name)
        orchestrator.evolution_tracker.refresh_from_git(spec_name, worktree_path)

        # Check for git-level conflicts first (branch divergence)
        debug(MODULE, "Checking for git-level conflicts")
        git_conflicts = _check_git_conflicts(project_dir, spec_name)

        debug_detailed(MODULE, "Git conflict check result",
                      has_conflicts=git_conflicts.get("has_conflicts"),
                      conflicting_files=git_conflicts.get("conflicting_files", []),
                      base_branch=git_conflicts.get("base_branch"))

        if git_conflicts.get("has_conflicts"):
            print(muted(f"  Branch has diverged from {git_conflicts.get('base_branch', 'main')}"))
            print(muted(f"  Conflicting files: {len(git_conflicts.get('conflicting_files', []))}"))

            debug(MODULE, "Starting AI conflict resolution",
                  num_conflicts=len(git_conflicts.get("conflicting_files", [])))

            # Try to resolve git conflicts with AI
            resolution_result = _resolve_git_conflicts_with_ai(
                project_dir,
                spec_name,
                worktree_path,
                git_conflicts,
                orchestrator,
                no_commit=no_commit,
            )

            if resolution_result.get("success"):
                debug_success(MODULE, "AI conflict resolution succeeded",
                             resolved_files=resolution_result.get("resolved_files", []),
                             stats=resolution_result.get("stats", {}))
                return resolution_result
            else:
                # AI couldn't resolve all conflicts
                debug_error(MODULE, "AI conflict resolution failed",
                           remaining_conflicts=resolution_result.get("remaining_conflicts", []),
                           resolved_files=resolution_result.get("resolved_files", []),
                           error=resolution_result.get("error"))
                return {
                    "success": False,
                    "conflicts": resolution_result.get("remaining_conflicts", []),
                    "resolved": resolution_result.get("resolved_files", []),
                    "git_conflicts": True,
                    "error": resolution_result.get("error"),
                }

        # No git conflicts - proceed with semantic analysis
        debug(MODULE, "No git conflicts, proceeding with semantic analysis")
        preview = orchestrator.preview_merge([spec_name])

        files_to_merge = len(preview.get("files_to_merge", []))
        conflicts = preview.get("conflicts", [])
        auto_mergeable = preview.get("summary", {}).get("auto_mergeable", 0)

        print(muted(f"  Found {files_to_merge} files to merge"))

        if conflicts:
            print(muted(f"  Detected {len(conflicts)} potential conflict(s)"))
            print(muted(f"  Auto-mergeable: {auto_mergeable}/{len(conflicts)}"))

            # Check if any conflicts need human review
            needs_human = [
                c for c in conflicts
                if not c.get("can_auto_merge")
            ]

            if needs_human:
                return {
                    "success": False,
                    "conflicts": needs_human,
                    "preview": preview,
                }

        # All conflicts can be auto-merged or no conflicts
        print(muted("  All changes compatible, proceeding with merge..."))
        return {
            "success": True,
            "stats": {
                "files_merged": files_to_merge,
                "auto_resolved": auto_mergeable,
            },
        }

    except Exception as e:
        # If smart merge fails, fall back to git
        import traceback
        print(muted(f"  Smart merge error: {e}"))
        traceback.print_exc()
        return None


def _check_git_conflicts(project_dir: Path, spec_name: str) -> dict:
    """
    Check for git-level conflicts WITHOUT modifying the working directory.

    Uses git merge-tree to check conflicts in-memory, avoiding HMR triggers
    from file system changes.

    Returns:
        Dict with has_conflicts, conflicting_files, etc.
    """
    import re
    import subprocess

    spec_branch = f"auto-claude/{spec_name}"
    result = {
        "has_conflicts": False,
        "conflicting_files": [],
        "base_branch": "main",
        "spec_branch": spec_branch,
    }

    try:
        # Get current branch
        base_result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=project_dir,
            capture_output=True,
            text=True,
        )
        if base_result.returncode == 0:
            result["base_branch"] = base_result.stdout.strip()

        # Get merge base
        merge_base_result = subprocess.run(
            ["git", "merge-base", result["base_branch"], spec_branch],
            cwd=project_dir,
            capture_output=True,
            text=True,
        )
        if merge_base_result.returncode != 0:
            debug_warning(MODULE, "Could not find merge base")
            return result

        merge_base = merge_base_result.stdout.strip()

        # Get commit hashes
        main_commit_result = subprocess.run(
            ["git", "rev-parse", result["base_branch"]],
            cwd=project_dir,
            capture_output=True,
            text=True,
        )
        spec_commit_result = subprocess.run(
            ["git", "rev-parse", spec_branch],
            cwd=project_dir,
            capture_output=True,
            text=True,
        )

        if main_commit_result.returncode != 0 or spec_commit_result.returncode != 0:
            debug_warning(MODULE, "Could not resolve branch commits")
            return result

        main_commit = main_commit_result.stdout.strip()
        spec_commit = spec_commit_result.stdout.strip()

        # Use git merge-tree to check for conflicts WITHOUT touching working directory
        merge_tree_result = subprocess.run(
            ["git", "merge-tree", "--write-tree", "--no-messages", merge_base, main_commit, spec_commit],
            cwd=project_dir,
            capture_output=True,
            text=True,
        )

        # merge-tree returns exit code 1 if there are conflicts
        if merge_tree_result.returncode != 0:
            result["has_conflicts"] = True

            # Parse the output for conflicting files
            output = merge_tree_result.stdout + merge_tree_result.stderr
            for line in output.split("\n"):
                if "CONFLICT" in line:
                    match = re.search(r"(?:Merge conflict in|CONFLICT.*?:)\s*(.+?)(?:\s*$|\s+\()", line)
                    if match:
                        file_path = match.group(1).strip()
                        if file_path and file_path not in result["conflicting_files"]:
                            result["conflicting_files"].append(file_path)

            # Fallback: if we didn't parse conflicts, use diff to find files changed in both branches
            if not result["conflicting_files"]:
                main_files_result = subprocess.run(
                    ["git", "diff", "--name-only", merge_base, main_commit],
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                )
                main_files = set(main_files_result.stdout.strip().split("\n")) if main_files_result.stdout.strip() else set()

                spec_files_result = subprocess.run(
                    ["git", "diff", "--name-only", merge_base, spec_commit],
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                )
                spec_files = set(spec_files_result.stdout.strip().split("\n")) if spec_files_result.stdout.strip() else set()

                # Files modified in both = potential conflicts
                conflicting = main_files & spec_files
                result["conflicting_files"] = list(conflicting)

    except Exception as e:
        print(muted(f"  Error checking git conflicts: {e}"))

    return result


def _resolve_git_conflicts_with_ai(
    project_dir: Path,
    spec_name: str,
    worktree_path: Path,
    git_conflicts: dict,
    orchestrator: MergeOrchestrator,
    no_commit: bool = False,
) -> dict:
    """
    Resolve git-level conflicts using AI.

    This handles the case where main has diverged from the worktree branch.
    For each conflicting file, it:
    1. Gets the content from the main branch
    2. Gets the content from the worktree branch
    3. Gets the common ancestor (merge-base) content
    4. Uses AI to intelligently merge them
    5. Writes the merged content to main and stages it

    Returns:
        Dict with success, resolved_files, remaining_conflicts
    """
    import subprocess

    debug(MODULE, "=== AI CONFLICT RESOLUTION START ===",
          spec_name=spec_name,
          num_conflicting_files=len(git_conflicts.get("conflicting_files", [])))

    conflicting_files = git_conflicts.get("conflicting_files", [])
    base_branch = git_conflicts.get("base_branch", "main")
    spec_branch = git_conflicts.get("spec_branch", f"auto-claude/{spec_name}")

    debug_detailed(MODULE, "Conflict resolution params",
                  base_branch=base_branch,
                  spec_branch=spec_branch,
                  conflicting_files=conflicting_files)

    resolved_files = []
    remaining_conflicts = []

    print()
    print_status(f"Resolving {len(conflicting_files)} conflicting file(s) with AI...", "progress")

    # Get merge-base commit
    merge_base_result = subprocess.run(
        ["git", "merge-base", base_branch, spec_branch],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    merge_base = merge_base_result.stdout.strip() if merge_base_result.returncode == 0 else None
    debug(MODULE, "Found merge-base commit", merge_base=merge_base[:12] if merge_base else None)

    # FIX: Copy NEW files FIRST before resolving conflicts
    # This ensures dependencies exist before files that import them are written
    changed_files = _get_changed_files_from_branch(project_dir, base_branch, spec_branch)
    new_files = [(f, s) for f, s in changed_files if s == "A" and f not in conflicting_files]

    if new_files:
        print(muted(f"  Copying {len(new_files)} new file(s) first (dependencies)..."))
        for file_path, status in new_files:
            try:
                content = _get_file_content_from_ref(project_dir, spec_branch, file_path)
                if content is not None:
                    target_path = project_dir / file_path
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    target_path.write_text(content, encoding="utf-8")
                    subprocess.run(["git", "add", file_path], cwd=project_dir, capture_output=True)
                    resolved_files.append(file_path)
                    debug(MODULE, f"Copied new file: {file_path}")
            except Exception as e:
                debug_warning(MODULE, f"Could not copy new file {file_path}: {e}")

    for file_path in conflicting_files:
        debug(MODULE, f"Processing conflicting file: {file_path}")
        print(muted(f"  Processing: {file_path}"))

        try:
            # Get content from main branch
            main_content = _get_file_content_from_ref(project_dir, base_branch, file_path)

            # Get content from worktree branch
            worktree_content = _get_file_content_from_ref(project_dir, spec_branch, file_path)

            # Get content from merge-base (common ancestor)
            base_content = None
            if merge_base:
                base_content = _get_file_content_from_ref(project_dir, merge_base, file_path)

            if main_content is None and worktree_content is None:
                # File doesn't exist in either - skip
                continue

            if main_content is None:
                # File only exists in worktree - it's a new file
                merged_content = worktree_content
                print(muted(f"    New file from worktree"))
            elif worktree_content is None:
                # File only exists in main - was deleted in worktree
                merged_content = None  # Will delete
                print(muted(f"    File deleted in worktree"))
            else:
                # File exists in both - need to merge
                merged_content = _merge_file_with_ai(
                    file_path=file_path,
                    main_content=main_content,
                    worktree_content=worktree_content,
                    base_content=base_content,
                    spec_name=spec_name,
                    orchestrator=orchestrator,
                    project_dir=project_dir,
                )

                if merged_content is None:
                    # AI couldn't merge
                    remaining_conflicts.append({
                        "file": file_path,
                        "reason": "AI could not resolve the conflict",
                        "severity": "high",
                    })
                    continue

            # Write the merged content to the project
            if merged_content is not None:
                target_path = project_dir / file_path
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_text(merged_content, encoding="utf-8")

                # Stage the file
                subprocess.run(
                    ["git", "add", file_path],
                    cwd=project_dir,
                    capture_output=True,
                )

                resolved_files.append(file_path)
                print(success(f"    ✓ Merged successfully"))
            else:
                # Delete the file
                target_path = project_dir / file_path
                if target_path.exists():
                    target_path.unlink()
                    subprocess.run(
                        ["git", "add", file_path],
                        cwd=project_dir,
                        capture_output=True,
                    )
                resolved_files.append(file_path)
                print(success(f"    ✓ Deleted as per worktree"))

        except Exception as e:
            print(error(f"    ✗ Failed: {e}"))
            remaining_conflicts.append({
                "file": file_path,
                "reason": str(e),
                "severity": "high",
            })

    if remaining_conflicts:
        return {
            "success": False,
            "resolved_files": resolved_files,
            "remaining_conflicts": remaining_conflicts,
        }

    # All conflicts resolved - now merge remaining non-conflicting files
    # (New files were already copied at the start)
    print(muted("  Merging remaining files..."))

    # Get list of modified/deleted files (new files already copied at start)
    non_conflicting = [
        (f, s) for f, s in changed_files
        if f not in conflicting_files and s != "A"  # Skip new files, already copied
    ]

    for file_path, status in non_conflicting:
        try:
            if status == "D":
                # Deleted in worktree
                target_path = project_dir / file_path
                if target_path.exists():
                    target_path.unlink()
                    subprocess.run(["git", "add", file_path], cwd=project_dir, capture_output=True)
            else:
                # Added or modified - copy from worktree
                content = _get_file_content_from_ref(project_dir, spec_branch, file_path)
                if content is not None:
                    target_path = project_dir / file_path
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    target_path.write_text(content, encoding="utf-8")
                    subprocess.run(["git", "add", file_path], cwd=project_dir, capture_output=True)
                    resolved_files.append(file_path)
        except Exception as e:
            print(muted(f"    Warning: Could not process {file_path}: {e}"))

    # V2: Record merge completion in Evolution Tracker for future context
    if resolved_files:
        _record_merge_completion(project_dir, spec_name, resolved_files)

    return {
        "success": True,
        "resolved_files": resolved_files,
        "stats": {
            "files_merged": len(resolved_files),
            "conflicts_resolved": len(conflicting_files),
            "ai_assisted": len(conflicting_files),
        },
    }


def _get_file_content_from_ref(project_dir: Path, ref: str, file_path: str) -> Optional[str]:
    """Get file content from a git ref (branch, commit, etc.)."""
    import subprocess

    result = subprocess.run(
        ["git", "show", f"{ref}:{file_path}"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return result.stdout
    return None


def _get_changed_files_from_branch(
    project_dir: Path,
    base_branch: str,
    spec_branch: str,
) -> list[tuple[str, str]]:
    """Get list of changed files between branches."""
    import subprocess

    result = subprocess.run(
        ["git", "diff", "--name-status", f"{base_branch}...{spec_branch}"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )

    files = []
    if result.returncode == 0:
        for line in result.stdout.strip().split("\n"):
            if line:
                parts = line.split("\t", 1)
                if len(parts) == 2:
                    files.append((parts[1], parts[0]))  # (file_path, status)
    return files


# Constants for merge limits
MAX_FILE_LINES_FOR_AI = 5000  # Skip AI for files larger than this
BINARY_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.pyc', '.pyo', '.class', '.o', '.obj',
}

# Merge lock timeout in seconds
MERGE_LOCK_TIMEOUT = 300  # 5 minutes


class MergeLock:
    """
    Context manager for merge locking to prevent concurrent merges.

    Uses a lock file in .auto-claude/ to ensure only one merge operation
    runs at a time for a given project.
    """

    def __init__(self, project_dir: Path, spec_name: str):
        self.project_dir = project_dir
        self.spec_name = spec_name
        self.lock_dir = project_dir / ".auto-claude" / ".locks"
        self.lock_file = self.lock_dir / f"merge-{spec_name}.lock"
        self.acquired = False

    def __enter__(self):
        """Acquire the merge lock."""
        import time
        import os

        self.lock_dir.mkdir(parents=True, exist_ok=True)

        # Check if lock exists and is stale
        if self.lock_file.exists():
            try:
                lock_data = json.loads(self.lock_file.read_text())
                lock_time = lock_data.get("timestamp", 0)
                lock_pid = lock_data.get("pid", 0)

                # Check if lock is stale (older than timeout)
                if time.time() - lock_time > MERGE_LOCK_TIMEOUT:
                    print(muted(f"    Removing stale merge lock (older than {MERGE_LOCK_TIMEOUT}s)"))
                    self.lock_file.unlink()
                # Check if locking process is still alive
                elif lock_pid and not _is_process_running(lock_pid):
                    print(muted(f"    Removing orphaned merge lock (PID {lock_pid} not running)"))
                    self.lock_file.unlink()
                else:
                    raise MergeLockError(
                        f"Another merge operation is in progress for {self.spec_name}. "
                        f"If this is an error, delete {self.lock_file}"
                    )
            except json.JSONDecodeError:
                # Corrupted lock file, remove it
                self.lock_file.unlink()

        # Create lock file
        lock_data = {
            "spec_name": self.spec_name,
            "timestamp": time.time(),
            "pid": os.getpid(),
        }
        self.lock_file.write_text(json.dumps(lock_data))
        self.acquired = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Release the merge lock."""
        if self.acquired and self.lock_file.exists():
            try:
                self.lock_file.unlink()
            except Exception:
                pass  # Best effort cleanup
        return False


class MergeLockError(Exception):
    """Raised when a merge lock cannot be acquired."""
    pass


def _is_process_running(pid: int) -> bool:
    """Check if a process with the given PID is running."""
    import os
    try:
        os.kill(pid, 0)
        return True
    except (OSError, ProcessLookupError):
        return False


def _is_binary_file(file_path: str) -> bool:
    """Check if a file is binary based on extension."""
    from pathlib import Path
    return Path(file_path).suffix.lower() in BINARY_EXTENSIONS


def _record_merge_completion(
    project_dir: Path,
    spec_name: str,
    merged_files: list[str],
    task_intent: str = "",
    merge_commit: str = "",
) -> None:
    """
    Record completed merge in both Evolution Tracker and FileTimelineTracker.

    This enables future AI merges to understand the history of file changes,
    creating a knowledge chain for intelligent conflict resolution.

    Args:
        project_dir: Project root directory
        spec_name: The task/spec that was merged
        merged_files: List of file paths that were merged
        task_intent: Description of what the task accomplished
        merge_commit: The commit hash of the merge (for timeline tracking)
    """
    # Get intent from implementation plan if not provided
    if not task_intent:
        intent_data = _get_task_intent(project_dir, spec_name)
        if intent_data:
            task_intent = intent_data.get("description", "") or intent_data.get("title", spec_name)

    # Track in FileEvolutionTracker (legacy system)
    try:
        tracker = FileEvolutionTracker(project_dir)

        # Mark the task as completed for all its tracked files
        tracker.mark_task_completed(spec_name)

        # Record merge metadata for each file
        for file_path in merged_files:
            evolution = tracker.get_file_evolution(file_path)
            if evolution:
                # The task snapshot should already exist from refresh_from_git
                # Just ensure it's marked as completed with intent
                snapshot = evolution.get_task_snapshot(spec_name)
                if snapshot:
                    snapshot.task_intent = task_intent

        # Save updates
        tracker._save_evolutions()

        debug(MODULE, f"Recorded merge in FileEvolutionTracker",
              spec_name=spec_name, files=len(merged_files))

    except Exception as e:
        debug_warning(MODULE, f"Could not record in FileEvolutionTracker: {e}")

    # Track in FileTimelineTracker (new intent-aware system)
    try:
        timeline_tracker = FileTimelineTracker(project_dir)

        # Get merge commit if not provided
        if not merge_commit:
            import subprocess
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=project_dir,
                capture_output=True,
                text=True,
            )
            merge_commit = result.stdout.strip() if result.returncode == 0 else "unknown"

        # Mark task as merged in timeline tracker
        timeline_tracker.on_task_merged(spec_name, merge_commit)

        debug(MODULE, f"Recorded merge in FileTimelineTracker",
              spec_name=spec_name, merge_commit=merge_commit[:8])
        print(muted(f"    Recorded merge completion for {len(merged_files)} files"))

    except Exception as e:
        # Non-fatal - this is supplementary tracking
        debug_warning(MODULE, f"Could not record in FileTimelineTracker: {e}")
        print(muted(f"    Note: Could not record merge completion: {e}"))


def _get_task_intent(project_dir: Path, spec_name: str) -> Optional[dict]:
    """
    Load task intent from implementation_plan.json.

    Returns dict with:
    - title: Task title
    - description: What the task does
    - files_to_modify: List of files the task planned to modify
    - current_subtask: What the agent was working on
    """
    try:
        # Try worktree location first, then main project
        for base_path in [
            project_dir / ".worktrees" / spec_name / ".auto-claude" / "specs" / spec_name,
            project_dir / ".auto-claude" / "specs" / spec_name,
        ]:
            plan_path = base_path / "implementation_plan.json"
            if plan_path.exists():
                with open(plan_path) as f:
                    plan = json.load(f)

                # Extract key intent information
                intent = {
                    "title": plan.get("title", spec_name),
                    "description": plan.get("description", ""),
                    "files_to_modify": [],
                    "subtasks": [],
                }

                # Get files_to_modify from phases/subtasks
                for phase in plan.get("phases", []):
                    for subtask in phase.get("subtasks", []):
                        intent["subtasks"].append({
                            "title": subtask.get("title", ""),
                            "description": subtask.get("description", ""),
                            "status": subtask.get("status", "pending"),
                        })
                        # Extract files from subtask if present
                        files = subtask.get("files", [])
                        intent["files_to_modify"].extend(files)

                # Also check spec.md for high-level context
                spec_path = base_path / "spec.md"
                if spec_path.exists():
                    spec_content = spec_path.read_text()
                    # Extract first paragraph as summary
                    lines = spec_content.split("\n\n")
                    if len(lines) > 1:
                        intent["spec_summary"] = lines[1][:500]  # First content paragraph

                return intent

        return None
    except Exception as e:
        print(muted(f"    Could not load task intent: {e}"))
        return None


def _get_recent_merges_context(project_dir: Path, file_path: str, limit: int = 3) -> list[dict]:
    """
    Get context about recent merges that touched this file.

    Uses the FileEvolutionTracker to retrieve historical information about
    recent tasks that have modified this file. This enables the AI to understand
    the file's evolution when resolving merge conflicts.

    Args:
        project_dir: Project root directory
        file_path: Path to the file (relative or absolute)
        limit: Maximum number of recent merges to return

    Returns:
        List of {task_id, intent, timestamp, changes} for recent tasks that modified this file.
    """
    try:
        from merge import FileEvolutionTracker

        tracker = FileEvolutionTracker(project_dir)
        evolution = tracker.get_file_evolution(file_path)

        if not evolution:
            return []

        # Get task snapshots that have completed modifications
        completed_snapshots = [
            ts for ts in evolution.task_snapshots
            if ts.completed_at is not None and ts.semantic_changes
        ]

        # Sort by completion time (most recent first)
        completed_snapshots.sort(
            key=lambda ts: ts.completed_at or ts.started_at,
            reverse=True
        )

        # Limit results
        recent = completed_snapshots[:limit]

        # Build context for each merge
        result = []
        for snapshot in recent:
            # Summarize the semantic changes
            change_summary = []
            for change in snapshot.semantic_changes[:5]:  # Limit to 5 changes
                change_summary.append(
                    f"{change.change_type.value}: {change.symbol_name or change.description}"
                )

            result.append({
                "task_id": snapshot.task_id,
                "intent": snapshot.task_intent,
                "timestamp": (snapshot.completed_at or snapshot.started_at).isoformat(),
                "changes": change_summary,
            })

        return result

    except Exception as e:
        # Log but don't fail - this is supplementary context
        print(muted(f"    Could not load merge history for {file_path}: {e}"))
        return []


def _validate_merged_syntax(file_path: str, content: str, project_dir: Path) -> tuple[bool, str]:
    """
    Validate the syntax of merged code.

    Returns (is_valid, error_message).
    """
    import subprocess
    import tempfile
    from pathlib import Path as P

    ext = P(file_path).suffix.lower()

    # TypeScript/JavaScript validation
    if ext in {'.ts', '.tsx', '.js', '.jsx'}:
        try:
            # Write to temp file in system temp dir (NOT project dir to avoid HMR triggers)
            with tempfile.NamedTemporaryFile(
                mode='w',
                suffix=ext,
                delete=False,
                # Don't set dir= to avoid writing to project directory which triggers HMR
            ) as tmp:
                tmp.write(content)
                tmp_path = tmp.name

            try:
                # Try tsc first (TypeScript)
                if ext in {'.ts', '.tsx'}:
                    result = subprocess.run(
                        ['npx', 'tsc', '--noEmit', '--skipLibCheck', tmp_path],
                        cwd=project_dir,
                        capture_output=True,
                        text=True,
                        timeout=30,
                    )
                    if result.returncode != 0:
                        # Filter out npm warnings (they go to stderr but aren't errors)
                        error_lines = [
                            line for line in result.stderr.strip().split('\n')
                            if line and not line.startswith('npm warn') and not line.startswith('npm WARN')
                        ]
                        # Only treat as error if there are actual TypeScript errors
                        if error_lines:
                            return False, '\n'.join(error_lines[:3])
                        # No actual errors, just npm warnings - syntax is valid

                # Try eslint for all JS/TS
                result = subprocess.run(
                    ['npx', 'eslint', '--no-eslintrc', '--parser', '@typescript-eslint/parser', tmp_path],
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                # eslint exit 1 for errors, 0 for clean
                if result.returncode > 1:  # 2+ is config error, ignore
                    pass
                elif result.returncode == 1 and 'Parsing error' in result.stdout:
                    return False, "Syntax error in merged code"

            finally:
                P(tmp_path).unlink(missing_ok=True)

            return True, ""

        except subprocess.TimeoutExpired:
            return True, ""  # Timeout = assume ok
        except FileNotFoundError:
            return True, ""  # No tsc/eslint = skip validation
        except Exception as e:
            return True, ""  # Other errors = skip validation

    # Python validation
    elif ext == '.py':
        try:
            compile(content, file_path, 'exec')
            return True, ""
        except SyntaxError as e:
            return False, f"Python syntax error: {e.msg} at line {e.lineno}"

    # JSON validation
    elif ext == '.json':
        try:
            json.loads(content)
            return True, ""
        except json.JSONDecodeError as e:
            return False, f"JSON error: {e.msg} at line {e.lineno}"

    # Other file types - skip validation
    return True, ""


def _create_conflict_file_with_git(
    main_content: str,
    worktree_content: str,
    base_content: Optional[str],
    project_dir: Path,
) -> tuple[Optional[str], bool]:
    """
    Use git merge-file to create a file with conflict markers.

    This produces a file with standard git conflict markers that can be
    parsed to extract only the conflicting regions.

    Returns:
        Tuple of (merged_content, has_conflicts):
        - (content, True) if there are conflict markers
        - (content, False) if git cleanly merged (USE THIS RESULT!)
        - (None, False) if merge failed
    """
    import subprocess
    import tempfile

    if not base_content:
        # Without a base, we can't do proper 3-way merge with markers
        debug(MODULE, "git merge-file: no base content available")
        return None, False

    try:
        # Create temp files for git merge-file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.main', delete=False) as main_f:
            main_f.write(main_content)
            main_path = main_f.name

        with tempfile.NamedTemporaryFile(mode='w', suffix='.base', delete=False) as base_f:
            base_f.write(base_content)
            base_path = base_f.name

        with tempfile.NamedTemporaryFile(mode='w', suffix='.worktree', delete=False) as worktree_f:
            worktree_f.write(worktree_content)
            worktree_path = worktree_f.name

        try:
            # git merge-file modifies the first file in place
            # Returns 0 if no conflicts, >0 if conflicts
            result = subprocess.run(
                ['git', 'merge-file', '-p', main_path, base_path, worktree_path],
                cwd=project_dir,
                capture_output=True,
                text=True,
                timeout=30,
            )

            debug(MODULE, "git merge-file result",
                  return_code=result.returncode,
                  output_length=len(result.stdout) if result.stdout else 0,
                  has_conflict_markers='<<<<<<' in result.stdout if result.stdout else False)

            # Return code > 0 means conflicts exist
            if result.returncode > 0 and '<<<<<<' in result.stdout:
                debug(MODULE, "git merge-file: has conflicts")
                return result.stdout, True
            elif result.returncode == 0:
                # Clean merge, no conflicts - THIS IS STILL USEFUL!
                debug(MODULE, "git merge-file: clean merge (no conflicts)")
                return result.stdout, False
            else:
                # Some error occurred
                debug_warning(MODULE, "git merge-file: unexpected result",
                             return_code=result.returncode,
                             stderr=result.stderr[:200] if result.stderr else None)
                return None, False

        finally:
            # Cleanup temp files
            Path(main_path).unlink(missing_ok=True)
            Path(base_path).unlink(missing_ok=True)
            Path(worktree_path).unlink(missing_ok=True)

    except Exception as e:
        debug_warning(MODULE, f"git merge-file failed: {e}")

    return None, False


def _merge_file_with_ai(
    file_path: str,
    main_content: str,
    worktree_content: str,
    base_content: Optional[str],
    spec_name: str,
    orchestrator: MergeOrchestrator,
    project_dir: Optional[Path] = None,
) -> Optional[str]:
    """
    Use AI to merge a conflicting file.

    OPTIMIZED: First tries to identify specific conflict regions and only
    sends those to the AI, rather than regenerating the entire file.

    This enhanced version includes:
    - Conflict-region-only merging (FAST - only sends conflict lines)
    - Fallback to full-file merge for complex cases
    - FileTimelineTracker context for full situational awareness
    - Task intent from implementation_plan.json
    - Binary file detection
    - File size limits
    - Syntax validation after merge

    Returns merged content, or None if AI couldn't resolve.
    """
    from merge import create_claude_resolver
    from merge.prompts import (
        build_timeline_merge_prompt,
        build_simple_merge_prompt,
        build_conflict_only_prompt,
        parse_conflict_markers,
        reassemble_with_resolutions,
        extract_conflict_resolutions,
    )

    debug(MODULE, f"AI merge starting for: {file_path}",
          spec_name=spec_name,
          has_base_content=base_content is not None)

    # Quick Win 2: Binary file detection
    if _is_binary_file(file_path):
        debug_warning(MODULE, "Skipping binary file", file_path=file_path)
        print(warning(f"    Binary file detected, skipping AI merge"))
        return None

    # Quick Win 4: File size limit
    main_lines = main_content.count('\n') if main_content else 0
    worktree_lines = worktree_content.count('\n') if worktree_content else 0
    max_lines = max(main_lines, worktree_lines)

    debug_detailed(MODULE, "File size check",
                  main_lines=main_lines,
                  worktree_lines=worktree_lines,
                  max_allowed=MAX_FILE_LINES_FOR_AI)

    if max_lines > MAX_FILE_LINES_FOR_AI:
        debug_warning(MODULE, "File too large for AI merge",
                     max_lines=max_lines,
                     limit=MAX_FILE_LINES_FOR_AI)
        print(warning(f"    File too large ({max_lines} lines > {MAX_FILE_LINES_FOR_AI}), skipping AI merge"))
        return None

    # Create an AI resolver
    resolver = create_claude_resolver()

    if not resolver.ai_call_fn:
        debug_warning(MODULE, "AI not available, using heuristic merge")
        print(muted(f"    AI not available, trying heuristic merge..."))
        return _heuristic_merge(main_content, worktree_content, base_content)

    # Determine language
    language = resolver._infer_language(file_path)
    debug(MODULE, "Detected language", language=language)

    # Get task intent for context
    task_intent = None
    if project_dir:
        task_intent = _get_task_intent(project_dir, spec_name)

    # OPTIMIZATION: Try git merge-file first
    # This can either:
    # 1. Cleanly merge (no AI needed - FASTEST)
    # 2. Produce conflict markers (only send conflict regions to AI - FAST)
    # 3. Fail (fall back to full-file AI merge - SLOW)
    if project_dir and base_content:
        merged_content, has_conflicts = _create_conflict_file_with_git(
            main_content, worktree_content, base_content, project_dir
        )

        # Case 1: Git cleanly merged - no AI needed!
        if merged_content and not has_conflicts:
            debug_success(MODULE, "Git merge-file cleanly merged (no AI needed)",
                         file_path=file_path)
            print(success(f"    ✓ Git auto-merged (no conflicts)"))

            # Validate syntax before returning
            is_valid, error_msg = _validate_merged_syntax(file_path, merged_content, project_dir)
            if is_valid:
                return merged_content
            else:
                debug_warning(MODULE, "Git auto-merge produced invalid syntax, falling back to AI",
                             error=error_msg)
                print(muted(f"    Git auto-merge had syntax issues, trying AI..."))

        # Case 2: Has conflict markers - use conflict-only AI merge (FAST)
        if merged_content and has_conflicts:
            conflicts, _ = parse_conflict_markers(merged_content)

            if conflicts:
                # Calculate how much smaller this approach is
                total_conflict_lines = sum(
                    len(c['main_lines'].split('\n')) + len(c['worktree_lines'].split('\n'))
                    for c in conflicts
                )
                savings_pct = 100 - (total_conflict_lines * 100 // max(max_lines, 1))

                debug(MODULE, "Using conflict-only merge (optimized)",
                      num_conflicts=len(conflicts),
                      conflict_lines=total_conflict_lines,
                      file_lines=max_lines,
                      savings_pct=savings_pct)
                print(muted(f"    Found {len(conflicts)} conflict region(s) ({total_conflict_lines} lines vs {max_lines} total - {savings_pct}% smaller prompt)"))

                # Build focused prompt with only conflict regions
                prompt = build_conflict_only_prompt(
                    file_path=file_path,
                    conflicts=conflicts,
                    spec_name=spec_name,
                    language=language,
                    task_intent=task_intent,
                )

                try:
                    response = resolver.ai_call_fn(
                        "You are an expert code merge assistant. Resolve ONLY the specific conflicts shown. Output the resolved code for each conflict.",
                        prompt,
                    )

                    if response:
                        # Extract resolutions for each conflict
                        resolutions = extract_conflict_resolutions(response, conflicts, language)

                        if resolutions:
                            debug(MODULE, "Extracted conflict resolutions",
                                  num_resolutions=len(resolutions),
                                  expected=len(conflicts))

                            # Reassemble the file with resolved conflicts
                            merged = reassemble_with_resolutions(merged_content, conflicts, resolutions)

                            # Validate syntax
                            if project_dir:
                                is_valid, error_msg = _validate_merged_syntax(file_path, merged, project_dir)
                                if is_valid:
                                    debug_success(MODULE, "Conflict-only merge succeeded",
                                                 file_path=file_path,
                                                 conflicts_resolved=len(resolutions))
                                    print(success(f"    ✓ Resolved {len(resolutions)} conflict(s)"))
                                    return merged
                                else:
                                    debug_warning(MODULE, "Conflict-only merge produced invalid syntax, falling back",
                                                 error=error_msg)
                                    print(muted(f"    Conflict-only merge had syntax issues, trying full-file merge..."))
                            else:
                                return merged

                except Exception as e:
                    debug_warning(MODULE, f"Conflict-only merge failed: {e}, falling back to full-file")
                    print(muted(f"    Conflict-only merge failed, trying full-file merge..."))

    # FALLBACK: Full-file merge approach (slower but more comprehensive)
    print(muted(f"    Using full-file AI merge..."))

    # Try to get timeline context for richer merge prompt
    timeline_context = None
    if project_dir:
        try:
            tracker = FileTimelineTracker(project_dir)
            timeline_context = tracker.get_merge_context(spec_name, file_path)
            if timeline_context:
                debug(MODULE, "Using FileTimelineTracker context",
                      commits_behind=timeline_context.total_commits_behind,
                      pending_tasks=timeline_context.total_pending_tasks,
                      main_events=len(timeline_context.main_evolution))
        except Exception as e:
            debug_warning(MODULE, f"Could not get timeline context: {e}")

    # Build prompt - use timeline context if available, fallback to simple prompt
    if timeline_context and timeline_context.total_commits_behind > 0:
        # Use the rich timeline-based prompt with full situational awareness
        debug(MODULE, "Building timeline-based merge prompt",
              commits_behind=timeline_context.total_commits_behind,
              main_events=len(timeline_context.main_evolution),
              pending_tasks=timeline_context.total_pending_tasks)
        print(muted(f"    Using timeline context ({timeline_context.total_commits_behind} commits behind, {timeline_context.total_pending_tasks} pending tasks)"))
        prompt = build_timeline_merge_prompt(timeline_context)
    else:
        # Fallback to simple three-way merge prompt
        debug(MODULE, "Building simple merge prompt (no timeline context)")

        if task_intent:
            debug(MODULE, "Loaded task intent",
                  title=task_intent.get('title'),
                  num_subtasks=len(task_intent.get('subtasks', [])))

        prompt = build_simple_merge_prompt(
            file_path=file_path,
            main_content=main_content,
            worktree_content=worktree_content,
            base_content=base_content,
            spec_name=spec_name,
            language=language,
            task_intent=task_intent,
        )

    try:
        debug(MODULE, "Calling AI for full-file merge",
              file_path=file_path,
              has_timeline_context=timeline_context is not None)

        response = resolver.ai_call_fn(
            "You are an expert code merge assistant. Output only the merged code. The code MUST be syntactically valid.",
            prompt,
        )

        debug_detailed(MODULE, "AI response received",
                      response_length=len(response) if response else 0)

        # Log response content for debugging (truncated)
        if response:
            preview = response[:200] if len(response) > 200 else response
            print(f"    [DEBUG] AI response preview: {repr(preview)}", file=sys.stderr)
        else:
            print(f"    [DEBUG] AI response was empty", file=sys.stderr)

        # Extract code from response
        merged = resolver._extract_code_block(response, language)
        if not merged:
            # If extraction failed, try using the whole response if it looks like code
            if resolver._looks_like_code(response, language):
                merged = response.strip()

        if not merged:
            debug_error(MODULE, "Could not extract merged code from AI response")
            print(muted(f"    Could not extract merged code from AI response"))
            return None

        debug(MODULE, "Extracted merged code",
              merged_lines=merged.count('\n') + 1)

        # Quick Win 3: Validate syntax before returning
        if project_dir:
            debug(MODULE, "Validating merged syntax")
            is_valid, error_msg = _validate_merged_syntax(file_path, merged, project_dir)
            if not is_valid:
                debug_warning(MODULE, "AI merge produced invalid syntax",
                             error=error_msg)
                print(warning(f"    AI merge produced invalid syntax: {error_msg}"))
                print(muted(f"    Retrying with syntax fix..."))

                # Try once more with explicit syntax fix request
                retry_prompt = f'''The previous merge attempt produced invalid {language} code.
Error: {error_msg}

Please fix the syntax error and output valid {language} code:

{merged}

Output ONLY the fixed code, wrapped in triple backticks:
```{language}
fixed code here
```
'''
                retry_response = resolver.ai_call_fn(
                    f"Fix the syntax error in this {language} code. Output only valid code.",
                    retry_prompt,
                )
                retry_merged = resolver._extract_code_block(retry_response, language)
                if retry_merged:
                    is_valid, _ = _validate_merged_syntax(file_path, retry_merged, project_dir)
                    if is_valid:
                        debug_success(MODULE, "Syntax fix retry succeeded", file_path=file_path)
                        return retry_merged
                    else:
                        debug_error(MODULE, "Syntax fix retry also failed", file_path=file_path)
                        print(warning(f"    Retry also produced invalid syntax"))
                        return None
                else:
                    debug_error(MODULE, "Could not extract code from retry response")
                    return None

        debug_success(MODULE, "AI merge completed successfully",
                     file_path=file_path,
                     merged_lines=merged.count('\n') + 1)
        return merged

    except Exception as e:
        debug_error(MODULE, "AI merge failed with exception",
                   file_path=file_path,
                   error=str(e))
        print(muted(f"    AI merge failed: {e}"))
        return _heuristic_merge(main_content, worktree_content, base_content)


def _heuristic_merge(
    main_content: str,
    worktree_content: str,
    base_content: Optional[str],
) -> Optional[str]:
    """
    Try a simple heuristic merge when AI is unavailable.

    This uses Python's difflib to attempt a three-way merge.
    """
    import difflib

    if base_content is None:
        # Without a base, we can't do a proper three-way merge
        # Just prefer worktree content (the feature being merged)
        return worktree_content

    try:
        # Use diff3-style merge
        main_lines = main_content.splitlines(keepends=True)
        worktree_lines = worktree_content.splitlines(keepends=True)
        base_lines = base_content.splitlines(keepends=True)

        # Simple approach: find what's changed in each branch and try to combine
        # This is a simplified version - real diff3 is more complex

        # Get diffs from base to each branch
        main_diff = list(difflib.unified_diff(base_lines, main_lines))
        worktree_diff = list(difflib.unified_diff(base_lines, worktree_lines))

        # If one has no changes, use the other
        if not main_diff:
            return worktree_content
        if not worktree_diff:
            return main_content

        # If both have changes, this simple heuristic won't work reliably
        # Return None to indicate AI is needed
        return None

    except Exception:
        return None


def _print_merge_success(no_commit: bool, stats: Optional[dict] = None) -> None:
    """Print success message after merge."""
    print()
    if stats:
        print(muted(f"  Files merged: {stats.get('files_merged', 0)}"))
        if stats.get('auto_resolved'):
            print(muted(f"  Conflicts auto-resolved: {stats.get('auto_resolved', 0)}"))
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


def _print_conflict_info(result: dict) -> None:
    """Print information about detected conflicts."""
    conflicts = result.get("conflicts", [])

    print()
    print_status(f"Detected {len(conflicts)} conflict(s) that need attention:", "warning")
    print()

    for i, conflict in enumerate(conflicts[:5], 1):  # Show first 5
        file_path = conflict.get("file", "unknown")
        location = conflict.get("location", "")
        reason = conflict.get("reason", "")
        severity = conflict.get("severity", "unknown")

        print(f"  {i}. {highlight(file_path)}")
        if location:
            print(f"     Location: {muted(location)}")
        if reason:
            print(f"     Reason: {muted(reason)}")
        print(f"     Severity: {severity}")
        print()

    if len(conflicts) > 5:
        print(muted(f"  ... and {len(conflicts) - 5} more"))


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
