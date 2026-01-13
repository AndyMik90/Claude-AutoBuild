"""Spec management API routes."""

import asyncio
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates

from config import get_settings, Settings
from models import Project, Spec, SpecCreate
from services.project_service import ProjectService
from services.spec_service import SpecService


router = APIRouter()
templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")


@router.get("/{project_id}/specs", response_model=list[Spec])
async def list_specs(
    project_id: str,
    settings: Settings = Depends(get_settings),
) -> list[Spec]:
    """List all specs for a project."""
    project_service = ProjectService(settings)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    return await spec_service.list_specs(project)


@router.get("/{project_id}/specs/{spec_id}", response_model=Spec)
async def get_spec(
    project_id: str,
    spec_id: str,
    settings: Settings = Depends(get_settings),
) -> Spec:
    """Get a spec by ID."""
    project_service = ProjectService(settings)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    spec = await spec_service.get_spec(project, spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="Spec not found")

    return spec


@router.get("/{project_id}/specs/{spec_id}/content")
async def get_spec_content(
    project_id: str,
    spec_id: str,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get spec content."""
    project_service = ProjectService(settings)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    content = await spec_service.get_spec_content(project, spec_id)
    plan = await spec_service.get_implementation_plan(project, spec_id)
    qa_report = await spec_service.get_qa_report(project, spec_id)

    return {
        "content": content,
        "implementation_plan": plan,
        "qa_report": qa_report,
    }


@router.post("/{project_id}/specs", response_model=dict)
async def create_spec(
    project_id: str,
    data: SpecCreate,
    settings: Settings = Depends(get_settings),
) -> dict:
    """Create a new spec using spec_runner.py."""
    project_service = ProjectService(settings)
    project = await project_service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    spec_service = SpecService(settings)
    next_num = await spec_service.get_next_spec_number(project)

    # Build command
    cmd = [
        "python",
        str(settings.auto_claude_path / "runners" / "spec_runner.py"),
        "--task",
        data.task,
        "--project-dir",
        project.path,
    ]

    if data.complexity:
        cmd.extend(["--complexity", data.complexity])

    # Run spec creation asynchronously
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=project.path,
    )

    stdout, _ = await process.communicate()

    if process.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail=f"Spec creation failed: {stdout.decode()}",
        )

    # Get the newly created spec
    specs = await spec_service.list_specs(project)
    if specs:
        newest_spec = max(specs, key=lambda s: s.id)
        return {"success": True, "spec_id": newest_spec.id}

    return {"success": True, "message": "Spec created"}


# HTMX partial endpoints
@router.post("/{project_id}/specs/htmx/create", response_class=HTMLResponse)
async def htmx_create_spec(
    project_id: str,
    request: Request,
    settings: Settings = Depends(get_settings),
):
    """HTMX endpoint for creating a spec."""
    form_data = await request.form()
    task = form_data.get("task", "")
    complexity = form_data.get("complexity")

    if not task:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": "Task description is required", "type": "error"},
        )

    project_service = ProjectService(settings)
    project = await project_service.get_project(project_id)
    if not project:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": "Project not found", "type": "error"},
        )

    try:
        result = await create_spec(
            project_id,
            SpecCreate(task=task, complexity=complexity or None),
            settings,
        )
        return templates.TemplateResponse(
            "partials/_toast.html",
            {
                "request": request,
                "message": f"Spec created: {result.get('spec_id', 'success')}",
                "type": "success",
            },
            headers={"HX-Trigger": "specCreated"},
        )
    except HTTPException as e:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": str(e.detail), "type": "error"},
        )


@router.get("/{project_id}/specs/htmx/list", response_class=HTMLResponse)
async def htmx_list_specs(
    project_id: str,
    request: Request,
    settings: Settings = Depends(get_settings),
):
    """HTMX endpoint for listing specs (partial)."""
    project_service = ProjectService(settings)
    project = await project_service.get_project(project_id)
    if not project:
        return HTMLResponse(content="<p>Project not found</p>")

    spec_service = SpecService(settings)
    specs = await spec_service.list_specs(project)

    # Return spec rows
    html_parts = []
    for spec in specs:
        response = templates.TemplateResponse(
            "partials/_spec_row.html",
            {"request": request, "spec": spec, "project": project},
        )
        html_parts.append(response.body.decode())

    return HTMLResponse(content="".join(html_parts))
