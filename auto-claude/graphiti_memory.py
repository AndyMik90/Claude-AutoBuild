"""
Graphiti Memory Integration V2
==============================

Provides persistent knowledge graph memory using Graphiti with FalkorDB backend.
This is an OPTIONAL enhancement layer that stores data ALONGSIDE file-based memory
(see memory.py), not as a replacement.

V2 Changes:
- Multi-provider support (OpenAI, Anthropic, Azure OpenAI, Ollama)
- Factory pattern for LLM clients and embedders
- Project-level group_id for shared context across specs
- Better error handling and graceful degradation

Key Features:
- Session insight storage as episodes
- Codebase knowledge persistence
- Cross-session context retrieval via semantic search
- Graceful degradation when unavailable

Architecture Decision:
    File-based memory (memory.py) remains the PRIMARY storage mechanism.
    Graphiti integration is an OPTIONAL enhancement that:
    - Provides semantic search capabilities across sessions
    - Stores data in parallel with file-based storage (dual-write)
    - Never replaces file-based storage (enhancement only)
    - Gracefully degrades when disabled or unavailable

Implementation:
- Uses lazy initialization - doesn't connect until first use
- All operations are async with proper error handling
- On failure, logs warning and continues (file-based already succeeded)
- Supports two group_id modes:
  - Spec-level: Each spec gets its own group_id (default)
  - Project-level: All specs share context via project name

Usage:
    from graphiti_memory import GraphitiMemory, is_graphiti_enabled

    if is_graphiti_enabled():
        memory = GraphitiMemory(spec_dir, project_dir)
        await memory.save_session_insights(session_num, insights)
        context = await memory.get_relevant_context("authentication patterns")
        await memory.close()
"""

import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from graphiti_config import (
    GraphitiConfig,
    GraphitiState,
    is_graphiti_enabled,
    EPISODE_TYPE_SESSION_INSIGHT,
    EPISODE_TYPE_CODEBASE_DISCOVERY,
    EPISODE_TYPE_PATTERN,
    EPISODE_TYPE_GOTCHA,
    EPISODE_TYPE_TASK_OUTCOME,
    EPISODE_TYPE_QA_RESULT,
    EPISODE_TYPE_HISTORICAL_CONTEXT,
)

# Configure logging
logger = logging.getLogger(__name__)

# Maximum results to return for context queries (avoid overwhelming agent context)
MAX_CONTEXT_RESULTS = 10

# Retry configuration
MAX_RETRIES = 2
RETRY_DELAY_SECONDS = 1


class GroupIdMode:
    """Group ID modes for Graphiti memory scoping."""
    SPEC = "spec"      # Each spec gets its own namespace
    PROJECT = "project"  # All specs share project-wide context


