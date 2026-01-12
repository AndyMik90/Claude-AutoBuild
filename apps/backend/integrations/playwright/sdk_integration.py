"""
Playwright SDK Integration
===========================

Provides Playwright tools for Claude Agent SDK with execution handlers.
"""

import logging

from claude_agent_sdk import create_sdk_mcp_server, tool

from .executor import execute_playwright_tool
from .tools import get_playwright_tools

logger = logging.getLogger(__name__)


def _create_sdk_tool(schema: dict):
    """
    Create an SDK MCP tool from a Playwright tool schema.

    Args:
        schema: Tool schema dict with name, description, input_schema

    Returns:
        SdkMcpTool decorated function
    """
    tool_name = schema["name"]
    description = schema["description"]
    input_schema = schema["input_schema"]

    # Create the tool function using the @tool decorator
    @tool(tool_name, description, input_schema)
    async def handler(args: dict):
        """Execute Playwright tool and return MCP response."""
        result = await execute_playwright_tool(tool_name, args)

        # Convert result to MCP response format
        content_blocks = []

        # Check if result contains a screenshot image (base64)
        if isinstance(result, dict) and "image_base64" in result and result.get("success"):
            # Add text summary first
            summary = {
                "success": result.get("success"),
                "path": result.get("path"),
                "selector": result.get("selector"),
                "full_page": result.get("full_page"),
            }
            content_blocks.append({
                "type": "text",
                "text": f"Screenshot saved successfully:\n{str(summary)}\n\nVerify the screenshot below:"
            })

            # Add image content block so Claude can see the screenshot
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": result.get("media_type", "image/png"),
                    "data": result["image_base64"],
                }
            })
        else:
            # Regular text response for other tools
            content_blocks.append({
                "type": "text",
                "text": str(result) if not isinstance(result, str) else result,
            })

        return {"content": content_blocks}

    return handler


def get_playwright_mcp_server():
    """
    Get Playwright tools as an SDK MCP server for Claude Agent SDK.

    Returns:
        McpSdkServerConfig that can be used in ClaudeAgentOptions.mcp_servers
    """
    schemas = get_playwright_tools()

    # Create SDK MCP tools from schemas
    sdk_tools = [_create_sdk_tool(schema) for schema in schemas]

    # Create and return the MCP SDK server
    return create_sdk_mcp_server(
        name="playwright",
        version="1.0.0",
        tools=sdk_tools,
    )


# Alternative: Create handlers dict for manual routing
PLAYWRIGHT_HANDLERS = {
    "playwright_navigate": lambda input: execute_playwright_tool(
        "playwright_navigate", input
    ),
    "playwright_screenshot": lambda input: execute_playwright_tool(
        "playwright_screenshot", input
    ),
    "playwright_click": lambda input: execute_playwright_tool("playwright_click", input),
    "playwright_fill": lambda input: execute_playwright_tool("playwright_fill", input),
    "playwright_assert": lambda input: execute_playwright_tool(
        "playwright_assert", input
    ),
    "playwright_get_console": lambda input: execute_playwright_tool(
        "playwright_get_console", input
    ),
    "playwright_create_test": lambda input: execute_playwright_tool(
        "playwright_create_test", input
    ),
}
