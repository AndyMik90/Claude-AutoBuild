"""
Dependency Validator
====================

Validates platform-specific dependencies are installed before running agents.
"""

import sys
from pathlib import Path


def validate_platform_dependencies() -> None:
    """
    Validate that platform-specific dependencies are installed.

    Raises:
        SystemExit: If required platform-specific dependencies are missing,
                   with helpful installation instructions.
    """
    # Check Windows-specific dependencies
    if sys.platform == "win32" and sys.version_info >= (3, 12):
        try:
            import pywintypes  # noqa: F401
        except ImportError:
            _exit_with_pywin32_error()


def _exit_with_pywin32_error() -> None:
    """Exit with helpful error message for missing pywin32."""
    # Use sys.prefix to detect the virtual environment path
    # This works for venv and poetry environments
    venv_activate = Path(sys.prefix) / "Scripts" / "activate"

    sys.exit(
        "Error: Required Windows dependency 'pywin32' is not installed.\n"
        "\n"
        "Auto Claude requires pywin32 on Windows for LadybugDB/Graphiti memory integration.\n"
        "\n"
        "To fix this:\n"
        "1. Activate your virtual environment:\n"
        f"   {venv_activate}\n"
        "\n"
        "2. Install pywin32:\n"
        "   pip install pywin32>=306\n"
        "\n"
        "   Or reinstall all dependencies:\n"
        "   pip install -r requirements.txt\n"
        "\n"
        f"Current Python: {sys.executable}\n"
    )
