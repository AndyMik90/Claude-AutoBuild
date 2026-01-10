"""
Z.ai Embedder Provider
======================

Z.ai (Zhipu AI) embedder implementation for Graphiti.
Uses OpenAI-compatible embedding API.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ...config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_zai_embedder(config: "GraphitiConfig") -> Any:
    """
    Create Z.ai embedder client.

    Z.ai uses OpenAI-compatible API, so we use the OpenAI embedder
    with custom base URL.

    Args:
        config: GraphitiConfig with Z.ai settings

    Returns:
        OpenAI-compatible embedder instance

    Raises:
        ProviderNotInstalled: If graphiti-core is not installed
        ProviderError: If API key is missing
    """
    try:
        from graphiti_core.embedder import EmbedderConfig, OpenAIEmbedder
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Z.ai provider requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    if not config.zai_api_key:
        raise ProviderError("Z.ai provider requires ZAI_API_KEY")

    # Use standard EmbedderConfig which supports base_url
    embedder_config = EmbedderConfig(
        api_key=config.zai_api_key,
        model=config.zai_embedding_model,
        base_url=config.zai_base_url,
    )

    return OpenAIEmbedder(config=embedder_config)
