"""
MemoryGraph Response Parser
===========================

Parses MCP response content into structured memory dicts.
Handles both JSON and formatted text responses.
"""

import json
import logging
import re

logger = logging.getLogger(__name__)


def parse_mcp_content(result: dict | None) -> list[dict]:
    """
    Parse MCP response content into list of memory dicts.

    Args:
        result: MCP tool result containing content array

    Returns:
        List of memory dicts or empty list
    """
    if result is None:
        return []

    if isinstance(result, dict):
        content = result.get("content", [])
        if isinstance(content, list) and content:
            # First content item usually has the text response
            text_content = content[0].get("text", "")

            # Try to parse as JSON if it looks like JSON
            if text_content.startswith("[") or text_content.startswith("{"):
                try:
                    parsed = json.loads(text_content)
                    # If single object, wrap in list
                    if isinstance(parsed, dict):
                        return [parsed]
                    return parsed if isinstance(parsed, list) else []
                except json.JSONDecodeError:
                    pass

            # Parse structured text response
            return parse_memories_text(text_content)

    return []


def parse_memories_text(text: str) -> list[dict]:
    """
    Parse memory text response into list of dicts.

    Handles formatted text output like:
    **1. Title** (ID: xxx)
    Type: solution | Importance: 0.8
    Tags: tag1, tag2

    Content here

    ---

    Args:
        text: Formatted text from MCP response

    Returns:
        List of memory dicts
    """
    memories = []
    # Split by --- separator (common in formatted outputs)
    sections = text.split("\n---\n")

    for section in sections:
        if not section.strip():
            continue

        memory = _parse_memory_section(section)

        # Only add if we extracted at least an ID or title
        if "id" in memory or "title" in memory:
            memories.append(memory)

    return memories


def _parse_memory_section(section: str) -> dict:
    """
    Parse a single memory section into a dict.

    Args:
        section: Text section for one memory

    Returns:
        Memory dict with extracted fields
    """
    memory = {}

    # Extract ID from (ID: xxx) - supports UUIDs with hyphens and underscores
    id_match = re.search(r"\(ID:\s*([a-zA-Z0-9_-]+)\)", section)
    if id_match:
        memory["id"] = id_match.group(1)

    # Extract title from **N. Title** format
    title_match = re.search(r"\*\*\d+\.\s*([^*]+)\*\*", section)
    if title_match:
        memory["title"] = title_match.group(1).strip()

    # Extract type
    type_match = re.search(r"Type:\s*(\w+)", section)
    if type_match:
        memory["type"] = type_match.group(1)

    # Extract importance
    importance_match = re.search(r"Importance:\s*([\d.]+)", section)
    if importance_match:
        memory["importance"] = float(importance_match.group(1))

    # Extract tags
    tags_match = re.search(r"Tags:\s*([^\n]+)", section)
    if tags_match:
        tags_str = tags_match.group(1).strip()
        memory["tags"] = [tag.strip() for tag in tags_str.split(",")]

    # Extract content (everything after the metadata)
    memory["content"] = _extract_content(section)

    # Remove empty content
    if not memory.get("content"):
        memory.pop("content", None)

    return memory


def _extract_content(section: str) -> str:
    """
    Extract content from a memory section.

    Content is everything after the metadata lines (title, type, tags, etc.)

    Args:
        section: Text section for one memory

    Returns:
        Extracted content string
    """
    lines = section.split("\n")
    content_lines = []
    in_content = False

    for line in lines:
        # Skip lines with metadata markers
        if re.match(r"^\*\*\d+\.", line) or re.match(r"^(Type|Tags|Importance):", line):
            continue
        if line.strip() and not line.startswith("(ID:"):
            in_content = True
        if in_content:
            content_lines.append(line)

    return "\n".join(content_lines).strip()


def extract_memory_id(result: dict | None) -> str | None:
    """
    Extract memory ID from a store_memory response.

    Args:
        result: MCP tool result from store_memory

    Returns:
        Memory ID string or None if not found
    """
    if result is None:
        return None

    if isinstance(result, dict):
        content = result.get("content", [])
        if isinstance(content, list) and content:
            text = content[0].get("text", "")
            # Look for "Memory stored successfully with ID: xxx" or similar
            # Supports UUIDs with hyphens and underscores
            match = re.search(r"ID:\s*([a-zA-Z0-9_-]+)", text)
            if match:
                return match.group(1)

    return None
