# CDP Bridge - Chrome DevTools Protocol MCP Integration

A lightweight bridge wrapper for integrating Google's official [Chrome DevTools MCP Server](https://github.com/ChromeDevTools/chrome-devtools-mcp) with Auto Claude for continuous feedback loops.

## Overview

The CDP Bridge provides configuration, tool mapping, and feedback loop integration for using Chrome DevTools Protocol (CDP) tools with AI agents. It acts as a configuration and discovery layer on top of Google's `chrome-devtools-mcp` server.

## Features

- **Configuration Management**: Validates and manages Chrome DevTools MCP server settings
- **Tool Mapping**: Maps Chrome DevTools MCP tools to Auto Claude's CDP category system
- **Feedback Loop Integration**: Provides agent-specific feedback loop configurations
- **Connection Validation**: Validates browser connection settings (remote debugging, WebSocket, auto-connect)

## Installation

```bash
cd providers/cdp-bridge
npm install
npm run build
```

## Configuration

The CDP Bridge is configured via environment variables. See `.env.example` in the project root for all available options.

### Key Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CDP_MCP_ENABLED` | Enable CDP MCP integration | `false` |
| `CDP_BROWSER_URL` | Chrome remote debugging URL | - |
| `CDP_WS_ENDPOINT` | WebSocket endpoint for Chrome | - |
| `CDP_AUTO_CONNECT` | Auto-connect to running Chrome (145+) | `false` |
| `CDP_HEADLESS` | Run Chrome in headless mode | `false` |
| `CDP_VIEWPORT` | Viewport size (e.g., `1280x720`) | - |
| `CDP_ENABLED_FOR_AGENTS` | Agent types that get CDP tools | `qa_reviewer,qa_fixer` |
| `CDP_TOOL_CATEGORIES` | Tool categories to enable | `network,performance,debugging,dom` |

## Chrome DevTools MCP Server Integration

The CDP Bridge wraps Google's official Chrome DevTools MCP server. The actual MCP server is started using the command returned by the `cdp_get_server_command` tool.

### Available Tools

The Chrome DevTools MCP server provides tools in these categories:

#### Input Automation (8 tools)
- `click` - Click elements
- `drag` - Drag and drop
- `fill` - Fill form fields
- `fill_form` - Fill multiple fields
- `handle_dialog` - Handle alert/dialog boxes
- `hover` - Hover over elements
- `press_key` - Send keyboard shortcuts
- `upload_file` - Upload files

#### Navigation Automation (6 tools)
- `close_page` - Close tabs/pages
- `list_pages` - List open pages
- `navigate_page` - Navigate to URL
- `new_page` - Open new page
- `select_page` - Switch to page
- `wait_for` - Wait for conditions

#### Emulation (2 tools)
- `emulate` - Device emulation (mobile, tablet)
- `resize_page` - Resize viewport

#### Performance (3 tools)
- `performance_analyze_insight` - Analyze performance traces
- `performance_start_trace` - Start performance recording
- `performance_stop_trace` - Stop and get performance data

#### Network (2 tools)
- `get_network_request` - Get request/response details
- `list_network_requests` - List all network activity

#### Debugging (5 tools)
- `evaluate_script` - Execute JavaScript
- `get_console_message` - Get console messages
- `list_console_messages` - List all console logs
- `take_screenshot` - Capture screenshot
- `take_snapshot` - Get DOM snapshot

## Continuous Feedback Loops

### QA Reviewer Agent

The QA Reviewer uses CDP tools for continuous validation:

```python
# After each subtask
- take_screenshot()      # Visual verification
- take_snapshot()        # DOM verification

# On completion
- performance_start_trace()
- performance_stop_trace()
- performance_analyze_insight()

# Continuous monitoring
- list_console_messages()  # Check for errors
- list_network_requests()  # Verify API calls
```

### QA Fixer Agent

The QA Fixer uses iterative testing:

```python
# After each fix
- take_screenshot()        # Verify fix
- list_console_messages()  # Check for regressions
- list_network_requests()  # Verify API calls

# Iterate until:
- No errors in console
- Acceptance criteria met
# Max 5 iterations
```

### Coder Agent (Optional)

The Coder can use CDP tools on-demand for development testing:

```python
# Quick verification during development
- take_screenshot()         # Visual check
- list_console_messages()   # Error check
```

## Setting Up Chrome

### Option 1: Remote Debugging Port

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-profile

# Linux
google-chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/chrome-debug-profile

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 \
  --user-data-dir=%TEMP%\chrome-debug-profile
```

Then set in `.env`:
```
CDP_BROWSER_URL=http://127.0.0.1:9222
```

### Option 2: Auto-Connect (Chrome 145+)

1. Open Chrome and navigate to `chrome://inspect/#remote-debugging`
2. Enable remote debugging
3. Allow incoming debugging connections
4. Set in `.env`:
   ```
   CDP_AUTO_CONNECT=true
   CDP_CHANNEL=stable  # or canary, beta, dev
   ```

## Usage

### Direct MCP Server Usage

The Chrome DevTools MCP server can be used directly:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

### Via CDP Bridge

Use the CDP Bridge to get configuration:

```python
# Get server command with proper configuration
result = await mcp_client.call_tool("cdp_get_server_command", {
  "include_categories": true
})

# Or validate configuration
result = await mcp_client.call_tool("cdp_validate_connection", {})
```

## Tool Mapping to Auto Claude

The CDP Bridge maps Chrome DevTools MCP tools to Auto Claude's CDP categories:

| Chrome DevTools Category | Auto Claude CDP Category |
|-------------------------|-------------------------|
| input (click, drag, etc.) | dom |
| navigation (navigate, etc.) | dom |
| emulation (device, resize) | emulation |
| performance (traces, insights) | performance |
| network (requests) | network |
| debugging (console, screenshot) | console, storage, dom |

## Development

```bash
# Build TypeScript
npm run build

# Watch mode
npm run watch

# Run directly
node dist/index.js
```

## References

- [Chrome DevTools MCP Server](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Auto Claude Documentation](../../../../../CLAUDE.md)

## License

MIT
