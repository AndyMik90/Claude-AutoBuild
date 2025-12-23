"""
Graphiti Provider Factory Functions
====================================

Factory functions for creating LLM clients and embedders.
"""

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from .embedder_providers import (
    create_azure_openai_embedder,
    create_google_embedder,
    create_ollama_embedder,
    create_openai_embedder,
    create_openrouter_embedder,
    create_voyage_embedder,
)
from .exceptions import ProviderError
from .llm_providers import (
    create_anthropic_llm_client,
    create_azure_openai_llm_client,
    create_google_llm_client,
    create_ollama_llm_client,
    create_openai_llm_client,
    create_openrouter_llm_client,
)

logger = logging.getLogger(__name__)


def create_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create an LLM client based on the configured provider.

    Args:
        config: GraphitiConfig with provider settings

    Returns:
        LLM client instance for Graphiti

    Raises:
        ProviderNotInstalled: If required packages are missing
        ProviderError: If client creation fails
    """
    provider = config.llm_provider

    logger.info(f"Creating LLM client for provider: {provider}")

    if provider == "openai":
        return create_openai_llm_client(config)
    elif provider == "anthropic":
        return create_anthropic_llm_client(config)
    elif provider == "azure_openai":
        return create_azure_openai_llm_client(config)
    elif provider == "ollama":
        return create_ollama_llm_client(config)
    elif provider == "google":
        return create_google_llm_client(config)
    elif provider == "openrouter":
        return create_openrouter_llm_client(config)
    else:
        raise ProviderError(f"Unknown LLM provider: {provider}")


def create_embedder(config: "GraphitiConfig") -> Any:
    """
    Create an embedder based on the configured provider.

    Args:
        config: GraphitiConfig with provider settings

    Returns:
        Embedder instance for Graphiti

    Raises:
        ProviderNotInstalled: If required packages are missing
        ProviderError: If embedder creation fails
    """
    provider = config.embedder_provider

    logger.info(f"Creating embedder for provider: {provider}")

    if provider == "openai":
        return create_openai_embedder(config)
    elif provider == "voyage":
        return create_voyage_embedder(config)
    elif provider == "azure_openai":
        return create_azure_openai_embedder(config)
    elif provider == "ollama":
        return create_ollama_embedder(config)
    elif provider == "google":
        return create_google_embedder(config)
    elif provider == "openrouter":
        return create_openrouter_embedder(config)
    else:
        raise ProviderError(f"Unknown embedder provider: {provider}")
