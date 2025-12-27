"""
Security Hooks for Auto-Build Framework
=======================================

BACKWARD COMPATIBILITY FACADE

This module maintains the original API for backward compatibility.
All functionality has been refactored into the security/ submodule:

- security/validator.py - Command validation logic
- security/parser.py - Command parsing utilities
- security/profile.py - Security profile management
- security/hooks.py - Security hook implementations
- security/__init__.py - Public API exports

See security/ directory for the actual implementation.

The security system has three layers:
1. Base commands - Always allowed (core shell utilities)
2. Stack commands - Detected from project structure (frameworks, languages)
3. Custom commands - User-defined allowlist

See project_analyzer.py for the detection logic.
"""

# Import everything from the security module to maintain backward compatibility
from security import *  # noqa: F401, F403

# Explicitly import commonly used items for clarity
from security import (
    BASE_COMMANDS,
    VALIDATORS,
    SecurityProfile,
    bash_security_hook,
    extract_commands,
    get_command_for_validation,
    get_security_profile,
    is_command_allowed,
    needs_validation,
    reset_profile_cache,
    split_command_segments,
    validate_command,
)

# Re-export for backward compatibility
__all__ = [
    "bash_security_hook",
    "validate_command",
    "get_security_profile",
    "reset_profile_cache",
    "extract_commands",
    "split_command_segments",
    "get_command_for_validation",
    "VALIDATORS",
    "SecurityProfile",
    "is_command_allowed",
    "needs_validation",
    "BASE_COMMANDS",
]


# =============================================================================
# CLI for testing (maintained for backward compatibility)
# =============================================================================

if __name__ == "__main__":
    import sys
    from pathlib import Path

    if len(sys.argv) < 2:
        print("Usage: python security.py <command>")
        print("       python security.py --list [project_dir]")
        sys.exit(1)

    if sys.argv[1] == "--list":
        # List all allowed commands for a project
        project_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path.cwd()
        profile = get_security_profile(project_dir)

        print("\nAllowed commands:")
        for cmd in sorted(profile.get_all_allowed_commands()):
            print(f"  {cmd}")

        print(f"\nTotal: {len(profile.get_all_allowed_commands())} commands")
    else:
        # Validate a command
        command = " ".join(sys.argv[1:])
        is_allowed, reason = validate_command(command)

        if is_allowed:
            print(f"✓ ALLOWED: {command}")
        else:
            print(f"✗ BLOCKED: {command}")
            print(f"  Reason: {reason}")
