"""
OpenAI LLM Provider
===================

OpenAI LLM client implementation for Graphiti.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_openai_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create OpenAI LLM client.

    Args:
        config: GraphitiConfig with OpenAI settings

    Returns:
        OpenAI LLM client instance

    Raises:
        ProviderNotInstalled: If graphiti-core is not installed
        ProviderError: If API key is missing
    """
    if not config.openai_api_key:
        raise ProviderError("OpenAI provider requires OPENAI_API_KEY")

    try:
        from graphiti_core.llm_client.config import LLMConfig
        from graphiti_core.llm_client.openai_client import OpenAIClient
    except ImportError as e:
        raise ProviderNotInstalled(
            f"OpenAI provider requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    llm_config = LLMConfig(
        api_key=config.openai_api_key,
        model=config.openai_model,
    )

    # GPT-5 family and o1/o3 models support reasoning/verbosity params
    model_lower = config.openai_model.lower()
    supports_reasoning = (
        model_lower.startswith("gpt-5")
        or model_lower.startswith("o1")
        or model_lower.startswith("o3")
    )

    if supports_reasoning:
        # Use defaults for models that support reasoning params
        return OpenAIClient(config=llm_config)
    else:
        # Disable reasoning/verbosity for older models that don't support them
        return OpenAIClient(config=llm_config, reasoning=None, verbosity=None)
