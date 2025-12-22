"""
Plane Integration
=================

Integration with Plane.so project management for self-hosted instances.
"""

from .api import PlaneAPIClient, PlaneAPIError
from .config import (
    PRIORITY_HIGH,
    PRIORITY_LOW,
    PRIORITY_MEDIUM,
    PRIORITY_NONE,
    PRIORITY_URGENT,
    STATE_GROUP_BACKLOG,
    STATE_GROUP_CANCELLED,
    STATE_GROUP_COMPLETED,
    STATE_GROUP_STARTED,
    STATE_GROUP_UNSTARTED,
    STATUS_BACKLOG,
    STATUS_CANCELLED,
    STATUS_DONE,
    STATUS_IN_PROGRESS,
    STATUS_TODO,
    PlaneConfig,
    PlaneProjectState,
    PlaneTaskState,
)
from .integration import PlaneManager
from .updater import (
    add_plane_comment,
    create_plane_task,
    get_plane_api_key,
    get_plane_base_url,
    get_plane_project_id,
    get_plane_workspace_slug,
    is_plane_enabled,
    plane_build_complete,
    plane_qa_approved,
    plane_qa_max_iterations,
    plane_qa_rejected,
    plane_qa_started,
    plane_session_completed,
    plane_stuck_escalation,
    plane_subtask_completed,
    plane_subtask_failed,
    plane_task_started,
    plane_task_stuck,
    update_plane_status,
)

# Aliases for consistency with Linear integration naming
PlaneIntegration = PlaneManager
PlaneUpdater = PlaneTaskState

__all__ = [
    # API Client
    "PlaneAPIClient",
    "PlaneAPIError",
    # Config
    "PlaneConfig",
    "PlaneTaskState",
    "PlaneProjectState",
    # Status constants
    "STATUS_BACKLOG",
    "STATUS_TODO",
    "STATUS_IN_PROGRESS",
    "STATUS_DONE",
    "STATUS_CANCELLED",
    # State group constants
    "STATE_GROUP_BACKLOG",
    "STATE_GROUP_UNSTARTED",
    "STATE_GROUP_STARTED",
    "STATE_GROUP_COMPLETED",
    "STATE_GROUP_CANCELLED",
    # Priority constants
    "PRIORITY_NONE",
    "PRIORITY_URGENT",
    "PRIORITY_HIGH",
    "PRIORITY_MEDIUM",
    "PRIORITY_LOW",
    # Manager
    "PlaneManager",
    "PlaneIntegration",
    "PlaneUpdater",
    # Updater functions
    "is_plane_enabled",
    "get_plane_api_key",
    "get_plane_base_url",
    "get_plane_workspace_slug",
    "get_plane_project_id",
    "create_plane_task",
    "update_plane_status",
    "add_plane_comment",
    # Convenience functions
    "plane_task_started",
    "plane_subtask_completed",
    "plane_subtask_failed",
    "plane_build_complete",
    "plane_qa_started",
    "plane_qa_approved",
    "plane_qa_rejected",
    "plane_qa_max_iterations",
    "plane_task_stuck",
    "plane_session_completed",
    "plane_stuck_escalation",
]
