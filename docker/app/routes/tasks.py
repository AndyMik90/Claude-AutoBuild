"""Task management API routes.

Tasks in Auto-Claude map to Specs. This route provides the Task API
expected by the frontend while internally working with specs.
"""

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any

import aiofiles
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings, Settings
from database import get_db
from db.models import User
from dependencies import get_current_user
from services.project_service import ProjectService
from services.spec_service import SpecService
from services.build_runner import get_build_runner
from routes.websocket import broadcast_task_status, broadcast_task_progress


router = APIRouter()


def validate_task_id(task_id: str) -> None:
    """Validate task_id doesn't contain path traversal characters.

    Raises HTTPException if task_id contains dangerous characters.
    """
    # Check for path traversal patterns
    if ".." in task_id or "/" in task_id or "\\" in task_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid task ID: contains path traversal characters"
        )

    # Check for null bytes which could be used for injection
    if "\x00" in task_id:
        raise HTTPException(
            status_code=400,
            detail="Invalid task ID: contains null bytes"
        )


# Dependency to get project service with user context
def get_project_service(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ProjectService:
    """Get project service with current user."""
    return ProjectService(db, settings, current_user)


# Request/Response Models
class TaskCreate(BaseModel):
    """Request model for creating a task."""
    title: str
    description: str
    metadata: Optional[dict] = None


class TaskUpdate(BaseModel):
    """Request model for updating a task."""
    title: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[dict] = None
    status: Optional[str] = None


class TaskStartOptions(BaseModel):
    """Options for starting a task."""
    parallel: bool = False
    workers: int = 1


# Helper functions
def spec_status_to_task_status(spec_status: str) -> str:
    """Convert spec status to task status."""
    mapping = {
        "draft": "backlog",
        "ready": "backlog",
        "building": "in_progress",
        "completed": "human_review",
        "failed": "human_review",
        "merged": "done",
    }
    return mapping.get(spec_status, "backlog")


def task_status_to_spec_status(task_status: str) -> str:
    """Convert task status to spec status."""
    mapping = {
        "backlog": "ready",
        "in_progress": "building",
        "ai_review": "completed",
        "human_review": "completed",
        "done": "merged",
    }
    return mapping.get(task_status, "ready")


async def load_implementation_plan(project_path: str, spec_id: str) -> Optional[dict]:
    """Load implementation plan from spec directory."""
    spec_dir = Path(project_path) / ".auto-claude" / "specs" / spec_id
    plan_file = spec_dir / "implementation_plan.json"

    if plan_file.exists():
        try:
            async with aiofiles.open(plan_file, mode='r') as f:
                content = await f.read()
            return json.loads(content)
        except json.JSONDecodeError:
            return None
    return None


async def load_task_logs(project_path: str, spec_id: str) -> Optional[dict]:
    """Load task logs from spec directory."""
    spec_dir = Path(project_path) / ".auto-claude" / "specs" / spec_id
    logs_file = spec_dir / "task_logs.json"

    if logs_file.exists():
        try:
            async with aiofiles.open(logs_file, mode='r') as f:
                content = await f.read()
            return json.loads(content)
        except json.JSONDecodeError:
            return None
    return None


async def spec_to_task(spec: Any, project_path: str) -> dict:
    """Convert a Spec to a Task dict for the frontend."""
    spec_id = spec.id

    # Load implementation plan for subtasks
    plan = await load_implementation_plan(project_path, spec_id)
    subtasks = []

    if plan and "phases" in plan:
        for phase in plan.get("phases", []):
            for subtask in phase.get("subtasks", []):
                subtasks.append({
                    "id": subtask.get("id", ""),
                    "title": subtask.get("description", ""),
                    "description": subtask.get("description", ""),
                    "status": subtask.get("status", "pending"),
                    "files": [],
                    "verification": subtask.get("verification"),
                })

    # Load logs
    logs_data = await load_task_logs(project_path, spec_id)
    logs = []
    if logs_data:
        for phase in logs_data.get("phases", {}).values():
            for entry in phase.get("entries", []):
                logs.append(entry.get("content", ""))

    # Determine status and review reason
    status = spec_status_to_task_status(spec.status)
    review_reason = None

    if status == "human_review":
        if spec.status == "completed":
            # Check if all subtasks are done
            all_completed = all(s["status"] == "completed" for s in subtasks) if subtasks else False
            review_reason = "completed" if all_completed else "errors"
        elif spec.status == "failed":
            review_reason = "errors"

    # Build execution progress
    execution_progress = {
        "phase": "idle",
        "phaseProgress": 0,
        "overallProgress": 0,
    }

    if spec.status == "building":
        completed = sum(1 for s in subtasks if s["status"] == "completed")
        total = len(subtasks) if subtasks else 1
        execution_progress = {
            "phase": "coding",
            "phaseProgress": int((completed / total) * 100) if total > 0 else 0,
            "overallProgress": int((completed / total) * 100) if total > 0 else 0,
        }

    return {
        "id": spec_id,
        "specId": spec_id,
        "projectId": spec.project_id,
        "title": plan.get("feature", spec.name) if plan else spec.name,
        "description": spec.description or "",
        "status": status,
        "reviewReason": review_reason,
        "subtasks": subtasks,
        "qaReport": None,
        "logs": logs,
        "metadata": {
            "sourceType": "manual",
            "category": "feature",
        },
        "executionProgress": execution_progress,
        "createdAt": spec.created_at.isoformat() if hasattr(spec.created_at, 'isoformat') else str(spec.created_at),
        "updatedAt": spec.updated_at.isoformat() if hasattr(spec.updated_at, 'isoformat') else str(spec.updated_at),
    }


# Routes
@router.get("/{project_id}/tasks")
async def get_tasks(
    project_id: uuid.UUID,
    include_drafts: bool = False,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Get all tasks for a project (maps specs to tasks).

    Args:
        include_drafts: If True, include incomplete specs without spec.md.
                       Defaults to False since draft specs can't be run.
    """
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    specs = await spec_service.list_specs(project)

    tasks = []
    for spec in specs:
        # Skip draft specs (no spec.md file) unless explicitly requested
        # Draft specs can't be run with run.py
        if not include_drafts and spec.status == "draft":
            continue
        task = await spec_to_task(spec, project.path)
        tasks.append(task)

    return tasks


@router.post("/{project_id}/tasks")
async def create_task(
    project_id: uuid.UUID,
    data: TaskCreate,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Create a new task (creates a spec)."""
    import asyncio

    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)

    # Build description from title and description
    task_description = f"{data.title}\n\n{data.description}"

    # Determine complexity from metadata
    complexity = None
    if data.metadata and "complexity" in data.metadata:
        complexity_map = {
            "trivial": "simple",
            "small": "simple",
            "medium": "standard",
            "large": "standard",
            "complex": "complex",
        }
        complexity = complexity_map.get(data.metadata.get("complexity"), None)

    # Build command
    cmd = [
        "python",
        str(settings.auto_claude_path / "runners" / "spec_runner.py"),
        "--task",
        task_description,
        "--project-dir",
        project.path,
    ]

    if complexity:
        cmd.extend(["--complexity", complexity])

    # Run spec creation
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=project.path,
    )

    try:
        stdout, _ = await asyncio.wait_for(
            process.communicate(),
            timeout=600.0,  # 10 minute timeout
        )
    except asyncio.TimeoutError:
        process.kill()
        raise HTTPException(
            status_code=504,
            detail="Task creation timed out",
        )

    if process.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Task creation failed: {stdout.decode()}",
        )

    # Get the newly created spec
    specs = await spec_service.list_specs(project)
    if specs:
        # Use numeric prefix comparison for spec IDs like "001-name", "002-name"
        def get_spec_numeric_prefix(spec) -> int:
            """Extract numeric prefix from spec ID for proper sorting."""
            try:
                # Spec IDs are formatted as "NNN-name" (e.g., "001-my-feature")
                prefix = spec.id.split("-")[0]
                return int(prefix)
            except (ValueError, IndexError, AttributeError):
                return 0

        newest_spec = max(specs, key=get_spec_numeric_prefix)
        task = await spec_to_task(newest_spec, project.path)
        return task

    raise HTTPException(status_code=500, detail="Task was created but could not be retrieved")


