"""
Plane Integration Configuration
===============================

Constants, status mappings, and configuration helpers for Plane.so integration.
Mirrors the structure of linear/config.py for consistency.
"""

import html
import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

# =============================================================================
# Status Constants (map to Plane state groups)
# =============================================================================

# Plane uses state "groups" to categorize states
STATE_GROUP_BACKLOG = "backlog"
STATE_GROUP_UNSTARTED = "unstarted"
STATE_GROUP_STARTED = "started"
STATE_GROUP_COMPLETED = "completed"
STATE_GROUP_CANCELLED = "cancelled"

# Friendly status names for display
STATUS_BACKLOG = "Backlog"
STATUS_TODO = "Todo"
STATUS_IN_PROGRESS = "In Progress"
STATUS_DONE = "Done"
STATUS_CANCELLED = "Cancelled"

# Map state groups to display names
STATE_GROUP_TO_STATUS = {
    STATE_GROUP_BACKLOG: STATUS_BACKLOG,
    STATE_GROUP_UNSTARTED: STATUS_TODO,
    STATE_GROUP_STARTED: STATUS_IN_PROGRESS,
    STATE_GROUP_COMPLETED: STATUS_DONE,
    STATE_GROUP_CANCELLED: STATUS_CANCELLED,
}

# =============================================================================
# Priority Constants
# =============================================================================

# Plane priority values (strings, not numbers like Linear)
PRIORITY_NONE = "none"
PRIORITY_URGENT = "urgent"
PRIORITY_HIGH = "high"
PRIORITY_MEDIUM = "medium"
PRIORITY_LOW = "low"

# Priority order for sorting (lower = higher priority)
PRIORITY_ORDER = {
    PRIORITY_URGENT: 1,
    PRIORITY_HIGH: 2,
    PRIORITY_MEDIUM: 3,
    PRIORITY_LOW: 4,
    PRIORITY_NONE: 5,
}

# Subtask status to Plane state group mapping
SUBTASK_TO_STATE_GROUP = {
    "pending": STATE_GROUP_UNSTARTED,
    "in_progress": STATE_GROUP_STARTED,
    "completed": STATE_GROUP_COMPLETED,
    "blocked": STATE_GROUP_BACKLOG,  # Map blocked to backlog for visibility
    "failed": STATE_GROUP_BACKLOG,
    "stuck": STATE_GROUP_BACKLOG,
}

# =============================================================================
# Labels for categorization
# =============================================================================

LABELS = {
    "phase": "phase",  # Phase label prefix (e.g., "phase-1")
    "service": "service",  # Service label prefix
    "stuck": "stuck",  # Mark stuck subtasks
    "auto_build": "auto-claude",  # All auto-claude work items
    "needs_review": "needs-review",
}

# =============================================================================
# State file names
# =============================================================================

PLANE_TASK_FILE = ".plane_task.json"
PLANE_PROJECT_FILE = ".plane_project.json"


# =============================================================================
# Configuration Dataclasses
# =============================================================================


@dataclass
class PlaneConfig:
    """Configuration for Plane integration."""

    api_key: str
    base_url: str = "https://api.plane.so"
    workspace_slug: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    enabled: bool = True

    @classmethod
    def from_env(cls) -> "PlaneConfig":
        """Create config from environment variables."""
        api_key = os.environ.get("PLANE_API_KEY", "")
        base_url = os.environ.get("PLANE_BASE_URL", "https://api.plane.so")

        return cls(
            api_key=api_key,
            base_url=base_url.rstrip("/"),
            workspace_slug=os.environ.get("PLANE_WORKSPACE_SLUG"),
            project_id=os.environ.get("PLANE_PROJECT_ID"),
            enabled=bool(api_key),
        )

    def is_valid(self) -> bool:
        """Check if config has minimum required values."""
        return bool(self.api_key)

    def is_fully_configured(self) -> bool:
        """Check if config has all values needed for most API calls."""
        return bool(self.api_key and self.workspace_slug and self.project_id)


@dataclass
class PlaneTaskState:
    """State of a Plane work item for an auto-claude spec."""

    task_id: str | None = None
    task_title: str | None = None
    workspace_slug: str | None = None
    project_id: str | None = None
    state_id: str | None = None
    state_group: str = STATE_GROUP_UNSTARTED
    sequence_id: int | None = None  # e.g., 123 in PROJ-123
    created_at: str | None = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_title": self.task_title,
            "workspace_slug": self.workspace_slug,
            "project_id": self.project_id,
            "state_id": self.state_id,
            "state_group": self.state_group,
            "sequence_id": self.sequence_id,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PlaneTaskState":
        return cls(
            task_id=data.get("task_id"),
            task_title=data.get("task_title"),
            workspace_slug=data.get("workspace_slug"),
            project_id=data.get("project_id"),
            state_id=data.get("state_id"),
            state_group=data.get("state_group", STATE_GROUP_UNSTARTED),
            sequence_id=data.get("sequence_id"),
            created_at=data.get("created_at"),
        )

    def save(self, spec_dir: Path) -> None:
        """Save state to the spec directory."""
        state_file = spec_dir / PLANE_TASK_FILE
        with open(state_file, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, spec_dir: Path) -> Optional["PlaneTaskState"]:
        """Load state from the spec directory."""
        state_file = spec_dir / PLANE_TASK_FILE
        if not state_file.exists():
            return None

        try:
            with open(state_file) as f:
                return cls.from_dict(json.load(f))
        except (OSError, json.JSONDecodeError):
            return None

    @property
    def identifier(self) -> str | None:
        """
        Get a task identifier for display.

        Returns the sequence ID (e.g., '123') if available, otherwise the task UUID.
        Note: Does not include project prefix as that's not stored in task state.
        """
        if self.sequence_id is not None:
            return str(self.sequence_id)
        return self.task_id


