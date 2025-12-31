"""
Custom MCP Tools for Maestro Agents
====================================

This module provides custom MCP tools that agents can use for reliable
operations on maestro data structures. These tools replace prompt-based
JSON manipulation with guaranteed-correct operations.

Benefits:
- 100% reliable JSON operations (no malformed output)
- Reduced context usage (tool definitions << prompt instructions)
- Type-safe with proper error handling
- Each agent only sees tools relevant to their role via allowed_tools

Usage:
    from maestro_tools import create_maestro_mcp_server, get_allowed_tools

    # Create the MCP server
    mcp_server = create_maestro_mcp_server(spec_dir, project_dir)

    # Get allowed tools for a specific agent type
    allowed_tools = get_allowed_tools("coder")

    # Use in ClaudeAgentOptions
    options = ClaudeAgentOptions(
        mcp_servers={"maestro": mcp_server},
        allowed_tools=allowed_tools,
        ...
    )
"""

from .models import (
    # Agent configuration registry
    AGENT_CONFIGS,
    # Base tools
    BASE_READ_TOOLS,
    BASE_WRITE_TOOLS,
    # MCP tool lists
    CONTEXT7_TOOLS,
    ELECTRON_TOOLS,
    GRAPHITI_MCP_TOOLS,
    LINEAR_TOOLS,
    PUPPETEER_TOOLS,
    PUPPETEER_EXTENDED_TOOLS,
    # Maestro tool names
    TOOL_GET_BUILD_PROGRESS,
    TOOL_GET_SESSION_CONTEXT,
    TOOL_RECORD_DISCOVERY,
    TOOL_RECORD_GOTCHA,
    TOOL_UPDATE_QA_STATUS,
    TOOL_UPDATE_SUBTASK_STATUS,
    WEB_TOOLS,
    # Config functions
    get_agent_config,
    get_default_thinking_level,
    get_required_mcp_servers,
)
from .permissions import get_all_agent_types, get_allowed_tools
from .registry import create_maestro_mcp_server, is_tools_available

__all__ = [
    # Main API
    "create_maestro_mcp_server",
    "get_allowed_tools",
    "is_tools_available",
    # Agent configuration registry
    "AGENT_CONFIGS",
    "get_agent_config",
    "get_required_mcp_servers",
    "get_default_thinking_level",
    "get_all_agent_types",
    # Base tool lists
    "BASE_READ_TOOLS",
    "BASE_WRITE_TOOLS",
    "WEB_TOOLS",
    # MCP tool lists
    "CONTEXT7_TOOLS",
    "LINEAR_TOOLS",
    "GRAPHITI_MCP_TOOLS",
    "ELECTRON_TOOLS",
    "PUPPETEER_TOOLS",
    "PUPPETEER_EXTENDED_TOOLS",
    # Maestro tool name constants
    "TOOL_UPDATE_SUBTASK_STATUS",
    "TOOL_GET_BUILD_PROGRESS",
    "TOOL_RECORD_DISCOVERY",
    "TOOL_RECORD_GOTCHA",
    "TOOL_GET_SESSION_CONTEXT",
    "TOOL_UPDATE_QA_STATUS",
]
