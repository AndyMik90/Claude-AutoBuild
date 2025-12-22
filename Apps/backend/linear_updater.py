"""
Linear updater module facade.

Provides Linear integration functionality.
Re-exports from integrations.linear.updater for clean imports.
"""

from integrations.linear.updater import (
    LinearTaskState,
    add_linear_comment,
    create_linear_task,
    get_linear_api_key,
    is_linear_enabled,
    linear_build_complete,
    linear_qa_approved,
    linear_qa_max_iterations,
    linear_qa_rejected,
    linear_qa_started,
    linear_subtask_completed,
    linear_subtask_failed,
    linear_task_started,
    linear_task_stuck,
    update_linear_status,
)

__all__ = [
    "LinearTaskState",
    "add_linear_comment",
    "create_linear_task",
    "get_linear_api_key",
    "is_linear_enabled",
    "linear_build_complete",
    "linear_qa_approved",
    "linear_qa_max_iterations",
    "linear_qa_rejected",
    "linear_qa_started",
    "linear_subtask_completed",
    "linear_subtask_failed",
    "linear_task_started",
    "linear_task_stuck",
    "update_linear_status",
]
