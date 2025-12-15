"""
Claude SDK Client Configuration
===============================

Functions for creating and configuring the Claude Agent SDK client.
"""

import json
import os
from pathlib import Path

from auto_claude_tools import (
    create_auto_claude_mcp_server,
    is_tools_available,
)
from auto_claude_tools import (
    get_allowed_tools as get_agent_allowed_tools,
)
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
from claude_agent_sdk.types import HookMatcher
from linear_updater import is_linear_enabled
from security import bash_security_hook


def is_graphiti_mcp_enabled() -> bool:
    """
    Check if Graphiti MCP server integration is enabled.

    Requires GRAPHITI_MCP_URL to be set (e.g., http://localhost:8000/mcp/)
    This is separate from GRAPHITI_ENABLED which controls the Python library integration.
    """
    return bool(os.environ.get("GRAPHITI_MCP_URL"))


def get_graphiti_mcp_url() -> str:
    """Get the Graphiti MCP server URL."""
    return os.environ.get("GRAPHITI_MCP_URL", "http://localhost:8000/mcp/")


# Puppeteer MCP tools for browser automation
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

# Context7 MCP tools for documentation lookup (always enabled)
CONTEXT7_TOOLS = [
    "mcp__context7__resolve-library-id",
    "mcp__context7__get-library-docs",
]

# Graphiti MCP tools for knowledge graph memory (when GRAPHITI_MCP_ENABLED is set)
# See: https://docs.falkordb.com/agentic-memory/graphiti-mcp-server.html
GRAPHITI_MCP_TOOLS = [
    "mcp__graphiti-memory__search_nodes",  # Search entity summaries
    "mcp__graphiti-memory__search_facts",  # Search relationships between entities
    "mcp__graphiti-memory__add_episode",  # Add data to knowledge graph
    "mcp__graphiti-memory__get_episodes",  # Retrieve recent episodes
    "mcp__graphiti-memory__get_entity_edge",  # Get specific entity/relationship
]

# Built-in tools
BUILTIN_TOOLS = [
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "Bash",
]


