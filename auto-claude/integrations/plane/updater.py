"""
Plane Updater - Direct REST API Updates
========================================

Provides reliable Plane updates via direct REST API calls.
Unlike Linear (which uses MCP), we call the Plane REST API directly.

Design Principles:
- ONE task per spec (not one issue per subtask)
- Python orchestrator controls when updates happen
- Direct API calls for reliability
- Graceful degradation if Plane unavailable

Status Flow:
  Backlog -> Unstarted -> Started -> Completed
    |           |            |
    |           |            +-- All subtasks done, QA approved
    |           +-- Planner/Coder working
    +-- Task created from spec
"""

import os
from datetime import datetime
from pathlib import Path

from .api import PlaneAPIClient, PlaneAPIError
from .config import (
    STATE_GROUP_COMPLETED,
    STATE_GROUP_STARTED,
    STATE_GROUP_UNSTARTED,
    PlaneConfig,
    PlaneTaskState,
    format_session_comment,
    format_stuck_comment,
)

# Re-export status constants for convenience
STATUS_BACKLOG = "Backlog"
STATUS_TODO = "Todo"
STATUS_IN_PROGRESS = "In Progress"
STATUS_DONE = "Done"
STATUS_CANCELLED = "Cancelled"


def is_plane_enabled() -> bool:
    """Check if Plane integration is available."""
    return bool(os.environ.get("PLANE_API_KEY"))


def get_plane_api_key() -> str:
    """Get the Plane API key from environment."""
    return os.environ.get("PLANE_API_KEY", "")


def get_plane_base_url() -> str:
    """Get the Plane base URL from environment."""
    return os.environ.get("PLANE_BASE_URL", "https://api.plane.so")


def get_plane_workspace_slug() -> str | None:
    """Get the Plane workspace slug from environment."""
    return os.environ.get("PLANE_WORKSPACE_SLUG")


def get_plane_project_id() -> str | None:
    """Get the Plane project ID from environment."""
    return os.environ.get("PLANE_PROJECT_ID")


def _get_config() -> PlaneConfig:
    """Get Plane configuration from environment."""
    return PlaneConfig.from_env()


async def _find_state_id(
    client: PlaneAPIClient,
    workspace_slug: str,
    project_id: str,
    state_group: str,
) -> str | None:
    """
    Find a state ID for a given state group.

    Args:
        client: Plane API client
        workspace_slug: Workspace identifier
        project_id: Project UUID
        state_group: State group (backlog, unstarted, started, completed, cancelled)

    Returns:
        State UUID or None if not found
    """
    try:
        states = await client.list_states(workspace_slug, project_id)
        for state in states:
            if state.get("group") == state_group:
                return state.get("id")
        return None
    except PlaneAPIError:
        return None


async def create_plane_task(
    spec_dir: Path,
    title: str,
    description: str | None = None,
) -> PlaneTaskState | None:
    """
    Create a new Plane work item for a spec.

    Called by spec_runner.py after requirements gathering.

    Args:
        spec_dir: Spec directory to save state
        title: Task title (the task name from user)
        description: Optional task description (HTML)

    Returns:
        PlaneTaskState if successful, None if failed
    """
    if not is_plane_enabled():
        return None

    # Check if task already exists
    existing = PlaneTaskState.load(spec_dir)
    if existing and existing.task_id:
        print(f"Plane task already exists: {existing.task_id}")
        return existing

    config = _get_config()
    if not config.workspace_slug:
        print("PLANE_WORKSPACE_SLUG not set")
        return None

    if not config.project_id:
        print("PLANE_PROJECT_ID not set")
        return None

    try:
        async with PlaneAPIClient(config.api_key, config.base_url) as client:
            # Create the work item
            work_item = await client.create_work_item(
                workspace_slug=config.workspace_slug,
                project_id=config.project_id,
                name=title,
                description_html=description,
            )

            if not work_item or "id" not in work_item:
                print("Failed to create Plane work item")
                return None

            # Create and save state
            state = PlaneTaskState(
                task_id=work_item["id"],
                task_title=title,
                workspace_slug=config.workspace_slug,
                project_id=config.project_id,
                state_id=work_item.get("state"),
                state_group=STATE_GROUP_UNSTARTED,
                sequence_id=work_item.get("sequence_id"),
                created_at=datetime.now().isoformat(),
            )
            state.save(spec_dir)

            seq_id = work_item.get("sequence_id", "?")
            print(f"Created Plane work item: #{seq_id}")
            return state

    except PlaneAPIError as e:
        print(f"Plane API error: {e}")
        return None
    except Exception as e:
        print(f"Plane task creation failed: {e}")
        return None


