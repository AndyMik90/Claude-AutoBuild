"""
CDP Configuration System
========================

Centralized configuration for Chrome DevTools Protocol (CDP) tools
in the Auto Claude application.

This module provides:
- CDP tool category definitions
- Per-agent-type CDP tool permissions
- Environment variable-based configuration
- Dynamic tool selection based on agent type and settings
"""

import os
from typing import Literal

# =============================================================================
# CDP Tool Categories
# =============================================================================

CDPLogLevel = Literal["none", "basic", "verbose", "debug"]

# CDP tool categories for granular control
CDPToolCategory = Literal[
    "network",      # Network monitoring (requests, responses, timing)
    "storage",      # Storage inspection (localStorage, cookies, state)
    "performance",  # Performance metrics (FCP, LCP, memory, profiling)
    "emulation",    # Device/network emulation (mobile, throttling, geolocation)
    "console",      # Console logging and exception tracking
    "dom",          # Enhanced DOM interactions (drag, hover, scroll)
]

# =============================================================================
# Tool Name Definitions
# =============================================================================

# =============================================================================
# Chrome DevTools MCP Tools (Google's Official Server)
# =============================================================================
# See: https://github.com/ChromeDevTools/chrome-devtools-mcp
# These tools are provided by Google's official chrome-devtools-mcp npm package.
# Tools are prefixed with mcp__chrome-devtools__ when used via MCP.

# Input automation tools (8 tools)
CHROME_DEVTOOLS_INPUT_TOOLS = [
    "mcp__chrome-devtools__click",
    "mcp__chrome-devtools__drag",
    "mcp__chrome-devtools__fill",
    "mcp__chrome-devtools__fill_form",
    "mcp__chrome-devtools__handle_dialog",
    "mcp__chrome-devtools__hover",
    "mcp__chrome-devtools__press_key",
    "mcp__chrome-devtools__upload_file",
]

# Navigation automation tools (6 tools)
CHROME_DEVTOOLS_NAVIGATION_TOOLS = [
    "mcp__chrome-devtools__close_page",
    "mcp__chrome-devtools__list_pages",
    "mcp__chrome-devtools__navigate_page",
    "mcp__chrome-devtools__new_page",
    "mcp__chrome-devtools__select_page",
    "mcp__chrome-devtools__wait_for",
]

# Emulation tools (2 tools)
CHROME_DEVTOOLS_EMULATION_TOOLS = [
    "mcp__chrome-devtools__emulate",
    "mcp__chrome-devtools__resize_page",
]

# Performance tools (3 tools)
CHROME_DEVTOOLS_PERFORMANCE_TOOLS = [
    "mcp__chrome-devtools__performance_analyze_insight",
    "mcp__chrome-devtools__performance_start_trace",
    "mcp__chrome-devtools__performance_stop_trace",
]

# Network tools (2 tools)
CHROME_DEVTOOLS_NETWORK_TOOLS = [
    "mcp__chrome-devtools__get_network_request",
    "mcp__chrome-devtools__list_network_requests",
]

# Debugging tools (5 tools)
CHROME_DEVTOOLS_DEBUGGING_TOOLS = [
    "mcp__chrome-devtools__evaluate_script",
    "mcp__chrome-devtools__get_console_message",
    "mcp__chrome-devtools__list_console_messages",
    "mcp__chrome-devtools__take_screenshot",
    "mcp__chrome-devtools__take_snapshot",
]

# All Chrome DevTools MCP tools
CHROME_DEVTOOLS_ALL_TOOLS = (
    CHROME_DEVTOOLS_INPUT_TOOLS +
    CHROME_DEVTOOLS_NAVIGATION_TOOLS +
    CHROME_DEVTOOLS_EMULATION_TOOLS +
    CHROME_DEVTOOLS_PERFORMANCE_TOOLS +
    CHROME_DEVTOOLS_NETWORK_TOOLS +
    CHROME_DEVTOOLS_DEBUGGING_TOOLS
)

