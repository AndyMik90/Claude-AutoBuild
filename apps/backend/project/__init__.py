"""
Project Analysis Module
=======================

Smart project analyzer for dynamic security profiles.

This module analyzes project structure to automatically determine which
commands should be allowed for safe autonomous development.

Public API:
- ProjectAnalyzer: Main analyzer class
- SecurityProfile: Security profile data structure
- TechnologyStack: Detected technologies
- CustomScripts: Detected custom scripts
- get_or_create_profile: Convenience function
- is_command_allowed: Check if command is allowed
- needs_validation: Check if command needs extra validation
- BASE_COMMANDS: Core safe commands
- VALIDATED_COMMANDS: Commands requiring validation
"""

from .analyzer import ProjectAnalyzer
from .command_registry import BASE_COMMANDS, VALIDATED_COMMANDS
from .models import CustomScripts, SecurityProfile, TechnologyStack

__all__ = [
    # Main classes
    "ProjectAnalyzer",
    "SecurityProfile",
    "TechnologyStack",
    "CustomScripts",
    # Utility functions
    "get_or_create_profile",
    "is_command_allowed",
    "needs_validation",
    # Command registries
    "BASE_COMMANDS",
    "VALIDATED_COMMANDS",
]


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

import os
from pathlib import Path
from typing import Optional


def get_or_create_profile(
    project_dir: Path,
    spec_dir: Path | None = None,
    force_reanalyze: bool = False,
) -> SecurityProfile:
    """
    Get existing profile or create a new one.

    This is the main entry point for the security system.

    Args:
        project_dir: Project root directory
        spec_dir: Optional spec directory for storing profile
        force_reanalyze: Force re-analysis even if profile exists

    Returns:
        SecurityProfile for the project
    """
    analyzer = ProjectAnalyzer(project_dir, spec_dir)
    return analyzer.analyze(force=force_reanalyze)


def is_command_allowed(
    command: str,
    profile: SecurityProfile,
) -> tuple[bool, str]:
    """
    Check if a command is allowed by the profile.

    Args:
        command: The command name (base command, not full command line)
        profile: The security profile to check against

    Returns:
        (is_allowed, reason) tuple
    """
    allowed = profile.get_all_allowed_commands()

    if command in allowed:
        return True, ""

    # Check for script commands (e.g., "./script.sh")
    if command.startswith("./") or command.startswith("/"):
        basename = os.path.basename(command)
        if basename in profile.custom_scripts.shell_scripts:
            return True, ""
        if command in profile.script_commands:
            return True, ""

    return False, f"Command '{command}' is not in the allowed commands for this project"


def needs_validation(command: str) -> str | None:
    """
    Check if a command needs extra validation.

    Returns:
        Validation function name or None
    """
    return VALIDATED_COMMANDS.get(command)
