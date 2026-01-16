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
    # pywin32 is required on all Python versions on Windows (ACS-306)
    # The MCP library unconditionally imports win32api on Windows
    if sys.platform == "win32":
        try:
            import pywintypes  # noqa: F401
        except ImportError:
            _exit_with_pywin32_error()


def _exit_with_pywin32_error() -> None:
    """Exit with helpful error message for missing pywin32."""
    # Use sys.prefix to detect the virtual environment path
    # This works for venv and poetry environments
    # Check for common Windows activation scripts (activate, activate.bat, Activate.ps1)
    scripts_dir = Path(sys.prefix) / "Scripts"
    activation_candidates = [
        scripts_dir / "activate",
        scripts_dir / "activate.bat",
        scripts_dir / "Activate.ps1",
    ]
    venv_activate = next((p for p in activation_candidates if p.exists()), None)

    # Build activation step only if activate script exists
    activation_step = ""
    if venv_activate:
        activation_step = (
            "To fix this:\n"
            "1. Activate your virtual environment:\n"
            f"   {venv_activate}\n"
            "\n"
            "2. Install pywin32:\n"
            "   pip install pywin32>=306\n"
            "\n"
            "   Or reinstall all dependencies:\n"
            "   pip install -r requirements.txt\n"
        )
    else:
        # For system Python or environments without activate script
        activation_step = (
            "To fix this:\n"
            "Install pywin32:\n"
            "   pip install pywin32>=306\n"
            "\n"
            "   Or reinstall all dependencies:\n"
            "   pip install -r requirements.txt\n"
        )

    sys.exit(
        "Error: Required Windows dependency 'pywin32' is not installed.\n"
        "\n"
        "Auto Claude requires pywin32 on Windows for:\n"
        "  - MCP library (win32api, win32con, win32job modules)\n"
        "  - LadybugDB/Graphiti memory integration\n"
        "\n"
        f"{activation_step}"
        "\n"
        f"Current Python: {sys.executable}\n"
    )
