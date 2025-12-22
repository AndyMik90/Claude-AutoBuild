"""
Semantic search operations for Graphiti memory.

Handles context retrieval, history queries, and similarity searches.
"""

import hashlib
import json
import logging
from pathlib import Path

from .schema import (
    EPISODE_TYPE_SESSION_INSIGHT,
    EPISODE_TYPE_TASK_OUTCOME,
    MAX_CONTEXT_RESULTS,
    GroupIdMode,
)

logger = logging.getLogger(__name__)


class GraphitiSearch:
    """
    Manages semantic search and context retrieval operations.

    Provides methods for finding relevant knowledge from the graph.
    """

    def __init__(
        self,
        client,
        group_id: str,
        spec_context_id: str,
        group_id_mode: str,
        project_dir: Path,
    ):
        """
        Initialize search manager.

        Args:
            client: GraphitiClient instance
            group_id: Group ID for memory namespace
            spec_context_id: Spec-specific context ID
            group_id_mode: "spec" or "project" mode
            project_dir: Project root directory
        """
        self.client = client
        self.group_id = group_id
        self.spec_context_id = spec_context_id
        self.group_id_mode = group_id_mode
        self.project_dir = project_dir

    async def get_relevant_context(
        self,
        query: str,
        num_results: int = MAX_CONTEXT_RESULTS,
        include_project_context: bool = True,
    ) -> list[dict]:
        """
        Search for relevant context based on a query.

        Args:
            query: Search query
            num_results: Maximum number of results to return
            include_project_context: If True and in PROJECT mode, search project-wide

        Returns:
            List of relevant context items with content, score, and type
        """
        try:
            # Determine which group IDs to search
            group_ids = [self.group_id]

            # In spec mode, optionally include project context too
            if self.group_id_mode == GroupIdMode.SPEC and include_project_context:
                project_name = self.project_dir.name
                path_hash = hashlib.md5(
                    str(self.project_dir.resolve()).encode()
                ).hexdigest()[:8]
                project_group_id = f"project_{project_name}_{path_hash}"
                if project_group_id != self.group_id:
                    group_ids.append(project_group_id)

            results = await self.client.graphiti.search(
                query=query,
                group_ids=group_ids,
                num_results=min(num_results, MAX_CONTEXT_RESULTS),
            )

            context_items = []
            for result in results:
                # Extract content from result
                content = (
                    getattr(result, "content", None)
                    or getattr(result, "fact", None)
                    or str(result)
                )

                context_items.append(
                    {
                        "content": content,
                        "score": getattr(result, "score", 0.0),
                        "type": getattr(result, "type", "unknown"),
                    }
                )

            logger.info(
                f"Found {len(context_items)} relevant context items for: {query[:50]}..."
            )
            return context_items

        except Exception as e:
            logger.warning(f"Failed to search context: {e}")
            return []

    async def get_session_history(
        self,
        limit: int = 5,
        spec_only: bool = True,
    ) -> list[dict]:
        """
        Get recent session insights from the knowledge graph.

        Args:
            limit: Maximum number of sessions to return
            spec_only: If True, only return sessions from this spec

        Returns:
            List of session insight summaries
        """
        try:
            results = await self.client.graphiti.search(
                query="session insight completed subtasks recommendations",
                group_ids=[self.group_id],
                num_results=limit * 2,  # Get more to filter
            )

            sessions = []
            for result in results:
                content = getattr(result, "content", None) or getattr(
                    result, "fact", None
                )
                if content and EPISODE_TYPE_SESSION_INSIGHT in str(content):
                    try:
                        data = (
                            json.loads(content) if isinstance(content, str) else content
                        )
                        if data.get("type") == EPISODE_TYPE_SESSION_INSIGHT:
                            # Filter by spec if requested
                            if (
                                spec_only
                                and data.get("spec_id") != self.spec_context_id
                            ):
                                continue
                            sessions.append(data)
                    except (json.JSONDecodeError, TypeError):
                        continue

            # Sort by session number and return latest
            sessions.sort(key=lambda x: x.get("session_number", 0), reverse=True)
            return sessions[:limit]

        except Exception as e:
            logger.warning(f"Failed to get session history: {e}")
            return []

    async def get_similar_task_outcomes(
        self,
        task_description: str,
        limit: int = 5,
    ) -> list[dict]:
        """
        Find similar past task outcomes to learn from.

        Args:
            task_description: Description of the current task
            limit: Maximum number of results

        Returns:
            List of similar task outcomes with success/failure info
        """
        try:
            results = await self.client.graphiti.search(
                query=f"task outcome: {task_description}",
                group_ids=[self.group_id],
                num_results=limit * 2,
            )

            outcomes = []
            for result in results:
                content = getattr(result, "content", None) or getattr(
                    result, "fact", None
                )
                if content and EPISODE_TYPE_TASK_OUTCOME in str(content):
                    try:
                        data = (
                            json.loads(content) if isinstance(content, str) else content
                        )
                        if data.get("type") == EPISODE_TYPE_TASK_OUTCOME:
                            outcomes.append(
                                {
                                    "task_id": data.get("task_id"),
                                    "success": data.get("success"),
                                    "outcome": data.get("outcome"),
                                    "score": getattr(result, "score", 0.0),
                                }
                            )
                    except (json.JSONDecodeError, TypeError):
                        continue

            return outcomes[:limit]

        except Exception as e:
            logger.warning(f"Failed to get similar task outcomes: {e}")
            return []
