"""
Formatted Output Helpers
=========================

High-level formatting functions for common output patterns.
"""

from .boxes import box
from .colors import bold, error, highlight, info, muted, success, warning
from .icons import Icons, icon


def print_header(
    title: str,
    subtitle: str = "",
    icon_tuple: tuple[str, str] = None,
    width: int = 70,
) -> None:
    """
    Print a formatted header.

    Args:
        title: Header title
        subtitle: Optional subtitle text
        icon_tuple: Optional icon to display
        width: Width of the box
    """
    icon_str = icon(icon_tuple) + " " if icon_tuple else ""

    content = [bold(f"{icon_str}{title}")]
    if subtitle:
        content.append(muted(subtitle))

    print(box(content, width=width, style="heavy"))


def print_section(
    title: str,
    icon_tuple: tuple[str, str] = None,
    width: int = 70,
) -> None:
    """
    Print a section header.

    Args:
        title: Section title
        icon_tuple: Optional icon to display
        width: Width of the box
    """
    icon_str = icon(icon_tuple) + " " if icon_tuple else ""
    print()
    print(box([bold(f"{icon_str}{title}")], width=width, style="light"))


def print_status(
    message: str,
    status: str = "info",
    icon_tuple: tuple[str, str] = None,
) -> None:
    """
    Print a status message with icon.

    Args:
        message: Status message to print
        status: Status type (success, error, warning, info, pending, progress)
        icon_tuple: Optional custom icon to use
    """
    if icon_tuple is None:
        icon_tuple = {
            "success": Icons.SUCCESS,
            "error": Icons.ERROR,
            "warning": Icons.WARNING,
            "info": Icons.INFO,
            "pending": Icons.PENDING,
            "progress": Icons.IN_PROGRESS,
        }.get(status, Icons.INFO)

    color_fn = {
        "success": success,
        "error": error,
        "warning": warning,
        "info": info,
        "pending": muted,
        "progress": highlight,
    }.get(status, lambda x: x)

    print(f"{icon(icon_tuple)} {color_fn(message)}")


def print_key_value(key: str, value: str, indent: int = 2) -> None:
    """
    Print a key-value pair.

    Args:
        key: Key name
        value: Value to display
        indent: Number of spaces to indent
    """
    spaces = " " * indent
    print(f"{spaces}{muted(key + ':')} {value}")


def print_phase_status(
    name: str,
    completed: int,
    total: int,
    status: str = "pending",
) -> None:
    """
    Print a phase status line.

    Args:
        name: Phase name
        completed: Number of completed items
        total: Total number of items
        status: Phase status (complete, in_progress, pending, blocked)
    """
    icon_tuple = {
        "complete": Icons.SUCCESS,
        "in_progress": Icons.IN_PROGRESS,
        "pending": Icons.PENDING,
        "blocked": Icons.BLOCKED,
    }.get(status, Icons.PENDING)

    color_fn = {
        "complete": success,
        "in_progress": highlight,
        "pending": lambda x: x,
        "blocked": muted,
    }.get(status, lambda x: x)

    print(f"  {icon(icon_tuple)} {color_fn(name)}: {completed}/{total}")