# =============================================================================
# Chrome DevTools MCP Tool Category Mapping
# =============================================================================
# Maps Chrome DevTools MCP tools to Auto Claude's CDP categories
CHROME_DEVTOOLS_CATEGORY_MAP: dict[CDPToolCategory, list[str]] = {
    "network": CHROME_DEVTOOLS_NETWORK_TOOLS,
    "storage": [],  # Storage tools are part of debugging in Chrome DevTools MCP
    "performance": CHROME_DEVTOOLS_PERFORMANCE_TOOLS,
    "emulation": CHROME_DEVTOOLS_EMULATION_TOOLS,
    "console": [
        "mcp__chrome-devtools__evaluate_script",
        "mcp__chrome-devtools__get_console_message",
        "mcp__chrome-devtools__list_console_messages",
    ],
    "dom": (
        CHROME_DEVTOOLS_INPUT_TOOLS +
        CHROME_DEVTOOLS_NAVIGATION_TOOLS +
        ["mcp__chrome-devtools__take_screenshot", "mcp__chrome-devtools__take_snapshot"]
    ),
}

# =============================================================================
# Electron MCP Tools (Existing - for Electron Desktop Apps)
# =============================================================================
# These tools are from the custom electron-mcp-server in providers/electron-mcp-server/

# Base Electron tools (existing)
ELECTRON_BASE_TOOLS = [
    "mcp__electron__get_electron_window_info",
    "mcp__electron__take_screenshot",
    "mcp__electron__send_command_to_electron",
    "mcp__electron__read_electron_logs",
]

# Network domain tools
ELECTRON_NETWORK_TOOLS = [
    "mcp__electron__get_network_logs",
    "mcp__electron__get_request_details",
    "mcp__electron__get_performance_timing",
]

# Storage tools
ELECTRON_STORAGE_TOOLS = [
    "mcp__electron__get_storage",
    "mcp__electron__set_storage",
    "mcp__electron__clear_storage",
    "mcp__electron__get_cookies",
    "mcp__electron__get_app_state",
]

# Performance tools
ELECTRON_PERFORMANCE_TOOLS = [
    "mcp__electron__get_metrics",
    "mcp__electron__get_memory_usage",
    "mcp__electron__start_profiling",
    "mcp__electron__stop_profiling",
]

# Emulation tools
ELECTRON_EMULATION_TOOLS = [
    "mcp__electron__set_device",
    "mcp__electron__set_network_throttle",
    "mcp__electron__set_geolocation",
    "mcp__electron__set_theme",
]

# Enhanced DOM tools
ELECTRON_DOM_TOOLS = [
    "mcp__electron__drag_and_drop",
    "mcp__electron__right_click",
    "mcp__electron__hover",
    "mcp__electron__scroll_to_element",
    "mcp__electron__get_element_state",
]

# Console enhancements
ELECTRON_CONSOLE_TOOLS = [
    "mcp__electron__get_logs_filtered",
    "mcp__electron__track_exceptions",
    "mcp__electron__get_console_history",
]

# =============================================================================
# Tool Category Mapping
# =============================================================================

CDP_TOOL_CATEGORY_MAP: dict[CDPToolCategory, list[str]] = {
    "network": ELECTRON_NETWORK_TOOLS,
    "storage": ELECTRON_STORAGE_TOOLS,
    "performance": ELECTRON_PERFORMANCE_TOOLS,
    "emulation": ELECTRON_EMULATION_TOOLS,
    "console": ELECTRON_CONSOLE_TOOLS,
    "dom": ELECTRON_DOM_TOOLS,
}

# =============================================================================
# Default Agent Permissions
# =============================================================================

CDP_AGENT_DEFAULT_PERMISSIONS: dict[str, list[CDPToolCategory]] = {
    "qa_reviewer": ["network", "storage", "performance", "console", "dom"],
    "qa_fixer": ["network", "storage", "console", "dom"],
    "coder": [],  # Default: no CDP to minimize context
    "planner": [],  # Default: no CDP
    "spec_gatherer": [],
    "spec_researcher": [],
    "spec_writer": [],
    "spec_critic": [],
    "spec_discovery": [],
    "spec_context": [],
    "spec_validation": [],
    "spec_compaction": [],
    "insights": [],
    "merge_resolver": [],
    "commit_message": [],
    "pr_reviewer": [],
    "analysis": [],
    "batch_analysis": [],
    "batch_validation": [],
    "roadmap_discovery": [],
    "competitor_analysis": [],
    "ideation": [],
}

# =============================================================================
# Configuration Functions
# =============================================================================


def get_cdp_enabled_agents() -> set[str]:
    """
    Get the set of agent types that have CDP tools enabled.

    Reads from CDP_ENABLED_FOR_AGENTS environment variable.
    Format: comma-separated list of agent types (e.g., "qa_reviewer,qa_fixer,coder")

    Returns:
        Set of agent type strings that have CDP enabled
    """
    enabled_agents_str = os.environ.get("CDP_ENABLED_FOR_AGENTS", "")
    if not enabled_agents_str:
        # Default: only QA agents
        return {"qa_reviewer", "qa_fixer"}

    return {agent.strip() for agent in enabled_agents_str.split(",") if agent.strip()}


