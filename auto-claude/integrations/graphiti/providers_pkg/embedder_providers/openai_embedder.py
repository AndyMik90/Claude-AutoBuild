"""
OpenAI Embedder Provider
========================

OpenAI embedder implementation for Graphiti.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_openai_embedder(config: "GraphitiConfig") -> Any:
    """
    Create OpenAI embedder.

    Args:
        config: GraphitiConfig with OpenAI settings

    Returns:
        OpenAI embedder instance

    Raises:
        ProviderNotInstalled: If graphiti-core is not installed
        ProviderError: If API key is missing
    """
    try:
        from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    except ImportError as e:
        raise ProviderNotInstalled(
            f"OpenAI embedder requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    if not config.openai_api_key:
        raise ProviderError("OpenAI embedder requires OPENAI_API_KEY")

    embedder_config = OpenAIEmbedderConfig(
        api_key=config.openai_api_key,
        embedding_model=config.openai_embedding_model,
    )

    return OpenAIEmbedder(config=embedder_config)
