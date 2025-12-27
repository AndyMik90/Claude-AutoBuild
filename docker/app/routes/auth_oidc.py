"""OIDC/SSO authentication routes.

Handles the OIDC authentication flow for enterprise SSO.
"""

import os
import urllib.parse
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.credential_service import get_credential_service
from services.oidc_service import OIDCService
from services.auth_service import get_auth_service

router = APIRouter()


class OIDCStatusResponse(BaseModel):
    """OIDC status for public display."""
    enabled: bool
    provider_name: str
    password_auth_enabled: bool


class OIDCCallbackResponse(BaseModel):
    """Response from OIDC callback."""
    success: bool
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    user: Optional[dict] = None
    error: Optional[str] = None


# In-memory state store (in production, use Redis or database)
# Maps state -> redirect_uri
_state_store: dict[str, str] = {}


@router.get("/status", response_model=OIDCStatusResponse)
async def get_oidc_status(
    db: AsyncSession = Depends(get_db),
):
    """
    Get OIDC status for the login page.

    Public endpoint - no authentication required.
    Returns whether OIDC is enabled and the provider name.
    """
    credential_service = get_credential_service()
    oidc_service = OIDCService(db, credential_service)

    config = await oidc_service.get_config()
    if not config:
        return OIDCStatusResponse(
            enabled=False,
            provider_name="SSO",
            password_auth_enabled=True,
        )

    is_configured = await oidc_service.is_configured()

    return OIDCStatusResponse(
        enabled=is_configured,
        provider_name=config.provider_name,
        password_auth_enabled=not config.disable_password_auth,
    )


@router.get("/authorize")
async def oidc_authorize(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redirect_uri: Optional[str] = Query(None),
):
    """
    Initiate OIDC authorization flow.

    Redirects the user to the OIDC provider's authorization endpoint.
    """
    credential_service = get_credential_service()
    oidc_service = OIDCService(db, credential_service)

    if not await oidc_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OIDC is not configured",
        )

    # Determine callback URL
    base_url = os.environ.get("BASE_URL", str(request.base_url).rstrip("/"))
    callback_url = f"{base_url}/api/auth/oidc/callback"

    # Generate and store state for CSRF protection
    state = oidc_service.generate_state()

    # Store the original redirect URI (where to send user after auth)
    final_redirect = redirect_uri or f"{base_url}/"
    _state_store[state] = final_redirect

    # Get authorization URL
    auth_url = await oidc_service.get_authorization_url(
        redirect_uri=callback_url,
        state=state,
    )

    if not auth_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to generate authorization URL",
        )

    return RedirectResponse(url=auth_url, status_code=302)


@router.get("/callback")
async def oidc_callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    error_description: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Handle OIDC callback from the provider.

    Exchanges the authorization code for tokens and creates/updates the user.
    Redirects to the frontend with tokens in URL fragment.
    """
    # Determine base URL for redirects
    base_url = os.environ.get("BASE_URL", str(request.base_url).rstrip("/"))

    # Handle errors from provider
    if error:
        error_msg = error_description or error
        return RedirectResponse(
            url=f"{base_url}/login?error={urllib.parse.quote(error_msg, safe='')}",
            status_code=302,
        )

    # Validate state
    if not state or state not in _state_store:
        return RedirectResponse(
            url=f"{base_url}/login?error={urllib.parse.quote('Invalid state parameter', safe='')}",
            status_code=302,
        )

    final_redirect = _state_store.pop(state)

    # Validate code
    if not code:
        return RedirectResponse(
            url=f"{base_url}/login?error={urllib.parse.quote('No authorization code', safe='')}",
            status_code=302,
        )

    credential_service = get_credential_service()
    oidc_service = OIDCService(db, credential_service)

    # Exchange code for tokens
    callback_url = f"{base_url}/api/auth/oidc/callback"
    token_response = await oidc_service.exchange_code(
        code=code,
        redirect_uri=callback_url,
    )

    if not token_response:
        return RedirectResponse(
            url=f"{base_url}/login?error={urllib.parse.quote('Token exchange failed', safe='')}",
            status_code=302,
        )

    # Get user info
    user_info = await oidc_service.get_user_info(token_response.access_token)
    if not user_info:
        return RedirectResponse(
            url=f"{base_url}/login?error={urllib.parse.quote('Failed to get user info', safe='')}",
            status_code=302,
        )

    # Provision or login user
    user = await oidc_service.provision_or_login_user(user_info)
    if not user:
        return RedirectResponse(
            url=f"{base_url}/login?error={urllib.parse.quote('User provisioning disabled or email required', safe='')}",
            status_code=302,
        )

    # Check if user is active
    if not user.is_active:
        return RedirectResponse(
            url=f"{base_url}/login?error={urllib.parse.quote('Account is disabled', safe='')}",
            status_code=302,
        )

    # Generate JWT tokens for our application
    auth_service = get_auth_service(db)
    tokens = await auth_service.create_user_tokens(
        user=user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )

    # Redirect to frontend with tokens
    # Using URL fragment to prevent tokens from being logged in server access logs
    redirect_url = f"{final_redirect}#access_token={tokens['access_token']}&refresh_token={tokens['refresh_token']}"
    return RedirectResponse(url=redirect_url, status_code=302)


@router.post("/callback", response_model=OIDCCallbackResponse)
async def oidc_callback_api(
    request: Request,
    code: str,
    redirect_uri: str,
    db: AsyncSession = Depends(get_db),
):
    """
    API endpoint for OIDC callback (for SPA flow).

    Alternative to the redirect-based callback for SPAs that handle the flow themselves.
    """
    credential_service = get_credential_service()
    oidc_service = OIDCService(db, credential_service)

    if not await oidc_service.is_configured():
        return OIDCCallbackResponse(
            success=False,
            error="OIDC is not configured",
        )

    # Exchange code for tokens
    token_response = await oidc_service.exchange_code(
        code=code,
        redirect_uri=redirect_uri,
    )

    if not token_response:
        return OIDCCallbackResponse(
            success=False,
            error="Token exchange failed",
        )

    # Get user info
    user_info = await oidc_service.get_user_info(token_response.access_token)
    if not user_info:
        return OIDCCallbackResponse(
            success=False,
            error="Failed to get user info",
        )

    # Provision or login user
    user = await oidc_service.provision_or_login_user(user_info)
    if not user:
        return OIDCCallbackResponse(
            success=False,
            error="User provisioning disabled or email required",
        )

    if not user.is_active:
        return OIDCCallbackResponse(
            success=False,
            error="Account is disabled",
        )

    # Generate JWT tokens
    auth_service = get_auth_service(db)
    tokens = await auth_service.create_user_tokens(
        user=user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )

    return OIDCCallbackResponse(
        success=True,
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user={
            "id": str(user.id),
            "email": user.email,
            "username": user.username,
            "role": user.role.value,
        },
    )
