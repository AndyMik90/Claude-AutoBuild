"""Debug routes for credential flow testing.

These endpoints are for development/testing only and should be disabled in production.
They help verify that the credential hierarchy (Global → User → Project) is working correctly.
"""

import os
import uuid
from typing import Dict, Any, Optional, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from db.models import User, UserRole
from dependencies import get_current_user, require_admin
from services.credential_service import get_credential_service
from services.user_credential_service import (
    CredentialHierarchyService,
    GlobalCredentialService,
    UserCredentialService,
)
from services.agent_profile_service import AgentProfileService

router = APIRouter()


# Check if debug mode is enabled
def is_debug_enabled() -> bool:
    """Check if debug endpoints are enabled."""
    return os.environ.get("DEBUG", "false").lower() == "true"


class CredentialSourceInfo(BaseModel):
    """Information about a single credential's source."""
    key: str
    label: str
    is_set: bool
    source: str  # "global", "user", "project", or "none"
    masked_preview: Optional[str] = None  # e.g., "sk-...abc123"


class CredentialFlowResponse(BaseModel):
    """Response showing credential flow for debugging."""
    debug_enabled: bool
    encryption_configured: bool
    credentials_locked: bool
    allow_user_credentials: bool
    credentials: List[CredentialSourceInfo]
    environment_fallback: Dict[str, bool]  # Which credentials come from docker-compose env


class ProjectCredentialFlowResponse(BaseModel):
    """Response showing credential flow for a specific project."""
    project_id: str
    project_name: str
    debug_enabled: bool
    encryption_configured: bool
    credentials_locked: bool
    allow_user_credentials: bool
    credentials: List[CredentialSourceInfo]
    build_env_preview: Dict[str, str]  # Masked env vars that would be passed to build


def mask_credential(value: Optional[str]) -> Optional[str]:
    """Mask a credential value for safe display."""
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


@router.get("/status")
async def debug_status():
    """Check if debug mode is enabled."""
    return {
        "debug_enabled": is_debug_enabled(),
        "message": "Debug endpoints are " + ("enabled" if is_debug_enabled() else "disabled"),
    }


@router.get("/credentials/hierarchy", response_model=CredentialFlowResponse)
async def get_credential_hierarchy(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the credential hierarchy for the current user.

    Shows which credentials are set at each level (global, user, project)
    and which source would be used for builds.

    Requires DEBUG=true environment variable.
    """
    if not is_debug_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debug endpoints are disabled. Set DEBUG=true to enable.",
        )

    credential_service = get_credential_service()
    hierarchy_service = CredentialHierarchyService(db, credential_service)
    global_service = GlobalCredentialService(db, credential_service)

    # Get global settings
    settings = await global_service.get_settings()

    # Get hierarchy status
    hierarchy_status = await hierarchy_service.get_credential_status_with_hierarchy(
        user_id=current_user.id,
    )

    # Build credential info list
    credentials = []
    for cred in hierarchy_status["credentials"]:
        credentials.append(CredentialSourceInfo(
            key=cred["key"],
            label=cred["label"],
            is_set=cred["is_set"],
            source=cred["effective_source"],
            masked_preview=None,  # We don't expose values even masked in hierarchy view
        ))

    # Check environment fallback (from docker-compose)
    env_fallback = {
        "claude_oauth": bool(os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")),
        "anthropic_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "openai_key": bool(os.environ.get("OPENAI_API_KEY")),
        "github_token": bool(os.environ.get("GITHUB_TOKEN")),
        "linear_key": bool(os.environ.get("LINEAR_API_KEY")),
    }

    return CredentialFlowResponse(
        debug_enabled=True,
        encryption_configured=credential_service.is_configured,
        credentials_locked=settings.credentials_locked,
        allow_user_credentials=settings.allow_user_credentials,
        credentials=credentials,
        environment_fallback=env_fallback,
    )


@router.get("/credentials/project/{project_id}", response_model=ProjectCredentialFlowResponse)
async def get_project_credential_flow(
    project_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the effective credentials for a specific project.

    Shows the resolved credentials after applying the hierarchy:
    Global → User → Project

    Also shows a preview of the environment variables that would be
    passed to a build subprocess (with values masked).

    Requires DEBUG=true environment variable.
    """
    if not is_debug_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debug endpoints are disabled. Set DEBUG=true to enable.",
        )

    credential_service = get_credential_service()
    agent_service = AgentProfileService(db, current_user, credential_service)
    global_service = GlobalCredentialService(db, credential_service)
    hierarchy_service = CredentialHierarchyService(db, credential_service)

    # Get project profile
    profile = await agent_service.get_profile(project_id)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found or not owned by current user",
        )

    # Get the project
    project = await agent_service._get_project(project_id)

    # Get global settings
    settings = await global_service.get_settings()

    # Get project credentials status
    project_creds = await agent_service.get_credentials(project_id)
    project_status = None
    if project_creds:
        project_status = {
            "has_claude_oauth": project_creds.has_claude_oauth,
            "has_anthropic_key": project_creds.has_anthropic_key,
            "has_openai_key": project_creds.has_openai_key,
            "has_github_token": project_creds.has_github_token,
            "has_linear_key": project_creds.has_linear_key,
        }

    # Get hierarchy status for this project
    hierarchy_status = await hierarchy_service.get_credential_status_with_hierarchy(
        user_id=current_user.id,
        project_id=project_id,
        project_status=project_status,
    )

    # Get effective credentials (decrypted)
    effective_creds = await agent_service.get_effective_credentials(project_id)

    # Build credential info list with masked values
    credentials = []
    cred_key_map = {
        "claude_oauth": "claude_oauth_token",
        "anthropic_key": "anthropic_api_key",
        "openai_key": "openai_api_key",
        "github_token": "github_token",
        "linear_key": "linear_api_key",
    }

    for cred in hierarchy_status["credentials"]:
        full_key = cred_key_map.get(cred["key"], cred["key"])
        value = effective_creds.get(full_key)

        credentials.append(CredentialSourceInfo(
            key=cred["key"],
            label=cred["label"],
            is_set=cred["is_set"],
            source=cred["effective_source"],
            masked_preview=mask_credential(value) if value else None,
        ))

    # Generate build env preview (masked)
    build_env = agent_service.get_build_env(profile, effective_creds)
    masked_build_env = {}
    sensitive_keys = [
        "CLAUDE_CODE_OAUTH_TOKEN",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GITHUB_TOKEN",
        "LINEAR_API_KEY",
    ]

    for key, value in build_env.items():
        if key in sensitive_keys:
            masked_build_env[key] = mask_credential(value) or "(not set)"
        else:
            masked_build_env[key] = value

    return ProjectCredentialFlowResponse(
        project_id=str(project_id),
        project_name=project.name,
        debug_enabled=True,
        encryption_configured=credential_service.is_configured,
        credentials_locked=settings.credentials_locked,
        allow_user_credentials=settings.allow_user_credentials,
        credentials=credentials,
        build_env_preview=masked_build_env,
    )