async def update_plane_status(
    spec_dir: Path,
    new_state_group: str,
) -> bool:
    """
    Update the Plane work item status.

    Args:
        spec_dir: Spec directory with .plane_task.json
        new_state_group: New state group (backlog, unstarted, started, completed, cancelled)

    Returns:
        True if successful, False otherwise
    """
    if not is_plane_enabled():
        return False

    state = PlaneTaskState.load(spec_dir)
    if not state or not state.task_id:
        print("No Plane task found for this spec")
        return False

    if not state.workspace_slug or not state.project_id:
        print("Plane task missing workspace_slug or project_id")
        return False

    # Don't update if already at this state
    if state.state_group == new_state_group:
        return True

    config = _get_config()

    try:
        async with PlaneAPIClient(config.api_key, config.base_url) as client:
            # Find the state ID for the target state group
            state_id = await _find_state_id(
                client,
                state.workspace_slug,
                state.project_id,
                new_state_group,
            )

            if not state_id:
                print(f"No state found for group: {new_state_group}")
                return False

            # Update the work item
            await client.update_work_item(
                workspace_slug=state.workspace_slug,
                project_id=state.project_id,
                work_item_id=state.task_id,
                state=state_id,
            )

            # Update local state
            state.state_group = new_state_group
            state.state_id = state_id
            state.save(spec_dir)

            print(f"Updated Plane task #{state.sequence_id} to: {new_state_group}")
            return True

    except PlaneAPIError as e:
        print(f"Plane API error: {e}")
        return False
    except Exception as e:
        print(f"Plane status update failed: {e}")
        return False


async def add_plane_comment(
    spec_dir: Path,
    comment_html: str,
) -> bool:
    """
    Add a comment to the Plane work item.

    Args:
        spec_dir: Spec directory with .plane_task.json
        comment_html: Comment content (HTML)

    Returns:
        True if successful, False otherwise
    """
    if not is_plane_enabled():
        return False

    state = PlaneTaskState.load(spec_dir)
    if not state or not state.task_id:
        print("No Plane task found for this spec")
        return False

    if not state.workspace_slug or not state.project_id:
        print("Plane task missing workspace_slug or project_id")
        return False

    config = _get_config()

    try:
        async with PlaneAPIClient(config.api_key, config.base_url) as client:
            await client.add_comment(
                workspace_slug=state.workspace_slug,
                project_id=state.project_id,
                work_item_id=state.task_id,
                comment_html=comment_html,
            )

            print(f"Added comment to Plane task #{state.sequence_id}")
            return True

    except PlaneAPIError as e:
        print(f"Plane API error: {e}")
        return False
    except Exception as e:
        print(f"Plane comment failed: {e}")
        return False


# =============================================================================
# Convenience functions for specific transitions
# =============================================================================


async def plane_task_started(spec_dir: Path) -> bool:
    """
    Mark task as started (In Progress).
    Called when planner session begins.
    """
    success = await update_plane_status(spec_dir, STATE_GROUP_STARTED)
    if success:
        await add_plane_comment(
            spec_dir,
            "<p><strong>Build started</strong> - planning phase initiated</p>",
        )
    return success


async def plane_subtask_completed(
    spec_dir: Path,
    subtask_id: str,
    completed_count: int,
    total_count: int,
) -> bool:
    """
    Record subtask completion as a comment.
    Called after each successful coder session.
    """
    comment = (
        f"<p><strong>Completed {subtask_id}</strong> "
        f"({completed_count}/{total_count} subtasks done)</p>"
    )
    return await add_plane_comment(spec_dir, comment)


