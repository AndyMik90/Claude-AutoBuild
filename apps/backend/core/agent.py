"""
Agent Session Logic
===================

Core agent interaction functions for running autonomous coding sessions.
Uses subtask-based implementation plans with minimal, focused prompts.

Architecture:
- Orchestrator (Python) handles all bookkeeping: memory, commits, progress
- Agent focuses ONLY on implementing code
- Post-session processing updates memory automatically (100% reliable)

Enhanced with status file updates for ccstatusline integration.
Enhanced with Graphiti memory for cross-session context retrieval.

NOTE: This module is now a facade that imports from agents/ submodules.
All logic has been refactored into focused modules for better maintainability.
"""

# Re-export everything from the agents module to maintain backwards compatibility
from agents import (
    # Constants
    AUTO_CONTINUE_DELAY_SECONDS,
    HUMAN_INTERVENTION_FILE,
    # Memory functions
    debug_memory_system_status,
    find_phase_for_subtask,
    find_subtask_in_plan,
    get_commit_count,
    get_graphiti_context,
    # Utility functions
    get_latest_commit,
    load_implementation_plan,
    post_session_processing,
    # Session management
    run_agent_session,
    # Main API
    run_autonomous_agent,
    run_followup_planner,
    save_session_memory,
    save_session_to_graphiti,
    sync_spec_to_source,
)

# Ensure all exports are available at module level
__all__ = [
    "run_autonomous_agent",
    "run_followup_planner",
    "debug_memory_system_status",
    "get_graphiti_context",
    "save_session_memory",
    "save_session_to_graphiti",
    "run_agent_session",
    "post_session_processing",
    "get_latest_commit",
    "get_commit_count",
    "load_implementation_plan",
    "find_subtask_in_plan",
    "find_phase_for_subtask",
    "sync_spec_to_source",
    "AUTO_CONTINUE_DELAY_SECONDS",
    "HUMAN_INTERVENTION_FILE",
]
