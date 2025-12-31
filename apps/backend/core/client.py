"""
Claude SDK Client Configuration
================================

Functions for creating and configuring the Claude Agent SDK client.

All AI interactions should use `create_client()` to ensure consistent OAuth authentication
and proper tool/MCP configuration. For simple message calls without full agent sessions,
use `create_simple_client()` from `core.simple_client`.

The client factory now uses AGENT_CONFIGS from agents/tools_pkg/models.py as the
single source of truth for phase-aware tool and MCP server configuration.
"""

import json
import os
from pathlib import Path

from agents.tools_pkg import (
    CONTEXT7_TOOLS,
    ELECTRON_TOOLS,
    GRAPHITI_MCP_TOOLS,
    LINEAR_TOOLS,
    PUPPETEER_TOOLS,
    PUPPETEER_EXTENDED_TOOLS,
    create_maestro_mcp_server,
    get_allowed_tools,
    get_required_mcp_servers,
    is_tools_available,
)
from core.cdp_config import (
    get_cdp_config_summary,
    get_cdp_tools_for_agent,
    validate_cdp_config,
)
from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient
from claude_agent_sdk.types import HookMatcher
from core.auth import get_sdk_env_vars, require_auth_token
from core.cdp_config import (
    get_cdp_config_summary,
    get_cdp_mcp_server_name,
    get_cdp_mcp_type,
    get_cdp_tools_for_agent,
    validate_cdp_config,
)
from core.mcp_config import (
    get_electron_debug_port,
    get_graphiti_mcp_url,
    is_electron_mcp_enabled,
    is_graphiti_mcp_enabled,
    should_use_claude_md,
)
from core.error_utils import safe_file_read
from linear_updater import is_linear_enabled
from prompts_pkg.project_context import detect_project_capabilities, load_project_index
from providers.config import (
    get_provider_config,
    get_provider_for_model,
    infer_provider_from_url,
    resolve_model_id,
)
from security import bash_security_hook


def load_claude_md(project_dir: Path) -> str | None:
    """
    Load CLAUDE.md content from project root if it exists.

    Args:
        project_dir: Root directory of the project

    Returns:
        Content of CLAUDE.md if found, None otherwise
    """
    claude_md_path = project_dir / "CLAUDE.md"
    if claude_md_path.exists():
        content = safe_file_read(str(claude_md_path), default=None, log_errors=False)
        return content if content else None
    return None


