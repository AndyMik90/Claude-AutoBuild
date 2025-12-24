"""Tests for safe_io module."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
import pytest

from auto_claude.core.safe_io import (
    safe_write_text,
    safe_write_json,
    safe_read_text,
    safe_read_json,
    safe_open,
)


class TestSafeWriteText:
    """Tests for safe_write_text function."""

    def test_creates_file(self, tmp_path: Path) -> None:
        """Test that file is created with correct content."""
        path = tmp_path / "test.txt"
        content = "Hello, World!"

        safe_write_text(path, content)

        assert path.exists()
        assert path.read_text(encoding="utf-8") == content

    def test_creates_parent_directories(self, tmp_path: Path) -> None:
        """Test that parent directories are created."""
        path = tmp_path / "nested" / "deep" / "test.txt"
        content = "Nested content"

        safe_write_text(path, content)

        assert path.exists()
        assert path.read_text(encoding="utf-8") == content

    def test_overwrites_existing_file(self, tmp_path: Path) -> None:
        """Test that existing files are overwritten."""
        path = tmp_path / "test.txt"
        path.write_text("original", encoding="utf-8")

        safe_write_text(path, "updated")

        assert path.read_text(encoding="utf-8") == "updated"

    def test_handles_unicode(self, tmp_path: Path) -> None:
        """Test Unicode content is handled correctly."""
        path = tmp_path / "unicode.txt"
        content = "Hello 世界 🌍 Привет"

        safe_write_text(path, content)

        assert path.read_text(encoding="utf-8") == content

    def test_accepts_string_path(self, tmp_path: Path) -> None:
        """Test that string paths are accepted."""
        path = str(tmp_path / "string_path.txt")
        content = "String path content"

        safe_write_text(path, content)

        assert Path(path).read_text(encoding="utf-8") == content


class TestSafeWriteJson:
    """Tests for safe_write_json function."""

    def test_writes_json(self, tmp_path: Path) -> None:
        """Test that JSON is written correctly."""
        path = tmp_path / "test.json"
        data = {"key": "value", "number": 42}

        safe_write_json(path, data)

        with open(path, encoding="utf-8") as f:
            result = json.load(f)
        assert result == data

    def test_handles_nested_data(self, tmp_path: Path) -> None:
        """Test nested data structures."""
        path = tmp_path / "nested.json"
        data = {
            "users": [
                {"name": "Alice", "age": 30},
                {"name": "Bob", "age": 25},
            ],
            "metadata": {"version": 1},
        }

        safe_write_json(path, data)

        with open(path, encoding="utf-8") as f:
            result = json.load(f)
        assert result == data

    def test_custom_indent(self, tmp_path: Path) -> None:
        """Test custom indentation."""
        path = tmp_path / "indented.json"
        data = {"key": "value"}

        safe_write_json(path, data, indent=4)

        content = path.read_text(encoding="utf-8")
        assert "    " in content  # 4-space indent

    def test_unicode_in_json(self, tmp_path: Path) -> None:
        """Test Unicode characters in JSON."""
        path = tmp_path / "unicode.json"
        data = {"greeting": "你好", "emoji": "🎉"}

        safe_write_json(path, data)

        with open(path, encoding="utf-8") as f:
            result = json.load(f)
        assert result == data


class TestSafeReadText:
    """Tests for safe_read_text function."""

    def test_reads_file(self, tmp_path: Path) -> None:
        """Test reading file content."""
        path = tmp_path / "test.txt"
        content = "Test content"
        path.write_text(content, encoding="utf-8")

        result = safe_read_text(path)

        assert result == content

    def test_default_on_missing(self, tmp_path: Path) -> None:
        """Test default value for missing file."""
        path = tmp_path / "missing.txt"

        result = safe_read_text(path, default="default value")

        assert result == "default value"

    def test_raises_on_missing_without_default(self, tmp_path: Path) -> None:
        """Test FileNotFoundError when no default."""
        path = tmp_path / "missing.txt"

        with pytest.raises(FileNotFoundError):
            safe_read_text(path)

    def test_reads_unicode(self, tmp_path: Path) -> None:
        """Test reading Unicode content."""
        path = tmp_path / "unicode.txt"
        content = "日本語 テスト"
        path.write_text(content, encoding="utf-8")

        result = safe_read_text(path)

        assert result == content


class TestSafeReadJson:
    """Tests for safe_read_json function."""

    def test_reads_json(self, tmp_path: Path) -> None:
        """Test reading JSON file."""
        path = tmp_path / "test.json"
        data = {"key": "value"}
        path.write_text(json.dumps(data), encoding="utf-8")

        result = safe_read_json(path)

        assert result == data

    def test_default_on_missing(self, tmp_path: Path) -> None:
        """Test default value for missing file."""
        path = tmp_path / "missing.json"

        result = safe_read_json(path, default={})

        assert result == {}

    def test_default_on_invalid_json(self, tmp_path: Path) -> None:
        """Test default value for invalid JSON."""
        path = tmp_path / "invalid.json"
        path.write_text("not valid json", encoding="utf-8")

        result = safe_read_json(path, default={"fallback": True})

        assert result == {"fallback": True}

    def test_raises_on_missing_without_default(self, tmp_path: Path) -> None:
        """Test FileNotFoundError when no default."""
        path = tmp_path / "missing.json"

        with pytest.raises(FileNotFoundError):
            safe_read_json(path)


class TestSafeOpen:
    """Tests for safe_open function."""

    def test_read_mode(self, tmp_path: Path) -> None:
        """Test opening file in read mode."""
        path = tmp_path / "test.txt"
        path.write_text("content", encoding="utf-8")

        with safe_open(path, "r") as f:
            content = f.read()

        assert content == "content"

    def test_write_mode(self, tmp_path: Path) -> None:
        """Test opening file in write mode."""
        path = tmp_path / "test.txt"

        with safe_open(path, "w") as f:
            f.write("written")

        assert path.read_text(encoding="utf-8") == "written"

    def test_binary_mode(self, tmp_path: Path) -> None:
        """Test opening file in binary mode."""
        path = tmp_path / "test.bin"
        data = b"\x00\x01\x02\x03"
        path.write_bytes(data)

        with safe_open(path, "rb") as f:
            content = f.read()

        assert content == data

    def test_default_utf8_encoding(self, tmp_path: Path) -> None:
        """Test that UTF-8 is the default encoding."""
        path = tmp_path / "unicode.txt"
        content = "日本語"
        path.write_text(content, encoding="utf-8")

        with safe_open(path, "r") as f:
            result = f.read()

        assert result == content
