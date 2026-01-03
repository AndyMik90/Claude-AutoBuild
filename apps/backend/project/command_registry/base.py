"""
Base Commands Module
====================

Core shell commands that are always safe regardless of project type.
These commands form the foundation of the security allowlist.

Security Modes:
- Normal mode: All BASE_COMMANDS available (backward compatible)
- Strict mode: Dangerous commands removed, network commands validated
  Enable with: SECURITY_STRICT_MODE=true in environment

Strict Mode Options:
- SECURITY_ALLOW_TEXT_PROCESSORS=true: Allow sed/awk in strict mode
  (blocked by default due to arbitrary code execution risk)
"""

import os


def is_strict_mode() -> bool:
    """
    Check if security strict mode is enabled.

    Strict mode:
    - Removes shell spawning commands (eval, exec, sh, bash, zsh)
    - Blocks text processors with code execution (sed, awk, gawk)
    - Adds validation for network commands (curl, wget)
    - Provides defense against prompt injection attacks

    Enable with: SECURITY_STRICT_MODE=true
    """
    return os.environ.get("SECURITY_STRICT_MODE", "").lower() in ("true", "1", "yes")


def allow_text_processors() -> bool:
    """
    Check if text processors (sed/awk) are allowed in strict mode.

    By default, sed and awk are blocked in strict mode because they can
    execute arbitrary code:
    - sed: s/pattern/e flag, e command
    - awk: system(), getline, pipes

    Users who need these tools can opt-in by setting:
    SECURITY_ALLOW_TEXT_PROCESSORS=true

    This setting has no effect in normal mode (always allowed).
    """
    return os.environ.get("SECURITY_ALLOW_TEXT_PROCESSORS", "").lower() in ("true", "1", "yes")


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
    "source", # Can execute arbitrary scripts - bypasses command validation
    ".",      # Alias for source - same risks
}

# Network commands - allowed but validated in strict mode
NETWORK_COMMANDS: set[str] = {
    "curl",   # Can exfiltrate data via POST/PUT
    "wget",   # Can exfiltrate data via POST
}

# Text processors - blocked in strict mode by default (can execute code)
# Enable with: SECURITY_ALLOW_TEXT_PROCESSORS=true
TEXT_PROCESSOR_COMMANDS: set[str] = {
    "sed",    # Can execute code via 's/pattern/e' flag
    "awk",    # Has system(), getline, pipe execution
    "gawk",   # GNU awk - same risks as awk
}

# =============================================================================
# BASE_COMMANDS - Computed based on security mode
# =============================================================================


def get_base_commands() -> set[str]:
    """
    Get the base command set based on current security mode.

    In strict mode:
    - Dangerous commands are excluded
    - Network commands require validation
    - Text processors blocked unless SECURITY_ALLOW_TEXT_PROCESSORS=true
    """
    if is_strict_mode():
        # Strict mode: safe commands + network commands (validated separately)
        base = SAFE_COMMANDS | NETWORK_COMMANDS
        # Optionally include text processors if explicitly allowed
        if allow_text_processors():
            base = base | TEXT_PROCESSOR_COMMANDS
        return base
    else:
        # Normal mode: all commands (backward compatible)
        return SAFE_COMMANDS | DANGEROUS_COMMANDS | NETWORK_COMMANDS | TEXT_PROCESSOR_COMMANDS


# For backward compatibility, BASE_COMMANDS is the full set
# Code should use get_base_commands() for mode-aware behavior
BASE_COMMANDS: set[str] = SAFE_COMMANDS | DANGEROUS_COMMANDS | NETWORK_COMMANDS | TEXT_PROCESSOR_COMMANDS

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
    "TEXT_PROCESSOR_COMMANDS",
    "get_base_commands",
    "get_validated_commands",
    "is_strict_mode",
    "allow_text_processors",
]
