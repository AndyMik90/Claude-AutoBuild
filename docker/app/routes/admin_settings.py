"""Admin settings API routes for global credentials and system configuration.

Admin-only routes for managing the global tier of the credential hierarchy
and SMTP configuration for email delivery.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from db.models import User
from db.models.settings import SystemSettings
from dependencies import require_admin
from services.user_credential_service import (
    GlobalCredentialService,
    UserCredentialError,
)
from services.credential_service import get_credential_service
from services.email_service import EmailService


router = APIRouter()


# Request/Response models

class GlobalCredentialStatusResponse(BaseModel):
    """Global credential status response."""
    has_global_claude_oauth: bool
    has_global_anthropic_key: bool
    has_global_openai_key: bool
    has_global_github_token: bool
    has_global_linear_key: bool
    has_global_voyage_key: bool
    has_global_google_key: bool
    has_global_azure_openai_key: bool
    credentials_locked: bool
    allow_user_credentials: bool


class UpdateGlobalCredentialsRequest(BaseModel):
    """Request to update global credentials.

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


class UpdateCredentialControlsRequest(BaseModel):
    """Request to update credential control flags."""
    credentials_locked: Optional[bool] = None
    allow_user_credentials: Optional[bool] = None


class MessageResponse(BaseModel):
    """Simple message response."""
    message: str
    success: bool = True


# Routes

