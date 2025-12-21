"""
Graphiti Integration Configuration
==================================

Constants, status mappings, and configuration helpers for Graphiti memory integration.
Follows the same patterns as linear_config.py for consistency.

Uses LadybugDB as the embedded graph database (no Docker required, Python 3.12+).

Multi-Provider Support (V2):
- LLM Providers: OpenAI, Anthropic, Azure OpenAI, Ollama, Google AI
- Embedder Providers: OpenAI, Voyage AI, Azure OpenAI, Ollama, Google AI

Environment Variables:
    # Core
    GRAPHITI_ENABLED: Set to "true" to enable Graphiti integration
    GRAPHITI_LLM_PROVIDER: openai|anthropic|azure_openai|ollama|google (default: openai)
    GRAPHITI_EMBEDDER_PROVIDER: openai|voyage|azure_openai|ollama|google (default: openai)

    # Database
    GRAPHITI_DATABASE: Graph database name (default: auto_claude_memory)
    GRAPHITI_DB_PATH: Database storage path (default: ~/.auto-claude/graphs)

    # OpenAI
    OPENAI_API_KEY: Required for OpenAI provider
    OPENAI_MODEL: Model for LLM (default: gpt-4o-mini)
    OPENAI_EMBEDDING_MODEL: Model for embeddings (default: text-embedding-3-small)

    # Anthropic (LLM only - needs separate embedder)
    ANTHROPIC_API_KEY: Required for Anthropic provider
    GRAPHITI_ANTHROPIC_MODEL: Model for LLM (default: claude-sonnet-4-5-latest)

    # Azure OpenAI
    AZURE_OPENAI_API_KEY: Required for Azure provider
    AZURE_OPENAI_BASE_URL: Azure endpoint URL
    AZURE_OPENAI_LLM_DEPLOYMENT: Deployment name for LLM
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: Deployment name for embeddings

    # Voyage AI (embeddings only - commonly used with Anthropic)
    VOYAGE_API_KEY: Required for Voyage embedder
    VOYAGE_EMBEDDING_MODEL: Model (default: voyage-3)

    # Google AI
    GOOGLE_API_KEY: Required for Google provider
    GOOGLE_LLM_MODEL: Model for LLM (default: gemini-2.0-flash)
    GOOGLE_EMBEDDING_MODEL: Model for embeddings (default: text-embedding-004)

    # Ollama (local)
    OLLAMA_BASE_URL: Ollama server URL (default: http://localhost:11434)
    OLLAMA_LLM_MODEL: Model for LLM (e.g., deepseek-r1:7b)
    OLLAMA_EMBEDDING_MODEL: Model for embeddings (e.g., nomic-embed-text)
    OLLAMA_EMBEDDING_DIM: Embedding dimension (required for Ollama, e.g., 768)
"""

import json
import os
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

# Default configuration values
DEFAULT_DATABASE = "auto_claude_memory"
DEFAULT_DB_PATH = "~/.auto-claude/graphs"
DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"

# Graphiti state marker file (stores connection info and status)
GRAPHITI_STATE_MARKER = ".graphiti_state.json"

# Episode types for different memory categories
EPISODE_TYPE_SESSION_INSIGHT = "session_insight"
EPISODE_TYPE_CODEBASE_DISCOVERY = "codebase_discovery"
EPISODE_TYPE_PATTERN = "pattern"
EPISODE_TYPE_GOTCHA = "gotcha"
EPISODE_TYPE_TASK_OUTCOME = "task_outcome"
EPISODE_TYPE_QA_RESULT = "qa_result"
EPISODE_TYPE_HISTORICAL_CONTEXT = "historical_context"


class LLMProvider(str, Enum):
    """Supported LLM providers for Graphiti."""

    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"
    OLLAMA = "ollama"
    GOOGLE = "google"


