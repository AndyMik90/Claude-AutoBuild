"""Tests for InsightExtractor."""
import pytest
from pathlib import Path
import sys

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "apps" / "backend"))

from integrations.memorygraph.extractor import InsightExtractor


class TestExtractProblems:
    """Tests for extract_problems method."""

    def test_extract_from_what_failed(self):
        """Extracts problems from what_failed field."""
        extractor = InsightExtractor()
        session_output = {
            "what_failed": [
                "Authentication failed due to missing JWT token validation",
                "Database connection timeout after 30 seconds"
            ]
        }

        problems = extractor.extract_problems(session_output)

        assert len(problems) == 2
        assert problems[0]["type"] == "problem"
        assert "JWT token validation" in problems[0]["content"]
        assert "title" in problems[0]
        assert "tags" in problems[0]

    def test_extract_from_errors(self):
        """Extracts problems from errors field."""
        extractor = InsightExtractor()
        session_output = {
            "errors": [
                "TypeError: expected str, got None in auth.py line 42"
            ]
        }

        problems = extractor.extract_problems(session_output)

        assert len(problems) == 1
        assert "TypeError" in problems[0]["content"]

    def test_extract_from_qa_rejections(self):
        """Extracts problems from QA rejection reasons."""
        extractor = InsightExtractor()
        session_output = {
            "qa_rejections": [
                "Tests failed: 3/10 test cases not passing"
            ]
        }

        problems = extractor.extract_problems(session_output)

        assert len(problems) == 1
        assert "test cases" in problems[0]["content"]

    def test_empty_when_no_failures(self):
        """Returns empty list when no failures present."""
        extractor = InsightExtractor()
        session_output = {
            "what_worked": ["Everything worked fine"]
        }

        problems = extractor.extract_problems(session_output)

        assert problems == []

    def test_handles_missing_fields(self):
        """Handles session_output with missing fields gracefully."""
        extractor = InsightExtractor()
        session_output = {}

        problems = extractor.extract_problems(session_output)

        assert problems == []


class TestExtractSolutions:
    """Tests for extract_solutions method."""

    def test_extract_from_what_worked(self):
        """Extracts solutions from what_worked field."""
        extractor = InsightExtractor()
        session_output = {
            "what_worked": [
                "Fixed auth by adding null check before token validation",
                "Increased database connection pool size to 20"
            ]
        }

        solutions = extractor.extract_solutions(session_output)

        assert len(solutions) == 2
        assert solutions[0]["type"] == "solution"
        assert "null check" in solutions[0]["content"]
        assert "title" in solutions[0]
        assert "tags" in solutions[0]

    def test_extract_from_fixes_applied(self):
        """Extracts solutions from fixes_applied field."""
        extractor = InsightExtractor()
        session_output = {
            "fixes_applied": [
                "Added retry logic with exponential backoff for API calls"
            ]
        }

        solutions = extractor.extract_solutions(session_output)

        assert len(solutions) == 1
        assert "retry logic" in solutions[0]["content"]

    def test_empty_when_no_successes(self):
        """Returns empty list when no successes present."""
        extractor = InsightExtractor()
        session_output = {
            "what_failed": ["Nothing worked"]
        }

        solutions = extractor.extract_solutions(session_output)

        assert solutions == []


class TestExtractPatterns:
    """Tests for extract_patterns method."""

    def test_extract_from_patterns_found(self):
        """Extracts patterns from patterns_found field."""
        extractor = InsightExtractor()
        session_output = {
            "patterns_found": [
                "Use async/await for all I/O operations",
                "Always validate input before database queries"
            ]
        }

        patterns = extractor.extract_patterns(session_output)

        assert len(patterns) == 2
        assert patterns[0]["type"] == "code_pattern"
        assert "async/await" in patterns[0]["content"]

    def test_infer_from_repeated_successes(self):
        """Infers patterns from repeated successful approaches."""
        extractor = InsightExtractor()
        session_output = {
            "what_worked": [
                "Added type hints to function - caught bug early",
                "Type hints helped IDE catch error before runtime",
                "Type annotation prevented None-related bug"
            ]
        }

        patterns = extractor.extract_patterns(session_output)

        # Should detect "type hints" as a pattern
        assert len(patterns) >= 1
        pattern_contents = " ".join(p["content"] for p in patterns)
        assert "type" in pattern_contents.lower()

    def test_empty_when_no_patterns(self):
        """Returns empty list when no patterns found."""
        extractor = InsightExtractor()
        session_output = {}

        patterns = extractor.extract_patterns(session_output)

        assert patterns == []


class TestSummarize:
    """Tests for _summarize helper method."""

    def test_truncates_long_text(self):
        """Truncates text to max_len characters."""
        extractor = InsightExtractor()
        long_text = "A" * 100

        summary = extractor._summarize(long_text, max_len=50)

        assert len(summary) <= 50

    def test_preserves_short_text(self):
        """Preserves text shorter than max_len."""
        extractor = InsightExtractor()
        short_text = "Short text"

        summary = extractor._summarize(short_text, max_len=50)

        assert summary == short_text

    def test_extracts_first_sentence(self):
        """Extracts first sentence as title."""
        extractor = InsightExtractor()
        text = "First sentence is good. Second sentence is extra."

        summary = extractor._summarize(text, max_len=50)

        assert "First sentence" in summary
        assert "Second sentence" not in summary

    def test_handles_unicode_content(self):
        """Handles Unicode characters in content."""
        extractor = InsightExtractor()
        session_output = {
            "what_failed": [
                "Failed to parse émojis 🚀 and 中文 characters"
            ]
        }

        problems = extractor.extract_problems(session_output)
        assert len(problems) == 1
        assert "🚀" in problems[0]["content"]
        assert "émojis" in problems[0]["content"]
        assert "中文" in problems[0]["content"]

    def test_handles_urls_in_summarize(self):
        """Doesn't break on URLs with dots."""
        extractor = InsightExtractor()
        text = "See https://example.com/path for details. This is the second sentence."

        # Should not split on URL dots
        summary = extractor._summarize(text, max_len=100)
        assert "example.com" in summary


class TestExtractTags:
    """Tests for _extract_tags helper method."""

    def test_extracts_technology_names(self):
        """Extracts technology names as tags."""
        extractor = InsightExtractor()
        text = "Fixed bug in FastAPI endpoint using Pydantic validation"

        tags = extractor._extract_tags(text)

        assert "fastapi" in tags or "api" in tags
        assert "pydantic" in tags

    def test_extracts_file_extensions(self):
        """Extracts file extensions as tags."""
        extractor = InsightExtractor()
        text = "Updated auth.py and login.js files"

        tags = extractor._extract_tags(text)

        assert "python" in tags or "py" in tags
        assert "javascript" in tags or "js" in tags

    def test_extracts_action_verbs(self):
        """Extracts action verbs as category tags."""
        extractor = InsightExtractor()
        text = "Fixed authentication bug by refactoring validation logic"

        tags = extractor._extract_tags(text)

        # Should extract categories like "bugfix", "refactor"
        assert any(tag in ["fix", "bugfix", "refactor", "refactoring"] for tag in tags)

    def test_handles_empty_text(self):
        """Returns empty list for empty text."""
        extractor = InsightExtractor()

        tags = extractor._extract_tags("")

        assert tags == []
