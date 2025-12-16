"""
Agent Tool Permissions
======================

Manages which tools are allowed for each agent type to prevent context
pollution and accidental misuse.
"""

from .models import (
    BASE_READ_TOOLS,
    BASE_WRITE_TOOLS,
    ELECTRON_TOOLS,
    TOOL_GET_BUILD_PROGRESS,
    TOOL_GET_SESSION_CONTEXT,
    TOOL_RECORD_DISCOVERY,
    TOOL_RECORD_GOTCHA,
    TOOL_UPDATE_QA_STATUS,
    TOOL_UPDATE_SUBTASK_STATUS,
    is_electron_mcp_enabled,
)


def get_allowed_tools(agent_type: str) -> list[str]:
    """
    Get the list of allowed tools for a specific agent type.

    This ensures each agent only sees tools relevant to their role,
    preventing context pollution and accidental misuse.

    Args:
        agent_type: One of 'planner', 'coder', 'qa_reviewer', 'qa_fixer'

    Returns:
        List of allowed tool names
    """
    # Auto-claude tool mappings by agent type
    tool_mappings = {
        "planner": {
            "base": BASE_READ_TOOLS + BASE_WRITE_TOOLS,
            "auto_claude": [
                TOOL_GET_BUILD_PROGRESS,
                TOOL_GET_SESSION_CONTEXT,
                TOOL_RECORD_DISCOVERY,
            ],
        },
        "coder": {
            "base": BASE_READ_TOOLS + BASE_WRITE_TOOLS,
            "auto_claude": [
                TOOL_UPDATE_SUBTASK_STATUS,
                TOOL_GET_BUILD_PROGRESS,
                TOOL_RECORD_DISCOVERY,
                TOOL_RECORD_GOTCHA,
                TOOL_GET_SESSION_CONTEXT,
            ],
        },
        "qa_reviewer": {
            "base": BASE_READ_TOOLS + ["Bash"],  # Can run tests but not edit
            "auto_claude": [
                TOOL_GET_BUILD_PROGRESS,
                TOOL_UPDATE_QA_STATUS,
                TOOL_GET_SESSION_CONTEXT,
            ],
        },
        "qa_fixer": {
            "base": BASE_READ_TOOLS + BASE_WRITE_TOOLS,
            "auto_claude": [
                TOOL_UPDATE_SUBTASK_STATUS,
                TOOL_GET_BUILD_PROGRESS,
                TOOL_UPDATE_QA_STATUS,
                TOOL_RECORD_GOTCHA,
            ],
        },
    }

    if agent_type not in tool_mappings:
        # Default to coder tools
        agent_type = "coder"

    mapping = tool_mappings[agent_type]
    tools = mapping["base"] + mapping["auto_claude"]

    # Add Electron MCP tools for QA agents only (when enabled)
    # This prevents context bloat for coder/planner agents who don't need desktop automation
    if agent_type in ("qa_reviewer", "qa_fixer") and is_electron_mcp_enabled():
        tools.extend(ELECTRON_TOOLS)

    return tools