@dataclass
class PlaneProjectState:
    """State of a Plane project for an auto-claude spec."""

    initialized: bool = False
    workspace_slug: str | None = None
    project_id: str | None = None
    project_name: str | None = None
    project_identifier: str | None = None  # e.g., "PROJ"
    meta_issue_id: str | None = None
    total_issues: int = 0
    created_at: str | None = None
    issue_mapping: dict = field(default_factory=dict)  # subtask_id -> work_item_id

    def to_dict(self) -> dict:
        return {
            "initialized": self.initialized,
            "workspace_slug": self.workspace_slug,
            "project_id": self.project_id,
            "project_name": self.project_name,
            "project_identifier": self.project_identifier,
            "meta_issue_id": self.meta_issue_id,
            "total_issues": self.total_issues,
            "created_at": self.created_at,
            "issue_mapping": self.issue_mapping,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "PlaneProjectState":
        return cls(
            initialized=data.get("initialized", False),
            workspace_slug=data.get("workspace_slug"),
            project_id=data.get("project_id"),
            project_name=data.get("project_name"),
            project_identifier=data.get("project_identifier"),
            meta_issue_id=data.get("meta_issue_id"),
            total_issues=data.get("total_issues", 0),
            created_at=data.get("created_at"),
            issue_mapping=data.get("issue_mapping", {}),
        )

    def save(self, spec_dir: Path) -> None:
        """Save state to the spec directory."""
        marker_file = spec_dir / PLANE_PROJECT_FILE
        with open(marker_file, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, spec_dir: Path) -> Optional["PlaneProjectState"]:
        """Load state from the spec directory."""
        marker_file = spec_dir / PLANE_PROJECT_FILE
        if not marker_file.exists():
            return None

        try:
            with open(marker_file) as f:
                return cls.from_dict(json.load(f))
        except (OSError, json.JSONDecodeError):
            return None


# =============================================================================
# Helper Functions
# =============================================================================


def get_plane_state_group(subtask_status: str) -> str:
    """
    Map subtask status to Plane state group.

    Args:
        subtask_status: Status from implementation_plan.json

    Returns:
        Corresponding Plane state group string
    """
    return SUBTASK_TO_STATE_GROUP.get(subtask_status, STATE_GROUP_UNSTARTED)


def get_priority_for_phase(phase_num: int, total_phases: int) -> str:
    """
    Determine Plane priority based on phase number.

    Early phases are higher priority (they're dependencies).

    Args:
        phase_num: Phase number (1-indexed)
        total_phases: Total number of phases

    Returns:
        Plane priority value string
    """
    if total_phases <= 1:
        return PRIORITY_HIGH

    # First quarter of phases = Urgent
    # Second quarter = High
    # Third quarter = Medium
    # Fourth quarter = Low
    position = phase_num / total_phases

    if position <= 0.25:
        return PRIORITY_URGENT
    elif position <= 0.5:
        return PRIORITY_HIGH
    elif position <= 0.75:
        return PRIORITY_MEDIUM
    else:
        return PRIORITY_LOW


def format_work_item_description(subtask: dict, phase: dict | None = None) -> str:
    """
    Format a subtask as a Plane work item description (HTML).

    Args:
        subtask: Subtask dict from implementation_plan.json
        phase: Optional phase dict for context

    Returns:
        HTML-formatted description (with proper escaping for security)
    """
    lines = []

    # Description
    if subtask.get("description"):
        desc = html.escape(subtask["description"])
        lines.append(f"<h2>Description</h2><p>{desc}</p>")

    # Service
    if subtask.get("service"):
        service = html.escape(subtask["service"])
        lines.append(f"<p><strong>Service:</strong> {service}</p>")
    elif subtask.get("all_services"):
        lines.append("<p><strong>Scope:</strong> All services (integration)</p>")

    # Phase info
    if phase:
        phase_name = html.escape(phase.get("name", phase.get("id", "Unknown")))
        lines.append(f"<p><strong>Phase:</strong> {phase_name}</p>")

    # Files to modify
    if subtask.get("files_to_modify"):
        lines.append("<h2>Files to Modify</h2><ul>")
        for f in subtask["files_to_modify"]:
            lines.append(f"<li><code>{html.escape(f)}</code></li>")
        lines.append("</ul>")

    # Files to create
    if subtask.get("files_to_create"):
        lines.append("<h2>Files to Create</h2><ul>")
        for f in subtask["files_to_create"]:
            lines.append(f"<li><code>{html.escape(f)}</code></li>")
        lines.append("</ul>")

    # Patterns to follow
    if subtask.get("patterns_from"):
        lines.append("<h2>Reference Patterns</h2><ul>")
        for f in subtask["patterns_from"]:
            lines.append(f"<li><code>{html.escape(f)}</code></li>")
        lines.append("</ul>")

    # Verification
    if subtask.get("verification"):
        v = subtask["verification"]
        lines.append("<h2>Verification</h2>")
        v_type = html.escape(v.get("type", "none"))
        lines.append(f"<p><strong>Type:</strong> {v_type}</p>")
        if v.get("run"):
            run_cmd = html.escape(v["run"])
            lines.append(f"<p><strong>Command:</strong> <code>{run_cmd}</code></p>")
        if v.get("url"):
            url = html.escape(v["url"])
            lines.append(f"<p><strong>URL:</strong> {url}</p>")
        if v.get("scenario"):
            scenario = html.escape(v["scenario"])
            lines.append(f"<p><strong>Scenario:</strong> {scenario}</p>")

    # Auto-build metadata
    lines.append("<hr>")
    lines.append(
        "<p><em>This work item was created by the Auto-Build Framework</em></p>"
    )

    return "".join(lines)


def format_session_comment(
    session_num: int,
    subtask_id: str,
    success: bool,
    approach: str = "",
    error: str = "",
    git_commit: str = "",
) -> str:
    """
    Format a session result as a Plane comment (HTML).

    Args:
        session_num: Session number
        subtask_id: Subtask being worked on
        success: Whether the session succeeded
        approach: What was attempted
        error: Error message if failed
        git_commit: Git commit hash if any

    Returns:
        HTML-formatted comment (with proper escaping for security)
    """
    status_emoji = "&#x2705;" if success else "&#x274C;"  # checkmark or X
    status_text = "Completed" if success else "In Progress"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        f"<h2>Session #{session_num} {status_emoji}</h2>",
        f"<p><strong>Subtask:</strong> <code>{html.escape(subtask_id)}</code></p>",
        f"<p><strong>Status:</strong> {status_text}</p>",
        f"<p><strong>Time:</strong> {timestamp}</p>",
    ]

    if approach:
        lines.append(f"<p><strong>Approach:</strong> {html.escape(approach)}</p>")

    if git_commit:
        lines.append(f"<p><strong>Commit:</strong> <code>{html.escape(git_commit[:8])}</code></p>")

    if error:
        # Escape HTML in error message using html.escape for security
        safe_error = html.escape(error[:500])
        lines.append(f"<p><strong>Error:</strong></p><pre>{safe_error}</pre>")

    return "".join(lines)


