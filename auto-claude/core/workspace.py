#!/usr/bin/env python3
"""
Workspace Management - Per-Spec Architecture
=============================================

Handles workspace isolation through Git worktrees, where each spec
gets its own isolated worktree in .worktrees/{spec-name}/.

This module has been refactored for better maintainability:
- Models and enums: workspace/models.py
- Git utilities: workspace/git_utils.py
- Setup functions: workspace/setup.py
- Display functions: workspace/display.py
- Finalization: workspace/finalization.py
- Complex merge operations: remain here (workspace.py)

Public API is exported via workspace/__init__.py for backward compatibility.
"""

import subprocess
from pathlib import Path

from ui import (
    Icons,
    bold,
    box,
    error,
    highlight,
    icon,
    muted,
    print_status,
    success,
    warning,
)
from worktree import WorktreeManager

# Import debug utilities
try:
    from debug import (
        debug,
        debug_detailed,
        debug_error,
        debug_success,
        debug_verbose,
        debug_warning,
        is_debug_enabled,
    )
except ImportError:

    def debug(*args, **kwargs):
        pass

    def debug_detailed(*args, **kwargs):
        pass

    def debug_verbose(*args, **kwargs):
        pass

    def debug_success(*args, **kwargs):
        pass

    def debug_error(*args, **kwargs):
        pass

    def debug_warning(*args, **kwargs):
        pass

    def is_debug_enabled():
        return False


# Import merge system
from core.workspace.display import (
    print_conflict_info as _print_conflict_info,
)
from core.workspace.display import (
    print_merge_success as _print_merge_success,
)
from core.workspace.display import (
    show_build_summary,
)
from core.workspace.git_utils import (
    MAX_PARALLEL_AI_MERGES,
    _is_auto_claude_file,
    get_existing_build_worktree,
)
from core.workspace.git_utils import (
    get_changed_files_from_branch as _get_changed_files_from_branch,
)
from core.workspace.git_utils import (
    get_file_content_from_ref as _get_file_content_from_ref,
)
from core.workspace.git_utils import (
    is_lock_file as _is_lock_file,
)

# Import from refactored modules in core/workspace/
from core.workspace.models import (
    MergeLock,
    MergeLockError,
    ParallelMergeResult,
    ParallelMergeTask,
)
from merge import (
    FileTimelineTracker,
    MergeOrchestrator,
)

MODULE = "workspace"

# The following functions are now imported from refactored modules above.
# They are kept here only to avoid breaking the existing code that still needs
# the complex merge operations below.

