"""
Graphiti Multi-Provider Package
================================

Factory functions and utilities for creating LLM clients and embedders for Graphiti.
Supports multiple providers: OpenAI, Anthropic, Azure OpenAI, and Ollama.

This package provides:
- Lazy imports to avoid ImportError when provider packages not installed
- Factory functions that create the correct client based on provider selection
- Provider-specific configuration validation
- Graceful error handling with helpful messages
- Health checks and validation utilities
- Convenience functions for graph-based memory queries

Usage:
    from graphiti_providers import create_llm_client, create_embedder
    from graphiti_config import GraphitiConfig

    config = GraphitiConfig.from_env()
    llm_client = create_llm_client(config)
    embedder = create_embedder(config)
"""

# Core exceptions
# Cross-encoder / reranker
from .cross_encoder import create_cross_encoder
from .exceptions import ProviderError, ProviderNotInstalled

# Factory functions
from .factory import create_embedder, create_llm_client

# Models and constants
from .models import EMBEDDING_DIMENSIONS, get_expected_embedding_dim

# Utilities
from .utils import get_graph_hints, is_graphiti_enabled

# Validators and health checks
from .validators import (
    test_embedder_connection,
    test_llm_connection,
    test_ollama_connection,
    validate_embedding_config,
)

__all__ = [
    # Exceptions
    "ProviderError",
    "ProviderNotInstalled",
    # Factory functions
    "create_llm_client",
    "create_embedder",
    "create_cross_encoder",
    # Models
    "EMBEDDING_DIMENSIONS",
    "get_expected_embedding_dim",
    # Validators
    "validate_embedding_config",
    "test_llm_connection",
    "test_embedder_connection",
    "test_ollama_connection",
    # Utilities
    "is_graphiti_enabled",
    "get_graph_hints",
]
