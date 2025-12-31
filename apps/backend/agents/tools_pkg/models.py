"""
Tool Models and Constants
==========================

Defines tool name constants and configuration for auto-claude MCP tools.

This module is the single source of truth for all tool definitions used by
the Claude Agent SDK client. Tool lists are organized by category:

- Base tools: Core file operations (Read, Write, Edit, etc.)
- Web tools: Documentation and research (WebFetch, WebSearch)
- MCP tools: External integrations (Context7, Linear, Graphiti, etc.)
- Auto-Claude tools: Custom build management tools
"""

import os
from core.cdp_config import get_cdp_tools_for_agent
from core.mcp_config import is_electron_mcp_enabled

# =============================================================================
# Base Tools (Built-in Claude Code tools)
# =============================================================================

# Core file operation tools
BASE_READ_TOOLS = ["Read", "Glob", "Grep"]
BASE_WRITE_TOOLS = ["Write", "Edit", "Bash"]

# Web tools for documentation lookup and research
# Always available to all agents for accessing external information
WEB_TOOLS = ["WebFetch", "WebSearch"]

# =============================================================================
# Auto-Claude MCP Tools (Custom build management)
# =============================================================================

# Auto-Claude MCP tool names (prefixed with mcp__auto-claude__)
TOOL_UPDATE_SUBTASK_STATUS = "mcp__auto-claude__update_subtask_status"
TOOL_GET_BUILD_PROGRESS = "mcp__auto-claude__get_build_progress"
TOOL_RECORD_DISCOVERY = "mcp__auto-claude__record_discovery"
TOOL_RECORD_GOTCHA = "mcp__auto-claude__record_gotcha"
TOOL_GET_SESSION_CONTEXT = "mcp__auto-claude__get_session_context"
TOOL_UPDATE_QA_STATUS = "mcp__auto-claude__update_qa_status"

# =============================================================================
# External MCP Tools
# =============================================================================

# Context7 MCP tools for documentation lookup (always enabled)
CONTEXT7_TOOLS = [
    "mcp__context7__resolve-library-id",
    "mcp__context7__get-library-docs",
]

# Linear MCP tools for project management (when LINEAR_API_KEY is set)
LINEAR_TOOLS = [
    "mcp__linear-server__list_teams",
    "mcp__linear-server__get_team",
    "mcp__linear-server__list_projects",
    "mcp__linear-server__get_project",
    "mcp__linear-server__create_project",
    "mcp__linear-server__update_project",
    "mcp__linear-server__list_issues",
    "mcp__linear-server__get_issue",
    "mcp__linear-server__create_issue",
    "mcp__linear-server__update_issue",
    "mcp__linear-server__list_comments",
    "mcp__linear-server__create_comment",
    "mcp__linear-server__list_issue_statuses",
    "mcp__linear-server__list_issue_labels",
    "mcp__linear-server__list_users",
    "mcp__linear-server__get_user",
]

# Graphiti MCP tools for knowledge graph memory (when GRAPHITI_MCP_URL is set)
# See: https://github.com/getzep/graphiti
GRAPHITI_MCP_TOOLS = [
    "mcp__graphiti-memory__search_nodes",  # Search entity summaries
    "mcp__graphiti-memory__search_facts",  # Search relationships between entities
    "mcp__graphiti-memory__add_episode",  # Add data to knowledge graph
    "mcp__graphiti-memory__get_episodes",  # Retrieve recent episodes
    "mcp__graphiti-memory__get_entity_edge",  # Get specific entity/relationship
]

# =============================================================================
# Browser Automation MCP Tools (QA agents only)
# =============================================================================

# Puppeteer MCP tools for web browser automation
# Used for web frontend validation (non-Electron web apps)
# NOTE: Screenshots must be compressed (1280x720, quality 60, JPEG) to stay under
# Claude SDK's 1MB JSON message buffer limit. See GitHub issue #74.

# Base Puppeteer tools (always included when browser automation is enabled)
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

# Extended Puppeteer tools - Network domain
PUPPETEER_NETWORK_TOOLS = [
    "mcp__puppeteer__get_network_logs",
    "mcp__puppeteer__get_request_details",
]

# Extended Puppeteer tools - Storage domain
PUPPETEER_STORAGE_TOOLS = [
    "mcp__puppeteer__get_storage",
    "mcp__puppeteer__set_storage",
    "mcp__puppeteer__get_cookies",
    "mcp__puppeteer__get_app_state",
]

# Extended Puppeteer tools - Performance domain
PUPPETEER_PERFORMANCE_TOOLS = [
    "mcp__puppeteer__get_metrics",
    "mcp__puppeteer__get_memory_usage",
]

