"""
Relationship Inference for MemoryGraph
=======================================

Infers and creates relationships between memories from the same session.
"""

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .client import MemoryGraphClient

logger = logging.getLogger(__name__)


async def infer_relationships(
    problems: list[dict], solutions: list[dict], client: "MemoryGraphClient"
) -> None:
    """
    Create relationships between stored memories.

    Links solutions to problems they solved from the same session.
    Uses simple heuristic: if session succeeded and we have both problems
    and solutions, the solutions likely SOLVED the problems.

    Args:
        problems: List of problem memories with 'id' field
        solutions: List of solution memories with 'id' field
        client: MemoryGraphClient instance

    Returns:
        None - creates relationships as side effect
    """
    if not problems or not solutions:
        logger.debug("No relationships to infer (missing problems or solutions)")
        return

    # Link each solution to each problem from same session
    # This is a simple heuristic - in same session = likely related
    for solution in solutions:
        for problem in problems:
            try:
                await client.relate(
                    from_id=solution["id"],
                    to_id=problem["id"],
                    relationship_type="SOLVES",
                )
                logger.debug(
                    f"Created SOLVES relationship: {solution['id']} -> {problem['id']}"
                )
            except Exception as e:
                # Don't fail the entire operation if one relationship fails
                logger.warning(
                    f"Failed to create relationship {solution['id']} -> {problem['id']}: {e}"
                )
                continue
