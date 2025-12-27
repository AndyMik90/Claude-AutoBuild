"""User credential service for managing user-level credentials.

Provides CRUD operations for the middle tier of the credential hierarchy:
Global (SystemSettings) → User (UserCredentials) → Project (ProjectCredentials)
"""

import uuid
from datetime import datetime
from typing import Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import User, UserCredentials, SystemSettings
from services.credential_service import CredentialService, CredentialEncryptionError


class UserCredentialError(Exception):
    """Exception for user credential errors."""

    def __init__(self, message: str, code: str = "user_credential_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class UserCredentialService:
    """Service for managing user-level credentials.

    Handles user-specific API keys that apply to all of a user's projects
    unless overridden at the project level.
    """

    def __init__(
        self,
        db: AsyncSession,
        credential_service: Optional[CredentialService] = None,
    ):
        self.db = db
        self.credential_service = credential_service or CredentialService()

    async def get_or_create_credentials(
        self,
        user_id: uuid.UUID,
    ) -> UserCredentials:
        """Get or create credentials record for a user.

        Args:
            user_id: UUID of the user.

        Returns:
            UserCredentials record.
        """
        result = await self.db.execute(
            select(UserCredentials).where(UserCredentials.user_id == user_id)
        )
        credentials = result.scalar_one_or_none()

        if not credentials:
            credentials = UserCredentials(user_id=user_id)
            self.db.add(credentials)
            await self.db.commit()
            await self.db.refresh(credentials)

        return credentials

    async def get_credentials(
        self,
        user_id: uuid.UUID,
    ) -> Optional[UserCredentials]:
        """Get credentials record for a user (without decryption).

        Args:
            user_id: UUID of the user.

        Returns:
            UserCredentials or None.
        """
        result = await self.db.execute(
            select(UserCredentials).where(UserCredentials.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_credentials_status(
        self,
        user_id: uuid.UUID,
    ) -> Dict[str, Any]:
        """Get credential status flags for a user.

        Returns whether each credential is set, without exposing values.

        Args:
            user_id: UUID of the user.

        Returns:
            Dictionary with status flags.
        """
        credentials = await self.get_or_create_credentials(user_id)

        return {
            "user_id": str(user_id),
            "has_claude_oauth": credentials.has_claude_oauth,
            "has_anthropic_key": credentials.has_anthropic_key,
            "has_openai_key": credentials.has_openai_key,
            "has_github_token": credentials.has_github_token,
            "has_linear_key": credentials.has_linear_key,
            "has_voyage_key": credentials.has_voyage_key,
            "has_google_key": credentials.has_google_key,
            "has_azure_openai_key": credentials.has_azure_openai_key,
            # User default settings
            "default_graphiti_llm_provider": credentials.default_graphiti_llm_provider,
            "default_graphiti_embedder_provider": credentials.default_graphiti_embedder_provider,
            "default_branch": credentials.default_branch,
        }

    async def get_decrypted_credentials(
        self,
        user_id: uuid.UUID,
    ) -> Optional[Dict[str, Optional[str]]]:
        """Get decrypted credentials for a user.

        Args:
            user_id: UUID of the user.

        Returns:
            Dictionary with decrypted credential values, or None if not found.

        Raises:
            UserCredentialError: If decryption fails.
        """
        credentials = await self.get_credentials(user_id)
        if not credentials:
            return None

        if not self.credential_service.is_configured:
            raise UserCredentialError(
                "Credential encryption not configured",
                "no_encryption_key",
            )

        try:
            return {
                "claude_oauth_token": self.credential_service.decrypt_or_none(
                    credentials.claude_oauth_token_encrypted
                ),
                "anthropic_api_key": self.credential_service.decrypt_or_none(
                    credentials.anthropic_api_key_encrypted
                ),
                "openai_api_key": self.credential_service.decrypt_or_none(
                    credentials.openai_api_key_encrypted
                ),
                "github_token": self.credential_service.decrypt_or_none(
                    credentials.github_token_encrypted
                ),
                "linear_api_key": self.credential_service.decrypt_or_none(
                    credentials.linear_api_key_encrypted
                ),
                "voyage_api_key": self.credential_service.decrypt_or_none(
                    credentials.voyage_key_encrypted
                ),
                "google_api_key": self.credential_service.decrypt_or_none(
                    credentials.google_key_encrypted
                ),
                "azure_openai_api_key": self.credential_service.decrypt_or_none(
                    credentials.azure_openai_key_encrypted
                ),
            }
        except CredentialEncryptionError as e:
            raise UserCredentialError(e.message, e.code)

    async def update_credentials(
        self,
        user_id: uuid.UUID,
        claude_oauth_token: Optional[str] = None,
        anthropic_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        github_token: Optional[str] = None,
        linear_api_key: Optional[str] = None,
        voyage_api_key: Optional[str] = None,
        google_api_key: Optional[str] = None,
        azure_openai_api_key: Optional[str] = None,
    ) -> UserCredentials:
        """Update encrypted credentials for a user.

        Pass empty string to clear a credential, None to leave unchanged.

        Args:
            user_id: UUID of the user.
            claude_oauth_token: Claude OAuth token.
            anthropic_api_key: Anthropic API key.
            openai_api_key: OpenAI API key.
            github_token: GitHub token.
            linear_api_key: Linear API key.
            voyage_api_key: Voyage API key.
            google_api_key: Google API key.
            azure_openai_api_key: Azure OpenAI API key.

        Returns:
            Updated credentials.

        Raises:
            UserCredentialError: If encryption fails.
        """
        credentials = await self.get_or_create_credentials(user_id)

        if not self.credential_service.is_configured:
            raise UserCredentialError(
                "Credential encryption not configured",
                "no_encryption_key",
            )

        try:
            # Update each credential if provided
            if claude_oauth_token is not None:
                if claude_oauth_token == "":
                    credentials.claude_oauth_token_encrypted = None
                    credentials.has_claude_oauth = False
                else:
                    credentials.claude_oauth_token_encrypted = (
                        self.credential_service.encrypt(claude_oauth_token)
                    )
                    credentials.has_claude_oauth = True

            if anthropic_api_key is not None:
                if anthropic_api_key == "":
                    credentials.anthropic_api_key_encrypted = None
                    credentials.has_anthropic_key = False
                else:
                    credentials.anthropic_api_key_encrypted = (
                        self.credential_service.encrypt(anthropic_api_key)
                    )
                    credentials.has_anthropic_key = True

            if openai_api_key is not None:
                if openai_api_key == "":
                    credentials.openai_api_key_encrypted = None
                    credentials.has_openai_key = False
                else:
                    credentials.openai_api_key_encrypted = (
                        self.credential_service.encrypt(openai_api_key)
                    )
                    credentials.has_openai_key = True

            if github_token is not None:
                if github_token == "":
                    credentials.github_token_encrypted = None
                    credentials.has_github_token = False
                else:
                    credentials.github_token_encrypted = (
                        self.credential_service.encrypt(github_token)
                    )
                    credentials.has_github_token = True

            if linear_api_key is not None:
                if linear_api_key == "":
                    credentials.linear_api_key_encrypted = None
                    credentials.has_linear_key = False
                else:
                    credentials.linear_api_key_encrypted = (
                        self.credential_service.encrypt(linear_api_key)
                    )
                    credentials.has_linear_key = True

            if voyage_api_key is not None:
                if voyage_api_key == "":
                    credentials.voyage_key_encrypted = None
                    credentials.has_voyage_key = False
                else:
                    credentials.voyage_key_encrypted = (
                        self.credential_service.encrypt(voyage_api_key)
                    )
                    credentials.has_voyage_key = True

            if google_api_key is not None:
                if google_api_key == "":
                    credentials.google_key_encrypted = None
                    credentials.has_google_key = False
                else:
                    credentials.google_key_encrypted = (
                        self.credential_service.encrypt(google_api_key)
                    )
                    credentials.has_google_key = True

            if azure_openai_api_key is not None:
                if azure_openai_api_key == "":
                    credentials.azure_openai_key_encrypted = None
                    credentials.has_azure_openai_key = False
                else:
                    credentials.azure_openai_key_encrypted = (
                        self.credential_service.encrypt(azure_openai_api_key)
                    )
                    credentials.has_azure_openai_key = True

        except CredentialEncryptionError as e:
            raise UserCredentialError(e.message, e.code)

        credentials.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(credentials)

        return credentials

    async def update_user_settings(
        self,
        user_id: uuid.UUID,
        default_graphiti_llm_provider: Optional[str] = None,
        default_graphiti_embedder_provider: Optional[str] = None,
        default_branch: Optional[str] = None,
    ) -> UserCredentials:
        """Update user default settings (non-secret).

        Args:
            user_id: UUID of the user.
            default_graphiti_llm_provider: Default Graphiti LLM provider.
            default_graphiti_embedder_provider: Default Graphiti embedder provider.
            default_branch: Default git branch.

        Returns:
            Updated credentials.
        """
        credentials = await self.get_or_create_credentials(user_id)

        if default_graphiti_llm_provider is not None:
            credentials.default_graphiti_llm_provider = (
                default_graphiti_llm_provider if default_graphiti_llm_provider else None
            )

        if default_graphiti_embedder_provider is not None:
            credentials.default_graphiti_embedder_provider = (
                default_graphiti_embedder_provider if default_graphiti_embedder_provider else None
            )

        if default_branch is not None:
            credentials.default_branch = default_branch if default_branch else None

        credentials.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(credentials)

        return credentials


class GlobalCredentialService:
    """Service for managing global (admin-set) credentials in SystemSettings.

    These credentials apply to all users and can be locked to prevent overrides.
    """

    def __init__(
        self,
        db: AsyncSession,
        credential_service: Optional[CredentialService] = None,
    ):
        self.db = db
        self.credential_service = credential_service or CredentialService()

    async def get_settings(self) -> SystemSettings:
        """Get or create system settings."""
        result = await self.db.execute(select(SystemSettings))
        settings = result.scalar_one_or_none()

        if not settings:
            settings = SystemSettings()
            self.db.add(settings)
            await self.db.commit()
            await self.db.refresh(settings)

        return settings

    async def get_credentials_status(self) -> Dict[str, Any]:
        """Get global credential status and control flags.

        Returns:
            Dictionary with status flags and control settings.
        """
        settings = await self.get_settings()

        return {
            "has_global_claude_oauth": settings.has_global_claude_oauth,
            "has_global_anthropic_key": settings.has_global_anthropic_key,
            "has_global_openai_key": settings.has_global_openai_key,
            "has_global_github_token": settings.has_global_github_token,
            "has_global_linear_key": settings.has_global_linear_key,
            "has_global_voyage_key": settings.has_global_voyage_key,
            "has_global_google_key": settings.has_global_google_key,
            "has_global_azure_openai_key": settings.has_global_azure_openai_key,
            "credentials_locked": settings.credentials_locked,
            "allow_user_credentials": settings.allow_user_credentials,
        }

    async def get_decrypted_credentials(self) -> Dict[str, Optional[str]]:
        """Get decrypted global credentials.

        Returns:
            Dictionary with decrypted credential values.

        Raises:
            UserCredentialError: If decryption fails.
        """
        settings = await self.get_settings()

        if not self.credential_service.is_configured:
            raise UserCredentialError(
                "Credential encryption not configured",
                "no_encryption_key",
            )

        try:
            return {
                "claude_oauth_token": self.credential_service.decrypt_or_none(
                    settings.global_claude_oauth_encrypted
                ),
                "anthropic_api_key": self.credential_service.decrypt_or_none(
                    settings.global_anthropic_key_encrypted
                ),
                "openai_api_key": self.credential_service.decrypt_or_none(
                    settings.global_openai_key_encrypted
                ),
                "github_token": self.credential_service.decrypt_or_none(
                    settings.global_github_token_encrypted
                ),
                "linear_api_key": self.credential_service.decrypt_or_none(
                    settings.global_linear_key_encrypted
                ),
                "voyage_api_key": self.credential_service.decrypt_or_none(
                    settings.global_voyage_key_encrypted
                ),
                "google_api_key": self.credential_service.decrypt_or_none(
                    settings.global_google_key_encrypted
                ),
                "azure_openai_api_key": self.credential_service.decrypt_or_none(
                    settings.global_azure_openai_key_encrypted
                ),
            }
        except CredentialEncryptionError as e:
            raise UserCredentialError(e.message, e.code)

    async def update_credentials(
        self,
        claude_oauth_token: Optional[str] = None,
        anthropic_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        github_token: Optional[str] = None,
        linear_api_key: Optional[str] = None,
        voyage_api_key: Optional[str] = None,
        google_api_key: Optional[str] = None,
        azure_openai_api_key: Optional[str] = None,
    ) -> SystemSettings:
        """Update global credentials.

        Pass empty string to clear a credential, None to leave unchanged.

        Returns:
            Updated settings.

        Raises:
            UserCredentialError: If encryption fails.
        """
        settings = await self.get_settings()

        if not self.credential_service.is_configured:
            raise UserCredentialError(
                "Credential encryption not configured",
                "no_encryption_key",
            )

        try:
            if claude_oauth_token is not None:
                if claude_oauth_token == "":
                    settings.global_claude_oauth_encrypted = None
                    settings.has_global_claude_oauth = False
                else:
                    settings.global_claude_oauth_encrypted = (
                        self.credential_service.encrypt(claude_oauth_token)
                    )
                    settings.has_global_claude_oauth = True

            if anthropic_api_key is not None:
                if anthropic_api_key == "":
                    settings.global_anthropic_key_encrypted = None
                    settings.has_global_anthropic_key = False
                else:
                    settings.global_anthropic_key_encrypted = (
                        self.credential_service.encrypt(anthropic_api_key)
                    )
                    settings.has_global_anthropic_key = True

            if openai_api_key is not None:
                if openai_api_key == "":
                    settings.global_openai_key_encrypted = None
                    settings.has_global_openai_key = False
                else:
                    settings.global_openai_key_encrypted = (
                        self.credential_service.encrypt(openai_api_key)
                    )
                    settings.has_global_openai_key = True

            if github_token is not None:
                if github_token == "":
                    settings.global_github_token_encrypted = None
                    settings.has_global_github_token = False
                else:
                    settings.global_github_token_encrypted = (
                        self.credential_service.encrypt(github_token)
                    )
                    settings.has_global_github_token = True

            if linear_api_key is not None:
                if linear_api_key == "":
                    settings.global_linear_key_encrypted = None
                    settings.has_global_linear_key = False
                else:
                    settings.global_linear_key_encrypted = (
                        self.credential_service.encrypt(linear_api_key)
                    )
                    settings.has_global_linear_key = True

            if voyage_api_key is not None:
                if voyage_api_key == "":
                    settings.global_voyage_key_encrypted = None
                    settings.has_global_voyage_key = False
                else:
                    settings.global_voyage_key_encrypted = (
                        self.credential_service.encrypt(voyage_api_key)
                    )
                    settings.has_global_voyage_key = True

            if google_api_key is not None:
                if google_api_key == "":
                    settings.global_google_key_encrypted = None
                    settings.has_global_google_key = False
                else:
                    settings.global_google_key_encrypted = (
                        self.credential_service.encrypt(google_api_key)
                    )
                    settings.has_global_google_key = True

            if azure_openai_api_key is not None:
                if azure_openai_api_key == "":
                    settings.global_azure_openai_key_encrypted = None
                    settings.has_global_azure_openai_key = False
                else:
                    settings.global_azure_openai_key_encrypted = (
                        self.credential_service.encrypt(azure_openai_api_key)
                    )
                    settings.has_global_azure_openai_key = True

        except CredentialEncryptionError as e:
            raise UserCredentialError(e.message, e.code)

        settings.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(settings)

        return settings

    async def get_global_settings(self) -> Dict[str, Any]:
        """Get global system settings (non-credential).

        Returns:
            Dictionary with global configuration settings.
        """
        settings = await self.get_settings()

        return {
            # Graphiti configuration
            "graphiti_enabled": settings.graphiti_enabled,
            "graphiti_llm_provider": settings.graphiti_llm_provider,
            "graphiti_embedder_provider": settings.graphiti_embedder_provider,
            "graphiti_model_name": settings.graphiti_model_name,
            "graphiti_embedding_model": settings.graphiti_embedding_model,
            "graphiti_anthropic_model": settings.graphiti_anthropic_model,
            "graphiti_database": settings.graphiti_database,
            "voyage_embedding_model": settings.voyage_embedding_model,
            "google_llm_model": settings.google_llm_model,
            "google_embedding_model": settings.google_embedding_model,
            # Azure OpenAI configuration
            "azure_openai_base_url": settings.azure_openai_base_url,
            "azure_openai_llm_deployment": settings.azure_openai_llm_deployment,
            "azure_openai_embedding_deployment": settings.azure_openai_embedding_deployment,
            # Ollama configuration
            "ollama_base_url": settings.ollama_base_url,
            "ollama_llm_model": settings.ollama_llm_model,
            "ollama_embedding_model": settings.ollama_embedding_model,
            "ollama_embedding_dim": settings.ollama_embedding_dim,
            # Linear configuration
            "linear_team_id": settings.linear_team_id,
            "linear_project_id": settings.linear_project_id,
            # General settings
            "default_branch": settings.default_branch,
            "debug_mode": settings.debug_mode,
            "auto_build_model": settings.auto_build_model,
            # Electron MCP configuration
            "electron_mcp_enabled": settings.electron_mcp_enabled,
            "electron_debug_port": settings.electron_debug_port,
        }

    async def update_global_settings(
        self,
        graphiti_enabled: Optional[bool] = None,
        graphiti_llm_provider: Optional[str] = None,
        graphiti_embedder_provider: Optional[str] = None,
        graphiti_model_name: Optional[str] = None,
        graphiti_embedding_model: Optional[str] = None,
        graphiti_anthropic_model: Optional[str] = None,
        graphiti_database: Optional[str] = None,
        voyage_embedding_model: Optional[str] = None,
        google_llm_model: Optional[str] = None,
        google_embedding_model: Optional[str] = None,
        azure_openai_base_url: Optional[str] = None,
        azure_openai_llm_deployment: Optional[str] = None,
        azure_openai_embedding_deployment: Optional[str] = None,
        ollama_base_url: Optional[str] = None,
        ollama_llm_model: Optional[str] = None,
        ollama_embedding_model: Optional[str] = None,
        ollama_embedding_dim: Optional[int] = None,
        linear_team_id: Optional[str] = None,
        linear_project_id: Optional[str] = None,
        default_branch: Optional[str] = None,
        debug_mode: Optional[bool] = None,
        auto_build_model: Optional[str] = None,
        electron_mcp_enabled: Optional[bool] = None,
        electron_debug_port: Optional[int] = None,
    ) -> SystemSettings:
        """Update global system settings (non-credential).

        Pass empty string to clear a string setting, None to leave unchanged.

        Returns:
            Updated settings.
        """
        settings = await self.get_settings()

        # Graphiti configuration
        if graphiti_enabled is not None:
            settings.graphiti_enabled = graphiti_enabled
        if graphiti_llm_provider is not None:
            settings.graphiti_llm_provider = graphiti_llm_provider if graphiti_llm_provider else None
        if graphiti_embedder_provider is not None:
            settings.graphiti_embedder_provider = graphiti_embedder_provider if graphiti_embedder_provider else None
        if graphiti_model_name is not None:
            settings.graphiti_model_name = graphiti_model_name if graphiti_model_name else None
        if graphiti_embedding_model is not None:
            settings.graphiti_embedding_model = graphiti_embedding_model if graphiti_embedding_model else None
        if graphiti_anthropic_model is not None:
            settings.graphiti_anthropic_model = graphiti_anthropic_model if graphiti_anthropic_model else None
        if graphiti_database is not None:
            settings.graphiti_database = graphiti_database if graphiti_database else None
        if voyage_embedding_model is not None:
            settings.voyage_embedding_model = voyage_embedding_model if voyage_embedding_model else None
        if google_llm_model is not None:
            settings.google_llm_model = google_llm_model if google_llm_model else None
        if google_embedding_model is not None:
            settings.google_embedding_model = google_embedding_model if google_embedding_model else None

        # Azure OpenAI configuration
        if azure_openai_base_url is not None:
            settings.azure_openai_base_url = azure_openai_base_url if azure_openai_base_url else None
        if azure_openai_llm_deployment is not None:
            settings.azure_openai_llm_deployment = azure_openai_llm_deployment if azure_openai_llm_deployment else None
        if azure_openai_embedding_deployment is not None:
            settings.azure_openai_embedding_deployment = azure_openai_embedding_deployment if azure_openai_embedding_deployment else None

        # Ollama configuration
        if ollama_base_url is not None:
            settings.ollama_base_url = ollama_base_url if ollama_base_url else None
        if ollama_llm_model is not None:
            settings.ollama_llm_model = ollama_llm_model if ollama_llm_model else None
        if ollama_embedding_model is not None:
            settings.ollama_embedding_model = ollama_embedding_model if ollama_embedding_model else None
        if ollama_embedding_dim is not None:
            settings.ollama_embedding_dim = ollama_embedding_dim

        # Linear configuration
        if linear_team_id is not None:
            settings.linear_team_id = linear_team_id if linear_team_id else None
        if linear_project_id is not None:
            settings.linear_project_id = linear_project_id if linear_project_id else None

        # General settings
        if default_branch is not None:
            settings.default_branch = default_branch if default_branch else "main"
        if debug_mode is not None:
            settings.debug_mode = debug_mode
        if auto_build_model is not None:
            settings.auto_build_model = auto_build_model if auto_build_model else None

        # Electron MCP configuration
        if electron_mcp_enabled is not None:
            settings.electron_mcp_enabled = electron_mcp_enabled
        if electron_debug_port is not None:
            settings.electron_debug_port = electron_debug_port

        settings.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(settings)

        return settings

    async def update_control_flags(
        self,
        credentials_locked: Optional[bool] = None,
        allow_user_credentials: Optional[bool] = None,
    ) -> SystemSettings:
        """Update credential control flags.

        Args:
            credentials_locked: If True, users AND projects can't override global.
            allow_user_credentials: If False, only global/project allowed.

        Returns:
            Updated settings.
        """
        settings = await self.get_settings()

        if credentials_locked is not None:
            settings.credentials_locked = credentials_locked

        if allow_user_credentials is not None:
            settings.allow_user_credentials = allow_user_credentials

        settings.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(settings)

        return settings


class CredentialHierarchyService:
    """Service for resolving effective credentials with hierarchy.

    Implements the credential hierarchy:
    1. Global (SystemSettings) - Admin-set, applies to all users
    2. User (UserCredentials) - User's default for all their projects
    3. Project (ProjectCredentials) - Project-specific overrides

    When credentials_locked=True, only global credentials are used.
    When allow_user_credentials=False, user-level is skipped.
    """

    def __init__(
        self,
        db: AsyncSession,
        credential_service: Optional[CredentialService] = None,
    ):
        self.db = db
        self.credential_service = credential_service or CredentialService()
        self.global_service = GlobalCredentialService(db, credential_service)
        self.user_service = UserCredentialService(db, credential_service)

    async def get_effective_credentials(
        self,
        user_id: uuid.UUID,
        project_credentials: Optional[Dict[str, Optional[str]]] = None,
    ) -> Dict[str, Optional[str]]:
        """Get effective credentials with hierarchy resolution.

        Args:
            user_id: UUID of the user.
            project_credentials: Optional project-level decrypted credentials.

        Returns:
            Dictionary with effective credentials and their sources.
        """
        # Start with empty credentials
        effective: Dict[str, Optional[str]] = {
            "claude_oauth_token": None,
            "anthropic_api_key": None,
            "openai_api_key": None,
            "github_token": None,
            "linear_api_key": None,
            "voyage_api_key": None,
            "google_api_key": None,
            "azure_openai_api_key": None,
        }

        # Track sources for debugging/display
        sources: Dict[str, str] = {
            "claude_oauth_token": "none",
            "anthropic_api_key": "none",
            "openai_api_key": "none",
            "github_token": "none",
            "linear_api_key": "none",
            "voyage_api_key": "none",
            "google_api_key": "none",
            "azure_openai_api_key": "none",
        }

        # Get global settings
        settings = await self.global_service.get_settings()

        # 1. Apply global credentials
        try:
            global_creds = await self.global_service.get_decrypted_credentials()
            for key in effective.keys():
                if global_creds.get(key):
                    effective[key] = global_creds[key]
                    sources[key] = "global"
        except UserCredentialError:
            pass  # No encryption key configured

        # If credentials are locked, skip user and project levels
        if settings.credentials_locked:
            return {"credentials": effective, "sources": sources, "locked": True}

        # 2. Apply user-level credentials (if allowed)
        if settings.allow_user_credentials:
            try:
                user_creds = await self.user_service.get_decrypted_credentials(user_id)
                if user_creds:
                    for key in effective.keys():
                        if user_creds.get(key):
                            effective[key] = user_creds[key]
                            sources[key] = "user"
            except UserCredentialError:
                pass  # No encryption key configured

        # 3. Apply project-level credentials
        if project_credentials:
            for key in effective.keys():
                if project_credentials.get(key):
                    effective[key] = project_credentials[key]
                    sources[key] = "project"

        return {"credentials": effective, "sources": sources, "locked": False}

    async def get_credential_status_with_hierarchy(
        self,
        user_id: uuid.UUID,
        project_id: Optional[uuid.UUID] = None,
        project_status: Optional[Dict[str, bool]] = None,
    ) -> Dict[str, Any]:
        """Get credential status showing inheritance at each level.

        Useful for UI to show where credentials come from.

        Args:
            user_id: UUID of the user.
            project_id: Optional project UUID.
            project_status: Optional project credential status flags.

        Returns:
            Dictionary with status at each level.
        """
        settings = await self.global_service.get_settings()
        global_status = await self.global_service.get_credentials_status()
        user_status = await self.user_service.get_credentials_status(user_id)

        # Build per-credential status
        credential_keys = [
            ("claude_oauth", "Claude OAuth Token"),
            ("anthropic_key", "Anthropic API Key"),
            ("openai_key", "OpenAI API Key"),
            ("github_token", "GitHub Token"),
            ("linear_key", "Linear API Key"),
            ("voyage_key", "Voyage API Key"),
            ("google_key", "Google API Key"),
            ("azure_openai_key", "Azure OpenAI API Key"),
        ]

        result = {
            "credentials_locked": settings.credentials_locked,
            "allow_user_credentials": settings.allow_user_credentials,
            "credentials": [],
        }

        for key, label in credential_keys:
            global_has = global_status.get(f"has_global_{key}", False)
            user_has = user_status.get(f"has_{key}", False)
            project_has = project_status.get(f"has_{key}", False) if project_status else False

            # Determine effective source
            if settings.credentials_locked:
                effective_source = "global" if global_has else "none"
            elif project_has:
                effective_source = "project"
            elif user_has and settings.allow_user_credentials:
                effective_source = "user"
            elif global_has:
                effective_source = "global"
            else:
                effective_source = "none"

            result["credentials"].append({
                "key": key,
                "label": label,
                "global": global_has,
                "user": user_has if settings.allow_user_credentials else None,
                "project": project_has if project_id else None,
                "effective_source": effective_source,
                "is_set": effective_source != "none",
            })

        return result
