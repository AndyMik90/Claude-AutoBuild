"""
Box Drawing
============

Functions for drawing boxes and dividers in terminal output.
"""

import re

from .capabilities import FANCY_UI
from .icons import Icons, icon


def box(
    content: str | list[str],
    title: str = "",
    width: int = 70,
    style: str = "heavy",
    title_align: str = "left",
) -> str:
    """
    Draw a box around content.

    Args:
        content: Text or lines of text to put in the box (string or list)
        title: Optional title for the top of the box
        width: Total width of the box
        style: "heavy" (double lines) or "light" (single lines)
        title_align: "left", "center", or "right"

    Returns:
        Formatted box as string
    """
    # Normalize content to list of strings
    if isinstance(content, str):
        content = content.split("\n")

    # Plain text fallback when fancy UI is disabled
    if not FANCY_UI:
        lines = []
        separator = "=" * width if style == "heavy" else "-" * width
        lines.append(separator)
        if title:
            lines.append(f"  {title}")
            lines.append(separator)
        for line in content:
            # Strip ANSI codes for plain output
            plain_line = re.sub(r"\033\[[0-9;]*m", "", line)
            lines.append(f"  {plain_line}")
        lines.append(separator)
        return "\n".join(lines)

    if style == "heavy":
        tl, tr, bl, br = Icons.BOX_TL, Icons.BOX_TR, Icons.BOX_BL, Icons.BOX_BR
        h, v = Icons.BOX_H, Icons.BOX_V
        ml, mr = Icons.BOX_ML, Icons.BOX_MR
    else:
        tl, tr, bl, br = (
            Icons.BOX_TL_LIGHT,
            Icons.BOX_TR_LIGHT,
            Icons.BOX_BL_LIGHT,
            Icons.BOX_BR_LIGHT,
        )
        h, v = Icons.BOX_H_LIGHT, Icons.BOX_V_LIGHT
        ml, mr = Icons.BOX_ML_LIGHT, Icons.BOX_MR_LIGHT

    tl, tr, bl, br = icon(tl), icon(tr), icon(bl), icon(br)
    h, v = icon(h), icon(v)
    ml, mr = icon(ml), icon(mr)

    inner_width = width - 2  # Account for side borders
    lines = []

    # Top border with optional title
    if title:
        # Calculate visible length (strip ANSI codes for length calculation)
        visible_title = re.sub(r"\033\[[0-9;]*m", "", title)
        title_len = len(visible_title)
        padding = inner_width - title_len - 2  # -2 for spaces around title

        if title_align == "center":
            left_pad = padding // 2
            right_pad = padding - left_pad
            top_line = tl + h * left_pad + " " + title + " " + h * right_pad + tr
        elif title_align == "right":
            top_line = tl + h * padding + " " + title + " " + tr
        else:  # left
            top_line = tl + " " + title + " " + h * padding + tr

        lines.append(top_line)
    else:
        lines.append(tl + h * inner_width + tr)

    # Content lines
    for line in content:
        # Strip ANSI for length calculation
        visible_line = re.sub(r"\033\[[0-9;]*m", "", line)
        visible_len = len(visible_line)
        padding = inner_width - visible_len - 2  # -2 for padding spaces

        if padding < 0:
            # Line is too long - need to truncate intelligently
            # Calculate how much to remove (visible characters only)
            chars_to_remove = abs(padding) + 3  # +3 for "..."
            target_len = visible_len - chars_to_remove

            if target_len <= 0:
                # Line is way too long, just show "..."
                line = "..."
                padding = inner_width - 5  # 3 for "..." + 2 for padding
            else:
                # Truncate the visible text, preserving ANSI codes for what remains
                # Split line into segments (ANSI code vs text)
                segments = re.split(r"(\033\[[0-9;]*m)", line)
                visible_chars = 0
                result_segments = []

                for segment in segments:
                    if re.match(r"\033\[[0-9;]*m", segment):
                        # ANSI code - include it without counting
                        result_segments.append(segment)
                    else:
                        # Text segment - count visible characters
                        remaining_space = target_len - visible_chars
                        if remaining_space <= 0:
                            break
                        if len(segment) <= remaining_space:
                            result_segments.append(segment)
                            visible_chars += len(segment)
                        else:
                            # Truncate this segment at word boundary if possible
                            truncated = segment[:remaining_space]
                            # Try to truncate at last space to avoid mid-word cuts
                            last_space = truncated.rfind(" ")
                            if (
                                last_space > remaining_space * 0.7
                            ):  # Only if space is in last 30%
                                truncated = truncated[:last_space]
                            result_segments.append(truncated)
                            visible_chars += len(truncated)
                            break

                line = "".join(result_segments) + "..."
                padding = 0

        lines.append(v + " " + line + " " * (padding + 1) + v)

    # Bottom border
    lines.append(bl + h * inner_width + br)

    return "\n".join(lines)


def divider(width: int = 70, style: str = "heavy", char: str = None) -> str:
    """
    Draw a horizontal divider line.

    Args:
        width: Width of the divider
        style: "heavy" or "light" box drawing style
        char: Optional custom character to use

    Returns:
        Formatted divider string
    """
    if char:
        return char * width
    if style == "heavy":
        return icon(Icons.BOX_H) * width
    return icon(Icons.BOX_H_LIGHT) * width