async def plane_subtask_failed(
    spec_dir: Path,
    subtask_id: str,
    attempt: int,
    error_summary: str,
) -> bool:
    """
    Record subtask failure as a comment.
    Called after failed coder session.
    """
    safe_error = error_summary[:200].replace("<", "&lt;").replace(">", "&gt;")
    comment = (
        f"<p><strong>Subtask {subtask_id} failed</strong> "
        f"(attempt {attempt}): {safe_error}</p>"
    )
    return await add_plane_comment(spec_dir, comment)


async def plane_build_complete(spec_dir: Path) -> bool:
    """
    Record build completion, moving to QA.
    Called when all subtasks are completed.
    """
    comment = "<p><strong>All subtasks completed</strong> - moving to QA validation</p>"
    return await add_plane_comment(spec_dir, comment)


async def plane_qa_started(spec_dir: Path) -> bool:
    """
    Note: Plane doesn't have a separate "In Review" state by default.
    We keep it as "started" and add a comment.
    """
    comment = "<p><strong>QA validation started</strong></p>"
    return await add_plane_comment(spec_dir, comment)


async def plane_qa_approved(spec_dir: Path) -> bool:
    """
    Record QA approval.
    Called when QA approves the build.
    """
    # Move to completed state
    success = await update_plane_status(spec_dir, STATE_GROUP_COMPLETED)
    if success:
        await add_plane_comment(
            spec_dir,
            "<p><strong>QA approved</strong> - awaiting human review for merge</p>",
        )
    return success


async def plane_qa_rejected(
    spec_dir: Path,
    issues_count: int,
    iteration: int,
) -> bool:
    """
    Record QA rejection.
    Called when QA rejects the build.
    """
    comment = (
        f"<p><strong>QA iteration {iteration}</strong>: "
        f"Found {issues_count} issues - applying fixes</p>"
    )
    return await add_plane_comment(spec_dir, comment)


async def plane_qa_max_iterations(spec_dir: Path, iterations: int) -> bool:
    """
    Record QA max iterations reached.
    Called when QA loop exhausts retries.
    """
    comment = (
        f"<p><strong>QA reached max iterations</strong> ({iterations}) "
        f"- needs human intervention</p>"
    )
    return await add_plane_comment(spec_dir, comment)


async def plane_task_stuck(
    spec_dir: Path,
    subtask_id: str,
    attempt_count: int,
) -> bool:
    """
    Record that a subtask is stuck.
    Called when subtask exceeds retry limit.
    """
    comment = (
        f"<p><strong>Subtask {subtask_id} is STUCK</strong> "
        f"after {attempt_count} attempts - needs human review</p>"
    )
    # Optionally move to backlog to indicate blocked
    # await update_plane_status(spec_dir, STATE_GROUP_BACKLOG)
    return await add_plane_comment(spec_dir, comment)


async def plane_session_completed(
    spec_dir: Path,
    session_num: int,
    subtask_id: str,
    success: bool,
    approach: str = "",
    error: str = "",
    git_commit: str = "",
) -> bool:
    """
    Record a session result as a detailed comment.
    Called after each coder session.
    """
    comment = format_session_comment(
        session_num=session_num,
        subtask_id=subtask_id,
        success=success,
        approach=approach,
        error=error,
        git_commit=git_commit,
    )
    return await add_plane_comment(spec_dir, comment)


async def plane_stuck_escalation(
    spec_dir: Path,
    subtask_id: str,
    attempt_count: int,
    attempts: list[dict],
    reason: str = "",
) -> bool:
    """
    Record detailed stuck subtask escalation.
    Called when subtask is marked as stuck.
    """
    comment = format_stuck_comment(
        subtask_id=subtask_id,
        attempt_count=attempt_count,
        attempts=attempts,
        reason=reason,
    )
    return await add_plane_comment(spec_dir, comment)
