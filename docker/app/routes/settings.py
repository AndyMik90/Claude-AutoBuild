"""Settings API routes."""

import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from config import get_settings, Settings
from models import SystemHealth
from services.build_runner import get_build_runner


router = APIRouter()


# App settings file path
SETTINGS_FILE = Path("/data/app_settings.json")


class NotificationSettings(BaseModel):
    """Notification settings model."""
    onTaskComplete: bool = True
    onTaskFailed: bool = True
    onReviewNeeded: bool = True
    sound: bool = False


class AppSettingsModel(BaseModel):
    """App settings model matching frontend expectations."""
    theme: str = "system"
    defaultModel: str = "opus"
    agentFramework: str = "auto-claude"
    pythonPath: Optional[str] = None
    autoBuildPath: Optional[str] = None
    autoUpdateAutoBuild: bool = True
    autoNameTerminals: bool = True
    onboardingCompleted: bool = False
    notifications: NotificationSettings = NotificationSettings()
    globalClaudeOAuthToken: Optional[str] = None
    globalOpenAIApiKey: Optional[str] = None
    selectedAgentProfile: str = "auto"
    changelogFormat: str = "keep-a-changelog"
    changelogAudience: str = "user-facing"
    changelogEmojiLevel: str = "none"


class AppSettingsUpdate(BaseModel):
    """Partial settings update model."""
    theme: Optional[str] = None
    defaultModel: Optional[str] = None
    agentFramework: Optional[str] = None
    pythonPath: Optional[str] = None
    autoBuildPath: Optional[str] = None
    autoUpdateAutoBuild: Optional[bool] = None
    autoNameTerminals: Optional[bool] = None
    onboardingCompleted: Optional[bool] = None
    notifications: Optional[dict] = None
    globalClaudeOAuthToken: Optional[str] = None
    globalOpenAIApiKey: Optional[str] = None
    selectedAgentProfile: Optional[str] = None
    changelogFormat: Optional[str] = None
    changelogAudience: Optional[str] = None
    changelogEmojiLevel: Optional[str] = None


def load_app_settings() -> dict:
    """Load app settings from file."""
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except json.JSONDecodeError:
            pass
    return AppSettingsModel().model_dump()


def save_app_settings(settings: dict) -> None:
    """Save app settings to file."""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(settings, indent=2))


@router.get("")
async def get_app_settings() -> dict:
    """Get app settings."""
    return load_app_settings()


@router.patch("")
async def update_app_settings(updates: AppSettingsUpdate) -> dict:
    """Update app settings."""
    current = load_app_settings()

    # Apply updates
    update_dict = updates.model_dump(exclude_none=True)
    for key, value in update_dict.items():
        if key == "notifications" and isinstance(value, dict):
            # Merge notification settings
            if "notifications" not in current:
                current["notifications"] = {}
            current["notifications"].update(value)
        else:
            current[key] = value

    save_app_settings(current)
    return current


@router.get("/version")
async def get_version() -> dict:
    """Get app version."""
    return {"version": "1.0.0"}


@router.get("/health", response_model=SystemHealth)
async def get_system_health(
    settings: Settings = Depends(get_settings),
) -> SystemHealth:
    """Get system health status.

    Performs actual health checks:
    - Verifies Auto-Claude CLI is accessible
    - Checks projects directory is writable
    - Validates Graphiti connectivity if enabled
    """
    import os
    import subprocess
    from services.project_service import ProjectService

    project_service = ProjectService(settings)
    projects = await project_service.list_projects()

    build_runner = get_build_runner(settings)
    active_builds = build_runner.get_all_active_builds()

    # Determine overall health status based on actual checks
    health_issues = []

    # Check if Auto-Claude path exists and is accessible
    if not settings.auto_claude_path.exists():
        health_issues.append("auto_claude_not_found")

    # Check if projects directory is writable
    if not os.access(settings.projects_dir, os.W_OK):
        health_issues.append("projects_dir_not_writable")

    # Check if data directory is writable
    if not os.access(settings.data_dir, os.W_OK):
        health_issues.append("data_dir_not_writable")

    # Check Graphiti connectivity
    graphiti_connected = False
    if settings.graphiti_enabled and settings.graphiti_mcp_url:
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{settings.graphiti_mcp_url.rstrip('/')}/health",
                    timeout=5.0,
                )
                graphiti_connected = response.status_code == 200
        except Exception:
            if settings.graphiti_enabled:
                health_issues.append("graphiti_unreachable")

    # Determine overall status
    if health_issues:
        status = "degraded"
    else:
        status = "healthy"

    return SystemHealth(
        status=status,
        claude_auth=settings.has_claude_auth,
        github_auth=bool(settings.github_token),
        graphiti_enabled=settings.graphiti_enabled,
        graphiti_connected=graphiti_connected,
        projects_count=len(projects),
        active_builds=len(active_builds),
    )


@router.get("/config")
async def get_config(
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get current configuration (sanitized)."""
    return {
        "projects_dir": str(settings.projects_dir),
        "data_dir": str(settings.data_dir),
        "auto_claude_path": str(settings.auto_claude_path),
        "default_branch": settings.default_branch,
        "graphiti_enabled": settings.graphiti_enabled,
        "auth_enabled": settings.auth_enabled,
        "has_claude_auth": settings.has_claude_auth,
        "has_github_token": bool(settings.github_token),
        "debug": settings.debug,
    }


@router.get("/active-builds")
async def get_active_builds(
    settings: Settings = Depends(get_settings),
) -> list[dict]:
    """Get all active builds."""
    build_runner = get_build_runner(settings)
    builds = build_runner.get_all_active_builds()
    return [
        {
            "id": b.id,
            "project_id": b.project_id,
            "spec_id": b.spec_id,
            "status": b.status,
            "started_at": b.started_at,
        }
        for b in builds
    ]


