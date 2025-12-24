"""Project management API routes with authentication."""

import uuid
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings, Settings
from database import get_db
from dependencies import get_current_user
from db.models import User, Project as ProjectModel, ProjectStatus
from services.project_service import ProjectService, ProjectError


router = APIRouter()


# Pydantic schemas for API
class ProjectCreate(BaseModel):
    """Request model for creating a project."""
    repo_url: str
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    """Request model for updating a project."""
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    """Response model for a project."""
    id: uuid.UUID
    name: str
    repo_url: str
    path: str
    status: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_accessed: datetime

    class Config:
        from_attributes = True


class AgentProfileResponse(BaseModel):
    """Response model for agent profile."""
    id: uuid.UUID
    project_id: uuid.UUID
    default_model: str
    thinking_level: str
    phase_models: Optional[dict] = None
    default_complexity: str
    auto_detect_complexity: bool
    memory_backend: str
    graphiti_config: Optional[dict] = None
    default_branch: str
    auto_commit: bool
    auto_push: bool
    max_parallel_subtasks: int
    qa_strict_mode: bool
    recovery_attempts: int
    custom_prompts: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentProfileUpdate(BaseModel):
    """Request model for updating agent profile."""
    default_model: Optional[str] = None
    thinking_level: Optional[str] = None
    phase_models: Optional[dict] = None
    default_complexity: Optional[str] = None
    auto_detect_complexity: Optional[bool] = None
    memory_backend: Optional[str] = None
    graphiti_config: Optional[dict] = None
    default_branch: Optional[str] = None
    auto_commit: Optional[bool] = None
    auto_push: Optional[bool] = None
    max_parallel_subtasks: Optional[int] = None
    qa_strict_mode: Optional[bool] = None
    recovery_attempts: Optional[int] = None
    custom_prompts: Optional[dict] = None


class CredentialsStatusResponse(BaseModel):
    """Response model for credentials status (no secrets)."""
    project_id: uuid.UUID
    has_claude_oauth: bool
    has_anthropic_key: bool
    has_openai_key: bool
    has_github_token: bool
    has_linear_key: bool
    has_voyage_key: bool
    has_google_key: bool
    has_azure_openai_key: bool


