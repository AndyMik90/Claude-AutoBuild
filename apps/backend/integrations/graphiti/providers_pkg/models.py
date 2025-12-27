"""
Graphiti Provider Models and Constants
=======================================

Embedding dimensions and model constants for different providers.
"""

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


def get_expected_embedding_dim(model: str) -> int | None:
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
