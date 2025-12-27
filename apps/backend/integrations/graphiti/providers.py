"""
Graphiti Multi-Provider Entry Point
====================================

Main entry point for Graphiti provider functionality.
This module re-exports all functionality from the graphiti_providers package.

The actual implementation has been refactored into a package structure:
- graphiti_providers/exceptions.py - Provider exceptions
- graphiti_providers/models.py - Embedding dimensions and constants
- graphiti_providers/llm_providers/ - LLM provider implementations
- graphiti_providers/embedder_providers/ - Embedder provider implementations
- graphiti_providers/cross_encoder.py - Cross-encoder/reranker
- graphiti_providers/validators.py - Validation and health checks
- graphiti_providers/utils.py - Utility functions
- graphiti_providers/factory.py - Factory functions

For backward compatibility, this module re-exports all public APIs.

Usage:
    from graphiti_providers import create_llm_client, create_embedder
    from graphiti_config import GraphitiConfig

    config = GraphitiConfig.from_env()
    llm_client = create_llm_client(config)
    embedder = create_embedder(config)
"""

# Re-export all public APIs from the package
from graphiti_providers import (
    # Models
    EMBEDDING_DIMENSIONS,
    # Exceptions
    ProviderError,
    ProviderNotInstalled,
    create_cross_encoder,
    create_embedder,
    # Factory functions
    create_llm_client,
    get_expected_embedding_dim,
    get_graph_hints,
    # Utilities
    is_graphiti_enabled,
    test_embedder_connection,
    test_llm_connection,
    test_ollama_connection,
    # Validators
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
