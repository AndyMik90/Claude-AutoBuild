"""User credentials API routes.

Allows users to manage their own credentials (middle tier of credential hierarchy).
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from db.models import User
from dependencies import get_current_user
from services.user_credential_service import (
    UserCredentialService,
    UserCredentialError,
    CredentialHierarchyService,
)
from services.credential_service import get_credential_service


router = APIRouter()


# Request/Response models

class CredentialStatusResponse(BaseModel):
    """Credential status response."""
    user_id: str
    has_claude_oauth: bool
    has_anthropic_key: bool
    has_openai_key: bool
    has_github_token: bool
    has_linear_key: bool
    has_voyage_key: bool
    has_google_key: bool
    has_azure_openai_key: bool
    # User default settings
    default_graphiti_llm_provider: Optional[str] = None
    default_graphiti_embedder_provider: Optional[str] = None
    default_branch: Optional[str] = None


class UpdateCredentialsRequest(BaseModel):
    """Request to update user credentials.

    Pass empty string to clear a credential, omit to leave unchanged.
    """
    claude_oauth_token: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    github_token: Optional[str] = None
    linear_api_key: Optional[str] = None
    voyage_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    azure_openai_api_key: Optional[str] = None


class UpdateUserSettingsRequest(BaseModel):
    """Request to update user default settings.

    Pass empty string to clear a setting, omit to leave unchanged.
    """
    default_graphiti_llm_provider: Optional[str] = None
    default_graphiti_embedder_provider: Optional[str] = None
    default_branch: Optional[str] = None


class CredentialHierarchyItem(BaseModel):
    """Single credential in hierarchy view."""
    key: str
    label: str
    global_set: Optional[bool] = None  # renamed from 'global' (reserved word)
    user_set: Optional[bool] = None    # renamed from 'user'
    project_set: Optional[bool] = None # renamed from 'project'
    effective_source: str
    is_set: bool


class CredentialHierarchyResponse(BaseModel):
    """Credential hierarchy status response."""
    credentials_locked: bool
    allow_user_credentials: bool
    credentials: list


# Routes

@router.get("", response_model=CredentialStatusResponse)
async def get_my_credentials(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get current user's credential status (what's set, not the values)."""
    credential_service = get_credential_service()
    service = UserCredentialService(db, credential_service)

    status = await service.get_credentials_status(user.id)
    return CredentialStatusResponse(**status)


@router.put("", response_model=CredentialStatusResponse)
async def update_my_credentials(
    data: UpdateCredentialsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update current user's credentials.

    Pass empty string to clear a credential.
    Omit a field to leave it unchanged.
    """
    credential_service = get_credential_service()

    if not credential_service.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Credential encryption not configured. Set CREDENTIAL_ENCRYPTION_KEY.",
        )

    service = UserCredentialService(db, credential_service)

    try:
        await service.update_credentials(
            user_id=user.id,
            claude_oauth_token=data.claude_oauth_token,
            anthropic_api_key=data.anthropic_api_key,
            openai_api_key=data.openai_api_key,
            github_token=data.github_token,
            linear_api_key=data.linear_api_key,
            voyage_api_key=data.voyage_api_key,
            google_api_key=data.google_api_key,
            azure_openai_api_key=data.azure_openai_api_key,
        )
    except UserCredentialError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=e.message,
        )

    # Return updated status
    updated_status = await service.get_credentials_status(user.id)
    return CredentialStatusResponse(**updated_status)


@router.get("/hierarchy")
async def get_credential_hierarchy(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get credential status showing the full hierarchy.

    Shows which credentials are set at global, user, and project levels,
    and which level is currently effective.
    """
    credential_service = get_credential_service()
    service = CredentialHierarchyService(db, credential_service)

    result = await service.get_credential_status_with_hierarchy(user.id)

    # Transform the result to match frontend expectations
    return {
        "credentials_locked": result["credentials_locked"],
        "allow_user_credentials": result["allow_user_credentials"],
        "credentials": [
            {
                "key": c["key"],
                "label": c["label"],
                "global_set": c["global"],
                "user_set": c["user"],
                "project_set": c["project"],
                "effective_source": c["effective_source"],
                "is_set": c["is_set"],
            }
            for c in result["credentials"]
        ],
    }


@router.put("/settings", response_model=CredentialStatusResponse)
async def update_my_settings(
    data: UpdateUserSettingsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update current user's default settings.

    Pass empty string to clear a setting.
    Omit a field to leave it unchanged.
    """
    credential_service = get_credential_service()
    service = UserCredentialService(db, credential_service)

    await service.update_user_settings(
        user_id=user.id,
        default_graphiti_llm_provider=data.default_graphiti_llm_provider,
        default_graphiti_embedder_provider=data.default_graphiti_embedder_provider,
        default_branch=data.default_branch,
    )

    # Return updated status
    updated_status = await service.get_credentials_status(user.id)
    return CredentialStatusResponse(**updated_status)
