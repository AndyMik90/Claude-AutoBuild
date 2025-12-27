"""
Ollama Embedder Provider
=========================

Ollama embedder implementation for Graphiti (using OpenAI-compatible interface).

Supported models with known dimensions:
- embeddinggemma (768) - Google's lightweight embedding model
- qwen3-embedding:0.6b (1024) - Qwen3 small embedding model
- qwen3-embedding:4b (2560) - Qwen3 medium embedding model
- qwen3-embedding:8b (4096) - Qwen3 large embedding model
- nomic-embed-text (768) - Nomic's embedding model
- mxbai-embed-large (1024) - MixedBread AI large embedding model
- bge-large (1024) - BAAI general embedding large
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from ..exceptions import ProviderError, ProviderNotInstalled

# Known Ollama embedding models and their default dimensions
# Users can override with OLLAMA_EMBEDDING_DIM env var
KNOWN_OLLAMA_EMBEDDING_MODELS: dict[str, int] = {
    # Google EmbeddingGemma (supports 128-768 via MRL)
    "embeddinggemma": 768,
    "embeddinggemma:300m": 768,
    # Qwen3 Embedding series (support flexible dimensions)
    "qwen3-embedding": 1024,  # Default tag uses 0.6b
    "qwen3-embedding:0.6b": 1024,
    "qwen3-embedding:4b": 2560,
    "qwen3-embedding:8b": 4096,
    # Other popular models
    "nomic-embed-text": 768,
    "nomic-embed-text:latest": 768,
    "mxbai-embed-large": 1024,
    "mxbai-embed-large:latest": 1024,
    "bge-large": 1024,
    "bge-large:latest": 1024,
    "bge-m3": 1024,
    "bge-m3:latest": 1024,
    "all-minilm": 384,
    "all-minilm:latest": 384,
}


def get_embedding_dim_for_model(model_name: str, configured_dim: int = 0) -> int:
    """
    Get the embedding dimension for an Ollama model.

    Args:
        model_name: The Ollama model name (e.g., "embeddinggemma", "qwen3-embedding:8b")
        configured_dim: User-configured dimension (takes precedence if > 0)

    Returns:
        Embedding dimension to use

    Raises:
        ProviderError: If model is unknown and no dimension configured
    """
    # User override takes precedence
    if configured_dim > 0:
        return configured_dim

    # Check known models (exact match first)
    if model_name in KNOWN_OLLAMA_EMBEDDING_MODELS:
        return KNOWN_OLLAMA_EMBEDDING_MODELS[model_name]

    # Try without tag suffix
    base_name = model_name.split(":")[0]
    if base_name in KNOWN_OLLAMA_EMBEDDING_MODELS:
        return KNOWN_OLLAMA_EMBEDDING_MODELS[base_name]

    raise ProviderError(
        f"Unknown Ollama embedding model: {model_name}. "
        f"Please set OLLAMA_EMBEDDING_DIM or use a known model: "
        f"{', '.join(sorted(set(k.split(':')[0] for k in KNOWN_OLLAMA_EMBEDDING_MODELS.keys())))}"
    )


def create_ollama_embedder(config: "GraphitiConfig") -> Any:
    """
    Create Ollama embedder (using OpenAI-compatible interface).

    Args:
        config: GraphitiConfig with Ollama settings

    Returns:
        Ollama embedder instance

    Raises:
        ProviderNotInstalled: If graphiti-core is not installed
        ProviderError: If model is not specified
    """
    if not config.ollama_embedding_model:
        raise ProviderError("Ollama embedder requires OLLAMA_EMBEDDING_MODEL")

    try:
        from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
    except ImportError as e:
        raise ProviderNotInstalled(
            f"Ollama embedder requires graphiti-core. "
            f"Install with: pip install graphiti-core\n"
            f"Error: {e}"
        )

    # Get embedding dimension (auto-detect for known models, or use configured value)
    embedding_dim = get_embedding_dim_for_model(
        config.ollama_embedding_model,
        config.ollama_embedding_dim,
    )

    # Ensure Ollama base URL ends with /v1 for OpenAI compatibility
    base_url = config.ollama_base_url
    if not base_url.endswith("/v1"):
        base_url = base_url.rstrip("/") + "/v1"

    embedder_config = OpenAIEmbedderConfig(
        api_key="ollama",  # Ollama requires a dummy API key
        embedding_model=config.ollama_embedding_model,
        embedding_dim=embedding_dim,
        base_url=base_url,
    )

    return OpenAIEmbedder(config=embedder_config)
