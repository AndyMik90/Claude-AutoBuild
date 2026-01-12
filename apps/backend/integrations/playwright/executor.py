"""
Playwright Tool Executor
=========================

Actual execution handlers for Playwright tools.
Manages browser lifecycle, executes automation commands, and captures results.
"""

import asyncio
import base64
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Global browser instance (lazy initialized)
_browser = None
_context = None
_page = None
_console_logs = []


async def get_browser():
    """
    Get or create browser instance.
    Uses lazy initialization - browser is created on first use.
    """
    global _browser

    if _browser is None:
        try:
            import os

            from playwright.async_api import async_playwright

            # Read headless setting from environment (default: True)
            headless_str = os.environ.get("PLAYWRIGHT_HEADLESS", "true").lower()
            headless = headless_str in ("true", "1", "yes")

            playwright = await async_playwright().start()
            _browser = await playwright.chromium.launch(
                headless=headless,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                ],
            )
            mode = "headless" if headless else "headed"
            logger.info(f"Playwright browser launched ({mode})")
        except ImportError:
            raise RuntimeError(
                "Playwright not installed. Run: pip install playwright && playwright install chromium"
            )
        except Exception as e:
            logger.error(f"Failed to launch browser: {e}")
            raise

    return _browser


async def get_page():
    """
    Get or create browser page with console monitoring.
    """
    global _context, _page, _console_logs

    if _page is None:
        browser = await get_browser()

        # Create new context
        _context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        )

        # Create new page
        _page = await _context.new_page()

        # Reset console logs
        _console_logs = []

        # Setup console monitoring
        def handle_console(msg):
            log_entry = {
                "type": msg.type,
                "text": msg.text,
                "location": msg.location,
            }
            _console_logs.append(log_entry)
            logger.debug(f"Console [{msg.type}]: {msg.text}")

        _page.on("console", handle_console)

        # Setup error monitoring
        def handle_page_error(error):
            logger.error(f"Page error: {error}")
            _console_logs.append({"type": "error", "text": str(error), "location": None})

        _page.on("pageerror", handle_page_error)

        logger.info("Playwright page created with console monitoring")

    return _page


async def close_browser():
    """
    Close browser and cleanup resources.
    """
    global _browser, _context, _page, _console_logs

    if _page:
        await _page.close()
        _page = None

    if _context:
        await _context.close()
        _context = None

    if _browser:
        await _browser.close()
        _browser = None

    _console_logs = []
    logger.info("Playwright browser closed")


# =============================================================================
# TOOL EXECUTION HANDLERS
# =============================================================================


async def execute_navigate(url: str) -> dict[str, Any]:
    """
    Navigate to a URL.

    Args:
        url: URL to navigate to

    Returns:
        Result dict with status and final URL
    """
    try:
        page = await get_page()

        logger.info(f"Navigating to: {url}")
        response = await page.goto(url, wait_until="networkidle", timeout=30000)

        if response is None:
            return {
                "success": False,
                "error": "Navigation failed - no response",
            }

        status = response.status
        final_url = page.url

        logger.info(f"Navigation complete: {status} - {final_url}")

        return {
            "success": True,
            "status": status,
            "url": final_url,
            "redirected": final_url != url,
        }

    except Exception as e:
        logger.error(f"Navigate error: {e}")
        return {
            "success": False,
            "error": str(e),
        }


async def execute_screenshot(
    path: str, selector: str | None = None, full_page: bool = False
) -> dict[str, Any]:
    """
    Take a screenshot of the page or element.

    Args:
        path: File path to save screenshot
        selector: Optional CSS selector for element screenshot
        full_page: Capture full scrollable page

    Returns:
        Result dict with screenshot path and base64-encoded image for Claude to verify
    """
    try:
        page = await get_page()

        # Ensure directory exists
        screenshot_path = Path(path)
        screenshot_path.parent.mkdir(parents=True, exist_ok=True)

        logger.info(f"Taking screenshot: {path}")

        if selector:
            # Element screenshot
            element = await page.locator(selector).first
            if element:
                await element.screenshot(path=str(screenshot_path))
                logger.info(f"Element screenshot saved: {selector} -> {path}")
            else:
                return {
                    "success": False,
                    "error": f"Element not found: {selector}",
                }
        else:
            # Page screenshot
            await page.screenshot(path=str(screenshot_path), full_page=full_page)
            logger.info(f"Page screenshot saved: {path} (full_page={full_page})")

        # Read screenshot and encode as base64 for Claude to verify
        with open(screenshot_path, "rb") as f:
            screenshot_bytes = f.read()
            screenshot_base64 = base64.b64encode(screenshot_bytes).decode("utf-8")

        return {
            "success": True,
            "path": str(screenshot_path.absolute()),
            "selector": selector,
            "full_page": full_page,
            # Include base64-encoded image so Claude can see and verify the screenshot
            "image_base64": screenshot_base64,
            "media_type": "image/png",
        }

    except Exception as e:
        logger.error(f"Screenshot error: {e}")
        return {
            "success": False,
            "error": str(e),
        }