# Extended Puppeteer tools - Emulation domain
PUPPETEER_EMULATION_TOOLS = [
    "mcp__puppeteer__set_device",
    "mcp__puppeteer__set_network_throttle",
    "mcp__puppeteer__set_geolocation",
]

# Extended Puppeteer tools - Enhanced DOM interactions
PUPPETEER_DOM_TOOLS = [
    "mcp__puppeteer__drag_and_drop",
    "mcp__puppeteer__right_click",
    "mcp__puppeteer__scroll_to_element",
    "mcp__puppeteer__get_element_state",
]

# Extended Puppeteer tools - Console domain
PUPPETEER_CONSOLE_TOOLS = [
    "mcp__puppeteer__get_console_logs",
    "mcp__puppeteer__track_exceptions",
]

# All extended Puppeteer tools
PUPPETEER_EXTENDED_TOOLS = (
    PUPPETEER_TOOLS +
    PUPPETEER_NETWORK_TOOLS +
    PUPPETEER_STORAGE_TOOLS +
    PUPPETEER_PERFORMANCE_TOOLS +
    PUPPETEER_EMULATION_TOOLS +
    PUPPETEER_DOM_TOOLS +
    PUPPETEER_CONSOLE_TOOLS
)

# Electron MCP tools for desktop app automation (when ELECTRON_MCP_ENABLED is set)
# Uses electron-mcp-server to connect to Electron apps via Chrome DevTools Protocol.
# Electron app must be started with --remote-debugging-port=9222 (or ELECTRON_DEBUG_PORT).
# NOTE: Screenshots must be compressed to stay under Claude SDK's 1MB JSON message buffer limit.

# Base Electron tools (always included when CDP is enabled for an agent)
ELECTRON_TOOLS = [
    "mcp__electron__get_electron_window_info",  # Get info about running Electron windows
    "mcp__electron__take_screenshot",  # Capture screenshot of Electron window
    "mcp__electron__send_command_to_electron",  # Send commands (click, fill, evaluate JS)
    "mcp__electron__read_electron_logs",  # Read console logs from Electron app
]

# Extended CDP tools - Network domain
# Monitor HTTP requests/responses, performance timing
ELECTRON_NETWORK_TOOLS = [
    "mcp__electron__get_network_logs",  # Get request/response history
    "mcp__electron__get_request_details",  # Full request headers/body
    "mcp__electron__get_performance_timing",  # Resource timing metrics
]

# Extended CDP tools - Storage domain
# localStorage, sessionStorage, cookies, application state
ELECTRON_STORAGE_TOOLS = [
    "mcp__electron__get_storage",  # Read localStorage/sessionStorage
    "mcp__electron__set_storage",  # Write storage items
    "mcp__electron__clear_storage",  # Clear all storage
    "mcp__electron__get_cookies",  # Cookie inspection
    "mcp__electron__get_app_state",  # Full application state snapshot
]

# Extended CDP tools - Performance domain
# Metrics, memory usage, CPU profiling
ELECTRON_PERFORMANCE_TOOLS = [
    "mcp__electron__get_metrics",  # FCP, LCP, TTI, FPS
    "mcp__electron__get_memory_usage",  # Heap size, used memory
    "mcp__electron__start_profiling",  # Start CPU profiling
    "mcp__electron__stop_profiling",  # Stop CPU profiling
]

# Extended CDP tools - Emulation domain
# Device emulation, network throttling, geolocation, theme
ELECTRON_EMULATION_TOOLS = [
    "mcp__electron__set_device",  # Mobile/tablet emulation
    "mcp__electron__set_network_throttle",  # Offline/3G/4G
    "mcp__electron__set_geolocation",  # GPS simulation
    "mcp__electron__set_theme",  # Dark/light mode
]

# Extended CDP tools - Enhanced DOM interactions
# Drag and drop, right-click, hover, scroll
ELECTRON_DOM_TOOLS = [
    "mcp__electron__drag_and_drop",  # Drag element to target
    "mcp__electron__right_click",  # Context menu interaction
    "mcp__electron__hover",  # Hover over element
    "mcp__electron__scroll_to_element",  # Smooth scroll
    "mcp__electron__get_element_state",  # Disabled/hidden/visible status
]

# Extended CDP tools - Console enhancements
# Filtered logs, exception tracking
ELECTRON_CONSOLE_TOOLS = [
    "mcp__electron__get_logs_filtered",  # Filter by level/regex
    "mcp__electron__track_exceptions",  # Exception tracking
    "mcp__electron__get_console_history",  # Full history
]

# All extended CDP tools (for reference)
ELECTRON_EXTENDED_TOOLS = (
    ELECTRON_TOOLS +
    ELECTRON_NETWORK_TOOLS +
    ELECTRON_STORAGE_TOOLS +
    ELECTRON_PERFORMANCE_TOOLS +
    ELECTRON_EMULATION_TOOLS +
    ELECTRON_DOM_TOOLS +
    ELECTRON_CONSOLE_TOOLS
)