def create_client(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    agent_type: str = "coder",
    max_thinking_tokens: int | None = None,
    output_format: dict | None = None,
) -> ClaudeSDKClient:
    """
    Create a Claude Agent SDK client with multi-layered security.

    Uses AGENT_CONFIGS for phase-aware tool and MCP server configuration.
    Only starts MCP servers that the agent actually needs, reducing context
    window bloat and startup latency.

    Args:
        project_dir: Root directory for the project (working directory)
        spec_dir: Directory containing the spec (for settings file)
        model: Claude model to use
        agent_type: Agent type identifier from AGENT_CONFIGS
                   (e.g., 'coder', 'planner', 'qa_reviewer', 'spec_gatherer')
        max_thinking_tokens: Token budget for extended thinking (None = disabled)
                            - ultrathink: 16000 (spec creation)
                            - high: 10000 (QA review)
                            - medium: 5000 (planning, validation)
                            - None: disabled (coding)
        output_format: Optional structured output format for validated JSON responses.
                      Use {"type": "json_schema", "schema": Model.model_json_schema()}
                      See: https://platform.claude.com/docs/en/agent-sdk/structured-outputs

    Returns:
        Configured ClaudeSDKClient

    Raises:
        ValueError: If agent_type is not found in AGENT_CONFIGS

    Security layers (defense in depth):
    1. Sandbox - OS-level bash command isolation prevents filesystem escape
    2. Permissions - File operations restricted to project_dir only
    3. Security hooks - Bash commands validated against an allowlist
       (see security.py for ALLOWED_COMMANDS)
    4. Tool filtering - Each agent type only sees relevant tools (prevents misuse)
    """
    oauth_token = require_auth_token()
    # Ensure SDK can access it via its expected env var
    os.environ["CLAUDE_CODE_OAUTH_TOKEN"] = oauth_token

    # Collect env vars to pass to SDK (ANTHROPIC_BASE_URL, etc.)
    sdk_env = get_sdk_env_vars()

    # ============================================
    # Provider Detection and Model Resolution
    # ============================================

    # Detect provider from model ID or environment
    provider = get_provider_for_model(model)

    # Resolve to full model ID based on provider
    resolved_model = resolve_model_id(model, provider)

    # Get provider configuration
    provider_config = get_provider_config(provider)

    # Check if provider supports extended thinking
    if max_thinking_tokens and not provider_config.supports_extended_thinking:
        print(f"   - Warning: {provider.value} does not support extended thinking. Disabling.")
        max_thinking_tokens = None

    # Set up custom base URL if configured
    # Priority: ANTHROPIC_BASE_URL env var > provider default
    base_url = sdk_env.get("ANTHROPIC_BASE_URL")

    # If ANTHROPIC_BASE_URL is set, infer provider from URL
    if base_url:
        provider = infer_provider_from_url(base_url)
        provider_config = get_provider_config(provider)

    # Add provider-specific base URL to SDK env
    if base_url:
        sdk_env["ANTHROPIC_BASE_URL"] = base_url
    elif provider != "anthropic":
        # Use provider's default base URL
        sdk_env["ANTHROPIC_BASE_URL"] = provider_config.base_url

    # Check if Linear integration is enabled
    linear_enabled = is_linear_enabled()
    linear_api_key = os.environ.get("LINEAR_API_KEY", "")

    # Check if custom maestro tools are available
    maestro_tools_enabled = is_tools_available()

    # Load project capabilities for dynamic MCP tool selection
    # This enables context-aware tool injection based on project type
    project_index = load_project_index(project_dir)
    project_capabilities = detect_project_capabilities(project_index)

    # Get allowed tools using phase-aware configuration
    # This respects AGENT_CONFIGS and only includes tools the agent needs
    allowed_tools_list = get_allowed_tools(
        agent_type,
        project_capabilities,
        linear_enabled,
    )

    # Get required MCP servers for this agent type
    # This is the key optimization - only start servers the agent needs
    required_servers = get_required_mcp_servers(
        agent_type,
        project_capabilities,
        linear_enabled,
    )

    # Check if Graphiti MCP is enabled (already filtered by get_required_mcp_servers)
    graphiti_mcp_enabled = "graphiti" in required_servers

    # Determine browser tools for permissions (already in allowed_tools_list)
    # Use dynamic CDP tool selection for Electron, Chrome DevTools, and Puppeteer agents
    browser_tools_permissions = []
    cdp_mcp_type = get_cdp_mcp_type()

    if "chrome-devtools" in required_servers:
        # Get Chrome DevTools MCP tools based on agent type and configuration
        browser_tools_permissions = get_cdp_tools_for_agent(agent_type, mcp_type="chrome-devtools")
    elif "electron" in required_servers:
        # Get Electron MCP tools based on agent type and configuration
        browser_tools_permissions = get_cdp_tools_for_agent(agent_type, mcp_type="electron")
    elif "puppeteer" in required_servers:
        # Use extended Puppeteer tools for web frontend automation
        browser_tools_permissions = PUPPETEER_EXTENDED_TOOLS

    # Create comprehensive security settings
    # Note: Using both relative paths ("./**") and absolute paths to handle
    # cases where Claude uses absolute paths for file operations
    project_path_str = str(project_dir.resolve())
    spec_path_str = str(spec_dir.resolve())
    security_settings = {
        "sandbox": {"enabled": True, "autoAllowBashIfSandboxed": True},
        "permissions": {
            "defaultMode": "acceptEdits",  # Auto-approve edits within allowed directories
            "allow": [
                # Allow all file operations within the project directory
                # Include both relative (./**) and absolute paths for compatibility
                "Read(./**)",
                "Write(./**)",
                "Edit(./**)",
                "Glob(./**)",
                "Grep(./**)",
                # Also allow absolute paths (Claude sometimes uses full paths)
                f"Read({project_path_str}/**)",
                f"Write({project_path_str}/**)",
                f"Edit({project_path_str}/**)",
                f"Glob({project_path_str}/**)",
                f"Grep({project_path_str}/**)",
                # Allow spec directory explicitly (needed when spec is in worktree)
                f"Read({spec_path_str}/**)",
                f"Write({spec_path_str}/**)",
                f"Edit({spec_path_str}/**)",
                # Bash permission granted here, but actual commands are validated
                # by the bash_security_hook (see security.py for allowed commands)
                "Bash(*)",
                # Allow web tools for documentation and research
                "WebFetch(*)",
                "WebSearch(*)",
                # Allow MCP tools based on required servers
                # Format: tool_name(*) allows all arguments
                *(
                    [f"{tool}(*)" for tool in CONTEXT7_TOOLS]
                    if "context7" in required_servers
                    else []
                ),
                *(
                    [f"{tool}(*)" for tool in LINEAR_TOOLS]
                    if "linear" in required_servers
                    else []
                ),
                *(
                    [f"{tool}(*)" for tool in GRAPHITI_MCP_TOOLS]
                    if graphiti_mcp_enabled
                    else []
                ),
                *[f"{tool}(*)" for tool in browser_tools_permissions],
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
    if max_thinking_tokens:
        print(f"   - Extended thinking: {max_thinking_tokens:,} tokens")
    else:
        print("   - Extended thinking: disabled")

    # Build list of MCP servers for display based on required_servers
    mcp_servers_list = []
    if "context7" in required_servers:
        mcp_servers_list.append("context7 (documentation)")
    if "chrome-devtools" in required_servers:
        mcp_servers_list.append("chrome-devtools (Google's official Chrome DevTools MCP)")
    if "electron" in required_servers:
        mcp_servers_list.append(
            f"electron (desktop automation, port {get_electron_debug_port()})"
        )
    if "puppeteer" in required_servers:
        mcp_servers_list.append("puppeteer (browser automation)")
    if "linear" in required_servers:
        mcp_servers_list.append("linear (project management)")
    if graphiti_mcp_enabled:
        mcp_servers_list.append("graphiti-memory (knowledge graph)")
    if "maestro" in required_servers and maestro_tools_enabled:
        mcp_servers_list.append(f"maestro ({agent_type} tools)")
    if mcp_servers_list:
        print(f"   - MCP servers: {', '.join(mcp_servers_list)}")
    else:
        print("   - MCP servers: none (minimal configuration)")

    # Show detected project capabilities for QA agents
    if agent_type in ("qa_reviewer", "qa_fixer") and any(project_capabilities.values()):
        caps = [
            k.replace("is_", "").replace("has_", "")
            for k, v in project_capabilities.items()
            if v
        ]
        print(f"   - Project capabilities: {', '.join(caps)}")

    # Show CDP configuration for agents with Electron or Chrome DevTools tools
    if ("electron" in required_servers or "chrome-devtools" in required_servers) and browser_tools_permissions:
        from core.cdp_config import get_cdp_categories_for_agent

        cdp_categories = get_cdp_categories_for_agent(agent_type)
        if cdp_categories:
            cdp_server_name = get_cdp_mcp_server_name()
            print(f"   - CDP server: {cdp_server_name}")
            print(f"   - CDP categories: {', '.join(cdp_categories)}")
            print(f"   - CDP tools: {len(browser_tools_permissions)} tools enabled")
    print()

    # Validate CDP configuration and show warnings
    cdp_warnings = validate_cdp_config()
    if cdp_warnings:
        print("   - CDP Configuration Warnings:")
        for warning in cdp_warnings:
            print(f"     - {warning}")
        print()

    # Configure MCP servers - ONLY start servers that are required
    # This is the key optimization to reduce context bloat and startup latency
    mcp_servers = {}

    if "context7" in required_servers:
        mcp_servers["context7"] = {
            "command": "npx",
            "args": ["-y", "@upstash/context7-mcp"],
        }

    if "electron" in required_servers:
        # Electron MCP for desktop apps
        # Use the local extended MCP server with enhanced CDP tools
        # Electron app must be started with --remote-debugging-port=<port>
        mcp_servers["electron"] = {
            "command": "node",
            "args": [str(Path(__file__).parent.parent / "providers" / "electron-mcp-server" / "dist" / "index.js")],
        }

    if "chrome-devtools" in required_servers:
        # Google's official Chrome DevTools MCP server
        # See: https://github.com/ChromeDevTools/chrome-devtools-mcp
        # This provides 26 tools across 6 categories: input, navigation, emulation,
        # performance, network, and debugging
        chrome_devtools_args = ["-y", "chrome-devtools-mcp@latest"]

        # Add connection-specific arguments from environment
        if os.environ.get("CDP_BROWSER_URL"):
            chrome_devtools_args.append(f"--browser-url={os.environ['CDP_BROWSER_URL']}")
        if os.environ.get("CDP_WS_ENDPOINT"):
            chrome_devtools_args.append(f"--ws-endpoint={os.environ['CDP_WS_ENDPOINT']}")
        if os.environ.get("CDP_AUTO_CONNECT", "").lower() == "true":
            chrome_devtools_args.append("--auto-connect")
        if os.environ.get("CDP_HEADLESS", "").lower() == "true":
            chrome_devtools_args.append("--headless=true")
        if os.environ.get("CDP_VIEWPORT"):
            chrome_devtools_args.append(f"--viewport={os.environ['CDP_VIEWPORT']}")

        # Add category filters (default: all enabled)
        if os.environ.get("CDP_CATEGORY_EMULATION", "true").lower() == "false":
            chrome_devtools_args.append("--category-emulation=false")
        if os.environ.get("CDP_CATEGORY_PERFORMANCE", "true").lower() == "false":
            chrome_devtools_args.append("--category-performance=false")
        if os.environ.get("CDP_CATEGORY_NETWORK", "true").lower() == "false":
            chrome_devtools_args.append("--category-network=false")

        mcp_servers["chrome-devtools"] = {
            "command": "npx",
            "args": chrome_devtools_args,
        }

    if "puppeteer" in required_servers:
        # Puppeteer for web frontends (not Electron)
        # Use the local extended MCP server with enhanced browser tools
        mcp_servers["puppeteer"] = {
            "command": "node",
            "args": [str(Path(__file__).parent.parent / "providers" / "puppeteer-mcp-server" / "dist" / "index.js")],
        }

    if "linear" in required_servers:
        mcp_servers["linear"] = {
            "type": "http",
            "url": "https://mcp.linear.app/mcp",
            "headers": {"Authorization": f"Bearer {linear_api_key}"},
        }

    # Graphiti MCP server for knowledge graph memory
    if graphiti_mcp_enabled:
        mcp_servers["graphiti-memory"] = {
            "type": "http",
            "url": get_graphiti_mcp_url(),
        }

    # Add custom maestro MCP server if required and available
    if "maestro" in required_servers and maestro_tools_enabled:
        maestro_mcp_server = create_maestro_mcp_server(spec_dir, project_dir)
        if maestro_mcp_server:
            mcp_servers["maestro"] = maestro_mcp_server

    # Build system prompt
    base_prompt = (
        f"You are an expert full-stack developer building production-quality software. "
        f"Your working directory is: {project_dir.resolve()}\n"
        f"Your filesystem access is RESTRICTED to this directory only. "
        f"Use relative paths (starting with ./) for all file operations. "
        f"Never use absolute paths or try to access files outside your working directory.\n\n"
        f"You follow existing code patterns, write clean maintainable code, and verify "
        f"your work through thorough testing. You communicate progress through Git commits "
        f"and build-progress.txt updates."
    )

    # Include CLAUDE.md if enabled and present
    if should_use_claude_md():
        claude_md_content = load_claude_md(project_dir)
        if claude_md_content:
            base_prompt = f"{base_prompt}\n\n# Project Instructions (from CLAUDE.md)\n\n{claude_md_content}"
            print("   - CLAUDE.md: included in system prompt")
        else:
            print("   - CLAUDE.md: not found in project root")
    else:
        print("   - CLAUDE.md: disabled by project settings")
    print()

    # Build options dict, conditionally including output_format
    options_kwargs = {
        "model": resolved_model,  # Use provider-resolved model ID
        "system_prompt": base_prompt,
        "allowed_tools": allowed_tools_list,
        "mcp_servers": mcp_servers,
        "hooks": {
            "PreToolUse": [
                HookMatcher(matcher="Bash", hooks=[bash_security_hook]),
            ],
        },
        "max_turns": 1000,
        "cwd": str(project_dir.resolve()),
        "settings": str(settings_file.resolve()),
        "env": sdk_env,  # Pass ANTHROPIC_BASE_URL etc. to subprocess
        "max_thinking_tokens": max_thinking_tokens,  # Extended thinking budget
    }

    # Add structured output format if specified
    # See: https://platform.claude.com/docs/en/agent-sdk/structured-outputs
    if output_format:
        options_kwargs["output_format"] = output_format

    return ClaudeSDKClient(options=ClaudeAgentOptions(**options_kwargs))
