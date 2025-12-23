"""
Base Provider Interface
=======================

Defines the abstract base class and types for LLM providers.
All provider implementations must extend LLMProvider.
"""

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any


class ProviderType(Enum):
    """Supported LLM provider types."""

    CLAUDE = "claude"
    OPENAI = "openai"
    GEMINI = "gemini"
    OLLAMA = "ollama"


@dataclass
class ProviderConfig:
    """
    Configuration for an LLM provider.

    Attributes:
        provider_type: The type of provider
        api_key: API key for authentication (optional for Ollama)
        model: Model identifier to use
        base_url: Custom API endpoint (for Ollama or proxies)
        max_tokens: Maximum tokens for response
        temperature: Temperature for response generation
        extra: Additional provider-specific configuration
    """

    provider_type: ProviderType
    api_key: str | None = None
    model: str | None = None
    base_url: str | None = None
    max_tokens: int = 8192
    temperature: float = 0.0
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_env(cls, provider_type: ProviderType) -> "ProviderConfig":
        """
        Create config from environment variables.

        Environment variable naming convention:
        - {PROVIDER}_API_KEY: API key
        - {PROVIDER}_MODEL: Model to use
        - {PROVIDER}_BASE_URL: Custom base URL

        Args:
            provider_type: The provider to configure

        Returns:
            ProviderConfig with values from environment
        """
        prefix = provider_type.value.upper()

        # Default models for each provider
        default_models = {
            ProviderType.CLAUDE: "claude-sonnet-4-20250514",
            ProviderType.OPENAI: "gpt-4o",
            ProviderType.GEMINI: "gemini-2.0-flash",
            ProviderType.OLLAMA: "llama3.2",
        }

        # Get API key (Claude uses CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)
        if provider_type == ProviderType.CLAUDE:
            api_key = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get(
                "ANTHROPIC_API_KEY"
            )
        else:
            api_key = os.environ.get(f"{prefix}_API_KEY")

        return cls(
            provider_type=provider_type,
            api_key=api_key,
            model=os.environ.get(f"{prefix}_MODEL", default_models.get(provider_type)),
            base_url=os.environ.get(f"{prefix}_BASE_URL"),
        )


@dataclass
class AgentResponse:
    """
    Response from an agent session.

    Attributes:
        success: Whether the agent completed successfully
        output: The agent's output/response
        tokens_used: Number of tokens used (input + output)
        cost_usd: Estimated cost in USD (if available)
        metadata: Additional response metadata
    """

    success: bool
    output: str
    tokens_used: int = 0
    cost_usd: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.

    All providers must implement the core agent session methods.
    The provider is responsible for:
    - Managing API authentication
    - Creating and running agent sessions
    - Translating provider-specific responses to common format
    """

    def __init__(self, config: ProviderConfig):
        """
        Initialize the provider.

        Args:
            config: Provider configuration
        """
        self.config = config

    @property
    @abstractmethod
    def name(self) -> str:
        """Return the provider name."""
        ...

    @property
    @abstractmethod
    def is_available(self) -> bool:
        """Check if the provider is properly configured and available."""
        ...

    @abstractmethod
    async def run_agent_session(
        self,
        prompt: str,
        project_dir: Path,
        spec_dir: Path,
        agent_type: str = "coder",
        max_thinking_tokens: int | None = None,
    ) -> AgentResponse:
        """
        Run an agent session with the given prompt.

        Args:
            prompt: The prompt/instructions for the agent
            project_dir: Working directory for the agent
            spec_dir: Directory containing spec files
            agent_type: Type of agent (planner, coder, qa_reviewer, qa_fixer)
            max_thinking_tokens: Token budget for extended thinking

        Returns:
            AgentResponse with the results
        """
        ...

    @abstractmethod
    def get_model_info(self) -> dict[str, Any]:
        """
        Get information about the configured model.

        Returns:
            Dict with model name, context window, pricing, etc.
        """
        ...

    def validate_config(self) -> list[str]:
        """
        Validate the provider configuration.

        Returns:
            List of validation error messages (empty if valid)
        """
        errors = []

        # Most providers require an API key (except Ollama)
        if self.config.provider_type != ProviderType.OLLAMA:
            if not self.config.api_key:
                errors.append(
                    f"{self.config.provider_type.value.upper()}_API_KEY not set"
                )

        return errors
