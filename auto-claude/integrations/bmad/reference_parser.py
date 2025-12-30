"""
Component Reference Parser

Parses user references like "Fix Component 3" or "Fix Stats Widget"
to identify specific blueprint components.
"""

import re
from difflib import SequenceMatcher


class ComponentReferenceParser:
    """Parse user references to blueprint components."""

    def __init__(self, blueprint):
        """
        Initialize parser with a blueprint.

        Args:
            blueprint: Blueprint object containing components
        """
        self.blueprint = blueprint
        self.components = blueprint.components

    def parse(self, user_input: str) -> object | None:
        """
        Parse user input to find the referenced component.

        Matches patterns:
        - "Component 3" / "comp-003" / "#3"
        - "Stats Widget" / "the stats widget"
        - "header" / "navigation header"

        Args:
            user_input: User's reference to a component

        Returns:
            Matched component or None
        """
        user_input = user_input.strip()

        # Try ID match first (most specific)
        component = self._match_by_id(user_input)
        if component:
            return component

        # Try exact name match
        component = self._match_by_exact_name(user_input)
        if component:
            return component

        # Try fuzzy name match
        component = self._match_by_fuzzy_name(user_input)
        if component:
            return component

        # Try keyword match
        component = self._match_by_keywords(user_input)
        if component:
            return component

        return None

    def _match_by_id(self, user_input: str) -> object | None:
        """
        Match component by ID.

        Patterns:
        - comp-003
        - Component 3
        - component 3
        - #3
        - 3
        """
        # Pattern: comp-XXX
        match = re.search(r"comp-(\d+)", user_input, re.I)
        if match:
            component_id = f"comp-{match.group(1).zfill(3)}"
            return self._find_by_id(component_id)

        # Pattern: Component N or #N or just N
        match = re.search(r"(?:component\s*)?#?(\d+)", user_input, re.I)
        if match:
            num = match.group(1).zfill(3)
            component_id = f"comp-{num}"
            return self._find_by_id(component_id)

        return None

    def _find_by_id(self, component_id: str) -> object | None:
        """Find component by exact ID."""
        for component in self.components:
            if component.id.lower() == component_id.lower():
                return component
        return None

    def _match_by_exact_name(self, user_input: str) -> object | None:
        """Match by exact name (case-insensitive)."""
        input_lower = user_input.lower()

        for component in self.components:
            if component.name.lower() == input_lower:
                return component

        return None

    def _match_by_fuzzy_name(
        self, user_input: str, threshold: float = 0.6
    ) -> object | None:
        """
        Match by fuzzy name matching.

        Uses sequence matching to find the best match above threshold.
        """
        input_lower = user_input.lower()

        # Clean input - remove common words
        cleaned = self._clean_input(input_lower)

        best_match = None
        best_score = threshold

        for component in self.components:
            name_lower = component.name.lower()

            # Try direct comparison
            score = SequenceMatcher(None, cleaned, name_lower).ratio()

            if score > best_score:
                best_score = score
                best_match = component

            # Try partial matching (input contained in name)
            if cleaned in name_lower:
                # Give bonus for substring match
                partial_score = len(cleaned) / len(name_lower) * 0.8 + 0.2
                if partial_score > best_score:
                    best_score = partial_score
                    best_match = component

        return best_match

    def _match_by_keywords(self, user_input: str) -> object | None:
        """Match by keywords in the input."""
        input_lower = user_input.lower()
        words = set(self._clean_input(input_lower).split())

        if not words:
            return None

        best_match = None
        best_overlap = 0

        for component in self.components:
            # Get words from component name and description
            component_words = set()
            component_words.update(component.name.lower().split())
            component_words.update(component.description.lower().split())

            # Calculate overlap
            overlap = len(words & component_words)

            if overlap > best_overlap:
                best_overlap = overlap
                best_match = component

        # Require at least one word match
        return best_match if best_overlap > 0 else None

    def _clean_input(self, text: str) -> str:
        """Clean input by removing common words and punctuation."""
        # Remove common words
        stop_words = {
            "the",
            "a",
            "an",
            "fix",
            "update",
            "modify",
            "change",
            "component",
            "module",
            "section",
            "part",
            "area",
            "please",
            "can",
            "you",
            "help",
            "with",
            "me",
        }

        # Remove punctuation
        text = re.sub(r"[^\w\s]", " ", text)

        # Split and filter
        words = text.split()
        words = [w for w in words if w not in stop_words]

        return " ".join(words)

    def get_suggestions(self, user_input: str, max_results: int = 3) -> list:
        """
        Get component suggestions based on partial input.

        Useful for autocomplete functionality.
        """
        input_lower = user_input.lower()
        cleaned = self._clean_input(input_lower)

        # Score all components
        scored = []
        for component in self.components:
            name_lower = component.name.lower()

            # Calculate score
            if cleaned in name_lower:
                score = 0.9  # High score for substring match
            else:
                score = SequenceMatcher(None, cleaned, name_lower).ratio()

            scored.append((component, score))

        # Sort by score descending
        scored.sort(key=lambda x: x[1], reverse=True)

        # Return top matches
        return [comp for comp, score in scored[:max_results] if score > 0.3]


def parse_fix_request(blueprint, user_input: str) -> tuple[object | None, str]:
    """
    Parse a fix request from user input.

    Examples:
    - "Fix Component 3 - button is not clickable"
    - "Fix the header nav, logo not showing"
    - "comp-002 has a bug with the dropdown"

    Args:
        blueprint: Blueprint object
        user_input: User's fix request

    Returns:
        Tuple of (component, issue_description)
    """
    parser = ComponentReferenceParser(blueprint)

    # Try to separate component reference from issue description
    separators = [" - ", ": ", ", ", " has ", " is "]

    for sep in separators:
        if sep in user_input:
            parts = user_input.split(sep, 1)
            component = parser.parse(parts[0])
            if component:
                return (component, parts[1])

    # No separator found - try to parse entire input as reference
    component = parser.parse(user_input)

    if component:
        return (component, "Issue reported via reference")

    return (None, user_input)
