"""
Keyword Extraction
==================

Extracts meaningful keywords from task descriptions for search.
"""

import re


class KeywordExtractor:
    """Extracts and filters keywords from task descriptions."""

    # Common words to filter out
    STOPWORDS = {
        "a",
        "an",
        "the",
        "to",
        "for",
        "of",
        "in",
        "on",
        "at",
        "by",
        "with",
        "and",
        "or",
        "but",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "can",
        "this",
        "that",
        "these",
        "those",
        "i",
        "you",
        "we",
        "they",
        "it",
        "add",
        "create",
        "make",
        "implement",
        "build",
        "fix",
        "update",
        "change",
        "modify",
        "when",
        "if",
        "then",
        "else",
        "new",
        "existing",
    }

    @classmethod
    def extract_keywords(cls, task: str, max_keywords: int = 10) -> list[str]:
        """
        Extract search keywords from task description.

        Args:
            task: Task description string
            max_keywords: Maximum number of keywords to return

        Returns:
            List of extracted keywords
        """
        # Tokenize and filter
        words = re.findall(r"\b[a-zA-Z_][a-zA-Z0-9_]*\b", task.lower())
        keywords = [w for w in words if w not in cls.STOPWORDS and len(w) > 2]

        # Deduplicate while preserving order
        seen = set()
        unique_keywords = []
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                unique_keywords.append(kw)

        return unique_keywords[:max_keywords]
