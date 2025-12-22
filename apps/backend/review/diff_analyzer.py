"""
Diff Analysis and Markdown Parsing
===================================

Provides utilities for extracting and parsing content from spec.md files,
including section extraction, table parsing, and text truncation.
"""

import re


def extract_section(
    content: str, header: str, next_header_pattern: str = r"^## "
) -> str:
    """
    Extract content from a markdown section.

    Args:
        content: Full markdown content
        header: Header to find (e.g., "## Overview")
        next_header_pattern: Regex pattern for next section header

    Returns:
        Content of the section (without the header), or empty string if not found
    """
    # Find the header
    header_pattern = rf"^{re.escape(header)}\s*$"
    match = re.search(header_pattern, content, re.MULTILINE)
    if not match:
        return ""

    # Get content from after the header
    start = match.end()
    remaining = content[start:]

    # Find the next section header
    next_match = re.search(next_header_pattern, remaining, re.MULTILINE)
    if next_match:
        section = remaining[: next_match.start()]
    else:
        section = remaining

    return section.strip()


def truncate_text(text: str, max_lines: int = 5, max_chars: int = 300) -> str:
    """Truncate text to fit display constraints."""
    lines = text.split("\n")
    truncated_lines = lines[:max_lines]
    result = "\n".join(truncated_lines)

    if len(result) > max_chars:
        result = result[: max_chars - 3] + "..."
    elif len(lines) > max_lines:
        result += "\n..."

    return result


def extract_table_rows(content: str, table_header: str) -> list[tuple[str, str, str]]:
    """
    Extract rows from a markdown table.

    Returns list of tuples with table cell values.
    """
    rows = []
    in_table = False
    header_found = False

    for line in content.split("\n"):
        line = line.strip()

        # Look for table header row containing the specified text
        if table_header.lower() in line.lower() and "|" in line:
            in_table = True
            header_found = True
            continue

        # Skip separator line
        if in_table and header_found and re.match(r"^\|[\s\-:|]+\|$", line):
            header_found = False
            continue

        # Parse table rows
        if in_table and line.startswith("|") and line.endswith("|"):
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if len(cells) >= 2:
                rows.append(tuple(cells[:3]) if len(cells) >= 3 else (*cells, ""))

        # End of table
        elif in_table and not line.startswith("|") and line:
            break

    return rows


def extract_title(content: str) -> str:
    """
    Extract the title from the first H1 heading.

    Args:
        content: Markdown content

    Returns:
        Title text or "Specification" if not found
    """
    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    return title_match.group(1) if title_match else "Specification"


def extract_checkboxes(content: str, max_items: int = 10) -> list[str]:
    """
    Extract checkbox items from markdown content.

    Args:
        content: Markdown content
        max_items: Maximum number of items to return

    Returns:
        List of checkbox item texts
    """
    checkboxes = re.findall(r"^\s*[-*]\s*\[[ x]\]\s*(.+)$", content, re.MULTILINE)
    return checkboxes[:max_items]