async def execute_click(selector: str) -> dict[str, Any]:
    """
    Click an element.

    Args:
        selector: CSS selector for element to click

    Returns:
        Result dict with click status
    """
    try:
        page = await get_page()

        logger.info(f"Clicking element: {selector}")
        await page.click(selector, timeout=10000)

        logger.info(f"Click successful: {selector}")
        return {
            "success": True,
            "selector": selector,
        }

    except Exception as e:
        logger.error(f"Click error: {e}")
        return {
            "success": False,
            "error": str(e),
            "selector": selector,
        }


async def execute_fill(selector: str, value: str) -> dict[str, Any]:
    """
    Fill a form field with text.

    Args:
        selector: CSS selector for input field
        value: Text value to fill

    Returns:
        Result dict with fill status
    """
    try:
        page = await get_page()

        logger.info(f"Filling field: {selector} = {value}")
        await page.fill(selector, value, timeout=10000)

        logger.info(f"Fill successful: {selector}")
        return {
            "success": True,
            "selector": selector,
            "value": value,
        }

    except Exception as e:
        logger.error(f"Fill error: {e}")
        return {
            "success": False,
            "error": str(e),
            "selector": selector,
        }


async def execute_assert(
    selector: str,
    text: str | None = None,
    visible: bool | None = None,
    count: int | None = None,
) -> dict[str, Any]:
    """
    Assert element state.

    Args:
        selector: CSS selector for element
        text: Expected text content (partial match)
        visible: Assert element is visible
        count: Expected number of matching elements

    Returns:
        Result dict with assertion status
    """
    try:
        page = await get_page()
        locator = page.locator(selector)

        logger.info(f"Asserting element: {selector}")

        results = {}

        # Count assertion
        if count is not None:
            actual_count = await locator.count()
            count_pass = actual_count == count
            results["count"] = {
                "expected": count,
                "actual": actual_count,
                "pass": count_pass,
            }
            logger.info(f"Count assertion: expected={count}, actual={actual_count}, pass={count_pass}")

        # Visibility assertion (default: true)
        if visible is not None or visible is None:
            check_visible = visible if visible is not None else True
            try:
                if check_visible:
                    await locator.first.wait_for(state="visible", timeout=5000)
                    is_visible = True
                else:
                    await locator.first.wait_for(state="hidden", timeout=5000)
                    is_visible = False

                results["visible"] = {
                    "expected": check_visible,
                    "actual": is_visible,
                    "pass": True,
                }
                logger.info(f"Visibility assertion: pass")
            except Exception as e:
                results["visible"] = {
                    "expected": check_visible,
                    "actual": not check_visible,
                    "pass": False,
                    "error": str(e),
                }
                logger.warning(f"Visibility assertion: fail - {e}")

        # Text assertion
        if text is not None:
            try:
                actual_text = await locator.first.inner_text(timeout=5000)
                text_match = text.lower() in actual_text.lower()
                results["text"] = {
                    "expected": text,
                    "actual": actual_text,
                    "pass": text_match,
                }
                logger.info(f"Text assertion: expected='{text}', actual='{actual_text}', pass={text_match}")
            except Exception as e:
                results["text"] = {
                    "expected": text,
                    "actual": None,
                    "pass": False,
                    "error": str(e),
                }
                logger.warning(f"Text assertion: fail - {e}")

        # Overall success
        all_passed = all(r.get("pass", False) for r in results.values())

        return {
            "success": True,
            "selector": selector,
            "assertions": results,
            "all_passed": all_passed,
        }

    except Exception as e:
        logger.error(f"Assert error: {e}")
        return {
            "success": False,
            "error": str(e),
            "selector": selector,
        }


