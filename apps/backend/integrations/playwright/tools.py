"""
Playwright Tools for QA Agent
===============================

MCP-style tools that enable QA agents to interact with browser applications
using Playwright for E2E testing, visual verification, and console monitoring.

These tools are provided to QA agents (qa_reviewer, qa_fixer) but NOT to
coding agents to keep their context focused.
"""

from dataclasses import dataclass
from typing import Any


@dataclass
class PlaywrightNavigateTool:
    """
    Navigate to a URL in the browser.

    Usage:
        navigate_to(url="http://localhost:3000/login")
    """

    name: str = "playwright_navigate"
    description: str = (
        "Navigate to a URL in the browser. "
        "Use this to visit pages in your application for testing. "
        "Example: navigate_to(url='http://localhost:3000/dashboard')"
    )

    def get_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to navigate to (e.g., 'http://localhost:3000/page')",
                    }
                },
                "required": ["url"],
            },
        }


@dataclass
class PlaywrightScreenshotTool:
    """
    Take a screenshot of the current page or a specific element.

    Usage:
        screenshot(path="screenshot.png", selector=".main-content")
    """

    name: str = "playwright_screenshot"
    description: str = (
        "Take a screenshot of the current page or a specific element. "
        "IMPORTANT: Always use RELATIVE paths (e.g., 'qa-screenshots/dashboard.png'), never absolute paths. "
        "Relative paths are saved in the spec directory for persistence. "
        "Example: screenshot(path='qa-screenshots/dashboard.png', selector='#main-content')"
    )

    def get_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "RELATIVE file path to save screenshot (e.g., 'qa-screenshots/dashboard.png'). Never use absolute paths like /tmp/... - they will be lost!",
                    },
                    "selector": {
                        "type": "string",
                        "description": "Optional CSS selector to screenshot specific element",
                    },
                    "fullPage": {
                        "type": "boolean",
                        "description": "Capture full scrollable page (default: false)",
                    },
                },
                "required": ["path"],
            },
        }


@dataclass
class PlaywrightClickTool:
    """
    Click an element on the page.

    Usage:
        click(selector="button[type='submit']")
    """

    name: str = "playwright_click"
    description: str = (
        "Click an element on the page using a CSS selector. "
        "Use for testing button clicks, navigation, etc. "
        "Example: click(selector='button.submit-btn')"
    )

    def get_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for element to click",
                    }
                },
                "required": ["selector"],
            },
        }


@dataclass
class PlaywrightFillTool:
    """
    Fill a form field with text.

    Usage:
        fill(selector="input[name='email']", value="test@example.com")
    """

    name: str = "playwright_fill"
    description: str = (
        "Fill a form field with text. "
        "Use for testing form inputs and user interactions. "
        "Example: fill(selector='input[name=\"email\"]', value='user@example.com')"
    )

    def get_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for input field",
                    },
                    "value": {
                        "type": "string",
                        "description": "Text value to fill in the field",
                    },
                },
                "required": ["selector", "value"],
            },
        }


@dataclass
class PlaywrightAssertTool:
    """
    Assert that an element exists and optionally matches expected state.

    Usage:
        assert_element(selector="h1", text="Welcome", visible=true)
    """

    name: str = "playwright_assert"
    description: str = (
        "Assert that an element exists and optionally verify its text content or visibility. "
        "Use for test assertions. "
        "Example: assert_element(selector='h1', text='Dashboard', visible=true)"
    )

    def get_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector for element to assert",
                    },
                    "text": {
                        "type": "string",
                        "description": "Expected text content (partial match)",
                    },
                    "visible": {
                        "type": "boolean",
                        "description": "Assert element is visible (default: true)",
                    },
                    "count": {
                        "type": "integer",
                        "description": "Expected number of matching elements",
                    },
                },
                "required": ["selector"],
            },
        }


@dataclass
class PlaywrightGetConsoleTool:
    """
    Get console logs (errors, warnings) from the browser.

    Usage:
        get_console(filter="error")
    """

    name: str = "playwright_get_console"
    description: str = (
        "Get console logs from the browser (errors, warnings, info). "
        "Use to detect JavaScript errors during testing. "
        "Example: get_console(filter='error')"
    )

    def get_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "filter": {
                        "type": "string",
                        "description": "Filter by log level: 'error', 'warning', 'info', or 'all' (default: 'all')",
                        "enum": ["error", "warning", "info", "all"],
                    }
                },
                "required": [],
            },
        }


@dataclass
class PlaywrightCreateTestTool:
    """
    Generate a Playwright E2E test file from a test specification.

    Usage:
        create_test(
            flow_name="user-login",
            steps=[...],
            output_path="tests/e2e/login.spec.ts"
        )
    """

    name: str = "playwright_create_test"
    description: str = (
        "Generate a complete Playwright E2E test file from a test specification. "
        "Provide flow name, steps, and assertions to create a runnable test. "
        "Example: create_test(flow_name='user-login', steps=[...], output_path='tests/e2e/login.spec.ts')"
    )

    def get_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": {
                "type": "object",
                "properties": {
                    "flow_name": {
                        "type": "string",
                        "description": "Name of the user flow being tested (e.g., 'user-login')",
                    },
                    "description": {
                        "type": "string",
                        "description": "Human-readable description of what this test verifies",
                    },
                    "steps": {
                        "type": "array",
                        "description": "Array of test steps with actions and assertions",
                        "items": {
                            "type": "object",
                            "properties": {
                                "action": {
                                    "type": "string",
                                    "description": "Action type: 'navigate', 'click', 'fill', 'assert', 'screenshot'",
                                },
                                "selector": {
                                    "type": "string",
                                    "description": "CSS selector for element (for click, fill, assert actions)",
                                },
                                "value": {
                                    "type": "string",
                                    "description": "Value for fill actions or expected text for assertions",
                                },
                                "url": {
                                    "type": "string",
                                    "description": "URL for navigate actions",
                                },
                            },
                        },
                    },
                    "output_path": {
                        "type": "string",
                        "description": "File path where test should be saved (e.g., 'tests/e2e/login.spec.ts')",
                    },
                },
                "required": ["flow_name", "steps", "output_path"],
            },
        }


def get_playwright_tools() -> list[dict[str, Any]]:
    """
    Get all Playwright tools as schema dictionaries for Claude Agent SDK.

    Returns:
        List of tool schemas compatible with Claude Agent SDK
    """
    tools = [
        PlaywrightNavigateTool(),
        PlaywrightScreenshotTool(),
        PlaywrightClickTool(),
        PlaywrightFillTool(),
        PlaywrightAssertTool(),
        PlaywrightGetConsoleTool(),
        PlaywrightCreateTestTool(),
    ]

    return [tool.get_schema() for tool in tools]


# Tool names exported for easy reference
PLAYWRIGHT_TOOL_NAMES = [
    "playwright_navigate",
    "playwright_screenshot",
    "playwright_click",
    "playwright_fill",
    "playwright_assert",
    "playwright_get_console",
    "playwright_create_test",
]
