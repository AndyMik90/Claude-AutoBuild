"""
Linear Integration
==================

Integration with Linear issue tracking.
"""

from .config import LinearConfig
from .integration import LinearManager
from .updater import (
    LinearTaskState,
    is_linear_enabled,
    get_linear_api_key,
    create_linear_task,
    update_linear_status,
    STATUS_TODO,
    STATUS_IN_PROGRESS,
    STATUS_IN_REVIEW,
    STATUS_DONE,
    STATUS_CANCELED,
)

# Aliases for backward compatibility
LinearIntegration = LinearManager
LinearUpdater = LinearTaskState  # Alias - old code may expect this name

__all__ = [
    "LinearConfig",
    "LinearManager",
    "LinearIntegration",
    "LinearTaskState",
    "LinearUpdater",
    "is_linear_enabled",
    "get_linear_api_key",
    "create_linear_task",
    "update_linear_status",
    "STATUS_TODO",
    "STATUS_IN_PROGRESS",
    "STATUS_IN_REVIEW",
    "STATUS_DONE",
    "STATUS_CANCELED",
]
