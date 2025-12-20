"""
Agent Tool Permissions
======================

Manages which tools are allowed for each agent type to prevent context
pollution and accidental misuse.

Supports dynamic tool filtering based on project capabilities to optimize
context window usage. For example, Electron tools are only included for
Electron projects, not for Next.js or CLI projects.
"""

from .models import (
    BASE_READ_TOOLS,
    BASE_WRITE_TOOLS,
    ELECTRON_TOOLS,
    PUPPETEER_TOOLS,
    TOOL_GET_BUILD_PROGRESS,
    TOOL_GET_SESSION_CONTEXT,
    TOOL_RECORD_DISCOVERY,
    TOOL_RECORD_GOTCHA,
    TOOL_UPDATE_QA_STATUS,
    TOOL_UPDATE_SUBTASK_STATUS,
    is_electron_mcp_enabled,
)


def get_allowed_tools(
    agent_type: str,
    project_capabilities: dict | None = None,
) -> list[str]:
    """
    Get the list of allowed tools for a specific agent type.

    This ensures each agent only sees tools relevant to their role,
    preventing context pollution and accidental misuse.

    When project_capabilities is provided, MCP tools are filtered based on
    the project type. For example:
    - Electron projects get Electron MCP tools
    - Web frontends (non-Electron) get Puppeteer MCP tools
    - CLI projects get neither

    Args:
        agent_type: One of 'planner', 'coder', 'qa_reviewer', 'qa_fixer'
        project_capabilities: Optional dict from detect_project_capabilities()
                            containing flags like is_electron, is_web_frontend, etc.

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

    # Add MCP tools for QA agents only, based on project capabilities
    if agent_type in ("qa_reviewer", "qa_fixer"):
        tools.extend(_get_qa_mcp_tools(project_capabilities))

    return tools


def _get_qa_mcp_tools(project_capabilities: dict | None) -> list[str]:
    """
    Get the list of MCP tools for QA agents based on project capabilities.

    This function determines which MCP tools to include based on:
    1. Project type detection (Electron, web frontend, etc.)
    2. Environment variables (ELECTRON_MCP_ENABLED)

    Args:
        project_capabilities: Dict from detect_project_capabilities() or None

    Returns:
        List of MCP tool names to include
    """
    tools = []

    # If no capabilities provided, fall back to legacy behavior
    # (check env var only)
    if project_capabilities is None:
        if is_electron_mcp_enabled():
            tools.extend(ELECTRON_TOOLS)
        return tools

    # Project-capability-based tool selection
    is_electron = project_capabilities.get("is_electron", False)
    is_web_frontend = project_capabilities.get("is_web_frontend", False)

    # Electron projects get Electron MCP tools (if enabled)
    if is_electron and is_electron_mcp_enabled():
        tools.extend(ELECTRON_TOOLS)

    # Web frontends (non-Electron) get Puppeteer tools
    # Puppeteer is always available, no env var check needed
    if is_web_frontend and not is_electron:
        tools.extend(PUPPETEER_TOOLS)

    return tools
