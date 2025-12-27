"""
Anthropic LLM Provider
======================

Anthropic LLM client implementation for Graphiti.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_anthropic_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create Anthropic LLM client.

    Args:
        config: GraphitiConfig with Anthropic settings

    Returns:
        Anthropic LLM client instance

    Raises:
        ProviderNotInstalled: If graphiti-core[anthropic] is not installed
        ProviderError: If API key is missing
    """
    try:
        from graphiti_core.llm_client.anthropic_client import AnthropicClient
        from graphiti_core.llm_client.config import LLMConfig
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Anthropic provider requires graphiti-core[anthropic]. "
            f"Install with: pip install graphiti-core[anthropic]\n"
            f"Error: {e}"
        )

    if not config.anthropic_api_key:
        raise ProviderError("Anthropic provider requires ANTHROPIC_API_KEY")

    llm_config = LLMConfig(
        api_key=config.anthropic_api_key,
        model=config.anthropic_model,
    )

    return AnthropicClient(config=llm_config)
