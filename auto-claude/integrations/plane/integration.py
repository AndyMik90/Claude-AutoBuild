"""
Plane Integration Manager
=========================

Manages synchronization between Auto-Build subtasks and Plane work items.
Provides real-time visibility into build progress through Plane.

The integration is OPTIONAL - if PLANE_API_KEY is not set, all operations
gracefully no-op and the build continues with local tracking only.

Key Features:
- Subtask -> Work Item mapping (sync implementation_plan.json to Plane)
- Session attempt recording (comments on work items)
- Stuck subtask escalation (add detailed comments)
- Progress tracking
"""

import json
import os
from datetime import datetime
from pathlib import Path

from .config import (
    LABELS,
    STATE_GROUP_BACKLOG,
    PlaneConfig,
    PlaneProjectState,
    format_session_comment,
    format_stuck_comment,
    format_work_item_description,
    get_plane_state_group,
    get_priority_for_phase,
)


class PlaneManager:
    """
    Manages Plane integration for an Auto-Build spec.

    This class provides a high-level interface for:
    - Creating/syncing work items from implementation_plan.json
    - Recording session attempts and results
    - Escalating stuck subtasks
    - Tracking overall progress

    All operations are idempotent and gracefully handle Plane being unavailable.
    """

    def __init__(self, spec_dir: Path, project_dir: Path):
        """
        Initialize Plane manager.

        Args:
            spec_dir: Spec directory (contains implementation_plan.json)
            project_dir: Project root directory
        """
        self.spec_dir = spec_dir
        self.project_dir = project_dir
        self.config = PlaneConfig.from_env()
        self.state: PlaneProjectState | None = None

        # Load existing state if available
        self.state = PlaneProjectState.load(spec_dir)

    @property
    def is_enabled(self) -> bool:
        """Check if Plane integration is enabled and available."""
        return self.config.is_valid()

    @property
    def is_initialized(self) -> bool:
        """Check if Plane project has been initialized for this spec."""
        return self.state is not None and self.state.initialized

    @property
    def is_fully_configured(self) -> bool:
        """Check if Plane has all required configuration."""
        return self.config.is_fully_configured()

    def get_issue_id(self, subtask_id: str) -> str | None:
        """
        Get the Plane work item ID for a subtask.

        Args:
            subtask_id: Subtask ID from implementation_plan.json

        Returns:
            Plane work item ID or None if not mapped
        """
        if not self.state:
            return None
        return self.state.issue_mapping.get(subtask_id)

    def set_issue_id(self, subtask_id: str, work_item_id: str) -> None:
        """
        Store the mapping between a subtask and its Plane work item.

        Args:
            subtask_id: Subtask ID from implementation_plan.json
            work_item_id: Plane work item ID
        """
        if not self.state:
            self.state = PlaneProjectState()

        self.state.issue_mapping[subtask_id] = work_item_id
        self.state.save(self.spec_dir)

    def initialize_project(
        self,
        workspace_slug: str,
        project_id: str,
        project_name: str,
        project_identifier: str | None = None,
    ) -> bool:
        """
        Initialize a Plane project for this spec.

        This should be called to set up the Plane project reference
        and create initial work items.

        Args:
            workspace_slug: Plane workspace slug
            project_id: Plane project ID
            project_name: Name of the Plane project
            project_identifier: Project key/identifier (e.g., "PROJ")

        Returns:
            True if successful
        """
        if not self.is_enabled:
            print("Plane integration not enabled (PLANE_API_KEY not set)")
            return False

        # Create initial state
        self.state = PlaneProjectState(
            initialized=True,
            workspace_slug=workspace_slug,
            project_id=project_id,
            project_name=project_name,
            project_identifier=project_identifier,
            created_at=datetime.now().isoformat(),
        )

        self.state.save(self.spec_dir)
        return True

    def update_meta_issue_id(self, meta_issue_id: str) -> None:
        """Update the META work item ID after creation."""
        if self.state:
            self.state.meta_issue_id = meta_issue_id
            self.state.save(self.spec_dir)

    def load_implementation_plan(self) -> dict | None:
        """Load the implementation plan from spec directory."""
        plan_file = self.spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            return None

        try:
            with open(plan_file) as f:
                return json.load(f)
        except (OSError, json.JSONDecodeError):
            return None

    def get_subtasks_for_sync(self) -> list[dict]:
        """
        Get all subtasks that need Plane work items.

        Returns:
            List of subtask dicts with phase context
        """
        plan = self.load_implementation_plan()
        if not plan:
            return []

        subtasks = []
        phases = plan.get("phases", [])
        total_phases = len(phases)

        for phase in phases:
            phase_num = phase.get("phase", 1)
            phase_name = phase.get("name", f"Phase {phase_num}")

            for subtask in phase.get("subtasks", []):
                subtasks.append(
                    {
                        **subtask,
                        "phase_num": phase_num,
                        "phase_name": phase_name,
                        "total_phases": total_phases,
                        "phase_depends_on": phase.get("depends_on", []),
                    }
                )

        return subtasks

    def generate_work_item_data(self, subtask: dict) -> dict:
        """
        Generate Plane work item data from a subtask.

        Args:
            subtask: Subtask dict with phase context

        Returns:
            Dict suitable for Plane create_work_item
        """
        phase = {
            "name": subtask.get("phase_name"),
            "id": subtask.get("phase_num"),
        }

        # Determine priority based on phase position
        priority = get_priority_for_phase(
            subtask.get("phase_num", 1), subtask.get("total_phases", 1)
        )

        # Build title
        subtask_id = subtask.get("id", "subtask")
        description_preview = subtask.get("description", "Implement subtask")[:100]
        title = f"[{subtask_id}] {description_preview}"

        return {
            "name": title,
            "description_html": format_work_item_description(subtask, phase),
            "priority": priority,
            "state_group": get_plane_state_group(subtask.get("status", "pending")),
        }

    def record_session_result(
        self,
        subtask_id: str,
        session_num: int,
        success: bool,
        approach: str = "",
        error: str = "",
        git_commit: str = "",
    ) -> str:
        """
        Record a session result as a Plane comment.

        This is called by post_session_processing in agent.py.

        Args:
            subtask_id: Subtask being worked on
            session_num: Session number
            success: Whether the session succeeded
            approach: What was attempted
            error: Error message if failed
            git_commit: Git commit hash if any

        Returns:
            Formatted comment body (for logging even if Plane unavailable)
        """
        comment = format_session_comment(
            session_num=session_num,
            subtask_id=subtask_id,
            success=success,
            approach=approach,
            error=error,
            git_commit=git_commit,
        )

        # Note: Actual Plane API call will be done by the updater module
        # This method prepares the data and returns it
        return comment

    def prepare_status_update(self, subtask_id: str, new_status: str) -> dict:
        """
        Prepare data for a Plane work item status update.

        Args:
            subtask_id: Subtask ID
            new_status: New subtask status (pending, in_progress, completed, etc.)

        Returns:
            Dict with work_item_id and state_group for the update
        """
        work_item_id = self.get_issue_id(subtask_id)
        state_group = get_plane_state_group(new_status)

        return {
            "work_item_id": work_item_id,
            "state_group": state_group,
            "subtask_id": subtask_id,
        }

    def prepare_stuck_escalation(
        self,
        subtask_id: str,
        attempt_count: int,
        attempts: list[dict],
        reason: str = "",
    ) -> dict:
        """
        Prepare data for escalating a stuck subtask.

        This creates the comment body and status update data.

        Args:
            subtask_id: Stuck subtask ID
            attempt_count: Number of attempts
            attempts: List of attempt records
            reason: Why it's stuck

        Returns:
            Dict with work_item_id, comment, labels for escalation
        """
        work_item_id = self.get_issue_id(subtask_id)
        comment = format_stuck_comment(
            subtask_id=subtask_id,
            attempt_count=attempt_count,
            attempts=attempts,
            reason=reason,
        )

        return {
            "work_item_id": work_item_id,
            "subtask_id": subtask_id,
            "state_group": STATE_GROUP_BACKLOG,  # Move back to backlog when stuck
            "comment": comment,
            "labels": [LABELS["stuck"], LABELS["needs_review"]],
        }

    def get_progress_summary(self) -> dict:
        """
        Get a summary of Plane integration progress.

        Returns:
            Dict with progress statistics
        """
        plan = self.load_implementation_plan()
        if not plan:
            return {
                "enabled": self.is_enabled,
                "initialized": False,
                "total_subtasks": 0,
                "mapped_subtasks": 0,
            }

        subtasks = self.get_subtasks_for_sync()
        mapped = sum(1 for s in subtasks if self.get_issue_id(s.get("id", "")))

        return {
            "enabled": self.is_enabled,
            "initialized": self.is_initialized,
            "workspace_slug": self.state.workspace_slug if self.state else None,
            "project_id": self.state.project_id if self.state else None,
            "project_name": self.state.project_name if self.state else None,
            "project_identifier": self.state.project_identifier if self.state else None,
            "meta_issue_id": self.state.meta_issue_id if self.state else None,
            "total_subtasks": len(subtasks),
            "mapped_subtasks": mapped,
        }

    def get_plane_context_for_prompt(self) -> str:
        """
        Generate Plane context section for agent prompts.

        This is included in the subtask prompt to give the agent
        awareness of Plane integration status.

        Returns:
            Markdown-formatted context string
        """
        if not self.is_enabled:
            return ""

        summary = self.get_progress_summary()

        if not summary["initialized"]:
            return """
## Plane Integration

Plane integration is enabled but not yet initialized.
The Python orchestrator will handle work item creation and updates.

Note: Unlike Linear, Plane uses direct REST API calls managed by Python,
so you don't need to use MCP tools for Plane updates.
"""

        lines = [
            "## Plane Integration",
            "",
            f"**Workspace:** {summary['workspace_slug']}",
            f"**Project:** {summary['project_name']}",
            f"**Work Items:** {summary['mapped_subtasks']}/{summary['total_subtasks']} subtasks mapped",
            "",
            "Progress updates are automatically posted to Plane by the orchestrator.",
            "Focus on your implementation - status tracking is handled for you.",
        ]

        return "\n".join(lines)

    def save_state(self) -> None:
        """Save the current state to disk."""
        if self.state:
            self.state.save(self.spec_dir)


