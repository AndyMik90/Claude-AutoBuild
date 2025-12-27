"""
File Timeline Tracker
=====================

Intent-aware file evolution tracking for multi-agent merge resolution.

This module implements the File-Centric Timeline Model that tracks:
- Main branch evolution (human commits)
- Task worktree modifications (AI agent changes)
- Task branch points and intent
- Pending task awareness for forward-compatible merges

The key insight is that each file has a TIMELINE of changes from multiple sources,
and the Merge AI needs this complete context to make intelligent decisions.

Usage:
    from merge.file_timeline import FileTimelineTracker

    tracker = FileTimelineTracker(project_dir)

    # When a task starts
    tracker.on_task_start(
        task_id="task-001-auth",
        files_to_modify=["src/App.tsx"],
        branch_point_commit="abc123",
        task_intent="Add authentication via useAuth() hook"
    )

    # When human commits to main (via git hook)
    tracker.on_main_branch_commit("def456")

    # When getting merge context
    context = tracker.get_merge_context("task-001-auth", "src/App.tsx")

Architecture:
    This module has been refactored into smaller, focused components:

    - timeline_models.py: Data classes for timeline representation
    - timeline_git.py: Git operations and queries
    - timeline_persistence.py: Storage and loading of timelines
    - timeline_tracker.py: Main service coordinating all components

    This file serves as the main entry point and re-exports all public APIs
    for backward compatibility.
"""

from __future__ import annotations

# Re-export helper classes (for advanced usage)
from .timeline_git import TimelineGitHelper

# Re-export all public models
from .timeline_models import (
    BranchPoint,
    FileTimeline,
    MainBranchEvent,
    MergeContext,
    TaskFileView,
    TaskIntent,
    WorktreeState,
)
from .timeline_persistence import TimelinePersistence

# Re-export the main tracker service
from .timeline_tracker import FileTimelineTracker

__all__ = [
    # Main service
    "FileTimelineTracker",
    # Core data models
    "MainBranchEvent",
    "BranchPoint",
    "WorktreeState",
    "TaskIntent",
    "TaskFileView",
    "FileTimeline",
    "MergeContext",
    # Helper components (advanced usage)
    "TimelineGitHelper",
    "TimelinePersistence",
]
