"""
Playwright Integration Package
================================

First-class Playwright testing tools for Auto Claude QA agents.
Provides browser automation, screenshot capture, console monitoring,
and E2E test generation capabilities.
"""

from .executor import (
    close_browser,
    execute_playwright_tool,
    get_browser,
    get_page,
)
from .sdk_integration import get_playwright_mcp_server
from .tools import (
    PlaywrightAssertTool,
    PlaywrightClickTool,
    PlaywrightCreateTestTool,
    PlaywrightFillTool,
    PlaywrightGetConsoleTool,
    PlaywrightNavigateTool,
    PlaywrightScreenshotTool,
    get_playwright_tools,
)

__all__ = [
    # Tools (schemas)
    "PlaywrightNavigateTool",
    "PlaywrightScreenshotTool",
    "PlaywrightClickTool",
    "PlaywrightFillTool",
    "PlaywrightAssertTool",
    "PlaywrightGetConsoleTool",
    "PlaywrightCreateTestTool",
    "get_playwright_tools",
    # Executor (actual execution)
    "execute_playwright_tool",
    "get_browser",
    "get_page",
    "close_browser",
    # SDK Integration
    "get_playwright_mcp_server",
]
