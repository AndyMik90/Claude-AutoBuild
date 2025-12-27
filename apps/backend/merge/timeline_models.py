"""
Timeline Data Models
====================

Data classes for the File-Centric Timeline Model.

These models represent the complete evolution of a file from multiple sources:
- Main branch evolution (human commits)
- Task worktree modifications (AI agent changes)
- Task branch points and intent
- Pending task awareness for forward-compatible merges
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal


@dataclass
class MainBranchEvent:
    """
    Represents a single commit to main branch affecting a file.

    These events form the "spine" of the file's timeline - the authoritative
    history that all task worktrees diverge from and merge back into.
    """

    # Git identification
    commit_hash: str
    timestamp: datetime

    # Content at this point
    content: str

    # Source of change
    source: Literal["human", "merged_task"]
    merged_from_task: str | None = None  # If source is 'merged_task'

    # Intent/reason for change
    commit_message: str = ""

    # For richer context (optional)
    author: str | None = None
    diff_summary: str | None = None  # e.g., "+15 -3 lines"

    def to_dict(self) -> dict:
        return {
            "commit_hash": self.commit_hash,
            "timestamp": self.timestamp.isoformat(),
            "content": self.content,
            "source": self.source,
            "merged_from_task": self.merged_from_task,
            "commit_message": self.commit_message,
            "author": self.author,
            "diff_summary": self.diff_summary,
        }

    @classmethod
    def from_dict(cls, data: dict) -> MainBranchEvent:
        return cls(
            commit_hash=data["commit_hash"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            content=data["content"],
            source=data["source"],
            merged_from_task=data.get("merged_from_task"),
            commit_message=data.get("commit_message", ""),
            author=data.get("author"),
            diff_summary=data.get("diff_summary"),
        )


@dataclass
class BranchPoint:
    """The exact point a task branched from main."""

    commit_hash: str
    content: str
    timestamp: datetime

    def to_dict(self) -> dict:
        return {
            "commit_hash": self.commit_hash,
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> BranchPoint:
        return cls(
            commit_hash=data["commit_hash"],
            content=data["content"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
        )


@dataclass
class WorktreeState:
    """Current state of a file in a task's worktree."""

    content: str
    last_modified: datetime

    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "last_modified": self.last_modified.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> WorktreeState:
        return cls(
            content=data["content"],
            last_modified=datetime.fromisoformat(data["last_modified"]),
        )


@dataclass
class TaskIntent:
    """What the task intends to do with this file."""

    title: str
    description: str
    from_plan: bool = False  # True if extracted from implementation_plan.json

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "description": self.description,
            "from_plan": self.from_plan,
        }

    @classmethod
    def from_dict(cls, data: dict) -> TaskIntent:
        return cls(
            title=data["title"],
            description=data["description"],
            from_plan=data.get("from_plan", False),
        )


@dataclass
class TaskFileView:
    """
    A single task's relationship with a specific file.

    This captures everything we need to know about how one task
    sees and modifies one file.
    """

    task_id: str

    # The exact point this task branched from main
    branch_point: BranchPoint

    # Current state in the task's worktree (None if not modified yet)
    worktree_state: WorktreeState | None = None

    # What the task intends to do
    task_intent: TaskIntent = field(default_factory=lambda: TaskIntent("", ""))

    # Drift tracking - how many commits happened in main since branch
    commits_behind_main: int = 0

    # Lifecycle status
    status: Literal["active", "merged", "abandoned"] = "active"
    merged_at: datetime | None = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "branch_point": self.branch_point.to_dict(),
            "worktree_state": self.worktree_state.to_dict()
            if self.worktree_state
            else None,
            "task_intent": self.task_intent.to_dict(),
            "commits_behind_main": self.commits_behind_main,
            "status": self.status,
            "merged_at": self.merged_at.isoformat() if self.merged_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict) -> TaskFileView:
        return cls(
            task_id=data["task_id"],
            branch_point=BranchPoint.from_dict(data["branch_point"]),
            worktree_state=WorktreeState.from_dict(data["worktree_state"])
            if data.get("worktree_state")
            else None,
            task_intent=TaskIntent.from_dict(data["task_intent"])
            if data.get("task_intent")
            else TaskIntent("", ""),
            commits_behind_main=data.get("commits_behind_main", 0),
            status=data.get("status", "active"),
            merged_at=datetime.fromisoformat(data["merged_at"])
            if data.get("merged_at")
            else None,
        )


