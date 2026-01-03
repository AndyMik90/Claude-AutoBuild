"""System settings database model."""

from datetime import datetime, timezone
from typing import Any, Optional
import uuid

from sqlalchemy import (
    String,
    Boolean,
    DateTime,
    JSON,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from database import Base


class SystemSettings(Base):
    """Global system settings.

    Key-value store for system-wide configuration.
    Singleton pattern: only one row should exist.
    """

    __tablename__ = "system_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Setup status
    setup_completed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    setup_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        nullable=True,
    )

    # Registration settings
    registration_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,  # Only via invitation by default
        nullable=False,
    )
    require_email_verification: Mapped[bool] = mapped_column(
        Boolean,
        default=False,  # Not implemented yet
        nullable=False,
    )

    # Default invitation expiry (hours)
    invitation_expiry_hours: Mapped[int] = mapped_column(
        default=168,  # 7 days
        nullable=False,
    )

    # Default agent profile for new projects
    default_agent_profile: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    # System-wide Graphiti configuration
    graphiti_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    graphiti_config: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    # UI settings
    default_theme: Mapped[str] = mapped_column(
        String(20),
        default="system",
        nullable=False,
    )

    # ==========================================================================
    # SMTP Configuration for Email Delivery
    # ==========================================================================

    smtp_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    smtp_host: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    smtp_port: Mapped[int] = mapped_column(
        default=587,
        nullable=False,
    )
    smtp_username: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    smtp_password_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )  # Encrypted with Fernet
    smtp_use_tls: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )
    smtp_use_ssl: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    smtp_from_email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    smtp_from_name: Mapped[str] = mapped_column(
        String(255),
        default="Auto-Claude",
        nullable=False,
    )

    # Legacy JSON config (kept for backwards compatibility, prefer explicit fields)
    smtp_config: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    # ==========================================================================
    # OIDC/SSO Configuration for Enterprise Single Sign-On
    # ==========================================================================

    oidc_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    oidc_provider_name: Mapped[str] = mapped_column(
        String(100),
        default="SSO",
        nullable=False,
    )  # Display name for the SSO button
    oidc_discovery_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )  # .well-known/openid-configuration URL
    oidc_client_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    oidc_client_secret_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )  # Encrypted with Fernet
    oidc_scopes: Mapped[str] = mapped_column(
        String(255),
        default="openid email profile",
        nullable=False,
    )
    oidc_auto_provision: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )  # Create users on first login
    oidc_default_role: Mapped[str] = mapped_column(
        String(20),
        default="user",
        nullable=False,
    )  # Role for auto-provisioned users
    oidc_disable_password_auth: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )  # Force SSO-only authentication
    oidc_email_claim: Mapped[str] = mapped_column(
        String(100),
        default="email",
        nullable=False,
    )  # Claim name for email
    oidc_username_claim: Mapped[str] = mapped_column(
        String(100),
        default="preferred_username",
        nullable=False,
    )  # Claim name for username

    # Legacy JSON config (kept for backwards compatibility)
    oidc_config: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
    )

    # Maintenance mode
    maintenance_mode: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    maintenance_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # ==========================================================================
    # Global Credentials (Admin-set, applies to all users)
    # ==========================================================================

    # Encrypted global credentials (stored as encrypted strings via Fernet)
    global_claude_oauth_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    global_anthropic_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    global_openai_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    global_github_token_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    global_linear_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Flags to indicate if global credentials are set
    has_global_claude_oauth: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_global_anthropic_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_global_openai_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_global_github_token: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_global_linear_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # Admin control flags for credential hierarchy
    credentials_locked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )  # If true, users AND projects can't override global credentials

    allow_user_credentials: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )  # If false, only global/project credentials allowed (no user-level)

    # ==========================================================================
    # Additional Global API Keys (Encrypted)
    # ==========================================================================

    global_voyage_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    global_google_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    global_azure_openai_key_encrypted: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    has_global_voyage_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_global_google_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    has_global_azure_openai_key: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # ==========================================================================
    # Graphiti Global Configuration
    # ==========================================================================

    graphiti_llm_provider: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )  # openai, anthropic, azure_openai, ollama, google
    graphiti_embedder_provider: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )  # openai, voyage, azure_openai, ollama, google
    graphiti_model_name: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Default LLM model for Graphiti
    graphiti_embedding_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Default embedding model
    graphiti_anthropic_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Model when using Anthropic provider
    graphiti_database: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # FalkorDB database name
    voyage_embedding_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Model when using Voyage embeddings
    google_llm_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Model when using Google LLM
    google_embedding_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Model when using Google embeddings

    # ==========================================================================
    # Azure OpenAI Configuration
    # ==========================================================================

    azure_openai_base_url: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )  # Azure OpenAI endpoint URL
    azure_openai_llm_deployment: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Azure deployment name for LLM
    azure_openai_embedding_deployment: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Azure deployment name for embeddings

    # ==========================================================================
    # Ollama Configuration (Local/Offline)
    # ==========================================================================

    ollama_base_url: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )  # Ollama server URL
    ollama_llm_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Ollama LLM model
    ollama_embedding_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Ollama embedding model
    ollama_embedding_dim: Mapped[Optional[int]] = mapped_column(
        nullable=True,
    )  # Embedding dimensions for Ollama

    # ==========================================================================
    # Linear Integration Configuration
    # ==========================================================================

    linear_team_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Pre-configured Linear team ID
    linear_project_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Pre-configured Linear project ID

    # ==========================================================================
    # General Settings
    # ==========================================================================

    default_branch: Mapped[str] = mapped_column(
        String(100),
        default="main",
        nullable=False,
    )  # Default git branch for all projects
    debug_mode: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )  # Enable debug mode globally
    auto_build_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )  # Model override for Auto-Claude builds

    # ==========================================================================
    # Electron MCP Configuration
    # ==========================================================================

    electron_mcp_enabled: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )  # Enable Electron MCP integration
    electron_debug_port: Mapped[int] = mapped_column(
        default=9222,
        nullable=False,
    )  # Chrome DevTools debugging port

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<SystemSettings setup={self.setup_completed}>"
