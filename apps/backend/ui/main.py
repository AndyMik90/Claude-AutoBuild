"""
UI Utilities for Auto-Build
===========================

Main entry point for UI utilities. This module re-exports all UI components
from specialized submodules for backward compatibility.

Provides:
- Icons and symbols with fallback support
- Color output using ANSI codes
- Interactive selection menus
- Progress indicators (bars, spinners)
- Status file management for ccstatusline
- Formatted output helpers
"""

# Capability detection
# Box drawing
from ui.boxes import box, divider
from ui.capabilities import (
    COLOR,
    FANCY_UI,
    INTERACTIVE,
    UNICODE,
    supports_color,
    supports_interactive,
    supports_unicode,
)

# Colors and styling
from ui.colors import (
    Color,
    bold,
    color,
    error,
    highlight,
    info,
    muted,
    success,
    warning,
)

# Formatted output helpers
from ui.formatters import (
    print_header,
    print_key_value,
    print_phase_status,
    print_section,
    print_status,
)

# Icons
from ui.icons import Icons, icon

# Interactive menu
from ui.menu import MenuOption, select_menu

# Progress indicators
from ui.progress import progress_bar

# Spinner
from ui.spinner import Spinner

# Status management
from ui.status import BuildState, BuildStatus, StatusManager

# For backward compatibility, expose private capability variables
_FANCY_UI = FANCY_UI
_UNICODE = UNICODE
_COLOR = COLOR
_INTERACTIVE = INTERACTIVE

__all__ = [
    # Capabilities
    "supports_unicode",
    "supports_color",
    "supports_interactive",
    "FANCY_UI",
    "UNICODE",
    "COLOR",
    "INTERACTIVE",
    "_FANCY_UI",
    "_UNICODE",
    "_COLOR",
    "_INTERACTIVE",
    # Icons
    "Icons",
    "icon",
    # Colors
    "Color",
    "color",
    "success",
    "error",
    "warning",
    "info",
    "muted",
    "highlight",
    "bold",
    # Boxes
    "box",
    "divider",
    # Progress
    "progress_bar",
    # Menu
    "MenuOption",
    "select_menu",
    # Status
    "BuildState",
    "BuildStatus",
    "StatusManager",
    # Formatters
    "print_header",
    "print_section",
    "print_status",
    "print_key_value",
    "print_phase_status",
    # Spinner
    "Spinner",
]
