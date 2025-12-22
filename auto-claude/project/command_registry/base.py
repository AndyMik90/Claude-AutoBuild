"""
Base Commands Module
====================

Core shell commands that are always safe regardless of project type.
These commands form the foundation of the security allowlist.

Security Modes:
- Normal mode: All BASE_COMMANDS available (backward compatible)
- Strict mode: Dangerous commands removed, network commands validated
  Enable with: SECURITY_STRICT_MODE=true in environment
"""

import os


def is_strict_mode() -> bool:
    """
    Check if security strict mode is enabled.

    Strict mode:
    - Removes shell spawning commands (eval, exec, sh, bash, zsh)
    - Adds validation for network commands (curl, wget)
    - Provides defense against prompt injection attacks

    Enable with: SECURITY_STRICT_MODE=true
    """
    return os.environ.get("SECURITY_STRICT_MODE", "").lower() in ("true", "1", "yes")


# =============================================================================
# SAFE COMMANDS - Always safe regardless of project type or mode
# =============================================================================

SAFE_COMMANDS: set[str] = {
    # Core shell (read/navigate)
    "echo",
    "printf",
    "cat",
    "head",
    "tail",
    "less",
    "more",
    "ls",
    "pwd",
    "cd",
    "pushd",
    "popd",
    "cp",
    "mv",
    "mkdir",
    "rmdir",
    "touch",
    "ln",
    "find",
    "fd",
    "grep",
    "egrep",
    "fgrep",
    "rg",
    "ag",
    "sort",
    "uniq",
    "cut",
    "tr",
    "sed",
    "awk",
    "gawk",
    "wc",
    "diff",
    "cmp",
    "comm",
    "tee",
    "xargs",
    "read",
    "file",
    "stat",
    "tree",
    "du",
    "df",
    "which",
    "whereis",
    "type",
    "command",
    "date",
    "time",
    "sleep",
    "timeout",
    "watch",
    "true",
    "false",
    "test",
    "[",
    "[[",
    "env",
    "printenv",
    "export",
    "unset",
    "set",
    "source",
    ".",
    "exit",
    "return",
    "break",
    "continue",
    # Archives
    "tar",
    "zip",
    "unzip",
    "gzip",
    "gunzip",
    # Network (read-only, safe for fetching)
    "ping",
    "host",
    "dig",
    # Git (always needed)
    "git",
    "gh",
    # Process management (with validation in security.py)
    "ps",
    "pgrep",
    "lsof",
    "jobs",
    "kill",
    "pkill",
    "killall",  # Validated for safe targets only
    # File operations (with validation in security.py)
    "rm",
    "chmod",  # Validated for safe operations only
    # Text tools
    "paste",
    "join",
    "split",
    "fold",
    "fmt",
    "nl",
    "rev",
    "shuf",
    "column",
    "expand",
    "unexpand",
    "iconv",
    # Misc safe
    "clear",
    "reset",
    "man",
    "help",
    "uname",
    "whoami",
    "id",
    "basename",
    "dirname",
    "realpath",
    "readlink",
    "mktemp",
    "bc",
    "expr",
    "let",
    "seq",
    "yes",
    "jq",
    "yq",
}

# =============================================================================
# DANGEROUS COMMANDS - Disabled in strict mode
# =============================================================================
# These commands can be used to:
# - Execute arbitrary code (eval, exec)
# - Spawn new shells that bypass security hooks (sh, bash, zsh)
# - Exfiltrate data to external servers (curl, wget with POST)

DANGEROUS_COMMANDS: set[str] = {
    "eval",   # Can execute arbitrary shell code
    "exec",   # Can replace current process with arbitrary command
    "sh",     # Spawns new shell - bypasses command validation
    "bash",   # Spawns new shell - bypasses command validation
    "zsh",    # Spawns new shell - bypasses command validation
}

# Network commands - allowed but validated in strict mode
NETWORK_COMMANDS: set[str] = {
    "curl",   # Can exfiltrate data via POST/PUT
    "wget",   # Can exfiltrate data via POST
}

# =============================================================================
# BASE_COMMANDS - Computed based on security mode
# =============================================================================


def get_base_commands() -> set[str]:
    """
    Get the base command set based on current security mode.

    In strict mode, dangerous commands are excluded and network
    commands require validation.
    """
    if is_strict_mode():
        # Strict mode: safe commands + network commands (validated separately)
        return SAFE_COMMANDS | NETWORK_COMMANDS
    else:
        # Normal mode: all commands (backward compatible)
        return SAFE_COMMANDS | DANGEROUS_COMMANDS | NETWORK_COMMANDS


# For backward compatibility, BASE_COMMANDS is the full set
# Code should use get_base_commands() for mode-aware behavior
BASE_COMMANDS: set[str] = SAFE_COMMANDS | DANGEROUS_COMMANDS | NETWORK_COMMANDS

# =============================================================================
# VALIDATED COMMANDS - Need extra validation even when allowed
# =============================================================================

# Base validators (always active)
_BASE_VALIDATORS: dict[str, str] = {
    "rm": "validate_rm",
    "chmod": "validate_chmod",
    "pkill": "validate_pkill",
    "kill": "validate_kill",
    "killall": "validate_killall",
}

# Strict mode validators (added in strict mode)
_STRICT_VALIDATORS: dict[str, str] = {
    "curl": "validate_curl",
    "wget": "validate_wget",
}


def get_validated_commands() -> dict[str, str]:
    """
    Get the validated commands dict based on current security mode.

    In strict mode, curl and wget require validation to prevent
    data exfiltration.
    """
    if is_strict_mode():
        return {**_BASE_VALIDATORS, **_STRICT_VALIDATORS}
    else:
        return _BASE_VALIDATORS.copy()


# For backward compatibility
VALIDATED_COMMANDS: dict[str, str] = _BASE_VALIDATORS.copy()


__all__ = [
    "BASE_COMMANDS",
    "VALIDATED_COMMANDS",
    "SAFE_COMMANDS",
    "DANGEROUS_COMMANDS",
    "NETWORK_COMMANDS",
    "get_base_commands",
    "get_validated_commands",
    "is_strict_mode",
]