@dataclass
class FileTimeline:
    """
    The core data structure tracking a single file's complete history.

    This is the "file-centric" view - instead of asking "what did Task X change?",
    we ask "what happened to File Y over time, from ALL sources?"
    """

    file_path: str

    # Main branch evolution - the authoritative history
    main_branch_history: list[MainBranchEvent] = field(default_factory=list)

    # Each task's isolated view of this file
    task_views: dict[str, TaskFileView] = field(default_factory=dict)

    # Metadata
    created_at: datetime = field(default_factory=datetime.now)
    last_updated: datetime = field(default_factory=datetime.now)

    def add_main_event(self, event: MainBranchEvent) -> None:
        """Add a main branch event and increment drift for all active tasks."""
        self.main_branch_history.append(event)
        self.last_updated = datetime.now()

        # Update commits_behind_main for all active tasks
        for task_view in self.task_views.values():
            if task_view.status == "active":
                task_view.commits_behind_main += 1

    def add_task_view(self, task_view: TaskFileView) -> None:
        """Add or update a task's view of this file."""
        self.task_views[task_view.task_id] = task_view
        self.last_updated = datetime.now()

    def get_task_view(self, task_id: str) -> TaskFileView | None:
        """Get a task's view of this file."""
        return self.task_views.get(task_id)

    def get_active_tasks(self) -> list[TaskFileView]:
        """Get all tasks that are still active (not merged/abandoned)."""
        return [tv for tv in self.task_views.values() if tv.status == "active"]

    def get_events_since_commit(self, commit_hash: str) -> list[MainBranchEvent]:
        """Get all main branch events since a given commit."""
        events = []
        found_commit = False
        for event in self.main_branch_history:
            if found_commit:
                events.append(event)
            if event.commit_hash == commit_hash:
                found_commit = True
        return events

    def get_current_main_state(self) -> MainBranchEvent | None:
        """Get the most recent main branch event."""
        if self.main_branch_history:
            return self.main_branch_history[-1]
        return None

    def to_dict(self) -> dict:
        return {
            "file_path": self.file_path,
            "main_branch_history": [e.to_dict() for e in self.main_branch_history],
            "task_views": {k: v.to_dict() for k, v in self.task_views.items()},
            "created_at": self.created_at.isoformat(),
            "last_updated": self.last_updated.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> FileTimeline:
        timeline = cls(
            file_path=data["file_path"],
            created_at=datetime.fromisoformat(data["created_at"]),
            last_updated=datetime.fromisoformat(data["last_updated"]),
        )
        timeline.main_branch_history = [
            MainBranchEvent.from_dict(e) for e in data.get("main_branch_history", [])
        ]
        timeline.task_views = {
            k: TaskFileView.from_dict(v) for k, v in data.get("task_views", {}).items()
        }
        return timeline


@dataclass
class MergeContext:
    """
    The complete context package provided to the Merge AI.

    This is the "situational awareness" the AI needs to make intelligent
    merge decisions.
    """

    file_path: str

    # The task being merged
    task_id: str
    task_intent: TaskIntent

    # Task's starting point
    task_branch_point: BranchPoint

    # What happened in main since task branched (ordered from oldest to newest)
    main_evolution: list[MainBranchEvent]

    # Task's changes
    task_worktree_content: str

    # Current main state
    current_main_content: str
    current_main_commit: str

    # Other tasks that also touch this file (for forward-compatibility)
    other_pending_tasks: list[dict]  # [{task_id, intent, branch_point, commits_behind}]

    # Metrics
    total_commits_behind: int
    total_pending_tasks: int

    def to_dict(self) -> dict:
        return {
            "file_path": self.file_path,
            "task_id": self.task_id,
            "task_intent": self.task_intent.to_dict(),
            "task_branch_point": self.task_branch_point.to_dict(),
            "main_evolution": [e.to_dict() for e in self.main_evolution],
            "task_worktree_content": self.task_worktree_content,
            "current_main_content": self.current_main_content,
            "current_main_commit": self.current_main_commit,
            "other_pending_tasks": self.other_pending_tasks,
            "total_commits_behind": self.total_commits_behind,
            "total_pending_tasks": self.total_pending_tasks,
        }
