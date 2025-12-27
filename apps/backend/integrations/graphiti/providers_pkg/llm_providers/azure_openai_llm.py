"""
Azure OpenAI LLM Provider
==========================

Azure OpenAI LLM client implementation for Graphiti.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_azure_openai_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create Azure OpenAI LLM client.

    Args:
        config: GraphitiConfig with Azure OpenAI settings

    Returns:
        Azure OpenAI LLM client instance

    Raises:
        ProviderNotInstalled: If required packages are not installed
        ProviderError: If required configuration is missing
    """
    try:
        from graphiti_core.llm_client.azure_openai_client import AzureOpenAILLMClient
        from graphiti_core.llm_client.config import LLMConfig
        from openai import AsyncOpenAI
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Azure OpenAI provider requires graphiti-core and openai. "
            f"Install with: pip install graphiti-core openai\n"
            f"Error: {e}"
        )

    if not config.azure_openai_api_key:
        raise ProviderError("Azure OpenAI provider requires AZURE_OPENAI_API_KEY")
    if not config.azure_openai_base_url:
        raise ProviderError("Azure OpenAI provider requires AZURE_OPENAI_BASE_URL")
    if not config.azure_openai_llm_deployment:
        raise ProviderError(
            "Azure OpenAI provider requires AZURE_OPENAI_LLM_DEPLOYMENT"
        )

    azure_client = AsyncOpenAI(
        base_url=config.azure_openai_base_url,
        api_key=config.azure_openai_api_key,
    )

    llm_config = LLMConfig(
        model=config.azure_openai_llm_deployment,
        small_model=config.azure_openai_llm_deployment,
    )

    return AzureOpenAILLMClient(azure_client=azure_client, config=llm_config)
