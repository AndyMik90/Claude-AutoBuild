"""
Workspace Commands
==================

CLI commands for workspace management (merge, review, discard, list, cleanup)
"""

import sys
from pathlib import Path

# Ensure parent directory is in path for imports (before other imports)
_PARENT_DIR = Path(__file__).parent.parent
if str(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(_PARENT_DIR))

from ui import (
    Icons,
    icon,
)
from workspace import (
    cleanup_all_worktrees,
    discard_existing_build,
    list_all_worktrees,
    merge_existing_build,
    review_existing_build,
)

from .utils import print_banner


def handle_merge_command(
    project_dir: Path, spec_name: str, no_commit: bool = False
) -> None:
    """
    Handle the --merge command.

    Args:
        project_dir: Project root directory
        spec_name: Name of the spec
        no_commit: If True, stage changes but don't commit
    """
    merge_existing_build(project_dir, spec_name, no_commit=no_commit)


def handle_review_command(project_dir: Path, spec_name: str) -> None:
    """
    Handle the --review command.

    Args:
        project_dir: Project root directory
        spec_name: Name of the spec
    """
    review_existing_build(project_dir, spec_name)


def handle_discard_command(project_dir: Path, spec_name: str) -> None:
    """
    Handle the --discard command.

    Args:
        project_dir: Project root directory
        spec_name: Name of the spec
    """
    discard_existing_build(project_dir, spec_name)


def handle_list_worktrees_command(project_dir: Path) -> None:
    """
    Handle the --list-worktrees command.

    Args:
        project_dir: Project root directory
    """
    print_banner()
    print("\n" + "=" * 70)
    print("  SPEC WORKTREES")
    print("=" * 70)
    print()

    worktrees = list_all_worktrees(project_dir)
    if not worktrees:
        print("  No worktrees found.")
        print()
        print("  Worktrees are created when you run a build in isolated mode.")
    else:
        for wt in worktrees:
            print(f"  {icon(Icons.FOLDER)} {wt.spec_name}")
            print(f"       Branch: {wt.branch}")
            print(f"       Path: {wt.path}")
            print(f"       Commits: {wt.commit_count}, Files: {wt.files_changed}")
            print()

        print("-" * 70)
        print()
        print("  To merge:   python auto-claude/run.py --spec <name> --merge")
        print("  To review:  python auto-claude/run.py --spec <name> --review")
        print("  To discard: python auto-claude/run.py --spec <name> --discard")
        print()
        print(
            "  To cleanup all worktrees: python auto-claude/run.py --cleanup-worktrees"
        )
    print()


def handle_cleanup_worktrees_command(project_dir: Path) -> None:
    """
    Handle the --cleanup-worktrees command.

    Args:
        project_dir: Project root directory
    """
    print_banner()
    cleanup_all_worktrees(project_dir, confirm=True)
