"""
Base Commands Module
====================

Core shell commands that are always safe regardless of project type.
These commands form the foundation of the security allowlist.
"""


# =============================================================================
# BASE COMMANDS - Always safe regardless of project type
# =============================================================================

BASE_COMMANDS: set[str] = {
    # Core shell
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
    "eval",
    "exec",
    "exit",
    "return",
    "break",
    "continue",
    "sh",
    "bash",
    "zsh",
    # Archives
    "tar",
    "zip",
    "unzip",
    "gzip",
    "gunzip",
    # Network (read-only)
    "curl",
    "wget",
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
# VALIDATED COMMANDS - Need extra validation even when allowed
# =============================================================================

VALIDATED_COMMANDS: dict[str, str] = {
    "rm": "validate_rm",
    "chmod": "validate_chmod",
    "pkill": "validate_pkill",
    "kill": "validate_kill",
    "killall": "validate_killall",
}


__all__ = ["BASE_COMMANDS", "VALIDATED_COMMANDS"]