@router.get("/credentials/test-flow")
async def test_credential_flow(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Admin-only endpoint to test the full credential flow.

    Creates test data to verify the hierarchy works correctly.
    This is a read-only verification that doesn't modify any data.

    Requires DEBUG=true and admin access.
    """
    if not is_debug_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debug endpoints are disabled. Set DEBUG=true to enable.",
        )

    credential_service = get_credential_service()

    results = {
        "encryption_configured": credential_service.is_configured,
        "tests": [],
    }

    # Test 1: Check encryption service
    test_encryption = {
        "name": "Encryption Service",
        "passed": False,
        "message": "",
    }

    if credential_service.is_configured:
        try:
            test_value = "test-credential-value"
            encrypted = credential_service.encrypt(test_value)
            decrypted = credential_service.decrypt(encrypted)
            test_encryption["passed"] = decrypted == test_value
            test_encryption["message"] = "Encryption/decryption working correctly"
        except Exception as e:
            test_encryption["message"] = f"Encryption test failed: {str(e)}"
    else:
        test_encryption["message"] = "CREDENTIAL_ENCRYPTION_KEY not configured"

    results["tests"].append(test_encryption)

    # Test 2: Check global credentials service
    test_global = {
        "name": "Global Credentials Service",
        "passed": False,
        "message": "",
    }

    try:
        global_service = GlobalCredentialService(db, credential_service)
        status = await global_service.get_credentials_status()
        test_global["passed"] = True
        test_global["message"] = f"Global service working. Credentials locked: {status['credentials_locked']}"
        test_global["data"] = {
            "has_any_global": any([
                status["has_global_claude_oauth"],
                status["has_global_anthropic_key"],
                status["has_global_openai_key"],
                status["has_global_github_token"],
                status["has_global_linear_key"],
            ]),
            "locked": status["credentials_locked"],
            "allow_user": status["allow_user_credentials"],
        }
    except Exception as e:
        test_global["message"] = f"Global service test failed: {str(e)}"

    results["tests"].append(test_global)

    # Test 3: Check user credentials service
    test_user = {
        "name": "User Credentials Service",
        "passed": False,
        "message": "",
    }

    try:
        user_service = UserCredentialService(db, credential_service)
        status = await user_service.get_credentials_status(current_user.id)
        test_user["passed"] = True
        test_user["message"] = "User credentials service working"
        test_user["data"] = {
            "has_any_user": any([
                status["has_claude_oauth"],
                status["has_anthropic_key"],
                status["has_openai_key"],
                status["has_github_token"],
                status["has_linear_key"],
            ]),
        }
    except Exception as e:
        test_user["message"] = f"User service test failed: {str(e)}"

    results["tests"].append(test_user)

    # Test 4: Check hierarchy resolution
    test_hierarchy = {
        "name": "Credential Hierarchy Resolution",
        "passed": False,
        "message": "",
    }

    try:
        hierarchy_service = CredentialHierarchyService(db, credential_service)
        effective = await hierarchy_service.get_effective_credentials(
            user_id=current_user.id,
        )
        test_hierarchy["passed"] = True
        test_hierarchy["message"] = "Hierarchy resolution working"
        test_hierarchy["data"] = {
            "sources": effective["sources"],
            "locked": effective.get("locked", False),
        }
    except Exception as e:
        test_hierarchy["message"] = f"Hierarchy test failed: {str(e)}"

    results["tests"].append(test_hierarchy)

    # Overall result
    results["all_passed"] = all(t["passed"] for t in results["tests"])

    return results
