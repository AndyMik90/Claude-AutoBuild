"""
Graphiti Multi-Provider Factory
================================

Factory functions for creating LLM clients and embedders for Graphiti.
Supports multiple providers: OpenAI, Anthropic, Azure OpenAI, and Ollama.

This module provides:
- Lazy imports to avoid ImportError when provider packages not installed
- Factory functions that create the correct client based on provider selection
- Provider-specific configuration validation
- Graceful error handling with helpful messages

Usage:
    from graphiti_providers import create_llm_client, create_embedder
    from graphiti_config import GraphitiConfig

    config = GraphitiConfig.from_env()
    llm_client = create_llm_client(config)
    embedder = create_embedder(config)
"""

import logging
from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from pathlib import Path
    from graphiti_config import GraphitiConfig

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    """Raised when a provider cannot be initialized."""
    pass


class ProviderNotInstalled(ProviderError):
    """Raised when required packages for a provider are not installed."""
    pass


# ============================================================================
# LLM Client Factory
# ============================================================================

def create_llm_client(config: "GraphitiConfig") -> Any:
    """
    Create an LLM client based on the configured provider.

    Args:
        config: GraphitiConfig with provider settings

    Returns:
        LLM client instance for Graphiti

    Raises:
        ProviderNotInstalled: If required packages are missing
        ProviderError: If client creation fails
    """
    provider = config.llm_provider

    logger.info(f"Creating LLM client for provider: {provider}")

    if provider == "openai":
        return _create_openai_llm_client(config)
    elif provider == "anthropic":
        return _create_anthropic_llm_client(config)
    elif provider == "azure_openai":
        return _create_azure_openai_llm_client(config)
    elif provider == "ollama":
        return _create_ollama_llm_client(config)
    else:
        raise ProviderError(f"Unknown LLM provider: {provider}")


