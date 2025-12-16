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
"""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Literal

logger = logging.getLogger(__name__)

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

MODULE = "merge.file_timeline"


# =============================================================================
# DATA MODELS
# =============================================================================

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
    source: Literal['human', 'merged_task']
    merged_from_task: Optional[str] = None  # If source is 'merged_task'

    # Intent/reason for change
    commit_message: str = ""

    # For richer context (optional)
    author: Optional[str] = None
    diff_summary: Optional[str] = None  # e.g., "+15 -3 lines"

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
    worktree_state: Optional[WorktreeState] = None

    # What the task intends to do
    task_intent: TaskIntent = field(default_factory=lambda: TaskIntent("", ""))

    # Drift tracking - how many commits happened in main since branch
    commits_behind_main: int = 0

    # Lifecycle status
    status: Literal['active', 'merged', 'abandoned'] = 'active'
    merged_at: Optional[datetime] = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "branch_point": self.branch_point.to_dict(),
            "worktree_state": self.worktree_state.to_dict() if self.worktree_state else None,
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
            worktree_state=WorktreeState.from_dict(data["worktree_state"]) if data.get("worktree_state") else None,
            task_intent=TaskIntent.from_dict(data["task_intent"]) if data.get("task_intent") else TaskIntent("", ""),
            commits_behind_main=data.get("commits_behind_main", 0),
            status=data.get("status", "active"),
            merged_at=datetime.fromisoformat(data["merged_at"]) if data.get("merged_at") else None,
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
    main_branch_history: List[MainBranchEvent] = field(default_factory=list)

    # Each task's isolated view of this file
    task_views: Dict[str, TaskFileView] = field(default_factory=dict)

    # Metadata
    created_at: datetime = field(default_factory=datetime.now)
    last_updated: datetime = field(default_factory=datetime.now)

    def add_main_event(self, event: MainBranchEvent) -> None:
        """Add a main branch event and increment drift for all active tasks."""
        self.main_branch_history.append(event)
        self.last_updated = datetime.now()

        # Update commits_behind_main for all active tasks
        for task_view in self.task_views.values():
            if task_view.status == 'active':
                task_view.commits_behind_main += 1

    def add_task_view(self, task_view: TaskFileView) -> None:
        """Add or update a task's view of this file."""
        self.task_views[task_view.task_id] = task_view
        self.last_updated = datetime.now()

    def get_task_view(self, task_id: str) -> Optional[TaskFileView]:
        """Get a task's view of this file."""
        return self.task_views.get(task_id)

    def get_active_tasks(self) -> List[TaskFileView]:
        """Get all tasks that are still active (not merged/abandoned)."""
        return [tv for tv in self.task_views.values() if tv.status == 'active']

    def get_events_since_commit(self, commit_hash: str) -> List[MainBranchEvent]:
        """Get all main branch events since a given commit."""
        events = []
        found_commit = False
        for event in self.main_branch_history:
            if found_commit:
                events.append(event)
            if event.commit_hash == commit_hash:
                found_commit = True
        return events

    def get_current_main_state(self) -> Optional[MainBranchEvent]:
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
    main_evolution: List[MainBranchEvent]

    # Task's changes
    task_worktree_content: str

    # Current main state
    current_main_content: str
    current_main_commit: str

    # Other tasks that also touch this file (for forward-compatibility)
    other_pending_tasks: List[Dict]  # [{task_id, intent, branch_point, commits_behind}]

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


# =============================================================================
# FILE TIMELINE TRACKER SERVICE
# =============================================================================

