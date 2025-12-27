"""
Ollama LLM Provider
===================

Ollama LLM client implementation for Graphiti (using OpenAI-compatible interface).
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled


def create_ollama_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create Ollama LLM client (using OpenAI-compatible interface).

    Args:
        config: GraphitiConfig with Ollama settings

    Returns:
        Ollama LLM client instance

    Raises:
        ProviderNotInstalled: If graphiti-core is not installed
        ProviderError: If model is not specified
    """
    try:
        from graphiti_core.llm_client.config import LLMConfig
        from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Ollama provider requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    if not config.ollama_llm_model:
        raise ProviderError("Ollama provider requires OLLAMA_LLM_MODEL")

    # Ensure Ollama base URL ends with /v1 for OpenAI compatibility
    base_url = config.ollama_base_url
    if not base_url.endswith("/v1"):
        base_url = base_url.rstrip("/") + "/v1"

    llm_config = LLMConfig(
        api_key="ollama",  # Ollama requires a dummy API key
        model=config.ollama_llm_model,
        small_model=config.ollama_llm_model,
        base_url=base_url,
    )

    return OpenAIGenericClient(config=llm_config)
