"""
Playwright Integration Package
================================

First-class Playwright testing tools for Auto Claude QA agents.
Provides browser automation, screenshot capture, console monitoring,
and E2E test generation capabilities.
"""

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
    "PlaywrightNavigateTool",
    "PlaywrightScreenshotTool",
    "PlaywrightClickTool",
    "PlaywrightFillTool",
    "PlaywrightAssertTool",
    "PlaywrightGetConsoleTool",
    "PlaywrightCreateTestTool",
    "get_playwright_tools",
]