@router.get("/credentials", response_model=GlobalCredentialStatusResponse)
async def get_global_credentials(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get global credential status and control flags (admin only).

    Returns which global credentials are set and the control settings.
    Does NOT return the credential values.
    """
    credential_service = get_credential_service()
    service = GlobalCredentialService(db, credential_service)

    status = await service.get_credentials_status()
    return GlobalCredentialStatusResponse(**status)


@router.put("/credentials", response_model=GlobalCredentialStatusResponse)
async def update_global_credentials(
    data: UpdateGlobalCredentialsRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update global credentials (admin only).

    These credentials are used by all users unless overridden.
    Pass empty string to clear a credential.
    """
    credential_service = get_credential_service()

    if not credential_service.is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Credential encryption not configured. Set CREDENTIAL_ENCRYPTION_KEY.",
        )

    service = GlobalCredentialService(db, credential_service)

    try:
        await service.update_credentials(
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
    updated_status = await service.get_credentials_status()
    return GlobalCredentialStatusResponse(**updated_status)


@router.put("/credentials/controls", response_model=GlobalCredentialStatusResponse)
async def update_credential_controls(
    data: UpdateCredentialControlsRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update credential control flags (admin only).

    - credentials_locked: If True, users AND projects cannot override global credentials.
      All builds will use ONLY the global credentials set by admin.

    - allow_user_credentials: If False, the user-level tier is disabled.
      Credentials flow directly from global to project level.
    """
    credential_service = get_credential_service()
    service = GlobalCredentialService(db, credential_service)

    await service.update_control_flags(
        credentials_locked=data.credentials_locked,
        allow_user_credentials=data.allow_user_credentials,
    )

    # Return updated status
    updated_status = await service.get_credentials_status()
    return GlobalCredentialStatusResponse(**updated_status)


@router.get("/credentials/info")
async def get_credential_hierarchy_info(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get information about the credential hierarchy system (admin only).

    Returns documentation about how the credential hierarchy works.
    """
    return {
        "title": "Credential Hierarchy System",
        "description": "Three-tier credential system with admin control",
        "hierarchy": [
            {
                "level": 1,
                "name": "Global",
                "description": "Admin-set credentials that apply to all users",
                "controlled_by": "Admin only",
                "can_be_overridden": "Depends on credentials_locked setting",
            },
            {
                "level": 2,
                "name": "User",
                "description": "User's default credentials for all their projects",
                "controlled_by": "Each user",
                "can_be_overridden": "By project-level credentials",
                "note": "Can be disabled with allow_user_credentials=false",
            },
            {
                "level": 3,
                "name": "Project",
                "description": "Project-specific credential overrides",
                "controlled_by": "Project owner",
                "can_be_overridden": "N/A (highest priority)",
            },
        ],
        "control_flags": {
            "credentials_locked": {
                "description": "When true, ONLY global credentials are used",
                "effect": "Users and projects cannot override any credentials",
                "use_case": "Enterprise environments where admin controls all API keys",
            },
            "allow_user_credentials": {
                "description": "When false, user-level tier is disabled",
                "effect": "Credentials flow directly from global to project",
                "use_case": "Simplified hierarchy without user defaults",
            },
        },
    }


# =============================================================================
# Global Settings Routes (Non-Credential Configuration)
# =============================================================================


class GlobalSettingsResponse(BaseModel):
    """Global system settings response."""
    # Graphiti configuration
    graphiti_enabled: bool
    graphiti_llm_provider: Optional[str]
    graphiti_embedder_provider: Optional[str]
    graphiti_model_name: Optional[str]
    graphiti_embedding_model: Optional[str]
    graphiti_anthropic_model: Optional[str]
    graphiti_database: Optional[str]
    voyage_embedding_model: Optional[str]
    google_llm_model: Optional[str]
    google_embedding_model: Optional[str]
    # Azure OpenAI configuration
    azure_openai_base_url: Optional[str]
    azure_openai_llm_deployment: Optional[str]
    azure_openai_embedding_deployment: Optional[str]
    # Ollama configuration
    ollama_base_url: Optional[str]
    ollama_llm_model: Optional[str]
    ollama_embedding_model: Optional[str]
    ollama_embedding_dim: Optional[int]
    # Linear configuration
    linear_team_id: Optional[str]
    linear_project_id: Optional[str]
    # General settings
    default_branch: str
    debug_mode: bool
    auto_build_model: Optional[str]
    # Electron MCP configuration
    electron_mcp_enabled: bool
    electron_debug_port: int


class UpdateGlobalSettingsRequest(BaseModel):
    """Request to update global settings.

    Pass empty string to clear a string setting, omit to leave unchanged.
    """
    # Graphiti configuration
    graphiti_enabled: Optional[bool] = None
    graphiti_llm_provider: Optional[str] = None
    graphiti_embedder_provider: Optional[str] = None
    graphiti_model_name: Optional[str] = None
    graphiti_embedding_model: Optional[str] = None
    graphiti_anthropic_model: Optional[str] = None
    graphiti_database: Optional[str] = None
    voyage_embedding_model: Optional[str] = None
    google_llm_model: Optional[str] = None
    google_embedding_model: Optional[str] = None
    # Azure OpenAI configuration
    azure_openai_base_url: Optional[str] = None
    azure_openai_llm_deployment: Optional[str] = None
    azure_openai_embedding_deployment: Optional[str] = None
    # Ollama configuration
    ollama_base_url: Optional[str] = None
    ollama_llm_model: Optional[str] = None
    ollama_embedding_model: Optional[str] = None
    ollama_embedding_dim: Optional[int] = None
    # Linear configuration
    linear_team_id: Optional[str] = None
    linear_project_id: Optional[str] = None
    # General settings
    default_branch: Optional[str] = None
    debug_mode: Optional[bool] = None
    auto_build_model: Optional[str] = None
    # Electron MCP configuration
    electron_mcp_enabled: Optional[bool] = None
    electron_debug_port: Optional[int] = None


@router.get("/settings", response_model=GlobalSettingsResponse)
async def get_global_settings(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get global system settings (admin only).

    Returns non-credential configuration settings.
    """
    credential_service = get_credential_service()
    service = GlobalCredentialService(db, credential_service)

    settings = await service.get_global_settings()
    return GlobalSettingsResponse(**settings)


@router.put("/settings", response_model=GlobalSettingsResponse)
async def update_global_settings(
    data: UpdateGlobalSettingsRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update global system settings (admin only).

    Updates non-credential configuration settings.
    Pass empty string to clear a string setting.
    """
    credential_service = get_credential_service()
    service = GlobalCredentialService(db, credential_service)

    await service.update_global_settings(
        graphiti_enabled=data.graphiti_enabled,
        graphiti_llm_provider=data.graphiti_llm_provider,
        graphiti_embedder_provider=data.graphiti_embedder_provider,
        graphiti_model_name=data.graphiti_model_name,
        graphiti_embedding_model=data.graphiti_embedding_model,
        graphiti_anthropic_model=data.graphiti_anthropic_model,
        graphiti_database=data.graphiti_database,
        voyage_embedding_model=data.voyage_embedding_model,
        google_llm_model=data.google_llm_model,
        google_embedding_model=data.google_embedding_model,
        azure_openai_base_url=data.azure_openai_base_url,
        azure_openai_llm_deployment=data.azure_openai_llm_deployment,
        azure_openai_embedding_deployment=data.azure_openai_embedding_deployment,
        ollama_base_url=data.ollama_base_url,
        ollama_llm_model=data.ollama_llm_model,
        ollama_embedding_model=data.ollama_embedding_model,
        ollama_embedding_dim=data.ollama_embedding_dim,
        linear_team_id=data.linear_team_id,
        linear_project_id=data.linear_project_id,
        default_branch=data.default_branch,
        debug_mode=data.debug_mode,
        auto_build_model=data.auto_build_model,
        electron_mcp_enabled=data.electron_mcp_enabled,
        electron_debug_port=data.electron_debug_port,
    )

    # Return updated settings
    updated_settings = await service.get_global_settings()
    return GlobalSettingsResponse(**updated_settings)


# =============================================================================
# SMTP Configuration Routes
# =============================================================================


class SMTPConfigResponse(BaseModel):
    """SMTP configuration status response."""
    enabled: bool
    host: Optional[str]
    port: int
    username: Optional[str]
    has_password: bool
    use_tls: bool
    use_ssl: bool
    from_email: Optional[str]
    from_name: str


class UpdateSMTPConfigRequest(BaseModel):
    """Request to update SMTP configuration."""
    enabled: Optional[bool] = None
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None  # Pass empty string to clear
    use_tls: Optional[bool] = None
    use_ssl: Optional[bool] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None


class TestEmailRequest(BaseModel):
    """Request to send a test email."""
    to_email: EmailStr


class SMTPTestResponse(BaseModel):
    """Response from SMTP test operations."""
    success: bool
    message: str
    error: Optional[str] = None


@router.get("/smtp", response_model=SMTPConfigResponse)
async def get_smtp_config(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get SMTP configuration (admin only).

    Returns current SMTP settings. Password is not returned.
    """
    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()

    if not settings:
        # Return defaults if no settings exist
        return SMTPConfigResponse(
            enabled=False,
            host=None,
            port=587,
            username=None,
            has_password=False,
            use_tls=True,
            use_ssl=False,
            from_email=None,
            from_name="Auto-Claude",
        )

    return SMTPConfigResponse(
        enabled=settings.smtp_enabled,
        host=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        has_password=settings.smtp_password_encrypted is not None,
        use_tls=settings.smtp_use_tls,
        use_ssl=settings.smtp_use_ssl,
        from_email=settings.smtp_from_email,
        from_name=settings.smtp_from_name,
    )


@router.put("/smtp", response_model=SMTPConfigResponse)
async def update_smtp_config(
    data: UpdateSMTPConfigRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update SMTP configuration (admin only).

    Pass empty string for password to clear it.
    """
    credential_service = get_credential_service()

    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()

    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System settings not found. Please complete setup first.",
        )

    # Update fields that were provided
    if data.enabled is not None:
        settings.smtp_enabled = data.enabled
    if data.host is not None:
        settings.smtp_host = data.host if data.host else None
    if data.port is not None:
        settings.smtp_port = data.port
    if data.username is not None:
        settings.smtp_username = data.username if data.username else None
    if data.password is not None:
        if data.password == "":
            settings.smtp_password_encrypted = None
        else:
            if credential_service.is_configured:
                settings.smtp_password_encrypted = credential_service.encrypt(data.password)
            else:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Credential encryption not configured. Set CREDENTIAL_ENCRYPTION_KEY.",
                )
    if data.use_tls is not None:
        settings.smtp_use_tls = data.use_tls
    if data.use_ssl is not None:
        settings.smtp_use_ssl = data.use_ssl
    if data.from_email is not None:
        settings.smtp_from_email = data.from_email if data.from_email else None
    if data.from_name is not None:
        settings.smtp_from_name = data.from_name if data.from_name else "Auto-Claude"

    await db.commit()

    return SMTPConfigResponse(
        enabled=settings.smtp_enabled,
        host=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_username,
        has_password=settings.smtp_password_encrypted is not None,
        use_tls=settings.smtp_use_tls,
        use_ssl=settings.smtp_use_ssl,
        from_email=settings.smtp_from_email,
        from_name=settings.smtp_from_name,
    )


@router.post("/smtp/test", response_model=SMTPTestResponse)
async def test_smtp_connection(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Test SMTP connection without sending an email (admin only).

    Validates the SMTP configuration by connecting to the server.
    """
    credential_service = get_credential_service()
    email_service = EmailService(db, credential_service)

    result = await email_service.test_connection()

    return SMTPTestResponse(
        success=result.success,
        message=result.message,
        error=result.error,
    )


@router.post("/smtp/test-email", response_model=SMTPTestResponse)
async def send_test_email(
    data: TestEmailRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Send a test email to verify SMTP configuration (admin only).

    Sends a test email to the specified address.
    """
    credential_service = get_credential_service()
    email_service = EmailService(db, credential_service)

    result = await email_service.send_test_email(data.to_email)

    return SMTPTestResponse(
        success=result.success,
        message=result.message,
        error=result.error,
    )


class SMTPStatusResponse(BaseModel):
    """Simple SMTP status for non-admin users."""
    configured: bool
    enabled: bool


@router.get("/smtp/status", response_model=SMTPStatusResponse)
async def get_smtp_status(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Check if SMTP is configured and enabled (admin only).

    Lightweight endpoint for checking if email can be sent.
    """
    credential_service = get_credential_service()
    email_service = EmailService(db, credential_service)

    is_configured = await email_service.is_configured()
    config = await email_service.get_smtp_config()

    return SMTPStatusResponse(
        configured=is_configured,
        enabled=config.enabled if config else False,
    )


# =============================================================================
# OIDC/SSO Configuration Routes
# =============================================================================


class OIDCConfigResponse(BaseModel):
    """OIDC configuration status response."""
    enabled: bool
    provider_name: str
    discovery_url: Optional[str]
    client_id: Optional[str]
    has_client_secret: bool
    scopes: str
    auto_provision: bool
    default_role: str
    disable_password_auth: bool
    email_claim: str
    username_claim: str


class UpdateOIDCConfigRequest(BaseModel):
    """Request to update OIDC configuration."""
    enabled: Optional[bool] = None
    provider_name: Optional[str] = None
    discovery_url: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None  # Pass empty string to clear
    scopes: Optional[str] = None
    auto_provision: Optional[bool] = None
    default_role: Optional[str] = None
    disable_password_auth: Optional[bool] = None
    email_claim: Optional[str] = None
    username_claim: Optional[str] = None


class OIDCTestResponse(BaseModel):
    """Response from OIDC test operations."""
    success: bool
    message: str
    error: Optional[str] = None
    data: Optional[dict] = None


@router.get("/oidc", response_model=OIDCConfigResponse)
async def get_oidc_config(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get OIDC configuration (admin only).

    Returns current OIDC settings. Client secret is not returned.
    """
    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()

    if not settings:
        # Return defaults if no settings exist
        return OIDCConfigResponse(
            enabled=False,
            provider_name="SSO",
            discovery_url=None,
            client_id=None,
            has_client_secret=False,
            scopes="openid email profile",
            auto_provision=True,
            default_role="user",
            disable_password_auth=False,
            email_claim="email",
            username_claim="preferred_username",
        )

    return OIDCConfigResponse(
        enabled=settings.oidc_enabled,
        provider_name=settings.oidc_provider_name,
        discovery_url=settings.oidc_discovery_url,
        client_id=settings.oidc_client_id,
        has_client_secret=settings.oidc_client_secret_encrypted is not None,
        scopes=settings.oidc_scopes,
        auto_provision=settings.oidc_auto_provision,
        default_role=settings.oidc_default_role,
        disable_password_auth=settings.oidc_disable_password_auth,
        email_claim=settings.oidc_email_claim,
        username_claim=settings.oidc_username_claim,
    )


@router.put("/oidc", response_model=OIDCConfigResponse)
async def update_oidc_config(
    data: UpdateOIDCConfigRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Update OIDC configuration (admin only).

    Pass empty string for client_secret to clear it.
    """
    credential_service = get_credential_service()

    result = await db.execute(select(SystemSettings).limit(1))
    settings = result.scalar_one_or_none()

    if not settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System settings not found. Please complete setup first.",
        )

    # Update fields that were provided
    if data.enabled is not None:
        settings.oidc_enabled = data.enabled
    if data.provider_name is not None:
        settings.oidc_provider_name = data.provider_name if data.provider_name else "SSO"
    if data.discovery_url is not None:
        settings.oidc_discovery_url = data.discovery_url if data.discovery_url else None
    if data.client_id is not None:
        settings.oidc_client_id = data.client_id if data.client_id else None
    if data.client_secret is not None:
        if data.client_secret == "":
            settings.oidc_client_secret_encrypted = None
        else:
            if credential_service.is_configured:
                settings.oidc_client_secret_encrypted = credential_service.encrypt(data.client_secret)
            else:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Credential encryption not configured. Set CREDENTIAL_ENCRYPTION_KEY.",
                )
    if data.scopes is not None:
        settings.oidc_scopes = data.scopes if data.scopes else "openid email profile"
    if data.auto_provision is not None:
        settings.oidc_auto_provision = data.auto_provision
    if data.default_role is not None:
        if data.default_role not in ("admin", "user"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role. Must be 'admin' or 'user'.",
            )
        settings.oidc_default_role = data.default_role
    if data.disable_password_auth is not None:
        settings.oidc_disable_password_auth = data.disable_password_auth
    if data.email_claim is not None:
        settings.oidc_email_claim = data.email_claim if data.email_claim else "email"
    if data.username_claim is not None:
        settings.oidc_username_claim = data.username_claim if data.username_claim else "preferred_username"

    await db.commit()

    return OIDCConfigResponse(
        enabled=settings.oidc_enabled,
        provider_name=settings.oidc_provider_name,
        discovery_url=settings.oidc_discovery_url,
        client_id=settings.oidc_client_id,
        has_client_secret=settings.oidc_client_secret_encrypted is not None,
        scopes=settings.oidc_scopes,
        auto_provision=settings.oidc_auto_provision,
        default_role=settings.oidc_default_role,
        disable_password_auth=settings.oidc_disable_password_auth,
        email_claim=settings.oidc_email_claim,
        username_claim=settings.oidc_username_claim,
    )


@router.post("/oidc/test", response_model=OIDCTestResponse)
async def test_oidc_discovery(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Test OIDC discovery endpoint (admin only).

    Validates the OIDC configuration by connecting to the discovery endpoint.
    """
    from services.oidc_service import OIDCService

    credential_service = get_credential_service()
    oidc_service = OIDCService(db, credential_service)

    result = await oidc_service.test_discovery()

    return OIDCTestResponse(
        success=result.success,
        message=result.message,
        error=result.error,
        data=result.data,
    )
