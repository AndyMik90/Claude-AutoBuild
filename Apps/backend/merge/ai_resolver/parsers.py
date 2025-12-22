"""
Code Parsers
============

Utilities for parsing code from AI responses.

This module contains functions for extracting code blocks from AI
responses and validating that content looks like code.
"""

from __future__ import annotations

import re


def extract_code_block(response: str, language: str) -> str | None:
    """
    Extract code block from AI response.

    Args:
        response: The AI response text
        language: Expected programming language

    Returns:
        Extracted code block, or None if not found
    """
    # Try to find fenced code block
    patterns = [
        rf"```{language}\n(.*?)```",
        rf"```{language.lower()}\n(.*?)```",
        r"```\n(.*?)```",
        r"```(.*?)```",
    ]

    for pattern in patterns:
        match = re.search(pattern, response, re.DOTALL)
        if match:
            return match.group(1).strip()

    # If no code block, check if the entire response looks like code
    lines = response.strip().split("\n")
    if lines and not lines[0].startswith("```"):
        # Assume entire response is code if it looks like it
        if looks_like_code(response, language):
            return response.strip()

    return None


def looks_like_code(text: str, language: str) -> bool:
    """
    Heuristic to check if text looks like code.

    Args:
        text: Text to check
        language: Programming language to check for

    Returns:
        True if text appears to be code
    """
    indicators = {
        "python": ["def ", "import ", "class ", "if ", "for "],
        "javascript": ["function", "const ", "let ", "var ", "import ", "export "],
        "typescript": ["function", "const ", "let ", "interface ", "type ", "import "],
        "tsx": ["function", "const ", "return ", "import ", "export ", "<"],
        "jsx": ["function", "const ", "return ", "import ", "export ", "<"],
    }

    lang_indicators = indicators.get(language.lower(), [])
    if lang_indicators:
        return any(ind in text for ind in lang_indicators)

    # Generic code indicators
    return any(
        ind in text for ind in ["=", "(", ")", "{", "}", "import", "def", "function"]
    )


def extract_batch_code_blocks(
    response: str,
    location: str,
    language: str,
) -> str | None:
    """
    Extract code block for a specific location from a batch response.

    Args:
        response: The batch AI response
        location: The conflict location to extract
        language: Programming language

    Returns:
        Extracted code block for the location, or None if not found
    """
    # Try to find the resolution for this location
    pattern = rf"## Location: {re.escape(location)}.*?```{language}\n(.*?)```"
    match = re.search(pattern, response, re.DOTALL)

    if match:
        return match.group(1).strip()

    return None
