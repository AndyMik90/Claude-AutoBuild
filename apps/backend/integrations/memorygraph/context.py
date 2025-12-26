"""
Context Retrieval for MemoryGraph
==================================

Retrieve relevant context from MemoryGraph for subtasks.
"""

import logging
from pathlib import Path
from typing import Optional

from .client import MemoryGraphClient
from .formatting import format_context

logger = logging.getLogger(__name__)


async def get_context_for_subtask(subtask: dict, project_dir: Path) -> str:
    """
    Get relevant memory context for a subtask.

    This searches MemoryGraph for memories relevant to the subtask's
    description and files, then formats them for injection into the
    agent's prompt.

    Args:
        subtask: Subtask dict containing 'description', 'id', 'files', etc.
        project_dir: Project root directory

    Returns:
        Formatted markdown string for prompt injection, or empty string
        if no relevant context found or MemoryGraph unavailable.
    """
    # Build query from subtask description
    query = subtask.get("description", "")
    if not query:
        logger.debug("No description in subtask, skipping context retrieval")
        return ""

    # Include files in query for better context
    files = subtask.get("files", [])
    if files:
        # Add file names to query (not full paths)
        file_names = [Path(f).name for f in files[:3]]  # Limit to avoid too long
        query = f"{query} {' '.join(file_names)}"

    logger.debug(f"Retrieving MemoryGraph context for: {query[:100]}")

    # Get memories from MemoryGraph
    client = MemoryGraphClient()
    memories = await client.recall(query, limit=5)

    if not memories:
        logger.debug("No memories found in MemoryGraph")
        return ""

    # Find related solutions for any problems
    solutions = []
    for memory in memories:
        if memory.get("type") == "problem":
            memory_id = memory.get("id")
            if memory_id:
                related = await client.get_related(
                    memory_id,
                    types=["SOLVES", "ADDRESSES"]
                )
                solutions.extend(related)

    # Format the context
    context = format_context(memories, solutions)

    if context:
        logger.debug(f"Retrieved {len(memories)} memories from MemoryGraph")
    else:
        logger.debug("No relevant context to format")

    return context