class EmbedderProvider(str, Enum):
    """Supported embedder providers for Graphiti."""

    OPENAI = "openai"
    VOYAGE = "voyage"
    AZURE_OPENAI = "azure_openai"
    OLLAMA = "ollama"
    GOOGLE = "google"


@dataclass
class GraphitiConfig:
    """Configuration for Graphiti memory integration with multi-provider support.

    Uses LadybugDB as the embedded graph database (no Docker required, Python 3.12+).
    """

    # Core settings
    enabled: bool = False
    llm_provider: str = "openai"
    embedder_provider: str = "openai"

    # Database settings (LadybugDB - embedded, no Docker required)
    database: str = DEFAULT_DATABASE
    db_path: str = DEFAULT_DB_PATH

    # OpenAI settings
    openai_api_key: str = ""
    openai_model: str = "gpt-5-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # Anthropic settings (LLM only)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5-latest"

    # Azure OpenAI settings
    azure_openai_api_key: str = ""
    azure_openai_base_url: str = ""
    azure_openai_llm_deployment: str = ""
    azure_openai_embedding_deployment: str = ""

    # Voyage AI settings (embeddings only)
    voyage_api_key: str = ""
    voyage_embedding_model: str = "voyage-3"

    # Google AI settings (LLM and embeddings)
    google_api_key: str = ""
    google_llm_model: str = "gemini-2.0-flash"
    google_embedding_model: str = "text-embedding-004"

    # Ollama settings (local)
    ollama_base_url: str = DEFAULT_OLLAMA_BASE_URL
    ollama_llm_model: str = ""
    ollama_embedding_model: str = ""
    ollama_embedding_dim: int = 0  # Required for Ollama embeddings

    @classmethod
    def from_env(cls) -> "GraphitiConfig":
        """Create config from environment variables."""
        # Check if Graphiti is explicitly enabled
        enabled_str = os.environ.get("GRAPHITI_ENABLED", "").lower()
        enabled = enabled_str in ("true", "1", "yes")

        # Provider selection
        llm_provider = os.environ.get("GRAPHITI_LLM_PROVIDER", "openai").lower()
        embedder_provider = os.environ.get(
            "GRAPHITI_EMBEDDER_PROVIDER", "openai"
        ).lower()

        # Database settings (LadybugDB - embedded)
        database = os.environ.get("GRAPHITI_DATABASE", DEFAULT_DATABASE)
        db_path = os.environ.get("GRAPHITI_DB_PATH", DEFAULT_DB_PATH)

        # OpenAI settings
        openai_api_key = os.environ.get("OPENAI_API_KEY", "")
        openai_model = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
        openai_embedding_model = os.environ.get(
            "OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"
        )

        # Anthropic settings
        anthropic_api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        anthropic_model = os.environ.get(
            "GRAPHITI_ANTHROPIC_MODEL", "claude-sonnet-4-5-latest"
        )

        # Azure OpenAI settings
        azure_openai_api_key = os.environ.get("AZURE_OPENAI_API_KEY", "")
        azure_openai_base_url = os.environ.get("AZURE_OPENAI_BASE_URL", "")
        azure_openai_llm_deployment = os.environ.get("AZURE_OPENAI_LLM_DEPLOYMENT", "")
        azure_openai_embedding_deployment = os.environ.get(
            "AZURE_OPENAI_EMBEDDING_DEPLOYMENT", ""
        )

        # Voyage AI settings
        voyage_api_key = os.environ.get("VOYAGE_API_KEY", "")
        voyage_embedding_model = os.environ.get("VOYAGE_EMBEDDING_MODEL", "voyage-3")

        # Google AI settings
        google_api_key = os.environ.get("GOOGLE_API_KEY", "")
        google_llm_model = os.environ.get("GOOGLE_LLM_MODEL", "gemini-2.0-flash")
        google_embedding_model = os.environ.get(
            "GOOGLE_EMBEDDING_MODEL", "text-embedding-004"
        )

        # Ollama settings
        ollama_base_url = os.environ.get("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL)
        ollama_llm_model = os.environ.get("OLLAMA_LLM_MODEL", "")
        ollama_embedding_model = os.environ.get("OLLAMA_EMBEDDING_MODEL", "")

        # Ollama embedding dimension (required for Ollama)
        try:
            ollama_embedding_dim = int(os.environ.get("OLLAMA_EMBEDDING_DIM", "0"))
        except ValueError:
            ollama_embedding_dim = 0

        return cls(
            enabled=enabled,
            llm_provider=llm_provider,
            embedder_provider=embedder_provider,
            database=database,
            db_path=db_path,
            openai_api_key=openai_api_key,
            openai_model=openai_model,
            openai_embedding_model=openai_embedding_model,
            anthropic_api_key=anthropic_api_key,
            anthropic_model=anthropic_model,
            azure_openai_api_key=azure_openai_api_key,
            azure_openai_base_url=azure_openai_base_url,
            azure_openai_llm_deployment=azure_openai_llm_deployment,
            azure_openai_embedding_deployment=azure_openai_embedding_deployment,
            voyage_api_key=voyage_api_key,
            voyage_embedding_model=voyage_embedding_model,
            google_api_key=google_api_key,
            google_llm_model=google_llm_model,
            google_embedding_model=google_embedding_model,
            ollama_base_url=ollama_base_url,
            ollama_llm_model=ollama_llm_model,
            ollama_embedding_model=ollama_embedding_model,
            ollama_embedding_dim=ollama_embedding_dim,
        )

    def is_valid(self) -> bool:
        """
        Check if config has minimum required values for operation.

        Returns True if:
        - GRAPHITI_ENABLED is true
        - LLM provider is configured correctly
        - Embedder provider is configured correctly
        """
        if not self.enabled:
            return False

        # Validate LLM provider
        if not self._validate_llm_provider():
            return False

        # Validate embedder provider
        if not self._validate_embedder_provider():
            return False

        return True

    def _validate_llm_provider(self) -> bool:
        """Validate LLM provider configuration."""
        if self.llm_provider == "openai":
            return bool(self.openai_api_key)
        elif self.llm_provider == "anthropic":
            return bool(self.anthropic_api_key)
        elif self.llm_provider == "azure_openai":
            return bool(
                self.azure_openai_api_key
                and self.azure_openai_base_url
                and self.azure_openai_llm_deployment
            )
        elif self.llm_provider == "ollama":
            return bool(self.ollama_llm_model)
        elif self.llm_provider == "google":
            return bool(self.google_api_key)
        return False

    def _validate_embedder_provider(self) -> bool:
        """Validate embedder provider configuration."""
        if self.embedder_provider == "openai":
            return bool(self.openai_api_key)
        elif self.embedder_provider == "voyage":
            return bool(self.voyage_api_key)
        elif self.embedder_provider == "azure_openai":
            return bool(
                self.azure_openai_api_key
                and self.azure_openai_base_url
                and self.azure_openai_embedding_deployment
            )
        elif self.embedder_provider == "ollama":
            return bool(self.ollama_embedding_model and self.ollama_embedding_dim)
        elif self.embedder_provider == "google":
            return bool(self.google_api_key)
        return False

    def get_validation_errors(self) -> list[str]:
        """Get list of validation errors for current configuration."""
        errors = []

        if not self.enabled:
            errors.append("GRAPHITI_ENABLED must be set to true")
            return errors

        # LLM provider validation
        if self.llm_provider == "openai":
            if not self.openai_api_key:
                errors.append("OpenAI LLM provider requires OPENAI_API_KEY")
        elif self.llm_provider == "anthropic":
            if not self.anthropic_api_key:
                errors.append("Anthropic LLM provider requires ANTHROPIC_API_KEY")
        elif self.llm_provider == "azure_openai":
            if not self.azure_openai_api_key:
                errors.append("Azure OpenAI LLM provider requires AZURE_OPENAI_API_KEY")
            if not self.azure_openai_base_url:
                errors.append(
                    "Azure OpenAI LLM provider requires AZURE_OPENAI_BASE_URL"
                )
            if not self.azure_openai_llm_deployment:
                errors.append(
                    "Azure OpenAI LLM provider requires AZURE_OPENAI_LLM_DEPLOYMENT"
                )
        elif self.llm_provider == "ollama":
            if not self.ollama_llm_model:
                errors.append("Ollama LLM provider requires OLLAMA_LLM_MODEL")
        elif self.llm_provider == "google":
            if not self.google_api_key:
                errors.append("Google LLM provider requires GOOGLE_API_KEY")
        else:
            errors.append(f"Unknown LLM provider: {self.llm_provider}")

        # Embedder provider validation
        if self.embedder_provider == "openai":
            if not self.openai_api_key:
                errors.append("OpenAI embedder provider requires OPENAI_API_KEY")
        elif self.embedder_provider == "voyage":
            if not self.voyage_api_key:
                errors.append("Voyage embedder provider requires VOYAGE_API_KEY")
        elif self.embedder_provider == "azure_openai":
            if not self.azure_openai_api_key:
                errors.append(
                    "Azure OpenAI embedder provider requires AZURE_OPENAI_API_KEY"
                )
            if not self.azure_openai_base_url:
                errors.append(
                    "Azure OpenAI embedder provider requires AZURE_OPENAI_BASE_URL"
                )
            if not self.azure_openai_embedding_deployment:
                errors.append(
                    "Azure OpenAI embedder provider requires AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
                )
        elif self.embedder_provider == "ollama":
            if not self.ollama_embedding_model:
                errors.append(
                    "Ollama embedder provider requires OLLAMA_EMBEDDING_MODEL"
                )
            if not self.ollama_embedding_dim:
                errors.append("Ollama embedder provider requires OLLAMA_EMBEDDING_DIM")
        elif self.embedder_provider == "google":
            if not self.google_api_key:
                errors.append("Google embedder provider requires GOOGLE_API_KEY")
        else:
            errors.append(f"Unknown embedder provider: {self.embedder_provider}")

        return errors

    def get_db_path(self) -> Path:
        """
        Get the resolved database path.

        Expands ~ to home directory and appends the database name.
        Creates the directory if it doesn't exist.
        """
        base_path = Path(self.db_path).expanduser()
        full_path = base_path / self.database
        full_path.parent.mkdir(parents=True, exist_ok=True)
        return full_path

    def get_provider_summary(self) -> str:
        """Get a summary of configured providers."""
        return f"LLM: {self.llm_provider}, Embedder: {self.embedder_provider}"


@dataclass
class GraphitiState:
    """State of Graphiti integration for an auto-claude spec."""

    initialized: bool = False
    database: str | None = None
    indices_built: bool = False
    created_at: str | None = None
    last_session: int | None = None
    episode_count: int = 0
    error_log: list = field(default_factory=list)
    # V2 additions
    llm_provider: str | None = None
    embedder_provider: str | None = None

    def to_dict(self) -> dict:
        return {
            "initialized": self.initialized,
            "database": self.database,
            "indices_built": self.indices_built,
            "created_at": self.created_at,
            "last_session": self.last_session,
            "episode_count": self.episode_count,
            "error_log": self.error_log[-10:],  # Keep last 10 errors
            "llm_provider": self.llm_provider,
            "embedder_provider": self.embedder_provider,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "GraphitiState":
        return cls(
            initialized=data.get("initialized", False),
            database=data.get("database"),
            indices_built=data.get("indices_built", False),
            created_at=data.get("created_at"),
            last_session=data.get("last_session"),
            episode_count=data.get("episode_count", 0),
            error_log=data.get("error_log", []),
            llm_provider=data.get("llm_provider"),
            embedder_provider=data.get("embedder_provider"),
        )

    def save(self, spec_dir: Path) -> None:
        """Save state to the spec directory."""
        marker_file = spec_dir / GRAPHITI_STATE_MARKER
        with open(marker_file, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, spec_dir: Path) -> Optional["GraphitiState"]:
        """Load state from the spec directory."""
        marker_file = spec_dir / GRAPHITI_STATE_MARKER
        if not marker_file.exists():
            return None

        try:
            with open(marker_file) as f:
                return cls.from_dict(json.load(f))
        except (OSError, json.JSONDecodeError):
            return None

    def record_error(self, error_msg: str) -> None:
        """Record an error in the state."""
        self.error_log.append(
            {
                "timestamp": datetime.now().isoformat(),
                "error": error_msg[:500],  # Limit error message length
            }
        )
        # Keep only last 10 errors
        self.error_log = self.error_log[-10:]


def is_graphiti_enabled() -> bool:
    """
    Quick check if Graphiti integration is available.

    Returns True if:
    - GRAPHITI_ENABLED is set to true/1/yes
    - Required provider credentials are configured
    """
    config = GraphitiConfig.from_env()
    return config.is_valid()


def get_graphiti_status() -> dict:
    """
    Get the current Graphiti integration status.

    Returns:
        Dict with status information:
            - enabled: bool
            - available: bool (has required dependencies)
            - database: str
            - db_path: str
            - llm_provider: str
            - embedder_provider: str
            - reason: str (why unavailable if not available)
            - errors: list (validation errors if any)
    """
    config = GraphitiConfig.from_env()

    status = {
        "enabled": config.enabled,
        "available": False,
        "database": config.database,
        "db_path": config.db_path,
        "llm_provider": config.llm_provider,
        "embedder_provider": config.embedder_provider,
        "reason": "",
        "errors": [],
    }

    if not config.enabled:
        status["reason"] = "GRAPHITI_ENABLED not set to true"
        return status

    # Get validation errors
    errors = config.get_validation_errors()
    if errors:
        status["errors"] = errors
        status["reason"] = errors[0]  # First error as primary reason
        return status

    status["available"] = True
    return status


def get_available_providers() -> dict:
    """
    Get list of available providers based on current environment.

    Returns:
        Dict with lists of available LLM and embedder providers
    """
    config = GraphitiConfig.from_env()

    available_llm = []
    available_embedder = []

    # Check OpenAI
    if config.openai_api_key:
        available_llm.append("openai")
        available_embedder.append("openai")

    # Check Anthropic
    if config.anthropic_api_key:
        available_llm.append("anthropic")

    # Check Azure OpenAI
    if config.azure_openai_api_key and config.azure_openai_base_url:
        if config.azure_openai_llm_deployment:
            available_llm.append("azure_openai")
        if config.azure_openai_embedding_deployment:
            available_embedder.append("azure_openai")

    # Check Voyage
    if config.voyage_api_key:
        available_embedder.append("voyage")

    # Check Google AI
    if config.google_api_key:
        available_llm.append("google")
        available_embedder.append("google")

    # Check Ollama
    if config.ollama_llm_model:
        available_llm.append("ollama")
    if config.ollama_embedding_model and config.ollama_embedding_dim:
        available_embedder.append("ollama")

    return {
        "llm_providers": available_llm,
        "embedder_providers": available_embedder,
    }


def validate_graphiti_config() -> tuple[bool, list[str]]:
    """
    Validate Graphiti configuration from environment.

    Returns:
        Tuple of (is_valid, error_messages)
        - is_valid: True if configuration is valid
        - error_messages: List of validation error messages (empty if valid)
    """
    config = GraphitiConfig.from_env()

    if not config.is_valid():
        errors = config.get_validation_errors()
        return False, errors

    return True, []
