"""
Git worktree management module facade.

Provides git worktree utilities for parallel builds.
Re-exports from core.worktree for clean imports.
"""

from core.worktree import (
    WorktreeError,
    WorktreeInfo,
    WorktreeManager,
)

__all__ = [
    "WorktreeError",
    "WorktreeInfo",
    "WorktreeManager",
]