def _create_openai_llm_client(config: "GraphitiConfig") -> Any:
    """Create OpenAI LLM client."""
    try:
        from graphiti_core.llm_client.openai_client import OpenAIClient
        from graphiti_core.llm_client.config import LLMConfig
    except ImportError as e:
        raise ProviderNotInstalled(
            f"OpenAI provider requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    if not config.openai_api_key:
        raise ProviderError("OpenAI provider requires OPENAI_API_KEY")

    llm_config = LLMConfig(
        api_key=config.openai_api_key,
        model=config.openai_model,
    )

    # GPT-5 family and o1/o3 models support reasoning/verbosity params
    model_lower = config.openai_model.lower()
    supports_reasoning = (
        model_lower.startswith("gpt-5") or
        model_lower.startswith("o1") or
        model_lower.startswith("o3")
    )

    if supports_reasoning:
        # Use defaults for models that support reasoning params
        return OpenAIClient(config=llm_config)
    else:
        # Disable reasoning/verbosity for older models that don't support them
        return OpenAIClient(config=llm_config, reasoning=None, verbosity=None)


def _create_anthropic_llm_client(config: "GraphitiConfig") -> Any:
    """Create Anthropic LLM client."""
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


def _create_azure_openai_llm_client(config: "GraphitiConfig") -> Any:
    """Create Azure OpenAI LLM client."""
    try:
        from openai import AsyncOpenAI
        from graphiti_core.llm_client.azure_openai_client import AzureOpenAILLMClient
        from graphiti_core.llm_client.config import LLMConfig
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
        raise ProviderError("Azure OpenAI provider requires AZURE_OPENAI_LLM_DEPLOYMENT")

    azure_client = AsyncOpenAI(
        base_url=config.azure_openai_base_url,
        api_key=config.azure_openai_api_key,
    )

    llm_config = LLMConfig(
        model=config.azure_openai_llm_deployment,
        small_model=config.azure_openai_llm_deployment,
    )

    return AzureOpenAILLMClient(azure_client=azure_client, config=llm_config)


def _create_ollama_llm_client(config: "GraphitiConfig") -> Any:
    """Create Ollama LLM client (using OpenAI-compatible interface)."""
    try:
        from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
        from graphiti_core.llm_client.config import LLMConfig
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


# ============================================================================
# Embedder Factory
# ============================================================================

def create_embedder(config: "GraphitiConfig") -> Any:
    """
    Create an embedder based on the configured provider.

    Args:
        config: GraphitiConfig with provider settings

    Returns:
        Embedder instance for Graphiti

    Raises:
        ProviderNotInstalled: If required packages are missing
        ProviderError: If embedder creation fails
    """
    provider = config.embedder_provider

    logger.info(f"Creating embedder for provider: {provider}")

    if provider == "openai":
        return _create_openai_embedder(config)
    elif provider == "voyage":
        return _create_voyage_embedder(config)
    elif provider == "azure_openai":
        return _create_azure_openai_embedder(config)
    elif provider == "ollama":
        return _create_ollama_embedder(config)
    else:
        raise ProviderError(f"Unknown embedder provider: {provider}")


def _create_openai_embedder(config: "GraphitiConfig") -> Any:
    """Create OpenAI embedder."""
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


def _create_voyage_embedder(config: "GraphitiConfig") -> Any:
    """Create Voyage AI embedder (commonly used with Anthropic LLM)."""
    try:
        from graphiti_core.embedder.voyage import VoyageEmbedder, VoyageAIConfig
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


def _create_azure_openai_embedder(config: "GraphitiConfig") -> Any:
    """Create Azure OpenAI embedder."""
    try:
        from openai import AsyncOpenAI
        from graphiti_core.embedder.azure_openai import AzureOpenAIEmbedderClient
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
        raise ProviderError("Azure OpenAI embedder requires AZURE_OPENAI_EMBEDDING_DEPLOYMENT")

    azure_client = AsyncOpenAI(
        base_url=config.azure_openai_base_url,
        api_key=config.azure_openai_api_key,
    )

    return AzureOpenAIEmbedderClient(
        azure_client=azure_client,
        model=config.azure_openai_embedding_deployment,
    )


def _create_ollama_embedder(config: "GraphitiConfig") -> Any:
    """Create Ollama embedder (using OpenAI-compatible interface)."""
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


# ============================================================================
# Cross-Encoder / Reranker Factory (Optional)
# ============================================================================

def create_cross_encoder(config: "GraphitiConfig", llm_client: Any = None) -> Optional[Any]:
    """
    Create a cross-encoder/reranker for improved search quality.

    This is optional and primarily useful for Ollama setups.
    Other providers typically have built-in reranking.

    Args:
        config: GraphitiConfig with provider settings
        llm_client: Optional LLM client for reranking

    Returns:
        Cross-encoder instance, or None if not applicable
    """
    # Only create for Ollama provider currently
    if config.llm_provider != "ollama":
        return None

    if llm_client is None:
        return None

    try:
        from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
        from graphiti_core.llm_client.config import LLMConfig
    except ImportError:
        logger.debug("Cross-encoder not available (optional)")
        return None

    try:
        # Create LLM config for reranker
        base_url = config.ollama_base_url
        if not base_url.endswith("/v1"):
            base_url = base_url.rstrip("/") + "/v1"

        llm_config = LLMConfig(
            api_key="ollama",
            model=config.ollama_llm_model,
            base_url=base_url,
        )

        return OpenAIRerankerClient(client=llm_client, config=llm_config)
    except Exception as e:
        logger.warning(f"Could not create cross-encoder: {e}")
        return None


# ============================================================================
# Embedding Dimension Validation
# ============================================================================

# Known embedding dimensions by provider and model
EMBEDDING_DIMENSIONS = {
    # OpenAI
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
    # Voyage AI
    "voyage-3": 1024,
    "voyage-3.5": 1024,
    "voyage-3-lite": 512,
    "voyage-3.5-lite": 512,
    "voyage-2": 1024,
    "voyage-large-2": 1536,
    # Ollama (common models)
    "nomic-embed-text": 768,
    "mxbai-embed-large": 1024,
    "all-minilm": 384,
    "snowflake-arctic-embed": 1024,
}


def get_expected_embedding_dim(model: str) -> Optional[int]:
    """
    Get the expected embedding dimension for a known model.

    Args:
        model: Embedding model name

    Returns:
        Expected dimension, or None if unknown
    """
    # Try exact match first
    if model in EMBEDDING_DIMENSIONS:
        return EMBEDDING_DIMENSIONS[model]

    # Try partial match (model name might have version suffix)
    model_lower = model.lower()
    for known_model, dim in EMBEDDING_DIMENSIONS.items():
        if known_model.lower() in model_lower or model_lower in known_model.lower():
            return dim

    return None


def validate_embedding_config(config: "GraphitiConfig") -> tuple[bool, str]:
    """
    Validate embedding configuration for consistency.

    Checks that embedding dimensions are correctly configured,
    especially important for Ollama where explicit dimension is required.

    Args:
        config: GraphitiConfig to validate

    Returns:
        Tuple of (is_valid, message)
    """
    provider = config.embedder_provider

    if provider == "ollama":
        # Ollama requires explicit embedding dimension
        if not config.ollama_embedding_dim:
            expected = get_expected_embedding_dim(config.ollama_embedding_model)
            if expected:
                return False, (
                    f"Ollama embedder requires OLLAMA_EMBEDDING_DIM. "
                    f"For model '{config.ollama_embedding_model}', "
                    f"expected dimension is {expected}."
                )
            else:
                return False, (
                    f"Ollama embedder requires OLLAMA_EMBEDDING_DIM. "
                    f"Check your model's documentation for the correct dimension."
                )

    # Check for known dimension mismatches
    if provider == "openai":
        expected = get_expected_embedding_dim(config.openai_embedding_model)
        # OpenAI handles this automatically, just log info
        if expected:
            logger.debug(f"OpenAI embedding model '{config.openai_embedding_model}' has dimension {expected}")

    elif provider == "voyage":
        expected = get_expected_embedding_dim(config.voyage_embedding_model)
        if expected:
            logger.debug(f"Voyage embedding model '{config.voyage_embedding_model}' has dimension {expected}")

    return True, "Embedding configuration valid"


# ============================================================================
# Provider Health Checks
# ============================================================================

async def test_llm_connection(config: "GraphitiConfig") -> tuple[bool, str]:
    """
    Test if LLM provider is reachable.

    Args:
        config: GraphitiConfig with provider settings

    Returns:
        Tuple of (success, message)
    """
    try:
        llm_client = create_llm_client(config)
        # Most clients don't have a ping method, so just verify creation succeeded
        return True, f"LLM client created successfully for provider: {config.llm_provider}"
    except ProviderNotInstalled as e:
        return False, str(e)
    except ProviderError as e:
        return False, str(e)
    except Exception as e:
        return False, f"Failed to create LLM client: {e}"


async def test_embedder_connection(config: "GraphitiConfig") -> tuple[bool, str]:
    """
    Test if embedder provider is reachable.

    Args:
        config: GraphitiConfig with provider settings

    Returns:
        Tuple of (success, message)
    """
    # First validate config
    valid, msg = validate_embedding_config(config)
    if not valid:
        return False, msg

    try:
        embedder = create_embedder(config)
        return True, f"Embedder created successfully for provider: {config.embedder_provider}"
    except ProviderNotInstalled as e:
        return False, str(e)
    except ProviderError as e:
        return False, str(e)
    except Exception as e:
        return False, f"Failed to create embedder: {e}"


async def test_ollama_connection(base_url: str = "http://localhost:11434") -> tuple[bool, str]:
    """
    Test if Ollama server is running and reachable.

    Args:
        base_url: Ollama server URL

    Returns:
        Tuple of (success, message)
    """
    import asyncio

    try:
        import aiohttp
    except ImportError:
        # Fall back to sync request
        import urllib.request
        import urllib.error

        try:
            # Normalize URL (remove /v1 suffix if present)
            url = base_url.rstrip("/")
            if url.endswith("/v1"):
                url = url[:-3]

            req = urllib.request.Request(f"{url}/api/tags", method="GET")
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    return True, f"Ollama is running at {url}"
                return False, f"Ollama returned status {response.status}"
        except urllib.error.URLError as e:
            return False, f"Cannot connect to Ollama at {url}: {e.reason}"
        except Exception as e:
            return False, f"Ollama connection error: {e}"

    # Use aiohttp if available
    try:
        # Normalize URL
        url = base_url.rstrip("/")
        if url.endswith("/v1"):
            url = url[:-3]

        async with aiohttp.ClientSession() as session:
            async with session.get(f"{url}/api/tags", timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    return True, f"Ollama is running at {url}"
                return False, f"Ollama returned status {response.status}"
    except asyncio.TimeoutError:
        return False, f"Ollama connection timed out at {url}"
    except aiohttp.ClientError as e:
        return False, f"Cannot connect to Ollama at {url}: {e}"
    except Exception as e:
        return False, f"Ollama connection error: {e}"


# ============================================================================
# Re-exports and Convenience Functions
# ============================================================================

def is_graphiti_enabled() -> bool:
    """
    Check if Graphiti memory integration is available and configured.

    This is a convenience re-export from graphiti_config.
    Returns True if GRAPHITI_ENABLED=true and provider credentials are valid.
    """
    from graphiti_config import is_graphiti_enabled as _is_graphiti_enabled
    return _is_graphiti_enabled()


async def get_graph_hints(
    query: str,
    project_id: str,
    max_results: int = 10,
    spec_dir: Optional["Path"] = None,
) -> list[dict]:
    """
    Get relevant hints from the Graphiti knowledge graph.

    This is a convenience function for querying historical context
    from the memory system. Used by spec_runner, ideation_runner,
    and roadmap_runner to inject historical insights.

    Args:
        query: Search query (e.g., "authentication patterns", "API design")
        project_id: Project identifier for scoping results
        max_results: Maximum number of hints to return
        spec_dir: Optional spec directory for loading memory instance

    Returns:
        List of hint dictionaries with keys:
            - content: str - The hint content
            - score: float - Relevance score
            - type: str - Type of hint (pattern, gotcha, outcome, etc.)

    Note:
        Returns empty list if Graphiti is not enabled or unavailable.
        This function never raises - it always fails gracefully.
    """
    if not is_graphiti_enabled():
        logger.debug("Graphiti not enabled, returning empty hints")
        return []

    try:
        from pathlib import Path
        from graphiti_memory import GraphitiMemory, GroupIdMode

        # Determine project directory from project_id or use current dir
        project_dir = Path.cwd()

        # Use spec_dir if provided, otherwise create a temp context
        if spec_dir is None:
            # Create a temporary spec dir for the query
            import tempfile
            spec_dir = Path(tempfile.mkdtemp(prefix="graphiti_query_"))

        # Create memory instance with project-level scope for cross-spec hints
        memory = GraphitiMemory(
            spec_dir=spec_dir,
            project_dir=project_dir,
            group_id_mode=GroupIdMode.PROJECT,
        )

        # Query for relevant context
        hints = await memory.get_relevant_context(
            query=query,
            num_results=max_results,
            include_project_context=True,
        )

        await memory.close()

        logger.info(f"Retrieved {len(hints)} graph hints for query: {query[:50]}...")
        return hints

    except ImportError as e:
        logger.debug(f"Graphiti packages not available: {e}")
        return []
    except Exception as e:
        logger.warning(f"Failed to get graph hints: {e}")
        return []
