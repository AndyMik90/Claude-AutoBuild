"""
Voyage AI Embedder Provider
===========================

Voyage AI embedder implementation for Graphiti (commonly used with Anthropic LLM).
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_voyage_embedder(config: "GraphitiConfig") -> Any:
    """
    Create Voyage AI embedder (commonly used with Anthropic LLM).

    Args:
        config: GraphitiConfig with Voyage AI settings

    Returns:
        Voyage AI embedder instance

    Raises:
        ProviderNotInstalled: If graphiti-core[voyage] is not installed
        ProviderError: If API key is missing
    """
    try:
        from graphiti_core.embedder.voyage import VoyageAIConfig, VoyageEmbedder
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Voyage embedder requires graphiti-core[voyage]. "
            f"Install with: pip install graphiti-core[voyage]\n"
            f"Error: {e}"
        )

    if not config.voyage_api_key:
        raise ProviderError("Voyage embedder requires VOYAGE_API_KEY")

    voyage_config = VoyageAIConfig(
        api_key=config.voyage_api_key,
        embedding_model=config.voyage_embedding_model,
    )

    return VoyageEmbedder(config=voyage_config)