# =============================================================================
# Configuration
# =============================================================================

# is_electron_mcp_enabled() is now imported from core.mcp_config
# to eliminate duplication. This is the single source of truth.

# =============================================================================
# Agent Configuration Registry
# =============================================================================
# Single source of truth for phase → tools → MCP servers mapping.
# This enables phase-aware tool control and context window optimization.

AGENT_CONFIGS = {
    # ═══════════════════════════════════════════════════════════════════════
    # SPEC CREATION PHASES (Minimal tools, fast startup)
    # ═══════════════════════════════════════════════════════════════════════
    "spec_gatherer": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],  # No MCP needed - just reads project
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_researcher": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],  # Needs docs lookup
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_writer": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS,
        "mcp_servers": [],  # Just writes spec.md
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_critic": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],  # Self-critique, no external tools
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_discovery": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_context": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_validation": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_compaction": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # BUILD PHASES (Full tools + Graphiti memory)
    # Note: "linear" is conditional on project setting "update_linear_with_tasks"
    # ═══════════════════════════════════════════════════════════════════════
    "planner": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7", "graphiti", "auto-claude"],
        "mcp_servers_optional": ["linear"],  # Only if project setting enabled
        "auto_claude_tools": [
            TOOL_GET_BUILD_PROGRESS,
            TOOL_GET_SESSION_CONTEXT,
            TOOL_RECORD_DISCOVERY,
        ],
        "thinking_default": "ultrathink",
    },
    "coder": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7", "graphiti", "auto-claude"],
        "mcp_servers_optional": ["linear"],
        "auto_claude_tools": [
            TOOL_UPDATE_SUBTASK_STATUS,
            TOOL_GET_BUILD_PROGRESS,
            TOOL_RECORD_DISCOVERY,
            TOOL_RECORD_GOTCHA,
            TOOL_GET_SESSION_CONTEXT,
        ],
        "thinking_default": "ultrathink",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # QA PHASES (Read + test + browser + Graphiti memory)
    # ═══════════════════════════════════════════════════════════════════════
    "qa_reviewer": {
        # Read-only + Bash (for running tests) - reviewer should NOT edit code
        "tools": BASE_READ_TOOLS + ["Bash"] + WEB_TOOLS,
        "mcp_servers": ["context7", "graphiti", "auto-claude", "browser"],
        "mcp_servers_optional": ["linear"],  # For updating issue status
        "auto_claude_tools": [
            TOOL_GET_BUILD_PROGRESS,
            TOOL_UPDATE_QA_STATUS,
            TOOL_GET_SESSION_CONTEXT,
        ],
        "thinking_default": "ultrathink",
    },
    "qa_fixer": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7", "graphiti", "auto-claude", "browser"],
        "mcp_servers_optional": ["linear"],
        "auto_claude_tools": [
            TOOL_UPDATE_SUBTASK_STATUS,
            TOOL_GET_BUILD_PROGRESS,
            TOOL_UPDATE_QA_STATUS,
            TOOL_RECORD_GOTCHA,
        ],
        "thinking_default": "ultrathink",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # UTILITY PHASES (Minimal, no MCP)
    # ═══════════════════════════════════════════════════════════════════════
    "insights": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "merge_resolver": {
        "tools": [],  # Text-only analysis
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "commit_message": {
        "tools": [],
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "pr_reviewer": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,  # Read-only
        "mcp_servers": ["context7"],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # ANALYSIS PHASES
    # ═══════════════════════════════════════════════════════════════════════
    "analysis": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "batch_analysis": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "batch_validation": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # ROADMAP & IDEATION
    # ═══════════════════════════════════════════════════════════════════════
    "roadmap_discovery": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "competitor_analysis": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],  # WebSearch for competitor research
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    "ideation": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],
        "auto_claude_tools": [],
        "thinking_default": "ultrathink",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # DELEGATION SYSTEM AGENTS (Ad-hoc task coordination)
    # ═══════════════════════════════════════════════════════════════════════
    # Note: The coordinator is programmatic (delegation/coordinator.py), not an AI agent.
    # These agent types are used by the delegation system when routing to specialists.
    "coordinator": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],  # Minimal - just analysis
        "auto_claude_tools": [],
        "thinking_default": "medium",  # Balanced for cost
    },
    # Documentation agent (future - for Phase 3)
    "docs_agent": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],  # Needs docs lookup
        "auto_claude_tools": [],
        "thinking_default": "low",  # Docs don't need deep thinking
    },
}


# =============================================================================
# Agent Config Helper Functions
# =============================================================================


