"""
Z.ai LLM Provider
=================

Z.ai (Zhipu AI) LLM client implementation for Graphiti.
Uses OpenAI-compatible API.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ...config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_zai_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create Z.ai LLM client.

    Z.ai uses OpenAI-compatible API, so we use the OpenAI client
    with custom base URL.

    Args:
        config: GraphitiConfig with Z.ai settings

    Returns:
        OpenAI-compatible LLM client instance

    Raises:
        ProviderNotInstalled: If graphiti-core is not installed
        ProviderError: If API key is missing
    """
    try:
        from graphiti_core.llm_client.config import LLMConfig
        from graphiti_core.llm_client.openai_client import OpenAIClient
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Z.ai provider requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    if not config.zai_api_key:
        raise ProviderError("Z.ai provider requires ZAI_API_KEY")

    llm_config = LLMConfig(
        api_key=config.zai_api_key,
        model=config.zai_llm_model,
        base_url=config.zai_base_url,
    )

    # Z.ai uses OpenAI-compatible API
    # Disable reasoning/verbosity as they are specific to newer OpenAI models (o1/o3/gpt-5)
    return OpenAIClient(config=llm_config, reasoning=None, verbosity=None)