@router.get("/{project_id}/tasks/{task_id}")
async def get_task(
    project_id: uuid.UUID,
    task_id: str,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get a specific task."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    spec = await spec_service.get_spec(project, task_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Task not found")

    return await spec_to_task(spec, project.path)


@router.patch("/{project_id}/tasks/{task_id}")
async def update_task(
    project_id: uuid.UUID,
    task_id: str,
    data: TaskUpdate,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Update a task."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    spec = await spec_service.get_spec(project, task_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Task not found")

    # Update status in implementation_plan.json if provided
    if data.status:
        spec_dir = Path(project.path) / ".auto-claude" / "specs" / task_id
        plan_file = spec_dir / "implementation_plan.json"

        if plan_file.exists():
            try:
                plan = json.loads(plan_file.read_text())
                plan["status"] = data.status
                plan["updated_at"] = datetime.now(timezone.utc).isoformat()
                plan_file.write_text(json.dumps(plan, indent=2))
            except (json.JSONDecodeError, IOError):
                pass

    # Return updated task
    return await spec_to_task(spec, project.path)


@router.delete("/{project_id}/tasks/{task_id}")
async def delete_task(
    project_id: uuid.UUID,
    task_id: str,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Delete a task."""
    import shutil

    # Validate task_id to prevent path traversal attacks
    validate_task_id(task_id)

    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    spec = await spec_service.get_spec(project, task_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Task not found")

    # Delete spec directory
    spec_dir = Path(project.path) / ".auto-claude" / "specs" / task_id
    if spec_dir.exists():
        shutil.rmtree(spec_dir)

    return {"success": True}


@router.post("/{project_id}/tasks/{task_id}/start")
async def start_task(
    project_id: uuid.UUID,
    task_id: str,
    options: Optional[TaskStartOptions] = None,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Start a task (runs the build)."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    build_runner = get_build_runner(settings)
    build = await build_runner.start_build(project.path, task_id)

    # Broadcast status update
    await broadcast_task_status(task_id, "in_progress", "Build started")

    return {
        "success": True,
        "buildId": build.id,
        "status": build.status,
    }


@router.post("/{project_id}/tasks/{task_id}/stop")
async def stop_task(
    project_id: uuid.UUID,
    task_id: str,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Stop a running task."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    build_runner = get_build_runner(settings)
    success = await build_runner.stop_build(project.path, task_id)

    if success:
        await broadcast_task_status(task_id, "backlog", "Build stopped")

    return {"success": success}


@router.post("/{project_id}/tasks/{task_id}/retry")
async def retry_task(
    project_id: uuid.UUID,
    task_id: str,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Retry a failed task."""
    # Stop any existing build
    await stop_task(project_id, task_id, project_service, settings)

    # Start fresh
    return await start_task(project_id, task_id, None, project_service, settings)


@router.get("/{project_id}/tasks/{task_id}/plan")
async def get_task_plan(
    project_id: uuid.UUID,
    task_id: str,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get the implementation plan for a task."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    plan = await load_implementation_plan(project.path, task_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Implementation plan not found")

    return plan


@router.get("/{project_id}/tasks/{task_id}/logs")
async def get_task_logs(
    project_id: uuid.UUID,
    task_id: str,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get logs for a task."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    logs = await load_task_logs(project.path, task_id)
    return logs or {"phases": {}}


@router.post("/{project_id}/tasks/{task_id}/approve")
async def approve_task(
    project_id: uuid.UUID,
    task_id: str,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Approve a task and mark as done."""
    # Update status to done
    await update_task(
        project_id,
        task_id,
        TaskUpdate(status="done"),
        project_service,
        settings
    )

    await broadcast_task_status(task_id, "done", "Task approved")

    return {"success": True}


@router.post("/{project_id}/tasks/{task_id}/reject")
async def reject_task(
    project_id: uuid.UUID,
    task_id: str,
    reason: dict,
    project_service: ProjectService = Depends(get_project_service),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Reject a task and send back for fixes."""
    # Update status back to in_progress
    await update_task(
        project_id,
        task_id,
        TaskUpdate(status="in_progress"),
        project_service,
        settings
    )

    await broadcast_task_status(task_id, "in_progress", reason.get("reason", "Task rejected"))

    return {"success": True}


@router.get("/{project_id}/tasks/archived")
async def get_archived_tasks(
    project_id: uuid.UUID,
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Get archived tasks for a project."""
    # For now, return empty list - archived tasks would have metadata.archivedAt set
    return []