def format_stuck_comment(
    subtask_id: str,
    attempt_count: int,
    attempts: list[dict],
    reason: str = "",
) -> str:
    """
    Format a detailed comment for stuck subtasks (HTML).

    Args:
        subtask_id: Stuck subtask ID
        attempt_count: Number of attempts
        attempts: List of attempt records
        reason: Why it's stuck

    Returns:
        HTML-formatted comment for escalation (with proper escaping for security)
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    lines = [
        "<h2>&#x26A0; Subtask Marked as STUCK</h2>",
        f"<p><strong>Subtask:</strong> <code>{html.escape(subtask_id)}</code></p>",
        f"<p><strong>Attempts:</strong> {attempt_count}</p>",
        f"<p><strong>Time:</strong> {timestamp}</p>",
    ]

    if reason:
        lines.append(f"<p><strong>Reason:</strong> {html.escape(reason)}</p>")

    # Add attempt history
    if attempts:
        lines.append("<h3>Attempt History</h3>")
        for i, attempt in enumerate(attempts[-5:], 1):  # Last 5 attempts
            status = "&#x2705;" if attempt.get("success") else "&#x274C;"
            lines.append(f"<p><strong>Attempt {i}:</strong> {status}</p>")
            if attempt.get("approach"):
                safe_approach = html.escape(attempt["approach"][:200])
                lines.append(f"<p>- Approach: {safe_approach}</p>")
            if attempt.get("error"):
                safe_error = html.escape(attempt["error"][:200])
                lines.append(f"<p>- Error: {safe_error}</p>")

    lines.append("<h3>Recommended Actions</h3>")
    lines.append("<ol>")
    lines.append("<li>Review the approach and error patterns above</li>")
    lines.append("<li>Check for missing dependencies or configuration</li>")
    lines.append("<li>Consider manual intervention or different approach</li>")
    lines.append("<li>Update HUMAN_INPUT.md with guidance for the agent</li>")
    lines.append("</ol>")

    return "".join(lines)
