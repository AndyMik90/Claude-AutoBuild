"""
Tool Input Validator
====================

Validates tool_input structure before tool execution.
Catches malformed inputs (None, wrong type, missing required keys) early.
"""

from typing import Any

# Required keys per tool type
TOOL_REQUIRED_KEYS: dict[str, list[str]] = {
    "Bash": ["command"],
    "Read": ["file_path"],
    "Write": ["file_path", "content"],
    "Edit": ["file_path", "old_string", "new_string"],
    "Glob": ["pattern"],
    "Grep": ["pattern"],
    "WebFetch": ["url"],
    "WebSearch": ["query"],
}


def validate_tool_input(
    tool_name: str,
    tool_input: Any,
) -> tuple[bool, str | None]:
    """
    Validate tool input structure.

    Args:
        tool_name: Name of the tool being called
        tool_input: The tool_input value from the SDK

    Returns:
        (is_valid, error_message) where error_message is None if valid
    """
    # Must not be None
    if tool_input is None:
        return False, f"{tool_name}: tool_input is None (malformed tool call)"

    # Must be a dict
    if not isinstance(tool_input, dict):
        return (
            False,
            f"{tool_name}: tool_input must be dict, got {type(tool_input).__name__}",
        )

    # Check required keys for known tools
    required_keys = TOOL_REQUIRED_KEYS.get(tool_name, [])
    missing_keys = [key for key in required_keys if key not in tool_input]

    if missing_keys:
        return (
            False,
            f"{tool_name}: missing required keys: {', '.join(missing_keys)}",
        )

    # Additional validation for specific tools
    if tool_name == "Bash":
        command = tool_input.get("command")
        if not isinstance(command, str):
            return (
                False,
                f"Bash: 'command' must be string, got {type(command).__name__}",
            )
        if not command.strip():
            return False, "Bash: 'command' is empty"

    return True, None


def get_safe_tool_input(block: Any, default: dict | None = None) -> dict:
    """
    Safely extract tool_input from a ToolUseBlock, defaulting to empty dict.

    Args:
        block: A ToolUseBlock from Claude SDK
        default: Default value if extraction fails (defaults to empty dict)

    Returns:
        The tool input as a dict (never None)
    """
    if default is None:
        default = {}

    if not hasattr(block, "input"):
        return default

    tool_input = block.input
    if tool_input is None:
        return default

    if not isinstance(tool_input, dict):
        return default

    return tool_input
