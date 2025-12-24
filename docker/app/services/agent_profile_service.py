"""Agent profile service for managing per-project agent configuration.

Provides CRUD operations for agent profiles and credential management.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import (
    User,
    Project,
    ProjectAgentProfile,
    ProjectCredentials,
    MemoryBackend,
)
from services.credential_service import CredentialService, CredentialEncryptionError
from services.user_credential_service import CredentialHierarchyService


class AgentProfileError(Exception):
    """Exception for agent profile errors."""

    def __init__(self, message: str, code: str = "agent_profile_error"):
        self.message = message
        self.code = code
        super().__init__(message)


class AgentProfileService:
    """Service for managing agent profiles and project credentials."""

    def __init__(
        self,
        db: AsyncSession,
        user: User,
        credential_service: Optional[CredentialService] = None,
    ):
        self.db = db
        self.user = user
        self.credential_service = credential_service or CredentialService()

    async def _get_project(self, project_id: uuid.UUID) -> Optional[Project]:
        """Get a project owned by the current user."""
        result = await self.db.execute(
            select(Project).where(
                Project.id == project_id,
                Project.owner_id == self.user.id,
            )
        )
        return result.scalar_one_or_none()

    async def get_profile(self, project_id: uuid.UUID) -> Optional[ProjectAgentProfile]:
        """Get agent profile for a project.

        Args:
            project_id: UUID of the project.

        Returns:
            ProjectAgentProfile or None if not found/not owned.
        """
        project = await self._get_project(project_id)
        if not project:
            return None

        result = await self.db.execute(
            select(ProjectAgentProfile).where(
                ProjectAgentProfile.project_id == project_id
            )
        )
        return result.scalar_one_or_none()

    async def update_profile(
        self,
        project_id: uuid.UUID,
        **updates: Any,
    ) -> Optional[ProjectAgentProfile]:
        """Update agent profile settings.

        Args:
            project_id: UUID of the project.
            **updates: Fields to update.

        Returns:
            Updated profile or None if not found.
        """
        profile = await self.get_profile(project_id)
        if not profile:
            return None

        # Allowed fields for update
        allowed_fields = {
            "default_model",
            "thinking_level",
            "phase_models",
            "default_complexity",
            "auto_detect_complexity",
            "memory_backend",
            "graphiti_config",
            "default_branch",
            "auto_commit",
            "auto_push",
            "max_parallel_subtasks",
            "qa_strict_mode",
            "recovery_attempts",
            "custom_prompts",
        }

        for key, value in updates.items():
            if key in allowed_fields and hasattr(profile, key):
                # Handle enum conversion for memory_backend
                if key == "memory_backend" and isinstance(value, str):
                    try:
                        value = MemoryBackend(value)
                    except ValueError:
                        valid_values = [e.value for e in MemoryBackend]
                        raise AgentProfileError(
                            f"Invalid memory_backend value: '{value}'. "
                            f"Valid values are: {valid_values}",
                            "invalid_memory_backend",
                        )
                setattr(profile, key, value)

        profile.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(profile)

        return profile

    async def create_default_profile(
        self,
        project_id: uuid.UUID,
    ) -> ProjectAgentProfile:
        """Create a default agent profile for a project.

        Args:
            project_id: UUID of the project.

        Returns:
            New ProjectAgentProfile.

        Raises:
            AgentProfileError: If profile already exists.
        """
        # Check if profile already exists
        existing = await self.db.execute(
            select(ProjectAgentProfile).where(
                ProjectAgentProfile.project_id == project_id
            )
        )
        if existing.scalar_one_or_none():
            raise AgentProfileError(
                "Profile already exists for this project",
                "profile_exists",
            )

        profile = ProjectAgentProfile(project_id=project_id)
        self.db.add(profile)
        await self.db.commit()
        await self.db.refresh(profile)

        return profile

    async def get_credentials(
        self,
        project_id: uuid.UUID,
    ) -> Optional[ProjectCredentials]:
        """Get credentials record for a project (without decryption).

        Args:
            project_id: UUID of the project.

        Returns:
            ProjectCredentials or None.
        """
        project = await self._get_project(project_id)
        if not project:
            return None

        result = await self.db.execute(
            select(ProjectCredentials).where(
                ProjectCredentials.project_id == project_id
            )
        )
        return result.scalar_one_or_none()

    async def get_decrypted_credentials(
        self,
        project_id: uuid.UUID,
    ) -> Optional[Dict[str, Optional[str]]]:
        """Get decrypted credentials for a project.

        Args:
            project_id: UUID of the project.

        Returns:
            Dictionary with decrypted credential values, or None if not found.

        Raises:
            AgentProfileError: If decryption fails.
        """
        credentials = await self.get_credentials(project_id)
        if not credentials:
            return None

        if not self.credential_service.is_configured:
            raise AgentProfileError(
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
            raise AgentProfileError(e.message, e.code)

    async def update_credentials(
        self,
        project_id: uuid.UUID,
        claude_oauth_token: Optional[str] = None,
        anthropic_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        github_token: Optional[str] = None,
        linear_api_key: Optional[str] = None,
        voyage_api_key: Optional[str] = None,
        google_api_key: Optional[str] = None,
        azure_openai_api_key: Optional[str] = None,
    ) -> Optional[ProjectCredentials]:
        """Update encrypted credentials for a project.

        Pass empty string to clear a credential, None to leave unchanged.

        Args:
            project_id: UUID of the project.
            claude_oauth_token: Claude OAuth token.
            anthropic_api_key: Anthropic API key.
            openai_api_key: OpenAI API key.
            github_token: GitHub token.
            linear_api_key: Linear API key.
            voyage_api_key: Voyage API key.
            google_api_key: Google API key.
            azure_openai_api_key: Azure OpenAI API key.

        Returns:
            Updated credentials or None if not found.

        Raises:
            AgentProfileError: If encryption fails.
        """
        credentials = await self.get_credentials(project_id)
        if not credentials:
            return None

        if not self.credential_service.is_configured:
            raise AgentProfileError(
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
            raise AgentProfileError(e.message, e.code)

        credentials.updated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(credentials)

        return credentials

    async def create_default_credentials(
        self,
        project_id: uuid.UUID,
    ) -> ProjectCredentials:
        """Create empty credentials record for a project.

        Args:
            project_id: UUID of the project.

        Returns:
            New ProjectCredentials.

        Raises:
            AgentProfileError: If credentials already exist.
        """
        # Check if credentials already exist
        existing = await self.db.execute(
            select(ProjectCredentials).where(
                ProjectCredentials.project_id == project_id
            )
        )
        if existing.scalar_one_or_none():
            raise AgentProfileError(
                "Credentials already exist for this project",
                "credentials_exist",
            )

        credentials = ProjectCredentials(project_id=project_id)
        self.db.add(credentials)
        await self.db.commit()
        await self.db.refresh(credentials)

        return credentials

    async def get_effective_credentials(
        self,
        project_id: uuid.UUID,
    ) -> Dict[str, Optional[str]]:
        """Get effective credentials with full hierarchy resolution.

        Resolves credentials from: Global → User → Project

        Args:
            project_id: UUID of the project.

        Returns:
            Dictionary with effective credentials.
        """
        # Get project-level credentials
        project_creds = None
        try:
            project_creds = await self.get_decrypted_credentials(project_id)
        except AgentProfileError:
            pass  # No project credentials

        # Use hierarchy service to resolve effective credentials
        hierarchy_service = CredentialHierarchyService(self.db, self.credential_service)
        result = await hierarchy_service.get_effective_credentials(
            user_id=self.user.id,
            project_credentials=project_creds,
        )

        return result["credentials"]

    def get_build_env(
        self,
        profile: ProjectAgentProfile,
        decrypted_credentials: Optional[Dict[str, Optional[str]]] = None,
    ) -> Dict[str, str]:
        """Generate environment variables for a build based on profile and credentials.

        Args:
            profile: The agent profile for the project.
            decrypted_credentials: Dictionary of decrypted credentials.

        Returns:
            Dictionary of environment variables for the build subprocess.
        """
        env: Dict[str, str] = {}

        # Agent model settings
        env["AGENT_DEFAULT_MODEL"] = profile.default_model
        env["AGENT_THINKING_LEVEL"] = profile.thinking_level
        env["AGENT_DEFAULT_COMPLEXITY"] = profile.default_complexity
        env["AGENT_AUTO_DETECT_COMPLEXITY"] = str(profile.auto_detect_complexity).lower()

        # Git settings
        env["DEFAULT_BRANCH"] = profile.default_branch
        env["AGENT_AUTO_COMMIT"] = str(profile.auto_commit).lower()
        env["AGENT_AUTO_PUSH"] = str(profile.auto_push).lower()

        # Agent behavior
        env["AGENT_MAX_PARALLEL_SUBTASKS"] = str(profile.max_parallel_subtasks)
        env["AGENT_QA_STRICT_MODE"] = str(profile.qa_strict_mode).lower()
        env["AGENT_RECOVERY_ATTEMPTS"] = str(profile.recovery_attempts)

        # Memory backend
        env["AGENT_MEMORY_BACKEND"] = profile.memory_backend.value

        # Graphiti settings if using graph memory
        if profile.memory_backend in (MemoryBackend.GRAPHITI, MemoryBackend.BOTH):
            env["GRAPHITI_ENABLED"] = "true"
            if profile.graphiti_config:
                if "host" in profile.graphiti_config:
                    env["GRAPHITI_FALKORDB_HOST"] = profile.graphiti_config["host"]
                if "port" in profile.graphiti_config:
                    env["GRAPHITI_FALKORDB_PORT"] = str(profile.graphiti_config["port"])

        # Credentials
        if decrypted_credentials:
            if decrypted_credentials.get("claude_oauth_token"):
                env["CLAUDE_CODE_OAUTH_TOKEN"] = decrypted_credentials["claude_oauth_token"]
            if decrypted_credentials.get("anthropic_api_key"):
                env["ANTHROPIC_API_KEY"] = decrypted_credentials["anthropic_api_key"]
            if decrypted_credentials.get("openai_api_key"):
                env["OPENAI_API_KEY"] = decrypted_credentials["openai_api_key"]
            if decrypted_credentials.get("github_token"):
                env["GITHUB_TOKEN"] = decrypted_credentials["github_token"]
            if decrypted_credentials.get("linear_api_key"):
                env["LINEAR_API_KEY"] = decrypted_credentials["linear_api_key"]
            if decrypted_credentials.get("voyage_api_key"):
                env["VOYAGE_API_KEY"] = decrypted_credentials["voyage_api_key"]
            if decrypted_credentials.get("google_api_key"):
                env["GOOGLE_API_KEY"] = decrypted_credentials["google_api_key"]
            if decrypted_credentials.get("azure_openai_api_key"):
                env["AZURE_OPENAI_API_KEY"] = decrypted_credentials["azure_openai_api_key"]

        return env

    async def get_build_env_with_hierarchy(
        self,
        project_id: uuid.UUID,
    ) -> Dict[str, str]:
        """Get complete build environment with credential hierarchy resolution.

        This is the recommended method for builds as it handles the full
        credential hierarchy (Global → User → Project).

        Args:
            project_id: UUID of the project.

        Returns:
            Dictionary of environment variables for the build subprocess.
        """
        profile = await self.get_profile(project_id)
        if not profile:
            raise AgentProfileError(
                "Agent profile not found",
                "profile_not_found",
            )

        # Get effective credentials with hierarchy
        effective_creds = await self.get_effective_credentials(project_id)

        return self.get_build_env(profile, effective_creds)
