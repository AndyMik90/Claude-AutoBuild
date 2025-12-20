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

# Puppeteer MCP tools for web browser automation
# Used for web frontend validation (non-Electron web apps)
PUPPETEER_TOOLS = [
    "mcp__puppeteer__puppeteer_connect_active_tab",
    "mcp__puppeteer__puppeteer_navigate",
    "mcp__puppeteer__puppeteer_screenshot",
    "mcp__puppeteer__puppeteer_click",
    "mcp__puppeteer__puppeteer_fill",
    "mcp__puppeteer__puppeteer_select",
    "mcp__puppeteer__puppeteer_hover",
    "mcp__puppeteer__puppeteer_evaluate",
]

# Electron MCP tools for desktop app automation (when ELECTRON_MCP_ENABLED is set)
# Uses electron-mcp-server to connect to Electron apps via Chrome DevTools Protocol.
# Electron app must be started with --remote-debugging-port=9222 (or ELECTRON_DEBUG_PORT).
# These tools are only available to QA agents (qa_reviewer, qa_fixer), not Coder/Planner.
ELECTRON_TOOLS = [
    "mcp__electron__get_electron_window_info",  # Get info about running Electron windows
    "mcp__electron__take_screenshot",  # Capture screenshot of Electron window
    "mcp__electron__send_command_to_electron",  # Send commands (click, fill, evaluate JS)
    "mcp__electron__read_electron_logs",  # Read console logs from Electron app
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