class GraphitiMemory:
    """
    Manages Graphiti-based persistent memory for auto-claude sessions.

    This class provides a high-level interface for:
    - Storing session insights as episodes
    - Recording codebase discoveries (file purposes, patterns, gotchas)
    - Retrieving relevant context for new sessions
    - Searching across all stored knowledge

    All operations are async and include error handling with fallback behavior.
    The integration is OPTIONAL - if Graphiti is disabled or unavailable,
    operations gracefully no-op or return empty results.

    V2 supports multi-provider configurations via factory pattern.
    """

    def __init__(
        self,
        spec_dir: Path,
        project_dir: Path,
        group_id_mode: str = GroupIdMode.SPEC,
    ):
        """
        Initialize Graphiti memory manager.

        Args:
            spec_dir: Spec directory (used as namespace/group_id in SPEC mode)
            project_dir: Project root directory (used as namespace in PROJECT mode)
            group_id_mode: How to scope the memory namespace:
                - "spec": Each spec gets isolated memory (default)
                - "project": All specs share project-wide context
        """
        self.spec_dir = spec_dir
        self.project_dir = project_dir
        self.group_id_mode = group_id_mode
        self.config = GraphitiConfig.from_env()
        self.state: Optional[GraphitiState] = None
        self._graphiti = None  # Lazy initialization
        self._driver = None
        self._llm_client = None
        self._embedder = None
        self._initialized = False
        self._available = False

        # Load existing state if available
        self.state = GraphitiState.load(spec_dir)

        # Check availability
        self._available = self.config.is_valid()

        # Log provider configuration if enabled
        if self._available:
            logger.info(f"Graphiti configured with providers: {self.config.get_provider_summary()}")

    @property
    def is_enabled(self) -> bool:
        """Check if Graphiti integration is enabled and configured."""
        return self._available

    @property
    def is_initialized(self) -> bool:
        """Check if Graphiti has been initialized for this spec."""
        return self._initialized and self.state is not None and self.state.initialized

    @property
    def group_id(self) -> str:
        """
        Get the group ID for memory namespace.

        Returns:
            - In SPEC mode: spec folder name (e.g., "001-add-auth")
            - In PROJECT mode: project name with hash for uniqueness
        """
        if self.group_id_mode == GroupIdMode.PROJECT:
            # Create a stable project-level group ID
            project_name = self.project_dir.name
            # Add a short hash of the absolute path for uniqueness
            path_hash = hashlib.md5(str(self.project_dir.resolve()).encode()).hexdigest()[:8]
            return f"project_{project_name}_{path_hash}"
        else:
            # Default to spec-level isolation
            return self.spec_dir.name

    @property
    def spec_context_id(self) -> str:
        """Get a context ID specific to this spec (for filtering in project mode)."""
        return self.spec_dir.name

    async def initialize(self) -> bool:
        """
        Initialize the Graphiti client with configured providers.

        This is called lazily on first operation. Uses factory pattern to
        create LLM client and embedder based on configured providers.

        Returns:
            True if initialization succeeded
        """
        if self._initialized:
            return True

        if not self._available:
            logger.info("Graphiti not available - skipping initialization")
            return False

        try:
            # Import Graphiti core
            from graphiti_core import Graphiti
            from graphiti_core.driver.falkordb_driver import FalkorDriver

            # Import our provider factory
            from graphiti_providers import (
                create_llm_client,
                create_embedder,
                ProviderError,
                ProviderNotInstalled,
            )

            # Create providers using factory pattern
            try:
                self._llm_client = create_llm_client(self.config)
                logger.info(f"Created LLM client for provider: {self.config.llm_provider}")
            except ProviderNotInstalled as e:
                logger.warning(f"LLM provider packages not installed: {e}")
                self._available = False
                return False
            except ProviderError as e:
                logger.warning(f"LLM provider configuration error: {e}")
                self._available = False
                return False

            try:
                self._embedder = create_embedder(self.config)
                logger.info(f"Created embedder for provider: {self.config.embedder_provider}")
            except ProviderNotInstalled as e:
                logger.warning(f"Embedder provider packages not installed: {e}")
                self._available = False
                return False
            except ProviderError as e:
                logger.warning(f"Embedder provider configuration error: {e}")
                self._available = False
                return False

            # Initialize FalkorDB driver
            self._driver = FalkorDriver(
                host=self.config.falkordb_host,
                port=self.config.falkordb_port,
                password=self.config.falkordb_password or None,
                database=self.config.database,
            )

            # Initialize Graphiti with the custom providers
            self._graphiti = Graphiti(
                graph_driver=self._driver,
                llm_client=self._llm_client,
                embedder=self._embedder,
            )

            # Build indices (first time only)
            if not self.state or not self.state.indices_built:
                logger.info("Building Graphiti indices and constraints...")
                await self._graphiti.build_indices_and_constraints()

                # Update state
                if not self.state:
                    self.state = GraphitiState()

                self.state.initialized = True
                self.state.indices_built = True
                self.state.database = self.config.database
                self.state.created_at = datetime.now(timezone.utc).isoformat()
                self.state.llm_provider = self.config.llm_provider
                self.state.embedder_provider = self.config.embedder_provider
                self.state.save(self.spec_dir)

            self._initialized = True
            logger.info(
                f"Graphiti initialized for group: {self.group_id} "
                f"(mode: {self.group_id_mode}, providers: {self.config.get_provider_summary()})"
            )
            return True

        except ImportError as e:
            logger.warning(
                f"Graphiti packages not installed: {e}. "
                "Install with: pip install graphiti-core[falkordb]"
            )
            self._available = False
            return False

        except Exception as e:
            logger.warning(f"Failed to initialize Graphiti: {e}")
            self._record_error(f"Initialization failed: {e}")
            self._available = False
            return False

    async def close(self) -> None:
        """
        Close the Graphiti client and clean up connections.

        Should be called when done with memory operations.
        """
        if self._graphiti:
            try:
                await self._graphiti.close()
                logger.info("Graphiti connection closed")
            except Exception as e:
                logger.warning(f"Error closing Graphiti: {e}")
            finally:
                self._graphiti = None
                self._driver = None
                self._llm_client = None
                self._embedder = None
                self._initialized = False

    async def save_session_insights(
        self,
        session_num: int,
        insights: dict,
    ) -> bool:
        """
        Save session insights as a Graphiti episode.

        Args:
            session_num: Session number (1-indexed)
            insights: Dictionary containing session learnings with keys:
                - subtasks_completed: list[str]
                - discoveries: dict
                - what_worked: list[str]
                - what_failed: list[str]
                - recommendations_for_next_session: list[str]

        Returns:
            True if saved successfully
        """
        if not await self._ensure_initialized():
            return False

        try:
            from graphiti_core.nodes import EpisodeType

            # Build episode content with spec context for filtering
            episode_content = {
                "type": EPISODE_TYPE_SESSION_INSIGHT,
                "spec_id": self.spec_context_id,
                "session_number": session_num,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **insights,
            }

            # Add as episode
            await self._graphiti.add_episode(
                name=f"session_{session_num:03d}_{self.spec_context_id}",
                episode_body=json.dumps(episode_content),
                source=EpisodeType.text,
                source_description=f"Auto-build session insight for {self.spec_context_id}",
                reference_time=datetime.now(timezone.utc),
                group_id=self.group_id,
            )

            # Update state
            if self.state:
                self.state.last_session = session_num
                self.state.episode_count += 1
                self.state.save(self.spec_dir)

            logger.info(f"Saved session {session_num} insights to Graphiti (group: {self.group_id})")
            return True

        except Exception as e:
            logger.warning(f"Failed to save session insights: {e}")
            self._record_error(f"Save session insights failed: {e}")
            return False

    async def save_codebase_discoveries(
        self,
        discoveries: dict[str, str],
    ) -> bool:
        """
        Save codebase discoveries (file purposes) to the knowledge graph.

        Args:
            discoveries: Dictionary mapping file paths to their purposes
                Example: {
                    "src/api/auth.py": "Handles JWT authentication",
                    "src/models/user.py": "User database model"
                }

        Returns:
            True if saved successfully
        """
        if not await self._ensure_initialized():
            return False

        if not discoveries:
            return True

        try:
            from graphiti_core.nodes import EpisodeType

            # Build episode content
            episode_content = {
                "type": EPISODE_TYPE_CODEBASE_DISCOVERY,
                "spec_id": self.spec_context_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "files": discoveries,
            }

            # Add as episode
            await self._graphiti.add_episode(
                name=f"codebase_discovery_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
                episode_body=json.dumps(episode_content),
                source=EpisodeType.text,
                source_description=f"Codebase file discoveries for {self.group_id}",
                reference_time=datetime.now(timezone.utc),
                group_id=self.group_id,
            )

            # Update state
            if self.state:
                self.state.episode_count += 1
                self.state.save(self.spec_dir)

            logger.info(f"Saved {len(discoveries)} codebase discoveries to Graphiti")
            return True

        except Exception as e:
            logger.warning(f"Failed to save codebase discoveries: {e}")
            self._record_error(f"Save discoveries failed: {e}")
            return False

    async def save_pattern(self, pattern: str) -> bool:
        """
        Save a code pattern to the knowledge graph.

        Args:
            pattern: Description of the code pattern

        Returns:
            True if saved successfully
        """
        if not await self._ensure_initialized():
            return False

        try:
            from graphiti_core.nodes import EpisodeType

            episode_content = {
                "type": EPISODE_TYPE_PATTERN,
                "spec_id": self.spec_context_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "pattern": pattern,
            }

            await self._graphiti.add_episode(
                name=f"pattern_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
                episode_body=json.dumps(episode_content),
                source=EpisodeType.text,
                source_description=f"Code pattern for {self.group_id}",
                reference_time=datetime.now(timezone.utc),
                group_id=self.group_id,
            )

            if self.state:
                self.state.episode_count += 1
                self.state.save(self.spec_dir)

            logger.info(f"Saved pattern to Graphiti: {pattern[:50]}...")
            return True

        except Exception as e:
            logger.warning(f"Failed to save pattern: {e}")
            self._record_error(f"Save pattern failed: {e}")
            return False

    async def save_gotcha(self, gotcha: str) -> bool:
        """
        Save a gotcha (pitfall) to the knowledge graph.

        Args:
            gotcha: Description of the pitfall to avoid

        Returns:
            True if saved successfully
        """
        if not await self._ensure_initialized():
            return False

        try:
            from graphiti_core.nodes import EpisodeType

            episode_content = {
                "type": EPISODE_TYPE_GOTCHA,
                "spec_id": self.spec_context_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "gotcha": gotcha,
            }

            await self._graphiti.add_episode(
                name=f"gotcha_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
                episode_body=json.dumps(episode_content),
                source=EpisodeType.text,
                source_description=f"Gotcha/pitfall for {self.group_id}",
                reference_time=datetime.now(timezone.utc),
                group_id=self.group_id,
            )

            if self.state:
                self.state.episode_count += 1
                self.state.save(self.spec_dir)

            logger.info(f"Saved gotcha to Graphiti: {gotcha[:50]}...")
            return True

        except Exception as e:
            logger.warning(f"Failed to save gotcha: {e}")
            self._record_error(f"Save gotcha failed: {e}")
            return False

    async def save_task_outcome(
        self,
        task_id: str,
        success: bool,
        outcome: str,
        metadata: Optional[dict] = None,
    ) -> bool:
        """
        Save a task outcome for learning from past successes/failures.

        Args:
            task_id: Unique identifier for the task (e.g., subtask ID)
            success: Whether the task succeeded
            outcome: Description of what happened
            metadata: Optional additional context

        Returns:
            True if saved successfully
        """
        if not await self._ensure_initialized():
            return False

        try:
            from graphiti_core.nodes import EpisodeType

            episode_content = {
                "type": EPISODE_TYPE_TASK_OUTCOME,
                "spec_id": self.spec_context_id,
                "task_id": task_id,
                "success": success,
                "outcome": outcome,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                **(metadata or {}),
            }

            await self._graphiti.add_episode(
                name=f"task_outcome_{task_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
                episode_body=json.dumps(episode_content),
                source=EpisodeType.text,
                source_description=f"Task outcome for {task_id}",
                reference_time=datetime.now(timezone.utc),
                group_id=self.group_id,
            )

            if self.state:
                self.state.episode_count += 1
                self.state.save(self.spec_dir)

            status = "succeeded" if success else "failed"
            logger.info(f"Saved task outcome to Graphiti: {task_id} {status}")
            return True

        except Exception as e:
            logger.warning(f"Failed to save task outcome: {e}")
            self._record_error(f"Save task outcome failed: {e}")
            return False

    async def save_structured_insights(self, insights: dict) -> bool:
        """
        Save extracted insights from a session as multiple focused episodes.

        This method saves the rich insights extracted by the insight_extractor
        as separate, semantically searchable episodes in Graphiti. Each type of
        insight becomes its own episode for better retrieval.

        Args:
            insights: Dictionary from insight_extractor with keys:
                - file_insights: list[dict] - per-file knowledge
                - patterns_discovered: list[dict] - reusable patterns
                - gotchas_discovered: list[dict] - pitfalls to avoid
                - approach_outcome: dict - what worked/failed
                - recommendations: list[str] - advice for future
                - subtask_id: str - which subtask was worked on
                - success: bool - whether session succeeded
                - changed_files: list[str] - files modified

        Returns:
            True if saved successfully (or partially)
        """
        if not await self._ensure_initialized():
            return False

        if not insights:
            return True

        saved_count = 0
        total_count = 0

        try:
            from graphiti_core.nodes import EpisodeType

            # 1. Save file insights as individual episodes
            for file_insight in insights.get("file_insights", []):
                total_count += 1
                try:
                    episode_content = {
                        "type": EPISODE_TYPE_CODEBASE_DISCOVERY,
                        "spec_id": self.spec_context_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "file_path": file_insight.get("path", "unknown"),
                        "purpose": file_insight.get("purpose", ""),
                        "changes_made": file_insight.get("changes_made", ""),
                        "patterns_used": file_insight.get("patterns_used", []),
                        "gotchas": file_insight.get("gotchas", []),
                    }

                    await self._graphiti.add_episode(
                        name=f"file_insight_{file_insight.get('path', 'unknown').replace('/', '_')}",
                        episode_body=json.dumps(episode_content),
                        source=EpisodeType.text,
                        source_description=f"File insight: {file_insight.get('path', 'unknown')}",
                        reference_time=datetime.now(timezone.utc),
                        group_id=self.group_id,
                    )
                    saved_count += 1
                except Exception as e:
                    logger.debug(f"Failed to save file insight: {e}")

            # 2. Save patterns as individual episodes
            for pattern in insights.get("patterns_discovered", []):
                total_count += 1
                try:
                    pattern_text = pattern.get("pattern", "") if isinstance(pattern, dict) else str(pattern)
                    applies_to = pattern.get("applies_to", "") if isinstance(pattern, dict) else ""
                    example = pattern.get("example", "") if isinstance(pattern, dict) else ""

                    episode_content = {
                        "type": EPISODE_TYPE_PATTERN,
                        "spec_id": self.spec_context_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "pattern": pattern_text,
                        "applies_to": applies_to,
                        "example": example,
                    }

                    await self._graphiti.add_episode(
                        name=f"pattern_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S%f')}",
                        episode_body=json.dumps(episode_content),
                        source=EpisodeType.text,
                        source_description=f"Pattern: {pattern_text[:50]}...",
                        reference_time=datetime.now(timezone.utc),
                        group_id=self.group_id,
                    )
                    saved_count += 1
                except Exception as e:
                    logger.debug(f"Failed to save pattern: {e}")

            # 3. Save gotchas as individual episodes
            for gotcha in insights.get("gotchas_discovered", []):
                total_count += 1
                try:
                    gotcha_text = gotcha.get("gotcha", "") if isinstance(gotcha, dict) else str(gotcha)
                    trigger = gotcha.get("trigger", "") if isinstance(gotcha, dict) else ""
                    solution = gotcha.get("solution", "") if isinstance(gotcha, dict) else ""

                    episode_content = {
                        "type": EPISODE_TYPE_GOTCHA,
                        "spec_id": self.spec_context_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "gotcha": gotcha_text,
                        "trigger": trigger,
                        "solution": solution,
                    }

                    await self._graphiti.add_episode(
                        name=f"gotcha_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S%f')}",
                        episode_body=json.dumps(episode_content),
                        source=EpisodeType.text,
                        source_description=f"Gotcha: {gotcha_text[:50]}...",
                        reference_time=datetime.now(timezone.utc),
                        group_id=self.group_id,
                    )
                    saved_count += 1
                except Exception as e:
                    logger.debug(f"Failed to save gotcha: {e}")

            # 4. Save approach outcome as task outcome episode
            outcome = insights.get("approach_outcome", {})
            if outcome:
                total_count += 1
                try:
                    subtask_id = insights.get("subtask_id", "unknown")
                    success = outcome.get("success", insights.get("success", False))

                    episode_content = {
                        "type": EPISODE_TYPE_TASK_OUTCOME,
                        "spec_id": self.spec_context_id,
                        "task_id": subtask_id,
                        "success": success,
                        "outcome": outcome.get("approach_used", ""),
                        "why_worked": outcome.get("why_it_worked"),
                        "why_failed": outcome.get("why_it_failed"),
                        "alternatives_tried": outcome.get("alternatives_tried", []),
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "changed_files": insights.get("changed_files", []),
                    }

                    await self._graphiti.add_episode(
                        name=f"task_outcome_{subtask_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
                        episode_body=json.dumps(episode_content),
                        source=EpisodeType.text,
                        source_description=f"Task outcome: {subtask_id} {'succeeded' if success else 'failed'}",
                        reference_time=datetime.now(timezone.utc),
                        group_id=self.group_id,
                    )
                    saved_count += 1
                except Exception as e:
                    logger.debug(f"Failed to save task outcome: {e}")

            # 5. Save recommendations as session insight
            recommendations = insights.get("recommendations", [])
            if recommendations:
                total_count += 1
                try:
                    episode_content = {
                        "type": EPISODE_TYPE_SESSION_INSIGHT,
                        "spec_id": self.spec_context_id,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "subtask_id": insights.get("subtask_id", "unknown"),
                        "session_number": insights.get("session_num", 0),
                        "recommendations": recommendations,
                        "success": insights.get("success", False),
                    }

                    await self._graphiti.add_episode(
                        name=f"recommendations_{insights.get('subtask_id', 'unknown')}",
                        episode_body=json.dumps(episode_content),
                        source=EpisodeType.text,
                        source_description=f"Recommendations for {insights.get('subtask_id', 'unknown')}",
                        reference_time=datetime.now(timezone.utc),
                        group_id=self.group_id,
                    )
                    saved_count += 1
                except Exception as e:
                    logger.debug(f"Failed to save recommendations: {e}")

            # Update state with count
            if self.state:
                self.state.episode_count += saved_count
                self.state.save(self.spec_dir)

            logger.info(
                f"Saved {saved_count}/{total_count} structured insights to Graphiti "
                f"(group: {self.group_id})"
            )
            return saved_count > 0

        except Exception as e:
            logger.warning(f"Failed to save structured insights: {e}")
            self._record_error(f"Save structured insights failed: {e}")
            return False

    async def get_relevant_context(
        self,
        query: str,
        num_results: int = MAX_CONTEXT_RESULTS,
        include_project_context: bool = True,
    ) -> list[dict]:
        """
        Search for relevant context based on a query.

        Args:
            query: Search query (e.g., "authentication patterns", "database models")
            num_results: Maximum number of results to return
            include_project_context: If True and in PROJECT mode, search project-wide

        Returns:
            List of relevant context items with keys:
                - content: str
                - score: float
                - type: str (episode type)
        """
        if not await self._ensure_initialized():
            return []

        try:
            # Determine which group IDs to search
            group_ids = [self.group_id]

            # In spec mode, optionally include project context too
            if self.group_id_mode == GroupIdMode.SPEC and include_project_context:
                # Calculate project group ID
                project_name = self.project_dir.name
                path_hash = hashlib.md5(str(self.project_dir.resolve()).encode()).hexdigest()[:8]
                project_group_id = f"project_{project_name}_{path_hash}"
                if project_group_id != self.group_id:
                    group_ids.append(project_group_id)

            results = await self._graphiti.search(
                query=query,
                group_ids=group_ids,
                num_results=min(num_results, MAX_CONTEXT_RESULTS),
            )

            context_items = []
            for result in results:
                # Extract content from result
                content = getattr(result, 'content', None) or getattr(result, 'fact', None) or str(result)

                context_items.append({
                    "content": content,
                    "score": getattr(result, 'score', 0.0),
                    "type": getattr(result, 'type', 'unknown'),
                })

            logger.info(f"Found {len(context_items)} relevant context items for: {query[:50]}...")
            return context_items

        except Exception as e:
            logger.warning(f"Failed to search context: {e}")
            self._record_error(f"Search context failed: {e}")
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
        if not await self._ensure_initialized():
            return []

        try:
            # Search for session insights
            results = await self._graphiti.search(
                query="session insight completed subtasks recommendations",
                group_ids=[self.group_id],
                num_results=limit * 2,  # Get more to filter
            )

            sessions = []
            for result in results:
                content = getattr(result, 'content', None) or getattr(result, 'fact', None)
                if content and EPISODE_TYPE_SESSION_INSIGHT in str(content):
                    try:
                        # Try to parse as JSON
                        data = json.loads(content) if isinstance(content, str) else content
                        if data.get('type') == EPISODE_TYPE_SESSION_INSIGHT:
                            # Filter by spec if requested
                            if spec_only and data.get('spec_id') != self.spec_context_id:
                                continue
                            sessions.append(data)
                    except (json.JSONDecodeError, TypeError):
                        continue

            # Sort by session number and return latest
            sessions.sort(key=lambda x: x.get('session_number', 0), reverse=True)
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
        if not await self._ensure_initialized():
            return []

        try:
            results = await self._graphiti.search(
                query=f"task outcome: {task_description}",
                group_ids=[self.group_id],
                num_results=limit * 2,
            )

            outcomes = []
            for result in results:
                content = getattr(result, 'content', None) or getattr(result, 'fact', None)
                if content and EPISODE_TYPE_TASK_OUTCOME in str(content):
                    try:
                        data = json.loads(content) if isinstance(content, str) else content
                        if data.get('type') == EPISODE_TYPE_TASK_OUTCOME:
                            outcomes.append({
                                "task_id": data.get("task_id"),
                                "success": data.get("success"),
                                "outcome": data.get("outcome"),
                                "score": getattr(result, 'score', 0.0),
                            })
                    except (json.JSONDecodeError, TypeError):
                        continue

            return outcomes[:limit]

        except Exception as e:
            logger.warning(f"Failed to get similar task outcomes: {e}")
            return []

    def get_status_summary(self) -> dict:
        """
        Get a summary of Graphiti memory status.

        Returns:
            Dict with status information
        """
        return {
            "enabled": self.is_enabled,
            "initialized": self.is_initialized,
            "database": self.config.database if self.is_enabled else None,
            "host": f"{self.config.falkordb_host}:{self.config.falkordb_port}" if self.is_enabled else None,
            "group_id": self.group_id,
            "group_id_mode": self.group_id_mode,
            "llm_provider": self.config.llm_provider if self.is_enabled else None,
            "embedder_provider": self.config.embedder_provider if self.is_enabled else None,
            "episode_count": self.state.episode_count if self.state else 0,
            "last_session": self.state.last_session if self.state else None,
            "errors": len(self.state.error_log) if self.state else 0,
        }

    async def _ensure_initialized(self) -> bool:
        """
        Ensure Graphiti is initialized, attempting initialization if needed.

        Returns:
            True if initialized and ready
        """
        if self._initialized:
            return True

        if not self._available:
            return False

        return await self.initialize()

    def _record_error(self, error_msg: str) -> None:
        """Record an error in the state."""
        if not self.state:
            self.state = GraphitiState()

        self.state.record_error(error_msg)
        self.state.save(self.spec_dir)


