"""
Graphiti Integration
====================

Integration with Graphiti knowledge graph for semantic memory.
"""

# Config imports don't require graphiti package
from .config import GraphitiConfig, validate_graphiti_config

# Lazy imports for components that require graphiti package
__all__ = [
    "GraphitiConfig",
    "validate_graphiti_config",
    "GraphitiMemory",
    "create_llm_client",
    "create_embedder",
]


def __getattr__(name):
    """Lazy import to avoid requiring graphiti package for config-only imports."""
    if name == "GraphitiMemory":
        from .memory import GraphitiMemory

        return GraphitiMemory
    elif name == "create_llm_client":
        from .providers import create_llm_client

        return create_llm_client
    elif name == "create_embedder":
        from .providers import create_embedder

        return create_embedder
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
