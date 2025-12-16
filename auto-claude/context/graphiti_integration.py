"""
Graphiti Knowledge Graph Integration
======================================

Integration with Graphiti for historical hints and cross-session context.
"""

# Import graphiti providers for optional historical hints
try:
    from graphiti_providers import get_graph_hints, is_graphiti_enabled

    GRAPHITI_AVAILABLE = True
except ImportError:
    GRAPHITI_AVAILABLE = False

    def is_graphiti_enabled() -> bool:
        return False

    async def get_graph_hints(
        query: str, project_id: str, max_results: int = 10
    ) -> list:
        return []


async def fetch_graph_hints(
    query: str, project_id: str, max_results: int = 5
) -> list[dict]:
    """
    Get historical hints from Graphiti knowledge graph.

    This provides context from past sessions and similar tasks.

    Args:
        query: The task description or query to search for
        project_id: The project identifier (typically project path)
        max_results: Maximum number of hints to return

    Returns:
        List of graph hints as dictionaries
    """
    if not is_graphiti_enabled():
        return []

    try:
        hints = await get_graph_hints(
            query=query,
            project_id=project_id,
            max_results=max_results,
        )
        return hints
    except Exception:
        # Graphiti is optional - fail gracefully
        return []
