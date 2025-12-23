"""
Embedder Provider Implementations
==================================

Individual embedder provider implementations for Graphiti.
"""

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from graphiti_config import GraphitiConfig

from .azure_openai_embedder import create_azure_openai_embedder
from .google_embedder import create_google_embedder
from .ollama_embedder import (
    KNOWN_OLLAMA_EMBEDDING_MODELS,
    create_ollama_embedder,
    get_embedding_dim_for_model,
)
from .openai_embedder import create_openai_embedder
from .openrouter_embedder import create_openrouter_embedder
from .voyage_embedder import create_voyage_embedder

__all__ = [
    "create_openai_embedder",
    "create_voyage_embedder",
    "create_azure_openai_embedder",
    "create_ollama_embedder",
    "create_google_embedder",
    "create_openrouter_embedder",
    "KNOWN_OLLAMA_EMBEDDING_MODELS",
    "get_embedding_dim_for_model",
]
