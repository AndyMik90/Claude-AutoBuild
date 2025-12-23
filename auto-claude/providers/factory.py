"""
Provider Factory
================

Factory for creating and managing LLM providers.
Provides a unified interface for accessing any configured provider.
"""

from typing import Any

from providers.base import LLMProvider, ProviderConfig, ProviderType

# Registry of provider creators
_PROVIDER_CREATORS: dict[ProviderType, type] = {}


def _register_providers():
    """Register all available providers."""
    global _PROVIDER_CREATORS

    # Import and register providers lazily to avoid import errors
    # when provider SDKs are not installed
    from providers.claude_provider import ClaudeProvider
    from providers.gemini_provider import GeminiProvider
    from providers.ollama_provider import OllamaProvider
    from providers.openai_provider import OpenAIProvider

    _PROVIDER_CREATORS = {
        ProviderType.CLAUDE: ClaudeProvider,
        ProviderType.OPENAI: OpenAIProvider,
        ProviderType.GEMINI: GeminiProvider,
        ProviderType.OLLAMA: OllamaProvider,
    }


def _ensure_registered():
    """Ensure providers are registered."""
    if not _PROVIDER_CREATORS:
        _register_providers()


def get_provider(
    provider_type: ProviderType | str | None = None,
    config: ProviderConfig | None = None,
) -> LLMProvider:
    """
    Get an LLM provider instance.

    Args:
        provider_type: Type of provider (ProviderType enum or string).
                      If None, defaults to Claude.
        config: Optional provider configuration. If not provided,
               configuration is loaded from environment variables.

    Returns:
        Configured LLMProvider instance

    Examples:
        # Get default Claude provider
        provider = get_provider()

        # Get OpenAI provider
        provider = get_provider(ProviderType.OPENAI)

        # Get provider by name
        provider = get_provider("gemini")

        # Get provider with custom config
        config = ProviderConfig(
            provider_type=ProviderType.OPENAI,
            api_key="sk-...",
            model="gpt-4o-mini",
        )
        provider = get_provider(config=config)
    """
    _ensure_registered()

    # Determine provider type
    if provider_type is None:
        if config is not None:
            provider_type = config.provider_type
        else:
            provider_type = ProviderType.CLAUDE

    # Convert string to enum if needed
    if isinstance(provider_type, str):
        try:
            provider_type = ProviderType(provider_type.lower())
        except ValueError:
            valid = [p.value for p in ProviderType]
            raise ValueError(
                f"Unknown provider: {provider_type}. Valid providers: {valid}"
            )

    # Get provider class
    if provider_type not in _PROVIDER_CREATORS:
        raise ValueError(f"Provider not registered: {provider_type}")

    provider_class = _PROVIDER_CREATORS[provider_type]

    # Create config if not provided
    if config is None:
        config = ProviderConfig.from_env(provider_type)

    return provider_class(config)


def list_providers() -> list[dict[str, Any]]:
    """
    List all available providers with their status.

    Returns:
        List of dicts with provider info and availability status
    """
    _ensure_registered()

    providers = []
    for provider_type in ProviderType:
        try:
            provider = get_provider(provider_type)
            providers.append(
                {
                    "name": provider_type.value,
                    "available": provider.is_available,
                    "model_info": provider.get_model_info(),
                    "validation_errors": provider.validate_config(),
                }
            )
        except Exception as e:
            providers.append(
                {
                    "name": provider_type.value,
                    "available": False,
                    "error": str(e),
                }
            )

    return providers


def get_provider_config(provider_type: ProviderType | str) -> ProviderConfig:
    """
    Get the configuration for a provider from environment variables.

    Args:
        provider_type: Type of provider

    Returns:
        ProviderConfig loaded from environment
    """
    if isinstance(provider_type, str):
        provider_type = ProviderType(provider_type.lower())

    return ProviderConfig.from_env(provider_type)


def validate_provider(provider_type: ProviderType | str) -> tuple[bool, list[str]]:
    """
    Validate a provider's configuration.

    Args:
        provider_type: Type of provider to validate

    Returns:
        Tuple of (is_valid, error_messages)
    """
    try:
        provider = get_provider(provider_type)
        errors = provider.validate_config()
        return len(errors) == 0, errors
    except Exception as e:
        return False, [str(e)]