def create_client(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    agent_type: str = "coder",
) -> ClaudeSDKClient:
    """
    Create a Claude Agent SDK client with multi-layered security.

    Args:
        project_dir: Root directory for the project (working directory)
        spec_dir: Directory containing the spec (for settings file)
        model: Claude model to use
        agent_type: Type of agent - 'planner', 'coder', 'qa_reviewer', or 'qa_fixer'
                   This determines which custom auto-claude tools are available.

    Returns:
        Configured ClaudeSDKClient

    Security layers (defense in depth):
    1. Sandbox - OS-level bash command isolation prevents filesystem escape
    2. Permissions - File operations restricted to project_dir only
    3. Security hooks - Bash commands validated against an allowlist
       (see security.py for ALLOWED_COMMANDS)
    4. Tool filtering - Each agent type only sees relevant tools (prevents misuse)
    """
    oauth_token = os.environ.get("CLAUDE_CODE_OAUTH_TOKEN")
    if not oauth_token:
        raise ValueError(
            "CLAUDE_CODE_OAUTH_TOKEN environment variable not set.\n"
            "Get your token by running: claude setup-token"
        )

    # Check if Linear integration is enabled
    linear_enabled = is_linear_enabled()
    linear_api_key = os.environ.get("LINEAR_API_KEY", "")

    # Check if custom auto-claude tools are available
    auto_claude_tools_enabled = is_tools_available()

    # Build the list of allowed tools
    # Start with agent-specific tools (includes base tools + auto-claude tools)
    if auto_claude_tools_enabled:
        allowed_tools_list = get_agent_allowed_tools(agent_type)
    else:
        allowed_tools_list = [*BUILTIN_TOOLS]

    # Check if Graphiti MCP is enabled
    graphiti_mcp_enabled = is_graphiti_mcp_enabled()

    # Add external MCP tools
    allowed_tools_list.extend(PUPPETEER_TOOLS)
    allowed_tools_list.extend(CONTEXT7_TOOLS)
    if linear_enabled:
        allowed_tools_list.extend(LINEAR_TOOLS)
    if graphiti_mcp_enabled:
        allowed_tools_list.extend(GRAPHITI_MCP_TOOLS)

    # Create comprehensive security settings
    # Note: Using relative paths ("./**") restricts access to project directory
    # since cwd is set to project_dir
    security_settings = {
        "sandbox": {"enabled": True, "autoAllowBashIfSandboxed": True},
        "permissions": {
            "defaultMode": "acceptEdits",  # Auto-approve edits within allowed directories
            "allow": [
                # Allow all file operations within the project directory
                "Read(./**)",
                "Write(./**)",
                "Edit(./**)",
                "Glob(./**)",
                "Grep(./**)",
                # Bash permission granted here, but actual commands are validated
                # by the bash_security_hook (see security.py for allowed commands)
                "Bash(*)",
                # Allow Puppeteer MCP tools for browser automation
                *PUPPETEER_TOOLS,
                # Allow Context7 MCP tools for documentation lookup
                *CONTEXT7_TOOLS,
                # Allow Linear MCP tools for project management (if enabled)
                *(LINEAR_TOOLS if linear_enabled else []),
                # Allow Graphiti MCP tools for knowledge graph memory (if enabled)
                *(GRAPHITI_MCP_TOOLS if graphiti_mcp_enabled else []),
            ],
        },
    }

    # Write settings to a file in the project directory
    settings_file = project_dir / ".claude_settings.json"
    with open(settings_file, "w") as f:
        json.dump(security_settings, f, indent=2)

    print(f"Security settings: {settings_file}")
    print("   - Sandbox enabled (OS-level bash isolation)")
    print(f"   - Filesystem restricted to: {project_dir.resolve()}")
    print("   - Bash commands restricted to allowlist")

    mcp_servers_list = ["puppeteer (browser automation)", "context7 (documentation)"]
    if linear_enabled:
        mcp_servers_list.append("linear (project management)")
    if graphiti_mcp_enabled:
        mcp_servers_list.append("graphiti-memory (knowledge graph)")
    if auto_claude_tools_enabled:
        mcp_servers_list.append(f"auto-claude ({agent_type} tools)")
    print(f"   - MCP servers: {', '.join(mcp_servers_list)}")
    print()

    # Configure MCP servers
    mcp_servers = {
        "puppeteer": {"command": "npx", "args": ["puppeteer-mcp-server"]},
        "context7": {"command": "npx", "args": ["-y", "@upstash/context7-mcp"]},
    }

    # Add Linear MCP server if enabled
    if linear_enabled:
        mcp_servers["linear"] = {
            "type": "http",
            "url": "https://mcp.linear.app/mcp",
            "headers": {"Authorization": f"Bearer {linear_api_key}"},
        }

    # Add Graphiti MCP server if enabled
    # Requires running: docker run -d -p 8000:8000 falkordb/graphiti-knowledge-graph-mcp
    if graphiti_mcp_enabled:
        mcp_servers["graphiti-memory"] = {
            "type": "http",
            "url": get_graphiti_mcp_url(),
        }

    # Add custom auto-claude MCP server if available
    auto_claude_mcp_server = None
    if auto_claude_tools_enabled:
        auto_claude_mcp_server = create_auto_claude_mcp_server(spec_dir, project_dir)
        if auto_claude_mcp_server:
            mcp_servers["auto-claude"] = auto_claude_mcp_server

    return ClaudeSDKClient(
        options=ClaudeAgentOptions(
            model=model,
            system_prompt=(
                f"You are an expert full-stack developer building production-quality software. "
                f"Your working directory is: {project_dir.resolve()}\n"
                f"Your filesystem access is RESTRICTED to this directory only. "
                f"Use relative paths (starting with ./) for all file operations. "
                f"Never use absolute paths or try to access files outside your working directory.\n\n"
                f"You follow existing code patterns, write clean maintainable code, and verify "
                f"your work through thorough testing. You communicate progress through Git commits "
                f"and build-progress.txt updates."
            ),
            allowed_tools=allowed_tools_list,
            mcp_servers=mcp_servers,
            hooks={
                "PreToolUse": [
                    HookMatcher(matcher="Bash", hooks=[bash_security_hook]),
                ],
            },
            max_turns=1000,
            cwd=str(project_dir.resolve()),
            settings=str(settings_file.resolve()),
        )
    )
