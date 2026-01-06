"""
Graphiti Memory Stub
====================

This stub module re-exports from the modular graphiti integration.
It provides backward compatibility for imports like:
    from graphiti_memory import GraphitiMemory, is_graphiti_enabled

For new code, prefer importing directly:
    from integrations.graphiti.memory import GraphitiMemory
"""

# Re-export everything from the modular integration
from integrations.graphiti.memory import (
    EPISODE_TYPE_CODEBASE_DISCOVERY,
    EPISODE_TYPE_GOTCHA,
    EPISODE_TYPE_HISTORICAL_CONTEXT,
    EPISODE_TYPE_PATTERN,
    EPISODE_TYPE_QA_RESULT,
    EPISODE_TYPE_SESSION_INSIGHT,
    EPISODE_TYPE_TASK_OUTCOME,
    MAX_CONTEXT_RESULTS,
    GraphitiMemory,
    GroupIdMode,
    get_graphiti_memory,
    is_graphiti_enabled,
    test_graphiti_connection,
    test_provider_configuration,
)

__all__ = [
    "GraphitiMemory",
    "GroupIdMode",
    "get_graphiti_memory",
    "is_graphiti_enabled",
    "test_graphiti_connection",
    "test_provider_configuration",
    "MAX_CONTEXT_RESULTS",
    "EPISODE_TYPE_SESSION_INSIGHT",
    "EPISODE_TYPE_CODEBASE_DISCOVERY",
    "EPISODE_TYPE_PATTERN",
    "EPISODE_TYPE_GOTCHA",
    "EPISODE_TYPE_TASK_OUTCOME",
    "EPISODE_TYPE_QA_RESULT",
    "EPISODE_TYPE_HISTORICAL_CONTEXT",
]
