"""
Graph schema definitions and constants for Graphiti memory.

Defines episode types and data structures used across the memory system.
"""

# Episode type constants
EPISODE_TYPE_SESSION_INSIGHT = "session_insight"
EPISODE_TYPE_CODEBASE_DISCOVERY = "codebase_discovery"
EPISODE_TYPE_PATTERN = "pattern"
EPISODE_TYPE_GOTCHA = "gotcha"
EPISODE_TYPE_TASK_OUTCOME = "task_outcome"
EPISODE_TYPE_QA_RESULT = "qa_result"
EPISODE_TYPE_HISTORICAL_CONTEXT = "historical_context"

# Maximum results to return for context queries (avoid overwhelming agent context)
MAX_CONTEXT_RESULTS = 10

# Retry configuration
MAX_RETRIES = 2
RETRY_DELAY_SECONDS = 1


class GroupIdMode:
    """Group ID modes for Graphiti memory scoping."""

    SPEC = "spec"  # Each spec gets its own namespace
    PROJECT = "project"  # All specs share project-wide context
