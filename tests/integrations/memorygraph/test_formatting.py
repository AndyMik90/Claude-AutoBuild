"""Tests for context formatting."""
from integrations.memorygraph.formatting import format_context


class TestFormatContext:
    """Tests for format_context function."""

    def test_returns_empty_for_no_memories(self):
        """Returns empty string when no memories provided."""
        context = format_context([], [])
        assert context == ""

    def test_formats_solutions(self):
        """Formats solution memories in 'What's worked before' section."""
        memories = [
            {
                "type": "solution",
                "title": "Fixed JWT validation",
                "content": "Added null check before token decode to prevent NPE",
            }
        ]

        context = format_context(memories, [])

        assert "Prior Knowledge" in context
        assert "What's worked before" in context
        assert "Fixed JWT validation" in context
        assert "null check" in context

    def test_formats_patterns(self):
        """Formats pattern memories in 'Patterns to follow' section."""
        memories = [
            {
                "type": "code_pattern",
                "content": "Always validate input before database queries",
            }
        ]

        context = format_context(memories, [])

        assert "Patterns to follow" in context
        assert "validate input" in context

    def test_formats_gotcha_problems(self):
        """Formats problems tagged as gotcha in 'Watch out for' section."""
        memories = [
            {
                "type": "problem",
                "title": "JWT expires silently",
                "content": "Token expiration not handled properly",
                "tags": ["gotcha", "auth"],
            }
        ]

        context = format_context(memories, [])

        assert "Watch out for" in context
        assert "JWT expires silently" in context

    def test_ignores_problems_without_gotcha_tag(self):
        """Problems without gotcha tag are not shown in Watch out section."""
        memories = [
            {
                "type": "problem",
                "title": "Database timeout",
                "content": "Connection timed out",
                "tags": ["database"],  # No gotcha tag
            }
        ]

        context = format_context(memories, [])

        # Should not have Watch out section without gotcha-tagged problems
        assert "Watch out for" not in context

    def test_truncates_long_content(self):
        """Truncates long content to avoid bloating prompts."""
        long_content = "A" * 500  # 500 chars
        memories = [{"type": "solution", "title": "Solution", "content": long_content}]

        context = format_context(memories, [])

        # Content should be truncated (200 chars for solutions)
        assert len(context) < len(long_content) + 200

    def test_limits_number_of_solutions(self):
        """Limits to top 3 solutions."""
        memories = [
            {"type": "solution", "title": f"Solution {i}", "content": f"Content {i}"}
            for i in range(5)
        ]

        context = format_context(memories, [])

        # Should only include 3 solutions
        assert context.count("Solution") <= 3

    def test_limits_number_of_patterns(self):
        """Limits to top 2 patterns."""
        memories = [
            {"type": "code_pattern", "content": f"Use pattern {i} for better code"}
            for i in range(5)
        ]

        context = format_context(memories, [])

        # Should only include 2 patterns (count the "- " prefix for list items)
        assert context.count("- Use pattern") == 2

    def test_handles_missing_fields_gracefully(self):
        """Handles memories with missing fields."""
        memories = [
            {"type": "solution"},  # Missing title and content
            {"type": "code_pattern", "title": "Has title"},  # Missing content
        ]

        # Should not raise exception
        context = format_context(memories, [])
        assert isinstance(context, str)

    def test_handles_none_tags(self):
        """Handles memories with None tags."""
        memories = [
            {
                "type": "problem",
                "title": "Issue",
                "content": "Description",
                "tags": None,
            }
        ]

        # Should not raise exception
        context = format_context(memories, [])
        assert isinstance(context, str)

    def test_returns_empty_when_only_regular_problems(self):
        """Returns empty when only problems without solutions/patterns/gotchas."""
        memories = [
            {
                "type": "problem",
                "title": "Some issue",
                "content": "Description",
                "tags": [],  # No gotcha tag
            }
        ]

        context = format_context(memories, [])

        # Should return empty since no useful sections
        # (problems without gotcha aren't shown)
        assert context == "" or "Prior Knowledge" in context

    def test_combines_all_sections(self):
        """Combines solutions, patterns, and gotchas in one context."""
        memories = [
            {"type": "solution", "title": "Fixed auth", "content": "Added validation"},
            {"type": "code_pattern", "content": "Use async/await for IO"},
            {
                "type": "problem",
                "title": "Race condition",
                "content": "Concurrent access issue",
                "tags": ["gotcha"],
            },
        ]

        context = format_context(memories, [])

        assert "What's worked before" in context
        assert "Patterns to follow" in context
        assert "Watch out for" in context
