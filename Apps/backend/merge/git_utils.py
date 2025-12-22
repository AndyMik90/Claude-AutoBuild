"""
Git Utilities
==============

Helper functions for git operations used in merge orchestration.

This module provides utilities for:
- Finding git worktrees
- Getting file content from branches
- Working with git repositories
"""

from __future__ import annotations

import subprocess
from pathlib import Path


def find_worktree(project_dir: Path, task_id: str) -> Path | None:
    """
    Find the worktree path for a task.

    Args:
        project_dir: The project root directory
        task_id: The task identifier

    Returns:
        Path to the worktree, or None if not found
    """
    # Check common locations
    worktrees_dir = project_dir / ".worktrees"
    if worktrees_dir.exists():
        # Look for worktree with task_id in name
        for entry in worktrees_dir.iterdir():
            if entry.is_dir() and task_id in entry.name:
                return entry

    # Try git worktree list
    try:
        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        for line in result.stdout.split("\n"):
            if line.startswith("worktree ") and task_id in line:
                return Path(line.split(" ", 1)[1])
    except subprocess.CalledProcessError:
        pass

    return None


def get_file_from_branch(project_dir: Path, file_path: str, branch: str) -> str | None:
    """
    Get file content from a specific git branch.

    Args:
        project_dir: The project root directory
        file_path: Path to the file relative to project root
        branch: Branch name

    Returns:
        File content as string, or None if file doesn't exist on branch
    """
    try:
        result = subprocess.run(
            ["git", "show", f"{branch}:{file_path}"],
            cwd=project_dir,
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout
    except subprocess.CalledProcessError:
        return None
