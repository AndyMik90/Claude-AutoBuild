"""Tests for MCP response parser."""

import pytest
from integrations.memorygraph.parser import (
    extract_memory_id,
    parse_mcp_content,
    parse_memories_text,
)


class TestParseMcpContent:
    """Tests for parse_mcp_content function."""

    def test_returns_empty_for_none(self):
        """Returns empty list for None input."""
        assert parse_mcp_content(None) == []

    def test_returns_empty_for_empty_dict(self):
        """Returns empty list for empty dict."""
        assert parse_mcp_content({}) == []

    def test_parses_json_array_response(self):
        """Parses JSON array in content text."""
        result = {
            "content": [
                {"text": '[{"id": "mem_1", "title": "Test", "type": "solution"}]'}
            ]
        }
        memories = parse_mcp_content(result)
        assert len(memories) == 1
        assert memories[0]["id"] == "mem_1"
        assert memories[0]["title"] == "Test"

    def test_parses_json_object_response(self):
        """Wraps single JSON object in list."""
        result = {"content": [{"text": '{"id": "mem_1", "title": "Single"}'}]}
        memories = parse_mcp_content(result)
        assert len(memories) == 1
        assert memories[0]["id"] == "mem_1"

    def test_parses_formatted_text_response(self):
        """Parses formatted text when not valid JSON."""
        result = {
            "content": [
                {
                    "text": """**1. Fixed auth bug** (ID: mem_123)
Type: solution | Importance: 0.8
Tags: auth, fix

Added null check to fix the issue.

---

**2. Another memory** (ID: mem_456)
Type: pattern | Importance: 0.5

Some content here."""
                }
            ]
        }
        memories = parse_mcp_content(result)
        assert len(memories) == 2
        assert memories[0]["id"] == "mem_123"
        assert memories[0]["title"] == "Fixed auth bug"
        assert memories[1]["id"] == "mem_456"

    def test_handles_empty_content_array(self):
        """Returns empty list for empty content array."""
        result = {"content": []}
        assert parse_mcp_content(result) == []

    def test_handles_missing_text_field(self):
        """Returns empty list when text field missing."""
        result = {"content": [{"type": "text"}]}
        assert parse_mcp_content(result) == []


class TestParseMemoriesText:
    """Tests for parse_memories_text function."""

    def test_parses_single_memory(self):
        """Parses single memory section."""
        text = """**1. Test Title** (ID: abc-123)
Type: solution | Importance: 0.9
Tags: python, async

This is the content."""

        memories = parse_memories_text(text)
        assert len(memories) == 1
        assert memories[0]["id"] == "abc-123"
        assert memories[0]["title"] == "Test Title"
        assert memories[0]["type"] == "solution"
        assert memories[0]["importance"] == 0.9
        assert memories[0]["tags"] == ["python", "async"]
        assert "content" in memories[0]

    def test_parses_multiple_memories_with_separator(self):
        """Parses multiple memories separated by ---."""
        text = """**1. First** (ID: id1)
Type: problem

Content 1

---

**2. Second** (ID: id2)
Type: solution

Content 2"""

        memories = parse_memories_text(text)
        assert len(memories) == 2
        assert memories[0]["id"] == "id1"
        assert memories[1]["id"] == "id2"

    def test_handles_uuid_with_hyphens(self):
        """Correctly parses UUIDs with hyphens."""
        text = "**1. Title** (ID: 550e8400-e29b-41d4-a716-446655440000)"
        memories = parse_memories_text(text)
        assert len(memories) == 1
        assert memories[0]["id"] == "550e8400-e29b-41d4-a716-446655440000"

    def test_handles_empty_text(self):
        """Returns empty list for empty text."""
        assert parse_memories_text("") == []

    def test_handles_whitespace_only(self):
        """Returns empty list for whitespace-only text."""
        assert parse_memories_text("   \n\n   ") == []

    def test_skips_sections_without_id_or_title(self):
        """Skips sections that have no ID or title."""
        text = """Some random text without structure

---

**1. Valid Title** (ID: valid_id)
Type: solution"""

        memories = parse_memories_text(text)
        assert len(memories) == 1
        assert memories[0]["id"] == "valid_id"


class TestExtractMemoryId:
    """Tests for extract_memory_id function."""

    def test_returns_none_for_none_input(self):
        """Returns None for None input."""
        assert extract_memory_id(None) is None

    def test_extracts_id_from_success_message(self):
        """Extracts ID from success message."""
        result = {
            "content": [{"text": "Memory stored successfully with ID: mem_abc123"}]
        }
        assert extract_memory_id(result) == "mem_abc123"

    def test_extracts_uuid_with_hyphens(self):
        """Extracts UUID with hyphens."""
        result = {
            "content": [
                {"text": "Created memory ID: 550e8400-e29b-41d4-a716-446655440000"}
            ]
        }
        assert extract_memory_id(result) == "550e8400-e29b-41d4-a716-446655440000"

    def test_returns_none_when_no_id_found(self):
        """Returns None when no ID pattern found."""
        result = {"content": [{"text": "Operation completed successfully"}]}
        assert extract_memory_id(result) is None

    def test_returns_none_for_empty_content(self):
        """Returns None for empty content array."""
        result = {"content": []}
        assert extract_memory_id(result) is None

    def test_returns_none_for_missing_text(self):
        """Returns None when text field missing."""
        result = {"content": [{"type": "text"}]}
        assert extract_memory_id(result) is None
