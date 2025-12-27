"""
Status Management
==================

Build status tracking and status file management for ccstatusline integration.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path

from .colors import warning


class BuildState(Enum):
    """Build state enumeration."""

    IDLE = "idle"
    PLANNING = "planning"
    BUILDING = "building"
    QA = "qa"
    COMPLETE = "complete"
    PAUSED = "paused"
    ERROR = "error"


@dataclass
class BuildStatus:
    """Current build status for status line display."""

    active: bool = False
    spec: str = ""
    state: BuildState = BuildState.IDLE
    subtasks_completed: int = 0
    subtasks_total: int = 0
    subtasks_in_progress: int = 0
    subtasks_failed: int = 0
    phase_current: str = ""
    phase_id: int = 0
    phase_total: int = 0
    workers_active: int = 0
    workers_max: int = 1
    session_number: int = 0
    session_started: str = ""
    last_update: str = ""

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "active": self.active,
            "spec": self.spec,
            "state": self.state.value,
            "subtasks": {
                "completed": self.subtasks_completed,
                "total": self.subtasks_total,
                "in_progress": self.subtasks_in_progress,
                "failed": self.subtasks_failed,
            },
            "phase": {
                "current": self.phase_current,
                "id": self.phase_id,
                "total": self.phase_total,
            },
            "workers": {
                "active": self.workers_active,
                "max": self.workers_max,
            },
            "session": {
                "number": self.session_number,
                "started_at": self.session_started,
            },
            "last_update": self.last_update or datetime.now().isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BuildStatus":
        """Create from dictionary."""
        subtasks = data.get("subtasks", {})
        phase = data.get("phase", {})
        workers = data.get("workers", {})
        session = data.get("session", {})

        return cls(
            active=data.get("active", False),
            spec=data.get("spec", ""),
            state=BuildState(data.get("state", "idle")),
            subtasks_completed=subtasks.get("completed", 0),
            subtasks_total=subtasks.get("total", 0),
            subtasks_in_progress=subtasks.get("in_progress", 0),
            subtasks_failed=subtasks.get("failed", 0),
            phase_current=phase.get("current", ""),
            phase_id=phase.get("id", 0),
            phase_total=phase.get("total", 0),
            workers_active=workers.get("active", 0),
            workers_max=workers.get("max", 1),
            session_number=session.get("number", 0),
            session_started=session.get("started_at", ""),
            last_update=data.get("last_update", ""),
        )


class StatusManager:
    """Manages the .auto-claude-status file for ccstatusline integration."""

    def __init__(self, project_dir: Path):
        self.project_dir = Path(project_dir)
        self.status_file = self.project_dir / ".auto-claude-status"
        self._status = BuildStatus()

    def read(self) -> BuildStatus:
        """Read current status from file."""
        if not self.status_file.exists():
            return BuildStatus()

        try:
            with open(self.status_file) as f:
                data = json.load(f)
            self._status = BuildStatus.from_dict(data)
            return self._status
        except (OSError, json.JSONDecodeError):
            return BuildStatus()

    def write(self, status: BuildStatus = None) -> None:
        """Write status to file."""
        if status:
            self._status = status
        self._status.last_update = datetime.now().isoformat()

        try:
            with open(self.status_file, "w") as f:
                json.dump(self._status.to_dict(), f, indent=2)
        except OSError as e:
            print(warning(f"Could not write status file: {e}"))

    def update(self, **kwargs) -> None:
        """Update specific status fields."""
        for key, value in kwargs.items():
            if hasattr(self._status, key):
                setattr(self._status, key, value)
        self.write()

    def set_active(self, spec: str, state: BuildState) -> None:
        """Mark build as active."""
        self._status.active = True
        self._status.spec = spec
        self._status.state = state
        self._status.session_started = datetime.now().isoformat()
        self.write()

    def set_inactive(self) -> None:
        """Mark build as inactive."""
        self._status.active = False
        self._status.state = BuildState.IDLE
        self.write()

    def update_subtasks(
        self,
        completed: int = None,
        total: int = None,
        in_progress: int = None,
        failed: int = None,
    ) -> None:
        """Update subtask progress."""
        if completed is not None:
            self._status.subtasks_completed = completed
        if total is not None:
            self._status.subtasks_total = total
        if in_progress is not None:
            self._status.subtasks_in_progress = in_progress
        if failed is not None:
            self._status.subtasks_failed = failed
        self.write()

    def update_phase(self, current: str, phase_id: int = 0, total: int = 0) -> None:
        """Update current phase."""
        self._status.phase_current = current
        self._status.phase_id = phase_id
        self._status.phase_total = total
        self.write()

    def update_workers(self, active: int, max_workers: int = None) -> None:
        """Update worker count."""
        self._status.workers_active = active
        if max_workers is not None:
            self._status.workers_max = max_workers
        self.write()

    def update_session(self, number: int) -> None:
        """Update session number."""
        self._status.session_number = number
        self.write()

    def clear(self) -> None:
        """Remove status file."""
        if self.status_file.exists():
            try:
                self.status_file.unlink()
            except OSError:
                pass
