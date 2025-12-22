"""
Graphiti config module facade.

Provides Graphiti configuration functionality.
Re-exports from integrations.graphiti.config for clean imports.
"""

from integrations.graphiti.config import (
    get_graphiti_status,
    is_graphiti_enabled,
)

__all__ = [
    "get_graphiti_status",
    "is_graphiti_enabled",
]
