"""
Multi-LLM Provider Support
==========================

Provides a unified interface for multiple LLM providers (Claude, OpenAI, Gemini, Ollama).

Usage:
    from providers import get_provider, ProviderType

    # Get default Claude provider
    provider = get_provider()

    # Get specific provider
    provider = get_provider(ProviderType.OPENAI)

    # Get provider by name
    provider = get_provider("gemini")
"""

from providers.base import LLMProvider, ProviderConfig, ProviderType
from providers.factory import get_provider, get_provider_config, list_providers

__all__ = [
    "LLMProvider",
    "ProviderConfig",
    "ProviderType",
    "get_provider",
    "list_providers",
    "get_provider_config",
]