# Remaining complex merge operations that reference each other:
# - merge_existing_build
# - _try_smart_merge
# - _try_smart_merge_inner
# - _check_git_conflicts
# - _resolve_git_conflicts_with_ai
# - _create_async_claude_client
# - _async_ai_call
# - _merge_file_with_ai_async
# - _run_parallel_merges
# - _record_merge_completion
# - _get_task_intent
# - _get_recent_merges_context
# - _merge_file_with_ai
# - _heuristic_merge


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

    # Detect current branch - this is where user wants changes merged
    # Normal workflow: user is on their feature branch (e.g., version/2.5.5)
    # and wants to merge the spec changes into it, then PR to main
    current_branch_result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    current_branch = (
        current_branch_result.stdout.strip()
        if current_branch_result.returncode == 0
        else None
    )

    spec_branch = f"auto-claude/{spec_name}"

    # Don't merge a branch into itself
    if current_branch == spec_branch:
        print()
        print_status(
            "You're on the spec branch. Switch to your target branch first.", "warning"
        )
        print()
        print("Example:")
        print(highlight("  git checkout main  # or your feature branch"))
        print(highlight(f"  python auto-claude/run.py --spec {spec_name} --merge"))
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

    # Use current branch as merge target (not auto-detected main/master)
    manager = WorktreeManager(project_dir, base_branch=current_branch)
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
                stats = smart_result.get("stats", {})
                had_conflicts = stats.get("conflicts_resolved", 0) > 0

                if had_conflicts:
                    # Git conflicts were resolved (via AI or lock file exclusion) - changes are already staged
                    _print_merge_success(
                        no_commit, stats, spec_name=spec_name, keep_worktree=True
                    )

                    # Don't auto-delete worktree - let user test and manually cleanup
                    # User can delete with: python auto-claude/run.py --spec <name> --discard
                    # Or via UI "Delete Worktree" button

                    return True
                else:
                    # No git conflicts, do standard git merge
                    success_result = manager.merge_worktree(
                        spec_name, delete_after=False, no_commit=no_commit
                    )
                    if success_result:
                        _print_merge_success(
                            no_commit, stats, spec_name=spec_name, keep_worktree=True
                        )
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
                        "warning",
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
        spec_name, delete_after=False, no_commit=no_commit
    )

    if success_result:
        print()
        if no_commit:
            print_status("Changes are staged in your working directory.", "success")
            print()
            print("Review the changes in your IDE, then commit:")
            print(highlight("  git commit -m 'your commit message'"))
            print()
            print("When satisfied, delete the worktree:")
            print(muted(f"  python auto-claude/run.py --spec {spec_name} --discard"))
        else:
            print_status("Your feature has been added to your project.", "success")
            print()
            print("When satisfied, delete the worktree:")
            print(muted(f"  python auto-claude/run.py --spec {spec_name} --discard"))
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
) -> dict | None:
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
) -> dict | None:
    """Inner implementation of smart merge (called with lock held)."""
    debug(
        MODULE,
        "=== SMART MERGE START ===",
        spec_name=spec_name,
        worktree_path=str(worktree_path),
        no_commit=no_commit,
    )

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
        debug(
            MODULE,
            "Initializing MergeOrchestrator",
            project_dir=str(project_dir),
            enable_ai=True,
        )
        orchestrator = MergeOrchestrator(
            project_dir,
            enable_ai=True,  # Enable AI for ambiguous conflicts
            dry_run=False,
        )

        # Refresh evolution data from the worktree
        debug(MODULE, "Refreshing evolution data from git", spec_name=spec_name)
        orchestrator.evolution_tracker.refresh_from_git(spec_name, worktree_path)

        # Check for git-level conflicts first (branch divergence)
        debug(MODULE, "Checking for git-level conflicts")
        git_conflicts = _check_git_conflicts(project_dir, spec_name)

        debug_detailed(
            MODULE,
            "Git conflict check result",
            has_conflicts=git_conflicts.get("has_conflicts"),
            conflicting_files=git_conflicts.get("conflicting_files", []),
            base_branch=git_conflicts.get("base_branch"),
        )

        if git_conflicts.get("has_conflicts"):
            print(
                muted(
                    f"  Branch has diverged from {git_conflicts.get('base_branch', 'main')}"
                )
            )
            print(
                muted(
                    f"  Conflicting files: {len(git_conflicts.get('conflicting_files', []))}"
                )
            )

            debug(
                MODULE,
                "Starting AI conflict resolution",
                num_conflicts=len(git_conflicts.get("conflicting_files", [])),
            )

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
                debug_success(
                    MODULE,
                    "AI conflict resolution succeeded",
                    resolved_files=resolution_result.get("resolved_files", []),
                    stats=resolution_result.get("stats", {}),
                )
                return resolution_result
            else:
                # AI couldn't resolve all conflicts
                debug_error(
                    MODULE,
                    "AI conflict resolution failed",
                    remaining_conflicts=resolution_result.get(
                        "remaining_conflicts", []
                    ),
                    resolved_files=resolution_result.get("resolved_files", []),
                    error=resolution_result.get("error"),
                )
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
            needs_human = [c for c in conflicts if not c.get("can_auto_merge")]

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
        # Note: --write-tree mode only accepts 2 branches (it auto-finds the merge base)
        merge_tree_result = subprocess.run(
            [
                "git",
                "merge-tree",
                "--write-tree",
                "--no-messages",
                result["base_branch"],  # Use branch names, not commit hashes
                spec_branch,
            ],
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
                    match = re.search(
                        r"(?:Merge conflict in|CONFLICT.*?:)\s*(.+?)(?:\s*$|\s+\()",
                        line,
                    )
                    if match:
                        file_path = match.group(1).strip()
                        # Skip .auto-claude files - they should never be merged
                        if (
                            file_path
                            and file_path not in result["conflicting_files"]
                            and not _is_auto_claude_file(file_path)
                        ):
                            result["conflicting_files"].append(file_path)

            # Fallback: if we didn't parse conflicts, use diff to find files changed in both branches
            if not result["conflicting_files"]:
                main_files_result = subprocess.run(
                    ["git", "diff", "--name-only", merge_base, main_commit],
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                )
                main_files = (
                    set(main_files_result.stdout.strip().split("\n"))
                    if main_files_result.stdout.strip()
                    else set()
                )

                spec_files_result = subprocess.run(
                    ["git", "diff", "--name-only", merge_base, spec_commit],
                    cwd=project_dir,
                    capture_output=True,
                    text=True,
                )
                spec_files = (
                    set(spec_files_result.stdout.strip().split("\n"))
                    if spec_files_result.stdout.strip()
                    else set()
                )

                # Files modified in both = potential conflicts
                # Filter out .auto-claude files - they should never be merged
                conflicting = main_files & spec_files
                result["conflicting_files"] = [
                    f for f in conflicting if not _is_auto_claude_file(f)
                ]

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

    debug(
        MODULE,
        "=== AI CONFLICT RESOLUTION START ===",
        spec_name=spec_name,
        num_conflicting_files=len(git_conflicts.get("conflicting_files", [])),
    )

    conflicting_files = git_conflicts.get("conflicting_files", [])
    base_branch = git_conflicts.get("base_branch", "main")
    spec_branch = git_conflicts.get("spec_branch", f"auto-claude/{spec_name}")

    debug_detailed(
        MODULE,
        "Conflict resolution params",
        base_branch=base_branch,
        spec_branch=spec_branch,
        conflicting_files=conflicting_files,
    )

    resolved_files = []
    remaining_conflicts = []
    auto_merged_count = 0
    ai_merged_count = 0

    print()
    print_status(
        f"Resolving {len(conflicting_files)} conflicting file(s) with AI...", "progress"
    )

    # Get merge-base commit
    merge_base_result = subprocess.run(
        ["git", "merge-base", base_branch, spec_branch],
        cwd=project_dir,
        capture_output=True,
        text=True,
    )
    merge_base = (
        merge_base_result.stdout.strip() if merge_base_result.returncode == 0 else None
    )
    debug(
        MODULE,
        "Found merge-base commit",
        merge_base=merge_base[:12] if merge_base else None,
    )

    # FIX: Copy NEW files FIRST before resolving conflicts
    # This ensures dependencies exist before files that import them are written
    changed_files = _get_changed_files_from_branch(
        project_dir, base_branch, spec_branch
    )
    new_files = [
        (f, s) for f, s in changed_files if s == "A" and f not in conflicting_files
    ]

    if new_files:
        print(muted(f"  Copying {len(new_files)} new file(s) first (dependencies)..."))
        for file_path, status in new_files:
            try:
                content = _get_file_content_from_ref(
                    project_dir, spec_branch, file_path
                )
                if content is not None:
                    target_path = project_dir / file_path
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    target_path.write_text(content, encoding="utf-8")
                    subprocess.run(
                        ["git", "add", file_path], cwd=project_dir, capture_output=True
                    )
                    resolved_files.append(file_path)
                    debug(MODULE, f"Copied new file: {file_path}")
            except Exception as e:
                debug_warning(MODULE, f"Could not copy new file {file_path}: {e}")

    # Categorize conflicting files for processing
    files_needing_ai_merge: list[ParallelMergeTask] = []
    simple_merges: list[
        tuple[str, str | None]
    ] = []  # (file_path, merged_content or None for delete)
    lock_files_excluded: list[str] = []  # Lock files excluded from merge

    debug(MODULE, "Categorizing conflicting files for parallel processing")

    for file_path in conflicting_files:
        debug(MODULE, f"Categorizing conflicting file: {file_path}")

        try:
            # Get content from main branch
            main_content = _get_file_content_from_ref(
                project_dir, base_branch, file_path
            )

            # Get content from worktree branch
            worktree_content = _get_file_content_from_ref(
                project_dir, spec_branch, file_path
            )

            # Get content from merge-base (common ancestor)
            base_content = None
            if merge_base:
                base_content = _get_file_content_from_ref(
                    project_dir, merge_base, file_path
                )

            if main_content is None and worktree_content is None:
                # File doesn't exist in either - skip
                continue

            if main_content is None:
                # File only exists in worktree - it's a new file (no AI needed)
                simple_merges.append((file_path, worktree_content))
                debug(MODULE, f"  {file_path}: new file (no AI needed)")
            elif worktree_content is None:
                # File only exists in main - was deleted in worktree (no AI needed)
                simple_merges.append((file_path, None))  # None = delete
                debug(MODULE, f"  {file_path}: deleted (no AI needed)")
            else:
                # File exists in both - check if it's a lock file
                if _is_lock_file(file_path):
                    # Lock files should be excluded from merge entirely
                    # They must be regenerated after merge by running the package manager
                    # (e.g., npm install, pnpm install, uv sync, cargo update)
                    #
                    # Strategy: Take main branch version and let user regenerate
                    lock_files_excluded.append(file_path)
                    simple_merges.append((file_path, main_content))
                    debug(
                        MODULE,
                        f"  {file_path}: lock file (excluded - will use main version)",
                    )
                else:
                    # Regular file - needs AI merge
                    files_needing_ai_merge.append(
                        ParallelMergeTask(
                            file_path=file_path,
                            main_content=main_content,
                            worktree_content=worktree_content,
                            base_content=base_content,
                            spec_name=spec_name,
                        )
                    )
                    debug(MODULE, f"  {file_path}: needs AI merge")

        except Exception as e:
            print(error(f"    ✗ Failed to categorize {file_path}: {e}"))
            remaining_conflicts.append(
                {
                    "file": file_path,
                    "reason": str(e),
                    "severity": "high",
                }
            )

    # Process simple merges first (fast, no AI)
    if simple_merges:
        print(muted(f"  Processing {len(simple_merges)} simple file(s)..."))
        for file_path, merged_content in simple_merges:
            try:
                if merged_content is not None:
                    target_path = project_dir / file_path
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    target_path.write_text(merged_content, encoding="utf-8")
                    subprocess.run(
                        ["git", "add", file_path], cwd=project_dir, capture_output=True
                    )
                    resolved_files.append(file_path)
                    print(success(f"    ✓ {file_path} (new file)"))
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
                    print(success(f"    ✓ {file_path} (deleted)"))
            except Exception as e:
                print(error(f"    ✗ {file_path}: {e}"))
                remaining_conflicts.append(
                    {
                        "file": file_path,
                        "reason": str(e),
                        "severity": "high",
                    }
                )

    # Process AI merges in parallel
    if files_needing_ai_merge:
        print()
        print_status(
            f"Merging {len(files_needing_ai_merge)} file(s) with AI (parallel)...",
            "progress",
        )

        import time

        start_time = time.time()

        # Run parallel merges
        parallel_results = asyncio.run(
            _run_parallel_merges(
                tasks=files_needing_ai_merge,
                project_dir=project_dir,
                max_concurrent=MAX_PARALLEL_AI_MERGES,
            )
        )

        elapsed = time.time() - start_time

        # Process results
        for result in parallel_results:
            if result.success:
                target_path = project_dir / result.file_path
                target_path.parent.mkdir(parents=True, exist_ok=True)
                target_path.write_text(result.merged_content, encoding="utf-8")
                subprocess.run(
                    ["git", "add", result.file_path],
                    cwd=project_dir,
                    capture_output=True,
                )
                resolved_files.append(result.file_path)

                if result.was_auto_merged:
                    auto_merged_count += 1
                    print(success(f"    ✓ {result.file_path} (git auto-merged)"))
                else:
                    ai_merged_count += 1
                    print(success(f"    ✓ {result.file_path} (AI merged)"))
            else:
                print(error(f"    ✗ {result.file_path}: {result.error}"))
                remaining_conflicts.append(
                    {
                        "file": result.file_path,
                        "reason": result.error or "AI could not resolve the conflict",
                        "severity": "high",
                    }
                )

        # Print summary
        print()
        print(muted(f"  Parallel merge completed in {elapsed:.1f}s"))
        print(muted(f"    Git auto-merged: {auto_merged_count}"))
        print(muted(f"    AI merged: {ai_merged_count}"))
        if remaining_conflicts:
            print(muted(f"    Failed: {len(remaining_conflicts)}"))

    # ALWAYS process non-conflicting files, even if some conflicts failed
    # This ensures we get as much of the build as possible
    # (New files were already copied at the start)
    print(muted("  Merging remaining files..."))

    # Get list of modified/deleted files (new files already copied at start)
    non_conflicting = [
        (f, s)
        for f, s in changed_files
        if f not in conflicting_files and s != "A"  # Skip new files, already copied
    ]

    for file_path, status in non_conflicting:
        try:
            if status == "D":
                # Deleted in worktree
                target_path = project_dir / file_path
                if target_path.exists():
                    target_path.unlink()
                    subprocess.run(
                        ["git", "add", file_path], cwd=project_dir, capture_output=True
                    )
            else:
                # Added or modified - copy from worktree
                content = _get_file_content_from_ref(
                    project_dir, spec_branch, file_path
                )
                if content is not None:
                    target_path = project_dir / file_path
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    target_path.write_text(content, encoding="utf-8")
                    subprocess.run(
                        ["git", "add", file_path], cwd=project_dir, capture_output=True
                    )
                    resolved_files.append(file_path)
        except Exception as e:
            print(muted(f"    Warning: Could not process {file_path}: {e}"))

    # V2: Record merge completion in Evolution Tracker for future context
    # TODO: _record_merge_completion not yet implemented - see line 141
    # if resolved_files:
    #     _record_merge_completion(project_dir, spec_name, resolved_files)

    # Build result - partial success if some files failed but we got others
    result = {
        "success": len(remaining_conflicts) == 0,
        "resolved_files": resolved_files,
        "stats": {
            "files_merged": len(resolved_files),
            "conflicts_resolved": len(conflicting_files) - len(remaining_conflicts),
            "ai_assisted": ai_merged_count,
            "auto_merged": auto_merged_count,
            "parallel_ai_merges": len(files_needing_ai_merge),
            "lock_files_excluded": len(lock_files_excluded),
        },
    }

    # Add remaining conflicts if any (for UI to show what needs manual attention)
    if remaining_conflicts:
        result["remaining_conflicts"] = remaining_conflicts
        result["partial_success"] = len(resolved_files) > 0
        print()
        print(
            warning(f"  ⚠ {len(remaining_conflicts)} file(s) could not be auto-merged:")
        )
        for conflict in remaining_conflicts:
            print(muted(f"    - {conflict['file']}: {conflict['reason']}"))
        print(muted("  These files may need manual review."))

    # Notify about excluded lock files that need regeneration
    if lock_files_excluded:
        result["lock_files_excluded"] = lock_files_excluded
        print()
        print(
            muted(f"  ℹ {len(lock_files_excluded)} lock file(s) excluded from merge:")
        )
        for lock_file in lock_files_excluded:
            print(muted(f"    - {lock_file}"))
        print()
        print(warning("  Run your package manager to regenerate lock files:"))
        print(muted("    npm install / pnpm install / yarn / uv sync / cargo update"))

    return result


# Note: All constants, classes and helper functions are imported from the refactored modules above
# - Constants from git_utils (MAX_FILE_LINES_FOR_AI, BINARY_EXTENSIONS, etc.)
# - Models from workspace/models.py (MergeLock, MergeLockError, etc.)
# - Git utilities from workspace/git_utils.py
# - Display functions from workspace/display.py
# - Finalization functions from workspace/finalization.py


# =============================================================================
# Parallel AI Merge Implementation
# =============================================================================

import asyncio
import logging
import os

_merge_logger = logging.getLogger(__name__)

# System prompt for AI file merging
AI_MERGE_SYSTEM_PROMPT = """You are an expert code merge assistant. Your task is to perform a 3-way merge of code files.

RULES:
1. Preserve all functional changes from both versions (ours and theirs)
2. Maintain code style consistency
3. Resolve conflicts by understanding the semantic purpose of each change
4. When changes are independent (different functions/sections), include both
5. When changes overlap, combine them logically or prefer the more complete version
6. Preserve all imports from both versions
7. Output ONLY the merged code - no explanations, no markdown, no code fences

IMPORTANT: Output the raw merged file content only. Do not wrap in code blocks."""


def _infer_language_from_path(file_path: str) -> str:
    """Infer programming language from file extension."""
    ext_map = {
        ".py": "python",
        ".js": "javascript",
        ".jsx": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".rs": "rust",
        ".go": "go",
        ".java": "java",
        ".cpp": "cpp",
        ".c": "c",
        ".h": "c",
        ".hpp": "cpp",
        ".rb": "ruby",
        ".php": "php",
        ".swift": "swift",
        ".kt": "kotlin",
        ".scala": "scala",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "toml",
        ".md": "markdown",
        ".html": "html",
        ".css": "css",
        ".scss": "scss",
        ".sql": "sql",
    }
    ext = os.path.splitext(file_path)[1].lower()
    return ext_map.get(ext, "text")


def _try_simple_3way_merge(
    base: str | None,
    ours: str,
    theirs: str,
) -> tuple[bool, str | None]:
    """
    Attempt a simple 3-way merge without AI.

    Returns:
        (success, merged_content) - if success is True, merged_content is the result
    """
    # If base is None, we can't do a proper 3-way merge
    if base is None:
        # If both are identical, no conflict
        if ours == theirs:
            return True, ours
        # Otherwise, we need AI to decide
        return False, None

    # If ours equals base, theirs is the only change - take theirs
    if ours == base:
        return True, theirs

    # If theirs equals base, ours is the only change - take ours
    if theirs == base:
        return True, ours

    # If ours equals theirs, both made same change - take either
    if ours == theirs:
        return True, ours

    # Both changed differently from base - need AI merge
    # We could try a line-by-line merge here, but for safety let's use AI
    return False, None


def _build_merge_prompt(
    file_path: str,
    base_content: str | None,
    main_content: str,
    worktree_content: str,
    spec_name: str,
) -> str:
    """Build the prompt for AI file merge."""
    language = _infer_language_from_path(file_path)

    base_section = ""
    if base_content:
        # Truncate very large files
        if len(base_content) > 10000:
            base_content = base_content[:10000] + "\n... (truncated)"
        base_section = f"""
BASE (common ancestor):
```{language}
{base_content}
```
"""

    # Truncate large content
    if len(main_content) > 15000:
        main_content = main_content[:15000] + "\n... (truncated)"
    if len(worktree_content) > 15000:
        worktree_content = worktree_content[:15000] + "\n... (truncated)"

    prompt = f"""Perform a 3-way merge for file: {file_path}
Task being merged: {spec_name}
{base_section}
OURS (current main branch):
```{language}
{main_content}
```

THEIRS (changes from task worktree):
```{language}
{worktree_content}
```

Merge these versions, preserving all meaningful changes from both. Output only the merged file content, no explanations."""

    return prompt


def _strip_code_fences(content: str) -> str:
    """Remove markdown code fences if present."""
    # Check if content starts with code fence
    lines = content.strip().split("\n")
    if lines and lines[0].startswith("```"):
        # Remove first and last line if they're code fences
        if lines[-1].strip() == "```":
            return "\n".join(lines[1:-1])
        else:
            return "\n".join(lines[1:])
    return content


async def _merge_file_with_ai_async(
    task: ParallelMergeTask,
    semaphore: asyncio.Semaphore,
) -> ParallelMergeResult:
    """
    Merge a single file using AI.

    Args:
        task: The merge task with file contents
        semaphore: Semaphore for concurrency control

    Returns:
        ParallelMergeResult with merged content or error
    """
    async with semaphore:
        try:
            # First try simple 3-way merge
            success, merged = _try_simple_3way_merge(
                task.base_content,
                task.main_content,
                task.worktree_content,
            )

            if success and merged is not None:
                debug(MODULE, f"Auto-merged {task.file_path} without AI")
                return ParallelMergeResult(
                    file_path=task.file_path,
                    merged_content=merged,
                    success=True,
                    was_auto_merged=True,
                )

            # Need AI merge
            debug(MODULE, f"Using AI to merge {task.file_path}")

            # Import auth utilities
            from core.auth import ensure_claude_code_oauth_token, get_auth_token

            if not get_auth_token():
                return ParallelMergeResult(
                    file_path=task.file_path,
                    merged_content=None,
                    success=False,
                    error="No authentication token available",
                )

            ensure_claude_code_oauth_token()

            # Build prompt
            prompt = _build_merge_prompt(
                task.file_path,
                task.base_content,
                task.main_content,
                task.worktree_content,
                task.spec_name,
            )

            # Call Claude Haiku for fast merge
            try:
                from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
            except ImportError:
                return ParallelMergeResult(
                    file_path=task.file_path,
                    merged_content=None,
                    success=False,
                    error="claude_agent_sdk not installed",
                )

            client = ClaudeSDKClient(
                options=ClaudeAgentOptions(
                    model="claude-haiku-4-5-20251001",
                    system_prompt=AI_MERGE_SYSTEM_PROMPT,
                    allowed_tools=[],
                    max_turns=1,
                    max_thinking_tokens=1024,  # Low thinking for speed
                )
            )

            response_text = ""
            async with client:
                await client.query(prompt)

                async for msg in client.receive_response():
                    msg_type = type(msg).__name__
                    if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            if hasattr(block, "text"):
                                response_text += block.text

            if response_text:
                # Strip any code fences the model might have added
                merged_content = _strip_code_fences(response_text.strip())

                debug(MODULE, f"AI merged {task.file_path} successfully")
                return ParallelMergeResult(
                    file_path=task.file_path,
                    merged_content=merged_content,
                    success=True,
                    was_auto_merged=False,
                )
            else:
                return ParallelMergeResult(
                    file_path=task.file_path,
                    merged_content=None,
                    success=False,
                    error="AI returned empty response",
                )

        except Exception as e:
            _merge_logger.error(f"Failed to merge {task.file_path}: {e}")
            return ParallelMergeResult(
                file_path=task.file_path,
                merged_content=None,
                success=False,
                error=str(e),
            )


async def _run_parallel_merges(
    tasks: list[ParallelMergeTask],
    project_dir: Path,
    max_concurrent: int = MAX_PARALLEL_AI_MERGES,
) -> list[ParallelMergeResult]:
    """
    Run file merges in parallel with concurrency control.

    Args:
        tasks: List of merge tasks to process
        project_dir: Project directory (for context, not currently used)
        max_concurrent: Maximum number of concurrent merge operations

    Returns:
        List of ParallelMergeResult for each task
    """
    if not tasks:
        return []

    debug(
        MODULE,
        f"Starting parallel merge of {len(tasks)} files (max concurrent: {max_concurrent})",
    )

    # Create semaphore for concurrency control
    semaphore = asyncio.Semaphore(max_concurrent)

    # Create tasks
    merge_coroutines = [_merge_file_with_ai_async(task, semaphore) for task in tasks]

    # Run all merges concurrently
    results = await asyncio.gather(*merge_coroutines, return_exceptions=True)

    # Process results, converting exceptions to error results
    final_results: list[ParallelMergeResult] = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            final_results.append(
                ParallelMergeResult(
                    file_path=tasks[i].file_path,
                    merged_content=None,
                    success=False,
                    error=str(result),
                )
            )
        else:
            final_results.append(result)

    debug(
        MODULE,
        f"Parallel merge complete: {sum(1 for r in final_results if r.success)} succeeded, "
        f"{sum(1 for r in final_results if not r.success)} failed",
    )

    return final_results
