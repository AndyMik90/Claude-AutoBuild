"""
Tool Models and Constants
==========================

Defines tool name constants and configuration for auto-claude MCP tools.
"""

import os

# =============================================================================
# Tool Name Constants
# =============================================================================

# Auto-Claude MCP tool names (prefixed with mcp__auto-claude__)
TOOL_UPDATE_SUBTASK_STATUS = "mcp__auto-claude__update_subtask_status"
TOOL_GET_BUILD_PROGRESS = "mcp__auto-claude__get_build_progress"
TOOL_RECORD_DISCOVERY = "mcp__auto-claude__record_discovery"
TOOL_RECORD_GOTCHA = "mcp__auto-claude__record_gotcha"
TOOL_GET_SESSION_CONTEXT = "mcp__auto-claude__get_session_context"
TOOL_UPDATE_QA_STATUS = "mcp__auto-claude__update_qa_status"

# Electron MCP tools for desktop app automation (when ELECTRON_MCP_ENABLED is set)
# Uses puppeteer-mcp-server to connect to Electron apps via Chrome DevTools Protocol.
# Electron app must be started with --remote-debugging-port=9222 (or ELECTRON_DEBUG_PORT).
# These tools are only available to QA agents (qa_reviewer, qa_fixer), not Coder/Planner.
ELECTRON_TOOLS = [
    "mcp__electron__electron_connect",  # Connect to Electron app via DevTools
    "mcp__electron__electron_screenshot",  # Take screenshot of Electron window
    "mcp__electron__electron_click",  # Click element in Electron app
    "mcp__electron__electron_fill",  # Fill input field in Electron app
    "mcp__electron__electron_evaluate",  # Execute JS in Electron renderer
    "mcp__electron__electron_get_window_info",  # Get window state/bounds
    "mcp__electron__electron_get_console",  # Get console logs from renderer
]

# Base tools available to all agents
BASE_READ_TOOLS = ["Read", "Glob", "Grep"]
BASE_WRITE_TOOLS = ["Write", "Edit", "Bash"]

# =============================================================================
# Configuration
# =============================================================================


def is_electron_mcp_enabled() -> bool:
    """
    Check if Electron MCP server integration is enabled.

    Requires ELECTRON_MCP_ENABLED to be set to 'true'.
    When enabled, QA agents can use Electron MCP tools to connect to Electron apps
    via Chrome DevTools Protocol on the configured debug port.
    """
    return os.environ.get("ELECTRON_MCP_ENABLED", "").lower() == "true"
