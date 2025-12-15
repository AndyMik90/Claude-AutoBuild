"""
CLI Utilities
==============

Shared utility functions for the Auto Claude CLI.
"""

import os
import sys
from pathlib import Path

# Ensure parent directory is in path for imports (before other imports)
_PARENT_DIR = Path(__file__).parent.parent
if str(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, str(_PARENT_DIR))

from dotenv import load_dotenv
from graphiti_config import get_graphiti_status
from init import init_auto_claude_dir
from linear_integration import LinearManager
from linear_updater import is_linear_enabled
from ui import (
    Icons,
    bold,
    box,
    icon,
    muted,
)

# Configuration
DEFAULT_MODEL = "claude-opus-4-5-20251101"


def setup_environment() -> Path:
    """
    Set up the environment and return the script directory.

    Returns:
        Path to the auto-claude directory
    """
    # Add auto-claude directory to path for imports
    script_dir = Path(__file__).parent.parent.resolve()
    sys.path.insert(0, str(script_dir))

    # Load .env file - check both auto-claude/ and dev/auto-claude/ locations
    env_file = script_dir / ".env"
    dev_env_file = script_dir.parent / "dev" / "auto-claude" / ".env"
    if env_file.exists():
        load_dotenv(env_file)
    elif dev_env_file.exists():
        load_dotenv(dev_env_file)

    return script_dir


def get_specs_dir(project_dir: Path, dev_mode: bool = False) -> Path:
    """
    Get the specs directory path.

    IMPORTANT: Only .auto-claude/ is considered an "installed" auto-claude.
    The auto-claude/ folder (if it exists) is SOURCE CODE being developed,
    not an installation. This allows Auto Claude to be used to develop itself.

    This function also ensures .auto-claude is added to .gitignore on first use.

    Args:
        project_dir: The project root directory
        dev_mode: Deprecated, kept for API compatibility. Has no effect.

    Returns:
        Path to the specs directory within .auto-claude/
    """
    # Initialize .auto-claude directory and ensure it's in .gitignore
    init_auto_claude_dir(project_dir)

    # Return the specs directory path
    return project_dir / ".auto-claude" / "specs"


def find_spec(
    project_dir: Path, spec_identifier: str, dev_mode: bool = False
) -> Path | None:
    """
    Find a spec by number or full name.

    Args:
        project_dir: Project root directory
        spec_identifier: Either "001" or "001-feature-name"
        dev_mode: If True, use dev/auto-claude/specs/

    Returns:
        Path to spec folder, or None if not found
    """
    specs_dir = get_specs_dir(project_dir, dev_mode)

    if not specs_dir.exists():
        return None

    # Try exact match first
    exact_path = specs_dir / spec_identifier
    if exact_path.exists() and (exact_path / "spec.md").exists():
        return exact_path

    # Try matching by number prefix
    for spec_folder in specs_dir.iterdir():
        if spec_folder.is_dir() and spec_folder.name.startswith(spec_identifier + "-"):
            if (spec_folder / "spec.md").exists():
                return spec_folder

    return None


def validate_environment(spec_dir: Path) -> bool:
    """
    Validate that the environment is set up correctly.

    Returns:
        True if valid, False otherwise (with error messages printed)
    """
    valid = True

    # Check for Claude Code OAuth token
    if not os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        print("Error: CLAUDE_CODE_OAUTH_TOKEN environment variable not set")
        print("\nGet your OAuth token by running:")
        print("  claude setup-token")
        print("\nThen set it:")
        print("  export CLAUDE_CODE_OAUTH_TOKEN='your-token-here'")
        valid = False

    # Check for spec.md in spec directory
    spec_file = spec_dir / "spec.md"
    if not spec_file.exists():
        print(f"\nError: spec.md not found in {spec_dir}")
        valid = False

    # Check Linear integration (optional but show status)
    if is_linear_enabled():
        print("Linear integration: ENABLED")
        # Show Linear project status if initialized
        project_dir = (
            spec_dir.parent.parent
        )  # auto-claude/specs/001-name -> project root
        linear_manager = LinearManager(spec_dir, project_dir)
        if linear_manager.is_initialized:
            summary = linear_manager.get_progress_summary()
            print(f"  Project: {summary.get('project_name', 'Unknown')}")
            print(
                f"  Issues: {summary.get('mapped_subtasks', 0)}/{summary.get('total_subtasks', 0)} mapped"
            )
        else:
            print("  Status: Will be initialized during planner session")
    else:
        print("Linear integration: DISABLED (set LINEAR_API_KEY to enable)")

    # Check Graphiti integration (optional but show status)
    graphiti_status = get_graphiti_status()
    if graphiti_status["available"]:
        print("Graphiti memory: ENABLED")
        print(f"  Database: {graphiti_status['database']}")
        print(f"  Host: {graphiti_status['host']}:{graphiti_status['port']}")
    elif graphiti_status["enabled"]:
        print(
            f"Graphiti memory: CONFIGURED but unavailable ({graphiti_status['reason']})"
        )
    else:
        print("Graphiti memory: DISABLED (set GRAPHITI_ENABLED=true to enable)")

    print()
    return valid


def print_banner() -> None:
    """Print the Auto-Build banner."""
    content = [
        bold(f"{icon(Icons.LIGHTNING)} AUTO-BUILD FRAMEWORK"),
        "",
        "Autonomous Multi-Session Coding Agent",
        muted("Subtask-Based Implementation with Phase Dependencies"),
    ]
    print()
    print(box(content, width=70, style="heavy"))


def get_project_dir(provided_dir: Path | None) -> Path:
    """
    Determine the project directory.

    Args:
        provided_dir: User-provided project directory (or None)

    Returns:
        Resolved project directory path
    """
    if provided_dir:
        return provided_dir.resolve()

    project_dir = Path.cwd()

    # Auto-detect if running from within auto-claude directory (the source code)
    if project_dir.name == "auto-claude" and (project_dir / "run.py").exists():
        # Running from within auto-claude/ source directory, go up 1 level
        project_dir = project_dir.parent

    return project_dir
