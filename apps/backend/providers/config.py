"""
Model Provider Configuration Module
===================================

Central configuration for model providers (Anthropic, OpenRouter, Z.AI).
Follows the pattern established by Graphiti's multi-provider architecture.
"""

import os
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from core.provider_base import BaseProviderConfig, get_provider_config_by_name


class ModelProvider(str, Enum):
    """Supported model providers for Auto Claude agents."""

    ANTHROPIC = "anthropic"
    OPENROUTER = "openrouter"
    ZAI = "zai"


@dataclass
class ProviderConfig:
    """Configuration for a specific model provider."""

    provider: ModelProvider
    base_url: str
    api_key_env_var: str
    supports_extended_thinking: bool = False
    max_thinking_tokens: Optional[int] = None
    # Model tier mapping for direct replacement mode
    model_mapping: dict[str, str] = None

    def __post_init__(self):
        if self.model_mapping is None:
            self.model_mapping = {}


# Provider configurations (similar to Graphiti's provider configs)
PROVIDER_CONFIGS: dict[ModelProvider, ProviderConfig] = {
    ModelProvider.ANTHROPIC: ProviderConfig(
        provider=ModelProvider.ANTHROPIC,
        base_url="https://api.anthropic.com",
        api_key_env_var="CLAUDE_CODE_OAUTH_TOKEN",
        supports_extended_thinking=True,
        max_thinking_tokens=200000,
        model_mapping={
            "opus": "claude-opus-4-5-20251101",
            "sonnet": "claude-sonnet-4-5-20250929",
            "haiku": "claude-haiku-4-5-20251001",
        },
    ),
    ModelProvider.OPENROUTER: ProviderConfig(
        provider=ModelProvider.OPENROUTER,
        base_url="https://openrouter.ai/api/v1",
        api_key_env_var="OPENROUTER_API_KEY",
        supports_extended_thinking=False,
        model_mapping={
            "opus": "anthropic/claude-opus-4-5-20251101",
            "sonnet": "anthropic/claude-sonnet-4-5-20250929",
            "haiku": "anthropic/claude-haiku-4-5-20251001",
            # GLM models available via direct model ID
            # "opus": "glm/glm-4-plus",
            # "sonnet": "glm/glm-4-0520",
            # "haiku": "glm/glm-4-air",
        },
    ),
    ModelProvider.ZAI: ProviderConfig(
        provider=ModelProvider.ZAI,
        base_url="https://open.bigmodel.cn/api/paas/v4/",
        api_key_env_var="ZAI_API_KEY",
        supports_extended_thinking=False,
        model_mapping={
            "opus": "glm-4.7",
            "sonnet": "glm-4.7",
            "haiku": "glm-4.5-air",
        },
    ),
}


def get_provider_config(provider: str) -> ProviderConfig:
    """
    Get provider configuration by provider name.

    Args:
        provider: Provider name (anthropic, openrouter, zai)

    Returns:
        ProviderConfig instance

    Raises:
        ValueError: If provider is not supported
    """
    try:
        provider_enum = ModelProvider(provider.lower())
        return PROVIDER_CONFIGS[provider_enum]
    except (ValueError, KeyError):
        raise ValueError(
            f"Unknown provider: {provider}. Valid options: {[p.value for p in ModelProvider]}"
        )


def resolve_model_id(model: str, provider: str = "anthropic") -> str:
    """
    Resolve a model shorthand or provider-qualified ID to a full model ID.

    Args:
        model: Model identifier (shorthand like "opus" or full ID)
        provider: Provider name (for shorthand resolution)

    Returns:
        Full model ID for the provider

    Examples:
        >>> resolve_model_id("opus", "anthropic")
        "claude-opus-4-5-20251101"
        >>> resolve_model_id("opus", "zai")
        "glm-4.7"
        >>> resolve_model_id("openrouter/glm-4-plus")
        "openrouter/glm-4-plus"
        >>> resolve_model_id("glm-4.7")
        "glm-4.7"
    """
    # If already provider-qualified, return as-is
    if "/" in model:
        return model

    # Check if it's a known shorthand
    config = get_provider_config(provider)

    if model in config.model_mapping:
        return config.model_mapping[model]

    # Already a full model ID or unknown
    return model


def get_provider_for_model(model_id: str) -> ModelProvider:
    """
    Determine the provider for a given model ID.

    Args:
        model_id: Full model ID or shorthand

    Returns:
        ModelProvider enum value
    """
    # Check for provider prefix
    if "/" in model_id:
        provider_part = model_id.split("/")[0].lower()
        if provider_part == "glm":
            return ModelProvider.OPENROUTER
        if provider_part == "anthropic":
            return ModelProvider.OPENROUTER
        # Could be extended for other providers

    # Check for Z.AI specific patterns (glm-* without provider prefix)
    if model_id.startswith("glm-") and "/" not in model_id:
        return ModelProvider.ZAI

    # Check for OpenRouter URL in environment
    base_url = os.environ.get("ANTHROPIC_BASE_URL", "")
    if "openrouter.ai" in base_url.lower():
        return ModelProvider.OPENROUTER
    if "bigmodel.cn" in base_url.lower():
        return ModelProvider.ZAI

    # Default to Anthropic
    return ModelProvider.ANTHROPIC


def infer_provider_from_url(base_url: str) -> str:
    """
    Infer provider from base URL.

    This allows users to set ANTHROPIC_BASE_URL to their provider's endpoint
    and have the correct provider be auto-detected.

    Args:
        base_url: The base URL set in ANTHROPIC_BASE_URL

    Returns:
        Provider name
    """
    url_lower = base_url.lower()

    if "openrouter.ai" in url_lower:
        return "openrouter"
    elif "bigmodel.cn" in url_lower:
        return "zai"
    else:
        return "anthropic"
