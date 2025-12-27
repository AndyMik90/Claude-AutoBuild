"""
Azure OpenAI Embedder Provider
===============================

Azure OpenAI embedder implementation for Graphiti.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_azure_openai_embedder(config: "GraphitiConfig") -> Any:
    """
    Create Azure OpenAI embedder.

    Args:
        config: GraphitiConfig with Azure OpenAI settings

    Returns:
        Azure OpenAI embedder instance

    Raises:
        ProviderNotInstalled: If required packages are not installed
        ProviderError: If required configuration is missing
    """
    try:
        from graphiti_core.embedder.azure_openai import AzureOpenAIEmbedderClient
        from openai import AsyncOpenAI
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Azure OpenAI embedder requires graphiti-core and openai. "
            f"Install with: pip install graphiti-core openai\n"
            f"Error: {e}"
        )

    if not config.azure_openai_api_key:
        raise ProviderError("Azure OpenAI embedder requires AZURE_OPENAI_API_KEY")
    if not config.azure_openai_base_url:
        raise ProviderError("Azure OpenAI embedder requires AZURE_OPENAI_BASE_URL")
    if not config.azure_openai_embedding_deployment:
        raise ProviderError(
            "Azure OpenAI embedder requires AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
        )

    azure_client = AsyncOpenAI(
        base_url=config.azure_openai_base_url,
        api_key=config.azure_openai_api_key,
    )

    return AzureOpenAIEmbedderClient(
        azure_client=azure_client,
        model=config.azure_openai_embedding_deployment,
    )