# Utility functions for integration with other modules


def get_plane_manager(spec_dir: Path, project_dir: Path) -> PlaneManager:
    """
    Get a PlaneManager instance for the given spec.

    This is the main entry point for other modules.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory

    Returns:
        PlaneManager instance
    """
    return PlaneManager(spec_dir, project_dir)


def is_plane_enabled() -> bool:
    """Quick check if Plane integration is available."""
    return bool(os.environ.get("PLANE_API_KEY"))


def prepare_planner_plane_instructions(spec_dir: Path) -> str:
    """
    Generate Plane setup instructions for the planner agent.

    This is included in the planner prompt when Plane is enabled.

    Args:
        spec_dir: Spec directory

    Returns:
        Markdown instructions for Plane setup
    """
    if not is_plane_enabled():
        return ""

    return """
## Plane Integration

Plane integration is ENABLED. Unlike Linear, Plane updates are handled
by the Python orchestrator using the REST API directly.

After creating the implementation plan:
1. The orchestrator will automatically create work items for each subtask
2. Status updates are posted as you complete subtasks
3. Session results are recorded as comments
4. Stuck subtasks are escalated automatically

You don't need to make any Plane API calls - focus on the implementation.
The orchestrator manages all Plane synchronization.
"""


def prepare_coder_plane_instructions(
    spec_dir: Path,
    subtask_id: str,
) -> str:
    """
    Generate Plane instructions for the coding agent.

    Args:
        spec_dir: Spec directory
        subtask_id: Current subtask being worked on

    Returns:
        Markdown instructions for Plane updates
    """
    if not is_plane_enabled():
        return ""

    manager = PlaneManager(spec_dir, spec_dir.parent.parent)  # Approximate project_dir

    if not manager.is_initialized:
        return ""

    work_item_id = manager.get_issue_id(subtask_id)
    if not work_item_id:
        return ""

    return f"""
## Plane Integration

This subtask is linked to Plane work item: `{work_item_id}`

Status updates and comments are handled automatically by the orchestrator.
Focus on your implementation - Plane will be updated when:
- Session starts (status -> started)
- Session completes (progress comment added)
- Subtask completes (status -> completed)
- Subtask gets stuck (detailed escalation comment)
"""
