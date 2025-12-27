"""
Color and Styling
==================

ANSI color codes and styling functions for terminal output.
"""

from .capabilities import COLOR


class Color:
    """ANSI color codes."""

    # Basic colors
    BLACK = "\033[30m"
    RED = "\033[31m"
    GREEN = "\033[32m"
    YELLOW = "\033[33m"
    BLUE = "\033[34m"
    MAGENTA = "\033[35m"
    CYAN = "\033[36m"
    WHITE = "\033[37m"

    # Bright colors
    BRIGHT_BLACK = "\033[90m"
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"

    # Styles
    BOLD = "\033[1m"
    DIM = "\033[2m"
    ITALIC = "\033[3m"
    UNDERLINE = "\033[4m"
    RESET = "\033[0m"

    # Semantic colors
    SUCCESS = BRIGHT_GREEN
    ERROR = BRIGHT_RED
    WARNING = BRIGHT_YELLOW
    INFO = BRIGHT_BLUE
    MUTED = BRIGHT_BLACK
    HIGHLIGHT = BRIGHT_CYAN
    ACCENT = BRIGHT_MAGENTA


def color(text: str, *styles: str) -> str:
    """
    Apply color/style to text if supported.

    Args:
        text: Text to colorize
        *styles: ANSI color/style codes to apply

    Returns:
        Styled text with ANSI codes, or plain text if colors not supported
    """
    if not COLOR or not styles:
        return text
    return "".join(styles) + text + Color.RESET


def success(text: str) -> str:
    """Green success text."""
    return color(text, Color.SUCCESS)


def error(text: str) -> str:
    """Red error text."""
    return color(text, Color.ERROR)


def warning(text: str) -> str:
    """Yellow warning text."""
    return color(text, Color.WARNING)


def info(text: str) -> str:
    """Blue info text."""
    return color(text, Color.INFO)


def muted(text: str) -> str:
    """Gray muted text."""
    return color(text, Color.MUTED)


def highlight(text: str) -> str:
    """Cyan highlighted text."""
    return color(text, Color.HIGHLIGHT)


def bold(text: str) -> str:
    """Bold text."""
    return color(text, Color.BOLD)
