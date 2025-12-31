"""
Base Provider Configuration Classes
====================================

Base classes and utilities for provider configuration.
Used by providers/config.py and integrations/graphiti/config.py
to eliminate duplication in provider enum and configuration patterns.
"""

import os
from dataclasses import dataclass
from enum import Enum


def parse_bool_env_var(value: str) -> bool:
    """
    Parse a boolean environment variable value.

    Accepts: true, 1, yes (case-insensitive)
    Rejects: all other values

    Args:
        value: The environment variable value string

    Returns:
        True if value is a truthy string, False otherwise
    """
    return value.lower() in ("true", "1", "yes")


def get_env_bool(key: str, default: bool = False) -> bool:
    """
    Get a boolean value from an environment variable.

    Args:
        key: Environment variable name
        default: Default value if not set (as string)

    Returns:
        Boolean value from environment variable
    """
    return parse_bool_env_var(os.environ.get(key, str(default)))


@dataclass
class BaseProviderConfig:
    """
    Base configuration class for providers.

    Provides common fields and methods shared across different
    provider configurations (model providers, LLM providers, embedder providers).
    """

    provider: str
    base_url: str
    api_key_env_var: str

    def get_api_key(self) -> str | None:
        """
        Get the API key from environment variable.

        Returns:
            The API key value if set, None otherwise
        """
        return os.environ.get(self.api_key_env_var, "")

    def is_configured(self) -> bool:
        """
        Check if this provider is properly configured with API key.

        Returns:
            True if API key is set, False otherwise
        """
        return bool(self.get_api_key())


def get_provider_config_by_name(
    provider_name: str,
    configs: dict[str, BaseProviderConfig],
    provider_type: str = "provider",
) -> BaseProviderConfig:
    """
    Get provider configuration by name from a config dict.

    This is a generic function that works with any provider config mapping,
    reducing duplication across different provider systems.

    Args:
        provider_name: The provider name to look up
        configs: Dictionary mapping provider names to BaseProviderConfig instances
        provider_type: Type name for error messages (e.g., "LLM", "embedder")

    Returns:
        The provider configuration

    Raises:
        ValueError: If provider_name is not found in configs
    """
    provider_key = provider_name.lower()
    if provider_key not in configs:
        available = list(configs.keys())
        raise ValueError(
            f"Unknown {provider_type} provider: {provider_name}. "
            f"Valid options: {available}"
        )
    return configs[provider_key]