class FileTimelineTracker:
    """
    Central service managing all file timelines.

    This service is the "brain" of the intent-aware merge system. It:
    - Creates and manages FileTimeline objects
    - Handles events from git hooks and task lifecycle
    - Provides merge context to the AI resolver
    - Persists timelines to JSON storage
    """

    def __init__(self, project_path: Path, storage_path: Optional[Path] = None):
        """
        Initialize the file timeline tracker.

        Args:
            project_path: Root directory of the project
            storage_path: Directory for timeline storage (default: .auto-claude/)
        """
        debug(MODULE, "Initializing FileTimelineTracker",
              project_path=str(project_path))

        self.project_path = Path(project_path).resolve()
        self.storage_path = storage_path or (self.project_path / ".auto-claude")
        self.timelines_dir = self.storage_path / "file-timelines"

        # Ensure storage directory exists
        self.timelines_dir.mkdir(parents=True, exist_ok=True)

        # In-memory cache of timelines
        self._timelines: Dict[str, FileTimeline] = {}

        # Load existing timelines
        self._load_from_storage()

        debug_success(MODULE, "FileTimelineTracker initialized",
                     timelines_loaded=len(self._timelines))

    # =========================================================================
    # EVENT HANDLERS
    # =========================================================================

    def on_task_start(
        self,
        task_id: str,
        files_to_modify: List[str],
        files_to_create: Optional[List[str]] = None,
        branch_point_commit: Optional[str] = None,
        task_intent: str = "",
        task_title: str = "",
    ) -> None:
        """
        Called when a task creates its worktree and starts work.

        This captures the task's "branch point" - what the file looked like
        when the task started, which is crucial for understanding what the
        task actually changed vs what was already there.
        """
        debug(MODULE, f"on_task_start: {task_id}",
              files_to_modify=files_to_modify,
              branch_point=branch_point_commit)

        # Get actual branch point commit if not provided
        if not branch_point_commit:
            branch_point_commit = self._get_current_main_commit()

        timestamp = datetime.now()

        for file_path in files_to_modify:
            # Get or create timeline for this file
            timeline = self._get_or_create_timeline(file_path)

            # Get file content at branch point
            content = self._get_file_content_at_commit(file_path, branch_point_commit)
            if content is None:
                # File doesn't exist at this commit - might be created by task
                content = ""

            # Create task file view
            task_view = TaskFileView(
                task_id=task_id,
                branch_point=BranchPoint(
                    commit_hash=branch_point_commit,
                    content=content,
                    timestamp=timestamp,
                ),
                task_intent=TaskIntent(
                    title=task_title or task_id,
                    description=task_intent,
                    from_plan=bool(task_intent),
                ),
                commits_behind_main=0,
                status='active',
            )

            timeline.add_task_view(task_view)
            self._persist_timeline(file_path)

        debug_success(MODULE, f"Task {task_id} registered with {len(files_to_modify)} files")

    def on_main_branch_commit(self, commit_hash: str) -> None:
        """
        Called via git post-commit hook when human commits to main.

        This tracks the "drift" - how many commits have happened in main
        since each task branched.
        """
        debug(MODULE, f"on_main_branch_commit: {commit_hash}")

        # Get list of files changed in this commit
        changed_files = self._get_files_changed_in_commit(commit_hash)

        for file_path in changed_files:
            # Only update existing timelines (we don't create new ones for random files)
            if file_path not in self._timelines:
                continue

            timeline = self._timelines[file_path]

            # Get file content at this commit
            content = self._get_file_content_at_commit(file_path, commit_hash)
            if content is None:
                continue

            # Get commit metadata
            commit_info = self._get_commit_info(commit_hash)

            # Create main branch event
            event = MainBranchEvent(
                commit_hash=commit_hash,
                timestamp=datetime.now(),
                content=content,
                source='human',
                commit_message=commit_info.get('message', ''),
                author=commit_info.get('author'),
                diff_summary=commit_info.get('diff_summary'),
            )

            timeline.add_main_event(event)
            self._persist_timeline(file_path)

        debug_success(MODULE, f"Processed main commit {commit_hash[:8]}",
                     files_updated=len(changed_files))

    def on_task_worktree_change(
        self,
        task_id: str,
        file_path: str,
        new_content: str,
    ) -> None:
        """
        Called when AI agent modifies a file in its worktree.

        This updates the task's "worktree state" - what the file currently
        looks like in that task's isolated workspace.
        """
        debug(MODULE, f"on_task_worktree_change: {task_id} -> {file_path}")

        timeline = self._timelines.get(file_path)
        if not timeline:
            # Create timeline if it doesn't exist
            timeline = self._get_or_create_timeline(file_path)

        task_view = timeline.get_task_view(task_id)
        if not task_view:
            debug_warning(MODULE, f"Task {task_id} not registered for {file_path}")
            return

        # Update worktree state
        task_view.worktree_state = WorktreeState(
            content=new_content,
            last_modified=datetime.now(),
        )

        self._persist_timeline(file_path)

    def on_task_merged(self, task_id: str, merge_commit: str) -> None:
        """
        Called after a task is successfully merged to main.

        This updates the timeline to show:
        1. The task is now merged
        2. Main branch has a new commit (from this merge)
        """
        debug(MODULE, f"on_task_merged: {task_id}")

        # Get list of files this task modified
        task_files = self.get_files_for_task(task_id)

        for file_path in task_files:
            timeline = self._timelines.get(file_path)
            if not timeline:
                continue

            task_view = timeline.get_task_view(task_id)
            if not task_view:
                continue

            # Mark task as merged
            task_view.status = 'merged'
            task_view.merged_at = datetime.now()

            # Add main branch event for the merge
            content = self._get_file_content_at_commit(file_path, merge_commit)
            if content:
                event = MainBranchEvent(
                    commit_hash=merge_commit,
                    timestamp=datetime.now(),
                    content=content,
                    source='merged_task',
                    merged_from_task=task_id,
                    commit_message=f"Merged from {task_id}",
                )
                timeline.add_main_event(event)

            self._persist_timeline(file_path)

        debug_success(MODULE, f"Task {task_id} marked as merged")

    def on_task_abandoned(self, task_id: str) -> None:
        """
        Called if a task is cancelled/abandoned.
        """
        debug(MODULE, f"on_task_abandoned: {task_id}")

        task_files = self.get_files_for_task(task_id)

        for file_path in task_files:
            timeline = self._timelines.get(file_path)
            if not timeline:
                continue

            task_view = timeline.get_task_view(task_id)
            if task_view:
                task_view.status = 'abandoned'

            self._persist_timeline(file_path)

    # =========================================================================
    # QUERY METHODS
    # =========================================================================

    def get_merge_context(self, task_id: str, file_path: str) -> Optional[MergeContext]:
        """
        Build complete merge context for AI resolver.

        This is the key method that produces the "situational awareness"
        the Merge AI needs.
        """
        debug(MODULE, f"get_merge_context: {task_id} -> {file_path}")

        timeline = self._timelines.get(file_path)
        if not timeline:
            debug_warning(MODULE, f"No timeline found for {file_path}")
            return None

        task_view = timeline.get_task_view(task_id)
        if not task_view:
            debug_warning(MODULE, f"Task {task_id} not found in timeline for {file_path}")
            return None

        # Get main evolution since task branched
        main_evolution = timeline.get_events_since_commit(task_view.branch_point.commit_hash)

        # Get current main state
        current_main = timeline.get_current_main_state()
        current_main_content = current_main.content if current_main else task_view.branch_point.content
        current_main_commit = current_main.commit_hash if current_main else task_view.branch_point.commit_hash

        # Get task's worktree content
        worktree_content = ""
        if task_view.worktree_state:
            worktree_content = task_view.worktree_state.content
        else:
            # Try to get from worktree path
            worktree_content = self._get_worktree_file_content(task_id, file_path)

        # Get other pending tasks
        other_tasks = []
        for tv in timeline.get_active_tasks():
            if tv.task_id != task_id:
                other_tasks.append({
                    "task_id": tv.task_id,
                    "intent": tv.task_intent.description,
                    "branch_point": tv.branch_point.commit_hash,
                    "commits_behind": tv.commits_behind_main,
                })

        context = MergeContext(
            file_path=file_path,
            task_id=task_id,
            task_intent=task_view.task_intent,
            task_branch_point=task_view.branch_point,
            main_evolution=main_evolution,
            task_worktree_content=worktree_content,
            current_main_content=current_main_content,
            current_main_commit=current_main_commit,
            other_pending_tasks=other_tasks,
            total_commits_behind=task_view.commits_behind_main,
            total_pending_tasks=len(other_tasks),
        )

        debug_success(MODULE, f"Built merge context",
                     commits_behind=task_view.commits_behind_main,
                     main_events=len(main_evolution),
                     other_tasks=len(other_tasks))

        return context

    def get_files_for_task(self, task_id: str) -> List[str]:
        """Return all files this task is tracking."""
        files = []
        for file_path, timeline in self._timelines.items():
            if task_id in timeline.task_views:
                files.append(file_path)
        return files

    def get_pending_tasks_for_file(self, file_path: str) -> List[TaskFileView]:
        """Return all active tasks that modify this file."""
        timeline = self._timelines.get(file_path)
        if not timeline:
            return []
        return timeline.get_active_tasks()

    def get_task_drift(self, task_id: str) -> Dict[str, int]:
        """Return commits-behind-main for each file in task."""
        drift = {}
        for file_path, timeline in self._timelines.items():
            task_view = timeline.get_task_view(task_id)
            if task_view and task_view.status == 'active':
                drift[file_path] = task_view.commits_behind_main
        return drift

    def has_timeline(self, file_path: str) -> bool:
        """Check if a file has an active timeline."""
        return file_path in self._timelines

    def get_timeline(self, file_path: str) -> Optional[FileTimeline]:
        """Get the timeline for a file."""
        return self._timelines.get(file_path)

    # =========================================================================
    # PERSISTENCE
    # =========================================================================

    def _load_from_storage(self) -> None:
        """Load timelines from disk on startup."""
        index_path = self.timelines_dir / "index.json"
        if not index_path.exists():
            return

        try:
            with open(index_path) as f:
                index = json.load(f)

            for file_path in index.get("files", []):
                timeline_file = self._get_timeline_file_path(file_path)
                if timeline_file.exists():
                    with open(timeline_file) as f:
                        data = json.load(f)
                    self._timelines[file_path] = FileTimeline.from_dict(data)

            debug(MODULE, f"Loaded {len(self._timelines)} timelines from storage")

        except Exception as e:
            logger.error(f"Failed to load timelines: {e}")

    def _persist_timeline(self, file_path: str) -> None:
        """Save a single timeline to disk."""
        timeline = self._timelines.get(file_path)
        if not timeline:
            return

        try:
            # Save timeline file
            timeline_file = self._get_timeline_file_path(file_path)
            timeline_file.parent.mkdir(parents=True, exist_ok=True)

            with open(timeline_file, "w") as f:
                json.dump(timeline.to_dict(), f, indent=2)

            # Update index
            self._update_index()

        except Exception as e:
            logger.error(f"Failed to persist timeline for {file_path}: {e}")

    def _update_index(self) -> None:
        """Update the index file with all tracked files."""
        index_path = self.timelines_dir / "index.json"
        index = {
            "files": list(self._timelines.keys()),
            "last_updated": datetime.now().isoformat(),
        }
        with open(index_path, "w") as f:
            json.dump(index, f, indent=2)

    def _get_timeline_file_path(self, file_path: str) -> Path:
        """Get the storage path for a file's timeline."""
        # Encode path: src/App.tsx -> src_App.tsx.json
        safe_name = file_path.replace("/", "_").replace("\\", "_")
        return self.timelines_dir / f"{safe_name}.json"

    def _get_or_create_timeline(self, file_path: str) -> FileTimeline:
        """Get existing timeline or create new one."""
        if file_path not in self._timelines:
            self._timelines[file_path] = FileTimeline(file_path=file_path)
        return self._timelines[file_path]

    # =========================================================================
    # GIT HELPERS
    # =========================================================================

    def _get_current_main_commit(self) -> str:
        """Get the current HEAD commit on main branch."""
        try:
            result = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                cwd=self.project_path,
                capture_output=True,
                text=True,
                check=True,
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return "unknown"

    def _get_file_content_at_commit(self, file_path: str, commit_hash: str) -> Optional[str]:
        """Get file content at a specific commit."""
        try:
            result = subprocess.run(
                ["git", "show", f"{commit_hash}:{file_path}"],
                cwd=self.project_path,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                return result.stdout
            return None
        except Exception:
            return None

    def _get_files_changed_in_commit(self, commit_hash: str) -> List[str]:
        """Get list of files changed in a commit."""
        try:
            result = subprocess.run(
                ["git", "diff-tree", "--no-commit-id", "--name-only", "-r", commit_hash],
                cwd=self.project_path,
                capture_output=True,
                text=True,
                check=True,
            )
            return [f for f in result.stdout.strip().split("\n") if f]
        except subprocess.CalledProcessError:
            return []

    def _get_commit_info(self, commit_hash: str) -> dict:
        """Get commit metadata."""
        info = {}
        try:
            # Get commit message
            result = subprocess.run(
                ["git", "log", "-1", "--format=%s", commit_hash],
                cwd=self.project_path,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                info["message"] = result.stdout.strip()

            # Get author
            result = subprocess.run(
                ["git", "log", "-1", "--format=%an", commit_hash],
                cwd=self.project_path,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                info["author"] = result.stdout.strip()

            # Get diff stat
            result = subprocess.run(
                ["git", "diff-tree", "--stat", "--no-commit-id", commit_hash],
                cwd=self.project_path,
                capture_output=True,
                text=True,
            )
            if result.returncode == 0:
                info["diff_summary"] = result.stdout.strip().split("\n")[-1] if result.stdout.strip() else None

        except Exception:
            pass

        return info

    def _get_worktree_file_content(self, task_id: str, file_path: str) -> str:
        """Get file content from a task's worktree."""
        # Extract spec name from task_id (remove 'task-' prefix if present)
        spec_name = task_id.replace("task-", "") if task_id.startswith("task-") else task_id

        worktree_path = self.project_path / ".worktrees" / spec_name / file_path
        if worktree_path.exists():
            return worktree_path.read_text(encoding="utf-8")
        return ""

    # =========================================================================
    # CAPTURE METHODS (for integration with existing code)
    # =========================================================================

    def capture_worktree_state(self, task_id: str, worktree_path: Path) -> None:
        """
        Capture the current state of all modified files in a worktree.

        Called before merge to ensure we have the latest worktree content.
        """
        debug(MODULE, f"capture_worktree_state: {task_id}")

        try:
            # Get all changed files in worktree vs main
            result = subprocess.run(
                ["git", "diff", "--name-only", "main...HEAD"],
                cwd=worktree_path,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                return

            changed_files = [f for f in result.stdout.strip().split("\n") if f]

            for file_path in changed_files:
                full_path = worktree_path / file_path
                if full_path.exists():
                    content = full_path.read_text(encoding="utf-8")
                    self.on_task_worktree_change(task_id, file_path, content)

            debug_success(MODULE, f"Captured {len(changed_files)} files from worktree")

        except Exception as e:
            logger.error(f"Failed to capture worktree state: {e}")

    def initialize_from_worktree(
        self,
        task_id: str,
        worktree_path: Path,
        task_intent: str = "",
        task_title: str = "",
    ) -> None:
        """
        Initialize timeline tracking from an existing worktree.

        Used for retroactive registration of tasks that were created
        before the timeline system was in place.
        """
        debug(MODULE, f"initialize_from_worktree: {task_id}")

        try:
            # Get the branch point (merge-base with main)
            result = subprocess.run(
                ["git", "merge-base", "main", "HEAD"],
                cwd=worktree_path,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                debug_warning(MODULE, "Could not determine branch point")
                return

            branch_point = result.stdout.strip()

            # Get changed files
            result = subprocess.run(
                ["git", "diff", "--name-only", f"{branch_point}...HEAD"],
                cwd=worktree_path,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                return

            changed_files = [f for f in result.stdout.strip().split("\n") if f]

            # Register task for these files
            self.on_task_start(
                task_id=task_id,
                files_to_modify=changed_files,
                branch_point_commit=branch_point,
                task_intent=task_intent,
                task_title=task_title,
            )

            # Capture current worktree state
            self.capture_worktree_state(task_id, worktree_path)

            # Calculate drift (commits behind main)
            result = subprocess.run(
                ["git", "rev-list", "--count", f"{branch_point}..main"],
                cwd=self.project_path,
                capture_output=True,
                text=True,
            )

            if result.returncode == 0:
                drift = int(result.stdout.strip())
                for file_path in changed_files:
                    timeline = self._timelines.get(file_path)
                    if timeline:
                        task_view = timeline.get_task_view(task_id)
                        if task_view:
                            task_view.commits_behind_main = drift
                        self._persist_timeline(file_path)

            debug_success(MODULE, f"Initialized from worktree",
                         files=len(changed_files),
                         branch_point=branch_point[:8])

        except Exception as e:
            logger.error(f"Failed to initialize from worktree: {e}")