def get_cdp_enabled_categories() -> set[CDPToolCategory]:
    """
    Get the set of CDP tool categories that are enabled.

    Reads from CDP_TOOL_CATEGORIES environment variable.
    Format: comma-separated list of categories (e.g., "network,storage,performance")

    Returns:
        Set of enabled CDP tool categories
    """
    enabled_categories_str = os.environ.get("CDP_TOOL_CATEGORIES", "")
    if not enabled_categories_str:
        # Default: enable all categories
        return set(CDP_TOOL_CATEGORY_MAP.keys())

    categories = set()
    valid_categories = set(CDP_TOOL_CATEGORY_MAP.keys())

    for cat in enabled_categories_str.split(","):
        cat = cat.strip()
        if cat in valid_categories:
            categories.add(cat)

    return categories


def get_cdp_log_level() -> CDPLogLevel:
    """
    Get the CDP logging level.

    Reads from CDP_LOG_LEVEL environment variable.
    Valid values: none, basic, verbose, debug

    Returns:
        Current CDP log level (defaults to "basic")
    """
    log_level = os.environ.get("CDP_LOG_LEVEL", "basic").lower()
    valid_levels = {"none", "basic", "verbose", "debug"}

    if log_level not in valid_levels:
        return "basic"

    return log_level


def get_cdp_categories_for_agent(agent_type: str) -> list[CDPToolCategory]:
    """
    Get the CDP tool categories enabled for a specific agent type.

    Combines:
    1. Default permissions for the agent type
    2. Globally enabled categories
    3. Agent-specific enabled flag

    Args:
        agent_type: The agent type identifier (e.g., 'coder', 'qa_reviewer')

    Returns:
        List of enabled CDP tool categories for this agent
    """
    # Check if this agent type has CDP enabled globally
    enabled_agents = get_cdp_enabled_agents()
    if agent_type not in enabled_agents:
        return []

    # Get default permissions for this agent
    default_permissions = CDP_AGENT_DEFAULT_PERMISSIONS.get(agent_type, [])

    # Get globally enabled categories
    enabled_categories = get_cdp_enabled_categories()

    # Intersect: only categories that are both in permissions and globally enabled
    return [cat for cat in default_permissions if cat in enabled_categories]


def get_cdp_mcp_type() -> str:
    """
    Get the type of CDP MCP server to use.

    Reads from CDP_MCP_TYPE environment variable.
    Valid values: electron, chrome-devtools

    Returns:
        CDP MCP server type (defaults to 'electron' for backward compatibility)
    """
    mcp_type = os.environ.get("CDP_MCP_TYPE", "electron").lower()
    if mcp_type not in ("electron", "chrome-devtools"):
        return "electron"
    return mcp_type


def get_cdp_tools_for_agent(agent_type: str, mcp_type: str | None = None) -> list[str]:
    """
    Get the complete list of CDP tools for a specific agent type.

    Includes:
    - Base tools (always included if agent has CDP enabled)
    - Category-specific tools based on agent permissions

    Args:
        agent_type: The agent type identifier
        mcp_type: MCP server type ('electron' or 'chrome-devtools')
                  If None, uses CDP_MCP_TYPE environment variable

    Returns:
        List of CDP tool names for this agent
    """
    categories = get_cdp_categories_for_agent(agent_type)

    if not categories:
        # No CDP categories enabled for this agent
        return []

    # Determine MCP type
    if mcp_type is None:
        mcp_type = get_cdp_mcp_type()

    # Select the appropriate tool set based on MCP type
    if mcp_type == "chrome-devtools":
        # Use Chrome DevTools MCP tools
        base_tools = []  # Chrome DevTools MCP has no separate base tools
        category_map = CHROME_DEVTOOLS_CATEGORY_MAP
    else:
        # Use Electron MCP tools (default for backward compatibility)
        base_tools = ELECTRON_BASE_TOOLS
        category_map = CDP_TOOL_CATEGORY_MAP

    # Start with base tools
    tools = list(base_tools)

    # Add category-specific tools
    for category in categories:
        tools.extend(category_map.get(category, []))

    return tools


def get_cdp_mcp_server_name() -> str:
    """
    Get the MCP server name for CDP integration.

    Returns:
        MCP server name to use in client configuration
    """
    mcp_type = get_cdp_mcp_type()
    if mcp_type == "chrome-devtools":
        return "chrome-devtools"
    return "electron"


