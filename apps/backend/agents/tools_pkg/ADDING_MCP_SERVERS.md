# Adding New MCP Servers to Auto-Claude

This guide shows how to add a new MCP server with automatic tool discovery.

## Quick Start

Adding a new MCP server now requires just **3 simple steps**:

### 1. Define Tool List Constant

In `agents/tools_pkg/models.py`, add your tool list:

```python
# My Custom MCP tools
MY_CUSTOM_TOOLS = [
    "mcp__my-custom__tool_one",
    "mcp__my-custom__tool_two",
    "mcp__my-custom__tool_three",
]
```

### 2. Register in SERVER_TOOL_REGISTRY

In `agents/tools_pkg/permissions.py`, add to the registry:

```python
SERVER_TOOL_REGISTRY = {
    "context7": CONTEXT7_TOOLS,
    "linear": LINEAR_TOOLS,
    "graphiti": GRAPHITI_MCP_TOOLS,
    "electron": ELECTRON_TOOLS,
    "puppeteer": PUPPETEER_TOOLS,
    "playwright": PLAYWRIGHT_TOOLS,
    "my-custom": MY_CUSTOM_TOOLS,  # ← Add your server here
}
```

### 3. Add to Agent Configs

In `agents/tools_pkg/models.py`, add to relevant agent configs:

```python
"coder": {
    "tools": BASE_READ_TOOLS + BASE_WRITE_TOOLS + WEB_TOOLS,
    "mcp_servers": ["context7", "graphiti", "auto-claude", "my-custom"],  # ← Add here
    "mcp_servers_optional": ["linear", "browser"],
    "auto_claude_tools": [...],
    "thinking_default": "none",
},
```

**That's it!** Tools will automatically be available when the server is added to the agent.

## How It Works

The automatic tool discovery system works as follows:

1. **Agent Config** defines which MCP servers an agent needs
2. **get_required_mcp_servers()** resolves server names based on project capabilities
3. **get_allowed_tools()** looks up tools from SERVER_TOOL_REGISTRY automatically
4. Tools are added to the agent's allowed_tools list

No manual if/elif mapping needed!

## Example: Adding a Notion MCP Server

```python
# 1. In models.py
NOTION_TOOLS = [
    "mcp__notion__search_pages",
    "mcp__notion__create_page",
    "mcp__notion__update_page",
]

# 2. In permissions.py
SERVER_TOOL_REGISTRY = {
    # ...existing servers...
    "notion": NOTION_TOOLS,
}

# 3. In models.py agent config
"planner": {
    "mcp_servers": ["context7", "graphiti", "auto-claude", "notion"],
    # ...rest of config...
},
```

Done! The planner agent now has access to all Notion tools automatically.

## Optional: Dynamic Server Selection

For servers that should only be enabled for certain project types, use `mcp_servers_optional`:

```python
"coder": {
    "mcp_servers": ["context7", "graphiti", "auto-claude"],
    "mcp_servers_optional": ["linear", "browser", "notion"],  # Only if needed
    # ...
},
```

Then in `get_required_mcp_servers()`, add logic to conditionally enable:

```python
# In get_required_mcp_servers()
if "notion" in optional:
    # Check if Notion integration is enabled
    if os.environ.get("NOTION_API_KEY"):
        servers.append("notion")
```

## Legacy: Before Automatic Discovery

Previously, adding a new MCP server required:

1. Define tool list constant ✓
2. **Manually add if/elif in `_get_mcp_tools_for_servers()`** ✗ (no longer needed!)
3. Add to agent configs ✓

The manual if/elif chain was error-prone and made the code harder to maintain.

## Benefits of Automatic Discovery

- **DRY Principle**: Tool mappings defined once in SERVER_TOOL_REGISTRY
- **Type Safety**: All tool lists defined as constants
- **Easy Maintenance**: Adding servers = updating a dict, not modifying function logic
- **Extensibility**: New servers work immediately without code changes
- **Debugging**: Registry can be inspected at runtime

## Advanced: Meta-Servers

The "browser" server is a special **meta-server** that dynamically resolves to:
- `electron` (for Electron apps)
- `puppeteer` (for web frontends)
- `playwright` (default/fallback)

This is handled in `get_required_mcp_servers()` before tool lookup, so the registry only needs the concrete server names.
