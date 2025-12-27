"""
JSON response parsing utilities.
"""

import json
from typing import Any


class ResultParser:
    """Parses JSON responses from Claude SDK."""

    @staticmethod
    def parse_json_response(response: str, default: dict[str, Any]) -> dict[str, Any]:
        """
        Parse JSON from Claude's response.

        Tries multiple strategies:
        1. Direct JSON parse
        2. Extract from markdown code block
        3. Find JSON object in text
        4. Return default on failure

        Args:
            response: Raw text response from Claude
            default: Default value to return on parse failure

        Returns:
            Parsed JSON as dictionary
        """
        if not response:
            return default

        # Try direct parse
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass

        # Try extracting from markdown code block
        if "```json" in response:
            start = response.find("```json") + 7
            end = response.find("```", start)
            if end > start:
                try:
                    return json.loads(response[start:end].strip())
                except json.JSONDecodeError:
                    pass

        # Try finding JSON object
        start_idx = response.find("{")
        end_idx = response.rfind("}")
        if start_idx >= 0 and end_idx > start_idx:
            try:
                return json.loads(response[start_idx : end_idx + 1])
            except json.JSONDecodeError:
                pass

        # Return default with raw response snippet
        return {**default, "_raw_response": response[:1000]}