async def execute_get_console(filter_level: str = "all") -> dict[str, Any]:
    """
    Get console logs from the browser.

    Args:
        filter_level: Filter by level ('error', 'warning', 'info', 'all')

    Returns:
        Result dict with console logs
    """
    global _console_logs

    try:
        # Ensure page exists (creates console monitoring)
        await get_page()

        # Filter logs
        if filter_level == "all":
            filtered_logs = _console_logs
        else:
            filtered_logs = [log for log in _console_logs if log["type"] == filter_level]

        logger.info(f"Retrieved {len(filtered_logs)} console logs (filter={filter_level})")

        return {
            "success": True,
            "filter": filter_level,
            "count": len(filtered_logs),
            "logs": filtered_logs,
        }

    except Exception as e:
        logger.error(f"Get console error: {e}")
        return {
            "success": False,
            "error": str(e),
        }


async def execute_create_test(
    flow_name: str, description: str, steps: list[dict], output_path: str
) -> dict[str, Any]:
    """
    Generate a Playwright E2E test file.

    Args:
        flow_name: Name of the user flow
        description: Human-readable description
        steps: List of test steps with actions
        output_path: File path to save test

    Returns:
        Result dict with generated file path
    """
    try:
        # Generate TypeScript test code
        test_code = _generate_test_code(flow_name, description, steps)

        # Ensure directory exists
        test_path = Path(output_path)
        test_path.parent.mkdir(parents=True, exist_ok=True)

        # Write test file
        test_path.write_text(test_code)

        logger.info(f"Generated Playwright test: {output_path}")

        return {
            "success": True,
            "path": str(test_path.absolute()),
            "flow_name": flow_name,
            "step_count": len(steps),
        }

    except Exception as e:
        logger.error(f"Create test error: {e}")
        return {
            "success": False,
            "error": str(e),
        }


def _generate_test_code(flow_name: str, description: str, steps: list[dict]) -> str:
    """
    Generate TypeScript Playwright test code from steps.

    Args:
        flow_name: Test name
        description: Test description
        steps: List of step dicts

    Returns:
        Generated TypeScript code
    """
    test_name = flow_name.replace("-", " ").replace("_", " ")

    code = f"""import {{ test, expect }} from '@playwright/test';

test.describe('{test_name}', () => {{
  test('{description}', async ({{ page }}) => {{
"""

    # Generate code for each step
    for i, step in enumerate(steps):
        action = step.get("action")
        code += f"    // Step {i + 1}: {action}\n"

        if action == "navigate":
            url = step.get("url", "")
            code += f"    await page.goto('{url}');\n"

        elif action == "click":
            selector = step.get("selector", "")
            code += f"    await page.click('{selector}');\n"

        elif action == "fill":
            selector = step.get("selector", "")
            value = step.get("value", "")
            code += f"    await page.fill('{selector}', '{value}');\n"

        elif action == "assert":
            selector = step.get("selector", "")
            value = step.get("value")

            if value:
                code += f"    await expect(page.locator('{selector}')).toContainText('{value}');\n"
            else:
                code += f"    await expect(page.locator('{selector}')).toBeVisible();\n"

        elif action == "screenshot":
            path = step.get("path", f"screenshot-{i}.png")
            code += f"    await page.screenshot({{ path: '{path}' }});\n"

        code += "\n"

    code += """  });
});
"""

    return code


# =============================================================================
# TOOL ROUTER
# =============================================================================


async def execute_playwright_tool(tool_name: str, tool_input: dict[str, Any]) -> dict[str, Any]:
    """
    Route tool execution to appropriate handler.

    Args:
        tool_name: Name of the Playwright tool
        tool_input: Tool input parameters

    Returns:
        Execution result
    """
    handlers = {
        "playwright_navigate": lambda: execute_navigate(**tool_input),
        "playwright_screenshot": lambda: execute_screenshot(**tool_input),
        "playwright_click": lambda: execute_click(**tool_input),
        "playwright_fill": lambda: execute_fill(**tool_input),
        "playwright_assert": lambda: execute_assert(**tool_input),
        "playwright_get_console": lambda: execute_get_console(**tool_input),
        "playwright_create_test": lambda: execute_create_test(**tool_input),
    }

    handler = handlers.get(tool_name)
    if not handler:
        return {
            "success": False,
            "error": f"Unknown Playwright tool: {tool_name}",
        }

    try:
        result = await handler()
        return result
    except Exception as e:
        logger.error(f"Tool execution error [{tool_name}]: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Execution failed: {str(e)}",
        }
