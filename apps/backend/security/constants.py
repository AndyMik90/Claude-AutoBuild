"""
Security Constants
==================

Shared constants for the security module.
"""

# Environment variable name for the project directory
# Set by agents (coder.py, loop.py) at startup to ensure security hooks
# can find the correct project directory even in worktree mode.
PROJECT_DIR_ENV_VAR = "AUTO_CLAUDE_PROJECT_DIR"

# Security configuration filename
# This JSON file controls which commands are allowed to run.
# Custom commands can be added to the "custom_commands" array.
PROFILE_FILENAME = ".auto-claude-security.json"
