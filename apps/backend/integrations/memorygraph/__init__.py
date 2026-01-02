"""
MemoryGraph Integration
=======================

Integration with MemoryGraph MCP server for invisible memory layer.
"""

from typing import TYPE_CHECKING

from .config import (
    MemoryGraphConfig,
    get_memorygraph_config,
    is_memorygraph_enabled,
)

# Type hints for lazy-loaded exports (helps static analyzers)
if TYPE_CHECKING:
    from .client import MemoryGraphClient as MemoryGraphClient
    from .context import get_context_for_subtask as get_context_for_subtask
    from .extractor import InsightExtractor as InsightExtractor
    from .formatting import format_context as format_context
    from .relationships import infer_relationships as infer_relationships
    from .storage import save_to_memorygraph as save_to_memorygraph

__all__ = [
    # Config (eagerly loaded)
    "is_memorygraph_enabled",
    "get_memorygraph_config",
    "MemoryGraphConfig",
    # Client (lazy loaded)
    "MemoryGraphClient",
    # Context retrieval (lazy loaded)
    "get_context_for_subtask",
    "format_context",
    # Storage (lazy loaded)
    "save_to_memorygraph",
    "InsightExtractor",
    "infer_relationships",
]


def __getattr__(name):
    """Lazy import to avoid requiring memorygraph package for config-only imports."""
    if name == "MemoryGraphClient":
        from .client import MemoryGraphClient

        return MemoryGraphClient
    elif name == "get_context_for_subtask":
        from .context import get_context_for_subtask

        return get_context_for_subtask
    elif name == "format_context":
        from .formatting import format_context

        return format_context
    elif name == "save_to_memorygraph":
        from .storage import save_to_memorygraph

        return save_to_memorygraph
    elif name == "InsightExtractor":
        from .extractor import InsightExtractor

        return InsightExtractor
    elif name == "infer_relationships":
        from .relationships import infer_relationships

        return infer_relationships
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
