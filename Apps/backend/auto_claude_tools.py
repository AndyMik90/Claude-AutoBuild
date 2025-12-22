"""
Auto Claude tools module facade.

Provides MCP tools for agent operations.
Uses lazy imports to avoid circular dependencies.
"""


def __getattr__(name):
    """Lazy import to avoid circular imports."""
    if name in (
        "ELECTRON_TOOLS",
        "TOOL_GET_BUILD_PROGRESS",
        "TOOL_GET_SESSION_CONTEXT",
        "TOOL_RECORD_DISCOVERY",
        "TOOL_RECORD_GOTCHA",
        "TOOL_UPDATE_QA_STATUS",
        "TOOL_UPDATE_SUBTASK_STATUS",
        "is_electron_mcp_enabled",
    ):
        from agents.tools_pkg.models import (
            ELECTRON_TOOLS,
            TOOL_GET_BUILD_PROGRESS,
            TOOL_GET_SESSION_CONTEXT,
            TOOL_RECORD_DISCOVERY,
            TOOL_RECORD_GOTCHA,
            TOOL_UPDATE_QA_STATUS,
            TOOL_UPDATE_SUBTASK_STATUS,
            is_electron_mcp_enabled,
        )

        return locals()[name]
    elif name == "get_allowed_tools":
        from agents.tools_pkg.permissions import get_allowed_tools

        return get_allowed_tools
    elif name in ("create_auto_claude_mcp_server", "is_tools_available"):
        from agents.tools_pkg.registry import (
            create_auto_claude_mcp_server,
            is_tools_available,
        )

        return locals()[name]
    raise AttributeError(f"module 'auto_claude_tools' has no attribute '{name}'")


__all__ = [
    "create_auto_claude_mcp_server",
    "get_allowed_tools",
    "is_tools_available",
    "TOOL_UPDATE_SUBTASK_STATUS",
    "TOOL_GET_BUILD_PROGRESS",
    "TOOL_RECORD_DISCOVERY",
    "TOOL_RECORD_GOTCHA",
    "TOOL_GET_SESSION_CONTEXT",
    "TOOL_UPDATE_QA_STATUS",
    "ELECTRON_TOOLS",
    "is_electron_mcp_enabled",
]
