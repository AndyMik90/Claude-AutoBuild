"""
Progress Indicators
====================

Progress bar and related progress display utilities.
"""

from .capabilities import COLOR
from .colors import info, muted, success, warning
from .icons import Icons, icon


def progress_bar(
    current: int,
    total: int,
    width: int = 40,
    show_percent: bool = True,
    show_count: bool = True,
    color_gradient: bool = True,
) -> str:
    """
    Create a colored progress bar.

    Args:
        current: Current progress value
        total: Total/maximum value
        width: Width of the bar (not including labels)
        show_percent: Show percentage at end
        show_count: Show current/total count
        color_gradient: Color bar based on progress

    Returns:
        Formatted progress bar string
    """
    if total == 0:
        percent = 0
        filled = 0
    else:
        percent = current / total
        filled = int(width * percent)

    full = icon(Icons.BAR_FULL)
    empty = icon(Icons.BAR_EMPTY)

    bar = full * filled + empty * (width - filled)

    # Apply color based on progress
    if color_gradient and COLOR:
        if percent >= 1.0:
            bar = success(bar)
        elif percent >= 0.5:
            bar = info(bar)
        elif percent > 0:
            bar = warning(bar)
        else:
            bar = muted(bar)

    parts = [f"[{bar}]"]

    if show_count:
        parts.append(f"{current}/{total}")

    if show_percent:
        parts.append(f"({percent:.0%})")

    return " ".join(parts)
