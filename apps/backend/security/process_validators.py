"""
Process Management Validators
==============================

Validators for process management commands (pkill, kill, killall).
"""

import shlex

from .validation_models import ValidationResult

# Allowed development process names
ALLOWED_PROCESS_NAMES = {
    # Node.js ecosystem
    "node",
    "npm",
    "npx",
    "yarn",
    "pnpm",
    "bun",
    "deno",
    "vite",
    "next",
    "nuxt",
    "webpack",
    "esbuild",
    "rollup",
    "tsx",
    "ts-node",
    # Python ecosystem
    "python",
    "python3",
    "flask",
    "uvicorn",
    "gunicorn",
    "django",
    "celery",
    "streamlit",
    "gradio",
    "pytest",
    "mypy",
    "ruff",
    # Other languages
    "cargo",
    "rustc",
    "go",
    "ruby",
    "rails",
    "php",
    # Databases (local dev)
    "postgres",
    "mysql",
    "mongod",
    "redis-server",
}


def validate_pkill_command(command_string: str) -> ValidationResult:
    """
    Validate pkill commands - only allow killing dev-related processes.

    Args:
        command_string: The full pkill command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse pkill command"

    if not tokens:
        return False, "Empty pkill command"

    # Separate flags from arguments
    args = []
    for token in tokens[1:]:
        if not token.startswith("-"):
            args.append(token)

    if not args:
        return False, "pkill requires a process name"

    # The target is typically the last non-flag argument
    target = args[-1]

    # For -f flag (full command line match), extract the first word
    if " " in target:
        target = target.split()[0]

    if target in ALLOWED_PROCESS_NAMES:
        return True, ""
    return (
        False,
        f"pkill only allowed for dev processes: {sorted(ALLOWED_PROCESS_NAMES)[:10]}...",
    )


def validate_kill_command(command_string: str) -> ValidationResult:
    """
    Validate kill commands - allow killing by PID (user must know the PID).

    Args:
        command_string: The full kill command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        tokens = shlex.split(command_string)
    except ValueError:
        return False, "Could not parse kill command"

    # Allow kill with specific PIDs or signal + PID
    # Block kill -9 -1 (kill all processes) and similar
    for token in tokens[1:]:
        if token == "-1" or token == "0" or token == "-0":
            return False, "kill -1 and kill 0 are not allowed (affects all processes)"

    return True, ""


def validate_killall_command(command_string: str) -> ValidationResult:
    """
    Validate killall commands - same rules as pkill.

    Args:
        command_string: The full killall command string

    Returns:
        Tuple of (is_valid, error_message)
    """
    return validate_pkill_command(command_string)
