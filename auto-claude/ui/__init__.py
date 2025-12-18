"""
UI Package
===========

Terminal UI utilities organized into logical modules:
- capabilities: Terminal capability detection
- icons: Icon symbols with Unicode/ASCII fallbacks
- colors: ANSI color codes and styling
- boxes: Box drawing and dividers
- progress: Progress bars and indicators
- menu: Interactive selection menus
- status: Build status tracking
- formatters: Formatted output helpers
- spinner: Spinner for long operations
"""

# Re-export everything from submodules
from .boxes import box, divider
from .capabilities import (
    COLOR,
    FANCY_UI,
    INTERACTIVE,
    UNICODE,
    configure_safe_encoding,
    supports_color,
    supports_interactive,
    supports_unicode,
)
from .colors import (
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
from .formatters import (
    print_header,
    print_key_value,
    print_phase_status,
    print_section,
    print_status,
)
from .icons import Icons, icon
from .menu import MenuOption, select_menu
from .progress import progress_bar
from .spinner import Spinner
from .status import BuildState, BuildStatus, StatusManager

# For backward compatibility
_FANCY_UI = FANCY_UI
_UNICODE = UNICODE
_COLOR = COLOR
_INTERACTIVE = INTERACTIVE

__all__ = [
    # Capabilities
    "configure_safe_encoding",
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
