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

# =============================================================================
# Electron MCP Tools
# =============================================================================
# Electron tool definitions are now in core/cdp_config.py (single source of truth).
# This module imports get_cdp_tools_for_agent() to dynamically get tool lists
# based on agent type and configuration.

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
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_researcher": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],  # Needs docs lookup
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_writer": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS,
        "mcp_servers": [],  # Just writes spec.md
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_critic": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],  # Self-critique, no external tools
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_discovery": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_context": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_validation": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "spec_compaction": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS,
        "mcp_servers": [],
        "maestro_tools": [],
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
        "maestro_tools": [
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
        "maestro_tools": [
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
        "maestro_tools": [
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
        "maestro_tools": [
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
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "merge_resolver": {
        "tools": [],  # Text-only analysis
        "mcp_servers": [],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "commit_message": {
        "tools": [],
        "mcp_servers": [],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "pr_reviewer": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,  # Read-only
        "mcp_servers": ["context7"],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "pr_orchestrator_parallel": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,  # Read-only for parallel PR orchestrator
        "mcp_servers": ["context7"],
        "auto_claude_tools": [],
        "thinking_default": "high",
    },
    "pr_followup_parallel": {
        "tools": BASE_READ_TOOLS
        + WEB_TOOLS,  # Read-only for parallel followup reviewer
        "mcp_servers": ["context7"],
        "auto_claude_tools": [],
        "thinking_default": "high",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # ANALYSIS PHASES
    # ═══════════════════════════════════════════════════════════════════════
    "analysis": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "batch_analysis": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "batch_validation": {
        "tools": BASE_READ_TOOLS,
        "mcp_servers": [],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    # ═══════════════════════════════════════════════════════════════════════
    # ROADMAP & IDEATION
    # ═══════════════════════════════════════════════════════════════════════
    "roadmap_discovery": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "competitor_analysis": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],  # WebSearch for competitor research
        "maestro_tools": [],
        "thinking_default": "ultrathink",
    },
    "ideation": {
        "tools": BASE_READ_TOOLS + WEB_TOOLS,
        "mcp_servers": [],
        "maestro_tools": [],
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
        "maestro_tools": [],
        "thinking_default": "medium",  # Balanced for cost
    },
    # Documentation agent (future - for Phase 3)
    "docs_agent": {
        "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS + WEB_TOOLS,
        "mcp_servers": ["context7"],  # Needs docs lookup
        "maestro_tools": [],
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


def _map_mcp_server_name(
    name: str, custom_server_ids: list[str] | None = None
) -> str | None:
    """
    Map user-friendly MCP server names to internal identifiers.
    Also accepts custom server IDs directly.

    Args:
        name: User-provided MCP server name
        custom_server_ids: List of custom server IDs to accept as-is

    Returns:
        Internal server identifier or None if not recognized
    """
    if not name:
        return None
    mappings = {
        "context7": "context7",
        "graphiti-memory": "graphiti",
        "graphiti": "graphiti",
        "linear": "linear",
        "electron": "electron",
        "puppeteer": "puppeteer",
        "auto-claude": "auto-claude",
    }
    # Check if it's a known mapping
    mapped = mappings.get(name.lower().strip())
    if mapped:
        return mapped
    # Check if it's a custom server ID (accept as-is)
    if custom_server_ids and name in custom_server_ids:
        return name
    return None


def get_required_mcp_servers(
    agent_type: str,
    project_capabilities: dict | None = None,
    linear_enabled: bool = False,
    mcp_config: dict | None = None,
) -> list[str]:
    """
    Get MCP servers required for this agent type.

    Handles dynamic server selection:
    - "browser" → electron (if is_electron) or puppeteer (if is_web_frontend)
                 or chrome-devtools (if CDP_MCP_TYPE=chrome-devtools)
    - "linear" → only if in mcp_servers_optional AND linear_enabled is True
    - "graphiti" → only if GRAPHITI_MCP_URL is set
    - Respects per-project MCP config overrides from .auto-claude/.env
    - Applies per-agent ADD/REMOVE overrides from AGENT_MCP_<agent>_ADD/REMOVE

    Args:
        agent_type: The agent type identifier
        project_capabilities: Dict from detect_project_capabilities() or None
        linear_enabled: Whether Linear integration is enabled for this project
        mcp_config: Per-project MCP server toggles from .auto-claude/.env
                   Keys: CONTEXT7_ENABLED, LINEAR_MCP_ENABLED, ELECTRON_MCP_ENABLED,
                         PUPPETEER_MCP_ENABLED, AGENT_MCP_<agent>_ADD/REMOVE

    Returns:
        List of MCP server names to start
    """
    from core.cdp_config import get_cdp_enabled_agents, get_cdp_mcp_server_name

    config = get_agent_config(agent_type)
    servers = list(config.get("mcp_servers", []))

    # Load per-project config (or use defaults)
    if mcp_config is None:
        mcp_config = {}

    # Filter context7 if explicitly disabled by project config
    if "context7" in servers:
        context7_enabled = mcp_config.get("CONTEXT7_ENABLED", "true")
        if str(context7_enabled).lower() == "false":
            servers = [s for s in servers if s != "context7"]

    # Handle optional servers (e.g., Linear if project setting enabled)
    optional = config.get("mcp_servers_optional", [])
    if "linear" in optional and linear_enabled:
        # Also check per-project LINEAR_MCP_ENABLED override
        linear_mcp_enabled = mcp_config.get("LINEAR_MCP_ENABLED", "true")
        if str(linear_mcp_enabled).lower() != "false":
            servers.append("linear")

    # Handle dynamic "browser" → electron/chrome-devtools/puppeteer based on project type
    if "browser" in servers:
        servers = [s for s in servers if s != "browser"]
        if project_capabilities:
            is_electron = project_capabilities.get("is_electron", False)
            is_web_frontend = project_capabilities.get("is_web_frontend", False)

            # Check per-project overrides (default false for both)
            electron_enabled = mcp_config.get("ELECTRON_MCP_ENABLED", "false")
            puppeteer_enabled = mcp_config.get("PUPPETEER_MCP_ENABLED", "false")

            # Check if this agent has CDP enabled
            cdp_enabled_agents = get_cdp_enabled_agents()
            agent_has_cdp = agent_type in cdp_enabled_agents

            # Electron: enabled by project config OR global env var AND agent has CDP
            if is_electron and agent_has_cdp and (
                str(electron_enabled).lower() == "true" or is_electron_mcp_enabled()
            ):
                # Use the CDP MCP server specified in environment
                cdp_server = get_cdp_mcp_server_name()
                servers.append(cdp_server)
            # Web frontend: Chrome DevTools or Puppeteer based on config
            elif is_web_frontend and not is_electron and agent_has_cdp:
                cdp_mcp_type = os.environ.get("CDP_MCP_TYPE", "electron")
                if cdp_mcp_type == "chrome-devtools":
                    servers.append("chrome-devtools")
                elif str(puppeteer_enabled).lower() == "true":
                    servers.append("puppeteer")

    # Filter graphiti if not enabled
    if "graphiti" in servers:
        if not os.environ.get("GRAPHITI_MCP_URL"):
            servers = [s for s in servers if s != "graphiti"]

    # ========== Apply per-agent MCP overrides ==========
    # Format: AGENT_MCP_<agent_type>_ADD=server1,server2
    #         AGENT_MCP_<agent_type>_REMOVE=server1,server2
    add_key = f"AGENT_MCP_{agent_type}_ADD"
    remove_key = f"AGENT_MCP_{agent_type}_REMOVE"

    # Extract custom server IDs for mapping (allows custom servers to be recognized)
    custom_servers = mcp_config.get("CUSTOM_MCP_SERVERS", [])
    custom_server_ids = [s.get("id") for s in custom_servers if s.get("id")]

    # Process additions
    if add_key in mcp_config:
        additions = [
            s.strip() for s in str(mcp_config[add_key]).split(",") if s.strip()
        ]
        for server in additions:
            mapped = _map_mcp_server_name(server, custom_server_ids)
            if mapped and mapped not in servers:
                servers.append(mapped)

    # Process removals (but never remove auto-claude)
    if remove_key in mcp_config:
        removals = [
            s.strip() for s in str(mcp_config[remove_key]).split(",") if s.strip()
        ]
        for server in removals:
            mapped = _map_mcp_server_name(server, custom_server_ids)
            if mapped and mapped != "auto-claude":  # auto-claude cannot be removed
                servers = [s for s in servers if s != mapped]

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