# Convenience function for getting a memory manager
def get_graphiti_memory(
    spec_dir: Path,
    project_dir: Path,
    group_id_mode: str = GroupIdMode.SPEC,
) -> GraphitiMemory:
    """
    Get a GraphitiMemory instance for the given spec.

    This is the main entry point for other modules.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory
        group_id_mode: "spec" for isolated memory, "project" for shared

    Returns:
        GraphitiMemory instance
    """
    return GraphitiMemory(spec_dir, project_dir, group_id_mode)


async def test_graphiti_connection() -> tuple[bool, str]:
    """
    Test if FalkorDB is available and Graphiti can connect.

    Returns:
        Tuple of (success: bool, message: str)
    """
    config = GraphitiConfig.from_env()

    if not config.enabled:
        return False, "Graphiti not enabled (GRAPHITI_ENABLED not set to true)"

    # Validate provider configuration
    errors = config.get_validation_errors()
    if errors:
        return False, f"Configuration errors: {'; '.join(errors)}"

    try:
        from graphiti_core import Graphiti
        from graphiti_core.driver.falkordb_driver import FalkorDriver
        from graphiti_providers import create_llm_client, create_embedder, ProviderError

        # Create providers
        try:
            llm_client = create_llm_client(config)
            embedder = create_embedder(config)
        except ProviderError as e:
            return False, f"Provider error: {e}"

        # Try to connect
        driver = FalkorDriver(
            host=config.falkordb_host,
            port=config.falkordb_port,
            password=config.falkordb_password or None,
            database=config.database,
        )

        graphiti = Graphiti(
            graph_driver=driver,
            llm_client=llm_client,
            embedder=embedder,
        )

        # Try a simple operation
        await graphiti.build_indices_and_constraints()
        await graphiti.close()

        return True, (
            f"Connected to FalkorDB at {config.falkordb_host}:{config.falkordb_port} "
            f"(providers: {config.get_provider_summary()})"
        )

    except ImportError as e:
        return False, f"Graphiti packages not installed: {e}"

    except Exception as e:
        return False, f"Connection failed: {e}"


async def test_provider_configuration() -> dict:
    """
    Test the current provider configuration and return detailed status.

    Returns:
        Dict with test results for each component
    """
    from graphiti_providers import (
        test_llm_connection,
        test_embedder_connection,
        test_ollama_connection,
        validate_embedding_config,
    )

    config = GraphitiConfig.from_env()

    results = {
        "config_valid": config.is_valid(),
        "validation_errors": config.get_validation_errors(),
        "llm_provider": config.llm_provider,
        "embedder_provider": config.embedder_provider,
        "llm_test": None,
        "embedder_test": None,
    }

    # Test LLM
    llm_success, llm_msg = await test_llm_connection(config)
    results["llm_test"] = {"success": llm_success, "message": llm_msg}

    # Test embedder
    emb_success, emb_msg = await test_embedder_connection(config)
    results["embedder_test"] = {"success": emb_success, "message": emb_msg}

    # Extra test for Ollama
    if config.llm_provider == "ollama" or config.embedder_provider == "ollama":
        ollama_success, ollama_msg = await test_ollama_connection(config.ollama_base_url)
        results["ollama_test"] = {"success": ollama_success, "message": ollama_msg}

    return results
