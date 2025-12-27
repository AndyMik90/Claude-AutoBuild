"""Configuration management for Auto-Claude Docker Web UI."""

from pathlib import Path
from functools import lru_cache
from typing import List, Optional

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Paths
    auto_claude_path: Path = Path("/opt/auto-claude")
    repos_dir: Path = Path("/repos")  # Per-user project repositories
    data_dir: Path = Path("/data")

    # Database
    database_url: str = "postgresql+asyncpg://autoclaude:autoclaude@postgres:5432/autoclaude"

    # JWT Authentication
    jwt_secret_key: str = "changeme-generate-a-secure-key"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 30

    # Credential encryption
    credential_encryption_key: Optional[str] = None

    # Web UI
    web_port: int = 8080
    debug: bool = False

    # CORS Configuration
    cors_allowed_origins: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Claude Authentication (system-wide defaults)
    claude_code_oauth_token: str = ""
    anthropic_api_key: str = ""

    # GitHub (system-wide default)
    github_token: str = ""

    # Auto-Claude Settings
    default_branch: str = "main"

    # Graphiti
    graphiti_enabled: bool = False
    graphiti_falkordb_host: str = "falkordb"
    graphiti_falkordb_port: int = 6379
    graphiti_mcp_url: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            # Handle comma-separated string from environment variable
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def validate_jwt_secret_in_production(self) -> "Settings":
        """Prevent using default insecure JWT secret in production."""
        default_secret = "changeme-generate-a-secure-key"
        if not self.debug and self.jwt_secret_key == default_secret:
            raise ValueError(
                "JWT_SECRET_KEY must be changed from the default value in production. "
                "Set DEBUG=true for development or provide a secure JWT_SECRET_KEY."
            )
        return self

    @model_validator(mode="after")
    def validate_credential_encryption_key(self) -> "Settings":
        """Validate CREDENTIAL_ENCRYPTION_KEY is set in production.

        In production (debug=False), credential encryption key is required
        for secure storage of user credentials. In development mode, the
        key is optional but a warning is issued if not set.
        """
        if not self.credential_encryption_key:
            if not self.debug:
                raise ValueError(
                    "CREDENTIAL_ENCRYPTION_KEY must be set in production. "
                    "Generate a secure Fernet key using: "
                    "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())' "
                    "Set DEBUG=true for development without encryption."
                )
            # In debug mode, key is optional but features requiring encryption won't work
        return self

    @property
    def projects_dir(self) -> Path:
        """Alias for repos_dir for backward compatibility."""
        return self.repos_dir

    @property
    def projects_json_path(self) -> Path:
        """Path to projects metadata file (legacy, moving to DB)."""
        return self.data_dir / "projects.json"

    @property
    def logs_dir(self) -> Path:
        """Path to logs directory."""
        return self.data_dir / "logs"

    @property
    def has_claude_auth(self) -> bool:
        """Check if Claude authentication is configured."""
        return bool(self.claude_code_oauth_token or self.anthropic_api_key)

    @property
    def has_encryption_key(self) -> bool:
        """Check if credential encryption key is configured."""
        return bool(self.credential_encryption_key)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
