"""
Insight Extractor for MemoryGraph
==================================

Extracts structured insights from session output without requiring LLMs.
Uses simple pattern matching and heuristics.
"""

import re


class InsightExtractor:
    """Extract structured insights from session output."""

    # Common technology keywords for tagging
    TECH_KEYWORDS = {
        "python": ["python", ".py"],
        "javascript": ["javascript", "js", ".js"],
        "typescript": ["typescript", ".ts", ".tsx"],
        "fastapi": ["fastapi"],
        "pydantic": ["pydantic"],
        "pytest": ["pytest"],
        "async": ["async", "await"],
        "api": ["api", "endpoint"],
        "database": ["database", "db", "sql"],
        "auth": ["auth", "authentication", "jwt", "token"],
    }

    # Action patterns for categorization
    ACTION_PATTERNS = {
        "fix": r"\b(fix|fixed|fixing|bugfix)\b",
        "refactor": r"\b(refactor|refactoring|refactored)\b",
        "add": r"\b(add|added|adding)\b",
        "update": r"\b(update|updated|updating)\b",
        "error": r"\b(error|exception|failure)\b",
    }

    def extract_problems(self, session_output: dict) -> list[dict]:
        """
        Extract problems from what_failed, errors, QA rejections.

        Args:
            session_output: Session output dictionary

        Returns:
            List of problem memory dicts
        """
        problems = []

        # Extract from what_failed
        for failure in session_output.get("what_failed", []):
            problems.append(self._create_memory("problem", failure, importance=0.7))

        # Extract from errors - use "error" type for actual errors
        for error in session_output.get("errors", []):
            problems.append(
                self._create_memory(
                    "error",
                    error,
                    importance=0.8,  # Errors are more important
                )
            )

        # Extract from QA rejections
        for rejection in session_output.get("qa_rejections", []):
            problems.append(self._create_memory("problem", rejection, importance=0.7))

        return problems

    def extract_solutions(self, session_output: dict) -> list[dict]:
        """
        Extract solutions from what_worked, fixes applied.

        Args:
            session_output: Session output dictionary

        Returns:
            List of solution memory dicts
        """
        solutions = []

        # Extract from what_worked
        for success in session_output.get("what_worked", []):
            solutions.append(self._create_memory("solution", success, importance=0.8))

        # Extract from fixes_applied
        for fix in session_output.get("fixes_applied", []):
            solutions.append(self._create_memory("solution", fix, importance=0.8))

        return solutions

    def extract_patterns(self, session_output: dict) -> list[dict]:
        """
        Extract patterns from patterns_found or infer from repeated approaches.

        Args:
            session_output: Session output dictionary

        Returns:
            List of code_pattern memory dicts
        """
        patterns = []

        # Extract explicit patterns
        for pattern in session_output.get("patterns_found", []):
            patterns.append(
                self._create_memory("code_pattern", pattern, importance=0.6)
            )

        # Infer patterns from repeated successes
        what_worked = session_output.get("what_worked", [])
        if what_worked:
            inferred = self._infer_patterns_from_successes(what_worked)
            patterns.extend(inferred)

        return patterns

    def _create_memory(
        self, memory_type: str, content: str, importance: float = 0.7
    ) -> dict:
        """
        Create a memory dict from content.

        Args:
            memory_type: Type of memory
            content: Memory content
            importance: Importance score

        Returns:
            Memory dict ready for storage
        """
        return {
            "type": memory_type,
            "title": self._summarize(content),
            "content": content,
            "tags": self._extract_tags(content),
            "importance": importance,
        }

    def _summarize(self, text: str, max_len: int = 50) -> str:
        """
        Create short title from text.

        Args:
            text: Text to summarize
            max_len: Maximum length of title

        Returns:
            Short title string
        """
        if not text:
            return "Untitled"

        # Take first sentence if available
        sentences = re.split(r"[.!?]\s+", text)
        first_sentence = sentences[0] if sentences else text

        # Truncate if too long
        if len(first_sentence) > max_len:
            return first_sentence[: max_len - 3].strip() + "..."

        return first_sentence.strip()

    def _extract_tags(self, text: str) -> list[str]:
        """
        Extract relevant tags from text (technologies, patterns, etc.).

        Args:
            text: Text to extract tags from

        Returns:
            List of tag strings
        """
        if not text:
            return []

        tags = set()
        text_lower = text.lower()

        # Extract technology tags
        for tag_name, keywords in self.TECH_KEYWORDS.items():
            if any(kw in text_lower for kw in keywords):
                tags.add(tag_name)

        # Extract action tags
        for tag_name, pattern in self.ACTION_PATTERNS.items():
            if re.search(pattern, text_lower):
                tags.add(tag_name)

        return sorted(tags)

    def _infer_patterns_from_successes(self, successes: list[str]) -> list[dict]:
        """
        Infer patterns from repeated successful approaches.

        Args:
            successes: List of successful approaches

        Returns:
            List of inferred pattern memory dicts
        """
        if len(successes) < 2:
            return []

        patterns = []

        # Find common keywords across successes
        word_counts = {}
        for success in successes:
            # Extract meaningful words (3+ chars, lowercase)
            words = re.findall(r"\b[a-z]{3,}\b", success.lower())
            for word in words:
                word_counts[word] = word_counts.get(word, 0) + 1

        # Find words that appear in multiple successes
        repeated_words = [
            word
            for word, count in word_counts.items()
            if count >= 2
            and word not in {"the", "and", "for", "with", "that", "this", "was", "from"}
        ]

        # Create pattern if we found repeated themes
        if repeated_words:
            pattern_content = f"Pattern: {', '.join(repeated_words[:3])} appeared in multiple solutions"
            patterns.append(
                self._create_memory("code_pattern", pattern_content, importance=0.6)
            )

        return patterns