# Dependency for project service
async def get_project_service(
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> ProjectService:
    """Get project service with current user."""
    return ProjectService(db, settings, current_user)


# API Routes
@router.get("", response_model=List[ProjectResponse])
async def list_projects(
    service: ProjectService = Depends(get_project_service),
) -> List[ProjectResponse]:
    """List all projects for the current user."""
    projects = await service.list_projects()
    return [ProjectResponse.model_validate(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Get a project by ID."""
    project = await service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse.model_validate(project)


@router.post("", response_model=ProjectResponse)
async def create_project(
    data: ProjectCreate,
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Create a new project by cloning a repository."""
    try:
        project = await service.create_project(
            repo_url=data.repo_url,
            name=data.name,
            description=data.description,
        )
        return ProjectResponse.model_validate(project)
    except ProjectError as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
) -> ProjectResponse:
    """Update a project."""
    project = await service.update_project(
        project_id,
        name=data.name,
        description=data.description,
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse.model_validate(project)


@router.delete("/{project_id}")
async def delete_project(
    project_id: uuid.UUID,
    delete_files: bool = Query(default=False),
    service: ProjectService = Depends(get_project_service),
) -> dict:
    """Delete a project."""
    success = await service.delete_project(project_id, delete_files)
    if not success:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"success": True}


@router.post("/{project_id}/pull")
async def pull_project(
    project_id: uuid.UUID,
    service: ProjectService = Depends(get_project_service),
) -> dict:
    """Pull latest changes for a project."""
    success, message = await service.pull_project(project_id)
    return {"success": success, "message": message}


# Agent Profile Routes
@router.get("/{project_id}/agent-profile", response_model=AgentProfileResponse)
async def get_agent_profile(
    project_id: uuid.UUID,
    service: ProjectService = Depends(get_project_service),
) -> AgentProfileResponse:
    """Get agent profile for a project."""
    profile = await service.get_agent_profile(project_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Agent profile not found")
    return AgentProfileResponse.model_validate(profile)


@router.patch("/{project_id}/agent-profile", response_model=AgentProfileResponse)
async def update_agent_profile(
    project_id: uuid.UUID,
    data: AgentProfileUpdate,
    service: ProjectService = Depends(get_project_service),
) -> AgentProfileResponse:
    """Update agent profile for a project."""
    # Only pass non-None values to the service
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    profile = await service.update_agent_profile(project_id, **updates)
    if not profile:
        raise HTTPException(status_code=404, detail="Agent profile not found")
    return AgentProfileResponse.model_validate(profile)


# Credentials Routes
@router.get("/{project_id}/credentials", response_model=CredentialsStatusResponse)
async def get_credentials_status(
    project_id: uuid.UUID,
    service: ProjectService = Depends(get_project_service),
) -> CredentialsStatusResponse:
    """Get credentials status for a project (no secrets exposed)."""
    credentials = await service.get_credentials(project_id)
    if not credentials:
        raise HTTPException(status_code=404, detail="Credentials not found")

    return CredentialsStatusResponse(
        project_id=credentials.project_id,
        has_claude_oauth=credentials.has_claude_oauth,
        has_anthropic_key=credentials.has_anthropic_key,
        has_openai_key=credentials.has_openai_key,
        has_github_token=credentials.has_github_token,
        has_linear_key=credentials.has_linear_key,
        has_voyage_key=credentials.has_voyage_key,
        has_google_key=credentials.has_google_key,
        has_azure_openai_key=credentials.has_azure_openai_key,
    )


class CredentialsUpdate(BaseModel):
    """Request model for updating credentials."""
    claude_oauth_token: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    github_token: Optional[str] = None
    linear_api_key: Optional[str] = None
    voyage_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    azure_openai_api_key: Optional[str] = None


@router.put("/{project_id}/credentials", response_model=CredentialsStatusResponse)
async def update_credentials(
    project_id: uuid.UUID,
    data: CredentialsUpdate,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
    current_user: User = Depends(get_current_user),
) -> CredentialsStatusResponse:
    """Update encrypted credentials for a project.

    Pass empty string to clear a credential, omit to leave unchanged.
    """
    from services.agent_profile_service import AgentProfileService, AgentProfileError
    from services.credential_service import get_credential_service

    credential_service = get_credential_service(settings.credential_encryption_key)
    agent_service = AgentProfileService(db, current_user, credential_service)

    try:
        credentials = await agent_service.update_credentials(
            project_id,
            claude_oauth_token=data.claude_oauth_token,
            anthropic_api_key=data.anthropic_api_key,
            openai_api_key=data.openai_api_key,
            github_token=data.github_token,
            linear_api_key=data.linear_api_key,
            voyage_api_key=data.voyage_api_key,
            google_api_key=data.google_api_key,
            azure_openai_api_key=data.azure_openai_api_key,
        )
    except AgentProfileError as e:
        raise HTTPException(status_code=400, detail=e.message)

    if not credentials:
        raise HTTPException(status_code=404, detail="Credentials not found")

    return CredentialsStatusResponse(
        project_id=credentials.project_id,
        has_claude_oauth=credentials.has_claude_oauth,
        has_anthropic_key=credentials.has_anthropic_key,
        has_openai_key=credentials.has_openai_key,
        has_github_token=credentials.has_github_token,
        has_linear_key=credentials.has_linear_key,
        has_voyage_key=credentials.has_voyage_key,
        has_google_key=credentials.has_google_key,
        has_azure_openai_key=credentials.has_azure_openai_key,
    )


# HTMX partial endpoints (for legacy frontend compatibility)
@router.get("/htmx/list", response_class=HTMLResponse)
async def htmx_list_projects(
    request: Request,
    service: ProjectService = Depends(get_project_service),
):
    """HTMX endpoint for listing projects as HTML."""
    from fastapi.templating import Jinja2Templates
    from pathlib import Path

    templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

    projects = await service.list_projects()

    if not projects:
        return HTMLResponse(content="""
            <div class="col-span-full text-center py-12">
                <svg class="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <h3 class="text-xl font-medium text-gray-400 mb-2">No projects yet</h3>
                <p class="text-gray-500 mb-4">Add a project by cloning a repository</p>
                <button
                    onclick="document.getElementById('addProjectModal').showModal()"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                    Add Your First Project
                </button>
            </div>
        """)

    # Build HTML for all project cards
    html_parts = []
    for project in projects:
        html_parts.append(templates.TemplateResponse(
            "partials/_project_card.html",
            {"request": request, "project": project},
        ).body.decode())

    return HTMLResponse(content="".join(html_parts))


@router.post("/htmx/add", response_class=HTMLResponse)
async def htmx_add_project(
    request: Request,
    service: ProjectService = Depends(get_project_service),
):
    """HTMX endpoint for adding a project."""
    from fastapi.templating import Jinja2Templates
    from pathlib import Path

    templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

    form_data = await request.form()
    repo_url = form_data.get("repo_url", "")
    name = form_data.get("name")

    if not repo_url:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {
                "request": request,
                "message": "Repository URL is required",
                "type": "error",
            },
        )

    try:
        project = await service.create_project(
            repo_url=repo_url,
            name=name or None,
        )
        return templates.TemplateResponse(
            "partials/_project_card.html",
            {"request": request, "project": project},
            headers={"HX-Trigger": "projectAdded"},
        )
    except ProjectError as e:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": e.message, "type": "error"},
        )


@router.delete("/htmx/{project_id}", response_class=HTMLResponse)
async def htmx_delete_project(
    project_id: uuid.UUID,
    request: Request,
    service: ProjectService = Depends(get_project_service),
):
    """HTMX endpoint for deleting a project."""
    from fastapi.templating import Jinja2Templates
    from pathlib import Path

    templates = Jinja2Templates(directory=Path(__file__).parent.parent / "templates")

    success = await service.delete_project(project_id, delete_files=True)

    if success:
        return HTMLResponse(
            content="",
            headers={"HX-Trigger": "projectDeleted"},
        )
    else:
        return templates.TemplateResponse(
            "partials/_toast.html",
            {"request": request, "message": "Failed to delete project", "type": "error"},
        )
