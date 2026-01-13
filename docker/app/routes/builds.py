"""Build execution API routes with authentication and per-project configuration."""

import asyncio
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings, Settings
from database import get_db
from dependencies import get_current_user
from models import Build
from db.models import User
from services.project_service import ProjectService
from services.build_runner import get_build_runner
from services.agent_profile_service import AgentProfileService, AgentProfileError
from services.credential_service import get_credential_service


router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")
logger = logging.getLogger(__name__)


async def get_project_service(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ProjectService:
    """Get project service with current user."""
    return ProjectService(db, settings, current_user)


async def get_agent_profile_service(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> AgentProfileService:
    """Get agent profile service with credential encryption."""
    credential_service = get_credential_service(settings.credential_encryption_key)
    return AgentProfileService(db, current_user, credential_service)


@router.post("/{project_id}/specs/{spec_id}/build", response_model=Build)
async def start_build(
    project_id: uuid.UUID,
    spec_id: str,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
    agent_service: AgentProfileService = Depends(get_agent_profile_service),
) -> Build:
    """Start a build for a spec with project-specific configuration."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Get agent profile and credentials for this project
    profile = await agent_service.get_profile(project_id)
    project_env = {}

    if profile:
        # Try to get decrypted credentials
        try:
            decrypted_creds = await agent_service.get_decrypted_credentials(project_id)
        except AgentProfileError:
            # Encryption not configured or decryption failed, use global creds
            decrypted_creds = None

        # Build environment from profile and credentials
        project_env = agent_service.get_build_env(profile, decrypted_creds)

    build_runner = get_build_runner(settings)
    build = await build_runner.start_build(
        project.path,
        spec_id,
        project_env=project_env,
    )
    return build


@router.post("/{project_id}/specs/{spec_id}/stop")
async def stop_build(
    project_id: uuid.UUID,
    spec_id: str,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
) -> dict:
    """Stop a running build."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    build_runner = get_build_runner(settings)
    success = await build_runner.stop_build(project.path, spec_id)
    return {"success": success}


@router.get("/{project_id}/specs/{spec_id}/build/status")
async def get_build_status(
    project_id: uuid.UUID,
    spec_id: str,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
) -> dict:
    """Get the status of a build."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    build_runner = get_build_runner(settings)
    build = build_runner.get_active_build(project.path, spec_id)

    if build:
        return {
            "status": build.status,
            "started_at": build.started_at,
            "is_running": True,
        }

    return {"status": "idle", "is_running": False}


@router.post("/{project_id}/specs/{spec_id}/merge")
async def merge_spec(
    project_id: uuid.UUID,
    spec_id: str,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
) -> dict:
    """Merge a spec's changes into the main branch."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Run merge command
    cmd = [
        "python",
        str(settings.auto_claude_path / "run.py"),
        "--spec",
        spec_id,
        "--merge",
        "--project-dir",
        project.path,
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=project.path,
    )

    try:
        stdout, _ = await asyncio.wait_for(
            process.communicate(),
            timeout=300.0,  # 5 minute timeout
        )
    except asyncio.TimeoutError:
        process.kill()
        raise HTTPException(
            status_code=504,
            detail="Merge operation timed out",
        )

    output = stdout.decode("utf-8") if stdout else ""
    if process.returncode != 0:
        logger.error(
            "Merge failed for spec %s in project %s: %s",
            spec_id,
            project_id,
            output,
        )
        raise HTTPException(
            status_code=500,
            detail="Merge failed. Check server logs for details.",
        )

    return {"success": True, "message": "Changes merged successfully"}


@router.post("/{project_id}/specs/{spec_id}/discard")
async def discard_spec(
    project_id: uuid.UUID,
    spec_id: str,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
) -> dict:
    """Discard a spec's changes."""
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Run discard command
    cmd = [
        "python",
        str(settings.auto_claude_path / "run.py"),
        "--spec",
        spec_id,
        "--discard",
        "--project-dir",
        project.path,
    ]

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=project.path,
    )

    try:
        stdout, _ = await asyncio.wait_for(
            process.communicate(),
            timeout=300.0,  # 5 minute timeout
        )
    except asyncio.TimeoutError:
        process.kill()
        raise HTTPException(
            status_code=504,
            detail="Discard operation timed out",
        )

    output = stdout.decode("utf-8") if stdout else ""
    if process.returncode != 0:
        logger.error(
            "Discard failed for spec %s in project %s: %s",
            spec_id,
            project_id,
            output,
        )
        raise HTTPException(
            status_code=500,
            detail="Discard failed. Check server logs for details.",
        )

    return {"success": True, "message": "Changes discarded"}


# HTMX partial endpoints
@router.post("/{project_id}/specs/{spec_id}/htmx/build", response_class=HTMLResponse)
async def htmx_start_build(
    project_id: uuid.UUID,
    spec_id: str,
    request: Request,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
    agent_service: AgentProfileService = Depends(get_agent_profile_service),
):
    """HTMX endpoint for starting a build."""
    try:
        project = await project_service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        # Get agent profile and credentials
        profile = await agent_service.get_profile(project_id)
        project_env = {}

        if profile:
            try:
                decrypted_creds = await agent_service.get_decrypted_credentials(project_id)
            except AgentProfileError:
                decrypted_creds = None
            project_env = agent_service.get_build_env(profile, decrypted_creds)

        build_runner = get_build_runner(settings)
        await build_runner.start_build(
            project.path,
            spec_id,
            project_env=project_env,
        )

        return templates.TemplateResponse(
            "partials/_toast.html",
            {
                "request": request,
                "message": "Build started",
                "type": "success",
            },
            headers={"HX-Trigger": "buildStarted"},
        )
    except HTTPException as e:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": str(e.detail), "type": "error"},
        )


@router.post("/{project_id}/specs/{spec_id}/htmx/merge", response_class=HTMLResponse)
async def htmx_merge_spec(
    project_id: uuid.UUID,
    spec_id: str,
    request: Request,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
):
    """HTMX endpoint for merging a spec."""
    try:
        result = await merge_spec(project_id, spec_id, settings, project_service)
        return templates.TemplateResponse(
            "partials/_toast.html",
            {
                "request": request,
                "message": result["message"],
                "type": "success",
            },
            headers={"HX-Trigger": "specMerged"},
        )
    except HTTPException as e:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": str(e.detail), "type": "error"},
        )


@router.post("/{project_id}/specs/{spec_id}/htmx/discard", response_class=HTMLResponse)
async def htmx_discard_spec(
    project_id: uuid.UUID,
    spec_id: str,
    request: Request,
    settings: Settings = Depends(get_settings),
    project_service: ProjectService = Depends(get_project_service),
):
    """HTMX endpoint for discarding a spec."""
    try:
        result = await discard_spec(project_id, spec_id, settings, project_service)
        return templates.TemplateResponse(
            "partials/_toast.html",
            {
                "request": request,
                "message": result["message"],
                "type": "success",
            },
            headers={"HX-Trigger": "specDiscarded"},
        )
    except HTTPException as e:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": str(e.detail), "type": "error"},
        )