def is_cdp_enabled_for_agent(agent_type: str) -> bool:
    """
    Check if CDP tools are enabled for a specific agent type.

    Args:
        agent_type: The agent type identifier

    Returns:
        True if the agent has any CDP tools enabled
    """
    return len(get_cdp_categories_for_agent(agent_type)) > 0


def get_cdp_config_summary() -> dict:
    """
    Get a summary of current CDP configuration.

    Returns:
        Dictionary containing configuration summary
    """
    enabled_agents = get_cdp_enabled_agents()
    enabled_categories = get_cdp_enabled_categories()
    log_level = get_cdp_log_level()
    mcp_type = get_cdp_mcp_type()

    return {
        "mcp_type": mcp_type,
        "mcp_server_name": get_cdp_mcp_server_name(),
        "enabled_agents": sorted(enabled_agents),
        "enabled_categories": sorted(enabled_categories),
        "log_level": log_level,
        "agent_permissions": {
            agent: get_cdp_categories_for_agent(agent)
            for agent in CDP_AGENT_DEFAULT_PERMISSIONS.keys()
            if is_cdp_enabled_for_agent(agent)
        },
    }


def get_cdp_electron_mcp_config() -> dict:
    """
    Get Electron MCP configuration summary.

    This provides detailed information about the Electron MCP server setup,
    including configuration values and tool availability for agents.

    Returns:
        Dictionary containing Electron MCP configuration details
    """
    # Import from mcp_config to avoid circular dependency
    from core.mcp_config import is_electron_mcp_enabled, get_electron_debug_port

    enabled_agents = get_cdp_enabled_agents()
    enabled_categories = get_cdp_enabled_categories()
    log_level = get_cdp_log_level()

    return {
        "enabled": is_electron_mcp_enabled(),
        "debug_port": get_electron_debug_port(),
        "enabled_agents": sorted(enabled_agents),
        "enabled_categories": sorted(enabled_categories),
        "log_level": log_level,
        "base_tools": ELECTRON_BASE_TOOLS,
        "available_tool_categories": {
            "network": {
                "tools": ELECTRON_NETWORK_TOOLS,
                "count": len(ELECTRON_NETWORK_TOOLS),
            },
            "storage": {
                "tools": ELECTRON_STORAGE_TOOLS,
                "count": len(ELECTRON_STORAGE_TOOLS),
            },
            "performance": {
                "tools": ELECTRON_PERFORMANCE_TOOLS,
                "count": len(ELECTRON_PERFORMANCE_TOOLS),
            },
            "emulation": {
                "tools": ELECTRON_EMULATION_TOOLS,
                "count": len(ELECTRON_EMULATION_TOOLS),
            },
            "console": {
                "tools": ELECTRON_CONSOLE_TOOLS,
                "count": len(ELECTRON_CONSOLE_TOOLS),
            },
            "dom": {
                "tools": ELECTRON_DOM_TOOLS,
                "count": len(ELECTRON_DOM_TOOLS),
            },
        },
        "agent_permissions": {
            agent: get_cdp_categories_for_agent(agent)
            for agent in CDP_AGENT_DEFAULT_PERMISSIONS.keys()
            if is_cdp_enabled_for_agent(agent)
        },
    }


# =============================================================================
# Configuration Validation
# =============================================================================


def validate_cdp_config() -> list[str]:
    """
    Validate CDP configuration and return any warnings or errors.

    Returns:
        List of warning/error messages (empty if valid)
    """
    warnings = []

    # Check for invalid agent types in CDP_ENABLED_FOR_AGENTS
    enabled_agents = get_cdp_enabled_agents()
    valid_agents = set(CDP_AGENT_DEFAULT_PERMISSIONS.keys())
    invalid_agents = enabled_agents - valid_agents

    if invalid_agents:
        warnings.append(
            f"Unknown agent types in CDP_ENABLED_FOR_AGENTS: {sorted(invalid_agents)}"
        )

    # Check for invalid categories in CDP_TOOL_CATEGORIES
    enabled_categories = get_cdp_enabled_categories()
    valid_categories = set(CDP_TOOL_CATEGORY_MAP.keys())
    invalid_categories = enabled_categories - valid_categories

    if invalid_categories:
        warnings.append(
            f"Unknown tool categories in CDP_TOOL_CATEGORIES: {sorted(invalid_categories)}"
        )

    return warnings