def get_agent_config(agent_type: str) -> dict:
    """
    Get full configuration for an agent type.

    Args:
        agent_type: The agent type identifier (e.g., 'coder', 'planner', 'qa_reviewer')

    Returns:
        Configuration dict containing tools, mcp_servers, auto_claude_tools, thinking_default

    Raises:
        ValueError: If agent_type is not found in AGENT_CONFIGS (strict mode)
    """
    if agent_type not in AGENT_CONFIGS:
        raise ValueError(
            f"Unknown agent type: '{agent_type}'. "
            f"Valid types: {sorted(AGENT_CONFIGS.keys())}"
        )
    return AGENT_CONFIGS[agent_type]


def get_required_mcp_servers(
    agent_type: str,
    project_capabilities: dict | None = None,
    linear_enabled: bool = False,
) -> list[str]:
    """
    Get MCP servers required for this agent type.

    Handles dynamic server selection:
    - "browser" → electron (if is_electron) or puppeteer (if is_web_frontend)
                 or chrome-devtools (if CDP_MCP_TYPE=chrome-devtools)
    - "linear" → only if in mcp_servers_optional AND linear_enabled is True
    - "graphiti" → only if GRAPHITI_MCP_URL is set

    Args:
        agent_type: The agent type identifier
        project_capabilities: Dict from detect_project_capabilities() or None
        linear_enabled: Whether Linear integration is enabled for this project

    Returns:
        List of MCP server names to start
    """
    from core.cdp_config import get_cdp_enabled_agents, get_cdp_mcp_server_name

    config = get_agent_config(agent_type)
    servers = list(config.get("mcp_servers", []))

    # Handle optional servers (e.g., Linear if project setting enabled)
    optional = config.get("mcp_servers_optional", [])
    if "linear" in optional and linear_enabled:
        servers.append("linear")

    # Handle dynamic "browser" → electron/chrome-devtools/puppeteer based on project type
    if "browser" in servers:
        servers = [s for s in servers if s != "browser"]
        if project_capabilities:
            is_electron = project_capabilities.get("is_electron", False)
            is_web_frontend = project_capabilities.get("is_web_frontend", False)

            # Check if this agent has CDP enabled
            cdp_enabled_agents = get_cdp_enabled_agents()
            agent_has_cdp = agent_type in cdp_enabled_agents

            if is_electron and is_electron_mcp_enabled() and agent_has_cdp:
                # Use the CDP MCP server specified in environment
                cdp_server = get_cdp_mcp_server_name()
                servers.append(cdp_server)
            elif is_web_frontend and not is_electron:
                # For web frontends, use Puppeteer or Chrome DevTools MCP
                if agent_has_cdp and os.environ.get("CDP_MCP_TYPE") == "chrome-devtools":
                    servers.append("chrome-devtools")
                else:
                    servers.append("puppeteer")

    # Filter graphiti if not enabled
    if "graphiti" in servers:
        if not os.environ.get("GRAPHITI_MCP_URL"):
            servers = [s for s in servers if s != "graphiti"]

    return servers


def get_default_thinking_level(agent_type: str) -> str:
    """
    Get default thinking level string for agent type.

    This returns the thinking level name (e.g., 'medium', 'high'), not the token budget.
    To convert to tokens, use phase_config.get_thinking_budget(level).

    Args:
        agent_type: The agent type identifier

    Returns:
        Thinking level string (none, low, medium, high, ultrathink)
    """
    config = get_agent_config(agent_type)
    return config.get("thinking_default", "medium")


def get_allowed_tools(
    agent_type: str,
    project_capabilities: dict | None = None,
    linear_enabled: bool = False,
) -> list[str]:
    """
    Get the list of allowed tools for an agent type.

    This function builds the complete tool list including:
    - Base tools from agent config
    - Browser tools (Electron, Chrome DevTools, or Puppeteer) if applicable
    - Dynamic CDP tools based on agent type and configuration

    Args:
        agent_type: The agent type identifier
        project_capabilities: Dict from detect_project_capabilities() or None
        linear_enabled: Whether Linear integration is enabled for this project

    Returns:
        List of allowed tool names for this agent
    """
    from core.cdp_config import get_cdp_enabled_agents, get_cdp_mcp_type

    config = get_agent_config(agent_type)
    tools = list(config.get("tools", []))

    # Add browser tools if the agent has CDP enabled
    if project_capabilities:
        is_electron = project_capabilities.get("is_electron", False)

        if is_electron and is_electron_mcp_enabled():
            # Check if this agent has CDP enabled
            cdp_enabled_agents = get_cdp_enabled_agents()
            if agent_type in cdp_enabled_agents:
                # Get CDP tools based on agent configuration and MCP type
                mcp_type = get_cdp_mcp_type()
                cdp_tools = get_cdp_tools_for_agent(agent_type, mcp_type=mcp_type)
                if cdp_tools:
                    tools.extend(cdp_tools)

    return tools
