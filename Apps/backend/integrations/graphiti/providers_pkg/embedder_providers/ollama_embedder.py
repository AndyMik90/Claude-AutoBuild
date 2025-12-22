"""
Ollama Embedder Provider
=========================

Ollama embedder implementation for Graphiti (using OpenAI-compatible interface).
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_ollama_embedder(config: "GraphitiConfig") -> Any:
    """
    Create Ollama embedder (using OpenAI-compatible interface).

    Args:
        config: GraphitiConfig with Ollama settings

    Returns:
        Ollama embedder instance

    Raises:
        ProviderNotInstalled: If graphiti-core is not installed
        ProviderError: If model is not specified
    """
    try:
        from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Ollama embedder requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    if not config.ollama_embedding_model:
        raise ProviderError("Ollama embedder requires OLLAMA_EMBEDDING_MODEL")

    # Ensure Ollama base URL ends with /v1 for OpenAI compatibility
    base_url = config.ollama_base_url
    if not base_url.endswith("/v1"):
        base_url = base_url.rstrip("/") + "/v1"

    embedder_config = OpenAIEmbedderConfig(
        api_key="ollama",  # Ollama requires a dummy API key
        embedding_model=config.ollama_embedding_model,
        embedding_dim=config.ollama_embedding_dim,
        base_url=base_url,
    )

    return OpenAIEmbedder(config=embedder_config)
