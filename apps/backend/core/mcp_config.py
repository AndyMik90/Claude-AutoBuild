"""
MCP Configuration Utilities
============================

Centralized configuration for MCP (Model Context Protocol) server integration.
This module is the single source of truth for MCP-related configuration,
eliminating duplication across the codebase.

Functions moved from:
- core/client.py (is_electron_mcp_enabled, is_graphiti_mcp_enabled, etc.)
- agents/tools_pkg/models.py (is_electron_mcp_enabled duplicate)
"""

import os


def parse_bool_env_var(value: str) -> bool:
    """
    Parse a boolean environment variable value.

    Accepts: true, 1, yes (case-insensitive)
    Rejects: all other values

    Args:
        value: The environment variable value string

    Returns:
        True if value is a truthy string, False otherwise
    """
    return value.lower() in ("true", "1", "yes")


def get_env_bool(key: str, default: bool = False) -> bool:
    """
    Get a boolean value from an environment variable.

    Args:
        key: Environment variable name
        default: Default value if not set

    Returns:
        Boolean value from environment variable
    """
    return parse_bool_env_var(os.environ.get(key, str(default)))


def parse_env_list(key: str, default: str = "") -> list[str]:
    """
    Parse a comma-separated list from an environment variable.

    Args:
        key: Environment variable name
        default: Default value if not set

    Returns:
        List of non-empty stripped strings
    """
    value = os.environ.get(key, default)
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


# =============================================================================
# MCP Server Configuration
# =============================================================================


def is_graphiti_mcp_enabled() -> bool:
    """
    Check if Graphiti MCP server integration is enabled.

    Requires GRAPHITI_MCP_URL to be set (e.g., http://localhost:8000/mcp/)
    This is separate from GRAPHITI_ENABLED which controls the Python library integration.

    Returns:
        True if GRAPHITI_MCP_URL is set, False otherwise
    """
    return bool(os.environ.get("GRAPHITI_MCP_URL"))


def get_graphiti_mcp_url() -> str:
    """
    Get the Graphiti MCP server URL.

    Returns:
        The GRAPHITI_MCP_URL value, or default localhost URL
    """
    return os.environ.get("GRAPHITI_MCP_URL", "http://localhost:8000/mcp/")


def is_electron_mcp_enabled() -> bool:
    """
    Check if Electron MCP server integration is enabled.

    Requires ELECTRON_MCP_ENABLED to be set to 'true'.
    When enabled, QA agents can use Puppeteer MCP tools to connect to Electron apps
    via Chrome DevTools Protocol on the configured debug port.

    Returns:
        True if ELECTRON_MCP_ENABLED is set to 'true', False otherwise
    """
    return os.environ.get("ELECTRON_MCP_ENABLED", "").lower() == "true"


def get_electron_debug_port() -> int:
    """
    Get the Electron remote debugging port.

    Returns:
        The port number from ELECTRON_DEBUG_PORT, or 9222 as default
    """
    return int(os.environ.get("ELECTRON_DEBUG_PORT", "9222"))


def should_use_claude_md() -> bool:
    """
    Check if CLAUDE.md instructions should be included in system prompt.

    Returns:
        True if USE_CLAUDE_MD is set to 'true', False otherwise
    """
    return os.environ.get("USE_CLAUDE_MD", "").lower() == "true"
