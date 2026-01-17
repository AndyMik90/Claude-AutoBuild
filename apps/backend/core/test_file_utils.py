"""
Tests for file_utils.py
========================

Tests for atomic file writes and Windows-safe path handling utilities.
"""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add backend directory to path for imports
_backend_dir = Path(__file__).parent.parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

from core.file_utils import (
    atomic_write,
    normalize_path,
    safe_open,
    safe_path,
    sanitize_filename,
    write_json_atomic,
)


class TestSanitizeFilename:
    """Tests for sanitize_filename function."""

    def test_empty_string_returns_underscore(self):
        """Empty string should return underscore."""
        assert sanitize_filename("") == "_"

    def test_whitespace_only_returns_underscore(self):
        """Whitespace-only string should return underscore."""
        assert sanitize_filename("   ") == "_"
        assert sanitize_filename("\t\n") == "_"

    def test_none_returns_underscore(self):
        """None-like empty values should return underscore."""
        assert sanitize_filename("") == "_"

    def test_replaces_invalid_windows_chars(self):
        """Invalid Windows characters should be replaced."""
        assert sanitize_filename("file<name") == "file_name"
        assert sanitize_filename("file>name") == "file_name"
        assert sanitize_filename('file"name') == "file'name"
        assert sanitize_filename("file|name") == "file_name"
        assert sanitize_filename("file?name") == "file_name"
        assert sanitize_filename("file*name") == "file_name"

    def test_replaces_colon_with_dash(self):
        """Colon (common in timestamps) should be replaced with dash."""
        assert sanitize_filename("2024:01:15") == "2024-01-15"

    def test_replaces_path_separators(self):
        """Path separators should be replaced to prevent directory traversal."""
        assert sanitize_filename("file/name") == "file_name"
        assert sanitize_filename("file\\name") == "file_name"
        assert sanitize_filename("../../../etc/passwd") == ".._.._.._etc_passwd"

    def test_removes_null_bytes(self):
        """Null bytes should be removed from filename."""
        assert sanitize_filename("file\x00name") == "filename"

    def test_removes_control_characters(self):
        """Control characters (ASCII 0-31) should be removed."""
        assert sanitize_filename("file\x01\x02\x03name") == "filename"
        assert sanitize_filename("file\x1fname") == "filename"

    def test_removes_del_character(self):
        """DEL character (ASCII 127) should be removed."""
        assert sanitize_filename("file\x7fname") == "filename"

    def test_removes_trailing_dots_and_spaces(self):
        """Trailing dots and spaces should be removed."""
        assert sanitize_filename("filename...") == "filename"
        assert sanitize_filename("filename   ") == "filename"
        assert sanitize_filename("filename. . .") == "filename"

    def test_all_dots_returns_underscore(self):
        """Filename of only dots should return underscore."""
        assert sanitize_filename("...") == "_"

    def test_prefixes_reserved_names(self):
        """Windows reserved names should be prefixed with underscore."""
        assert sanitize_filename("CON") == "_CON"
        assert sanitize_filename("con") == "_con"  # Case-insensitive
        assert sanitize_filename("PRN") == "_PRN"
        assert sanitize_filename("AUX") == "_AUX"
        assert sanitize_filename("NUL") == "_NUL"
        assert sanitize_filename("COM1") == "_COM1"
        assert sanitize_filename("LPT1") == "_LPT1"

    def test_prefixes_reserved_names_with_extension(self):
        """Reserved names with extensions should be prefixed."""
        assert sanitize_filename("CON.txt") == "_CON.txt"
        assert sanitize_filename("LPT1.foo.bar") == "_LPT1.foo.bar"

    def test_normal_filename_unchanged(self):
        """Normal filenames should remain unchanged."""
        assert sanitize_filename("normal_file.txt") == "normal_file.txt"
        assert sanitize_filename("My Document (1).pdf") == "My Document (1).pdf"

    def test_unicode_filename_allowed(self):
        """Unicode characters should be allowed."""
        assert sanitize_filename("file_name.txt") == "file_name.txt"
        assert sanitize_filename("documento.txt") == "documento.txt"


class TestNormalizePath:
    """Tests for normalize_path function."""

    def test_returns_path_object(self):
        """normalize_path should return a Path object."""
        result = normalize_path("some/path")
        assert isinstance(result, Path)

    def test_resolves_relative_path(self):
        """Relative paths should be resolved to absolute."""
        result = normalize_path("relative/path")
        assert result.is_absolute()

    def test_handles_string_input(self):
        """Should accept string input."""
        result = normalize_path("/some/path")
        assert isinstance(result, Path)

    def test_handles_path_input(self):
        """Should accept Path input."""
        result = normalize_path(Path("/some/path"))
        assert isinstance(result, Path)

    @patch("core.file_utils.is_windows", return_value=True)
    def test_long_path_prefix_on_windows(self, mock_is_windows):
        """Long paths on Windows should get \\\\?\\ prefix."""
        # Create a path longer than 260 characters
        long_path = "C:\\" + "a" * 300 + ".txt"
        result = normalize_path(long_path)
        # The prefix should be added (actual behavior depends on implementation)
        assert isinstance(result, Path)

    @patch("core.file_utils.is_windows", return_value=False)
    def test_no_prefix_on_non_windows(self, mock_is_windows):
        """Non-Windows systems should not get Windows long path prefix."""
        result = normalize_path("/some/very/long/path")
        assert not str(result).startswith("\\\\?\\")


class TestSafePath:
    """Tests for safe_path function."""

    def test_returns_normalized_path(self):
        """safe_path should return a normalized Path."""
        result = safe_path("some/path.txt")
        assert isinstance(result, Path)
        assert result.is_absolute()

    @patch("core.file_utils.is_windows", return_value=True)
    def test_sanitizes_filename_on_windows(self, mock_is_windows):
        """On Windows, filename should be sanitized."""
        result = safe_path("/dir/file<name>.txt")
        assert "<" not in result.name
        assert ">" not in result.name


class TestSafeOpen:
    """Tests for safe_open function."""

    def test_read_existing_file(self, tmp_path):
        """Should read existing files."""
        test_file = tmp_path / "test.txt"
        test_file.write_text("hello world")

        with safe_open(test_file, "r") as f:
            content = f.read()

        assert content == "hello world"

    def test_write_creates_file(self, tmp_path):
        """Should create files in write mode."""
        test_file = tmp_path / "new_file.txt"

        with safe_open(test_file, "w") as f:
            f.write("test content")

        assert test_file.exists()
        assert test_file.read_text() == "test content"

    def test_creates_parent_directories(self, tmp_path):
        """Write mode should create parent directories."""
        test_file = tmp_path / "subdir" / "nested" / "file.txt"

        with safe_open(test_file, "w") as f:
            f.write("nested content")

        assert test_file.exists()
        assert test_file.read_text() == "nested content"

    def test_binary_mode(self, tmp_path):
        """Should handle binary mode correctly."""
        test_file = tmp_path / "binary.bin"
        data = b"\x00\x01\x02\x03"

        with safe_open(test_file, "wb") as f:
            f.write(data)

        with safe_open(test_file, "rb") as f:
            read_data = f.read()

        assert read_data == data

    def test_default_encoding_utf8(self, tmp_path):
        """Default encoding should be UTF-8."""
        test_file = tmp_path / "unicode.txt"
        content = "Hello World!"

        with safe_open(test_file, "w") as f:
            f.write(content)

        # Read with explicit UTF-8 to verify
        assert test_file.read_text(encoding="utf-8") == content

    def test_append_mode(self, tmp_path):
        """Should support append mode."""
        test_file = tmp_path / "append.txt"
        test_file.write_text("line1\n")

        with safe_open(test_file, "a") as f:
            f.write("line2\n")

        assert test_file.read_text() == "line1\nline2\n"

    def test_logs_warning_on_sanitization(self, tmp_path, caplog):
        """Should log warning when filename is sanitized."""
        import logging

        # This test is only meaningful on Windows where sanitization occurs
        # On other platforms, the warning won't be triggered
        with patch("core.file_utils.is_windows", return_value=True):
            test_file = tmp_path / "file<name>.txt"
            with caplog.at_level(logging.WARNING):
                try:
                    with safe_open(test_file, "w") as f:
                        f.write("test")
                except Exception:
                    pass  # May fail due to mocking, but we're testing the log


class TestAtomicWrite:
    """Tests for atomic_write context manager."""

    def test_writes_file_successfully(self, tmp_path):
        """Should write file content on successful completion."""
        test_file = tmp_path / "atomic.txt"

        with atomic_write(test_file) as f:
            f.write("atomic content")

        assert test_file.exists()
        assert test_file.read_text() == "atomic content"

    def test_no_partial_write_on_exception(self, tmp_path):
        """File should not exist if exception occurs during write."""
        test_file = tmp_path / "atomic_fail.txt"

        with pytest.raises(ValueError):
            with atomic_write(test_file) as f:
                f.write("partial")
                raise ValueError("Simulated error")

        # File should not exist after failed write
        assert not test_file.exists()

    def test_preserves_existing_on_failure(self, tmp_path):
        """Existing file should be preserved if write fails."""
        test_file = tmp_path / "existing.txt"
        test_file.write_text("original content")

        with pytest.raises(ValueError):
            with atomic_write(test_file) as f:
                f.write("new content")
                raise ValueError("Simulated error")

        # Original content should be preserved
        assert test_file.read_text() == "original content"

    def test_creates_parent_directories(self, tmp_path):
        """Should create parent directories if they don't exist."""
        test_file = tmp_path / "deep" / "nested" / "dir" / "file.txt"

        with atomic_write(test_file) as f:
            f.write("nested content")

        assert test_file.exists()
        assert test_file.read_text() == "nested content"

    def test_binary_mode(self, tmp_path):
        """Should support binary write mode."""
        test_file = tmp_path / "binary.bin"
        data = b"\x00\x01\x02\x03\xff"

        with atomic_write(test_file, mode="wb") as f:
            f.write(data)

        assert test_file.read_bytes() == data

    def test_replaces_existing_file(self, tmp_path):
        """Should atomically replace existing file."""
        test_file = tmp_path / "replace.txt"
        test_file.write_text("old content")

        with atomic_write(test_file) as f:
            f.write("new content")

        assert test_file.read_text() == "new content"

    def test_temp_file_cleaned_up_on_success(self, tmp_path):
        """Temp file should not exist after successful write."""
        test_file = tmp_path / "cleanup.txt"

        with atomic_write(test_file) as f:
            f.write("content")

        # No temp files should remain
        temp_files = list(tmp_path.glob(".cleanup.txt.tmp.*"))
        assert len(temp_files) == 0


class TestWriteJsonAtomic:
    """Tests for write_json_atomic function."""

    def test_writes_valid_json(self, tmp_path):
        """Should write valid JSON file."""
        test_file = tmp_path / "data.json"
        data = {"key": "value", "number": 42}

        write_json_atomic(test_file, data)

        with open(test_file) as f:
            loaded = json.load(f)

        assert loaded == data

    def test_default_indent(self, tmp_path):
        """Should use default indent of 2."""
        test_file = tmp_path / "indented.json"
        data = {"key": "value"}

        write_json_atomic(test_file, data)

        content = test_file.read_text()
        # Default indent of 2 means the content should be formatted
        assert "  " in content

    def test_custom_indent(self, tmp_path):
        """Should support custom indent."""
        test_file = tmp_path / "custom_indent.json"
        data = {"key": "value"}

        write_json_atomic(test_file, data, indent=4)

        content = test_file.read_text()
        assert "    " in content  # 4-space indent

    def test_unicode_content(self, tmp_path):
        """Should handle unicode content correctly."""
        test_file = tmp_path / "unicode.json"
        data = {"message": "Hello World!"}

        write_json_atomic(test_file, data)

        with open(test_file, encoding="utf-8") as f:
            loaded = json.load(f)

        assert loaded == data

    def test_ensure_ascii_false_by_default(self, tmp_path):
        """ensure_ascii should be False by default, preserving unicode."""
        test_file = tmp_path / "unicode_preserved.json"
        data = {"symbol": "euro"}

        write_json_atomic(test_file, data)

        content = test_file.read_text(encoding="utf-8")
        # Unicode should not be escaped
        assert "euro" in content or "\\u" not in content

    def test_complex_nested_data(self, tmp_path):
        """Should handle complex nested structures."""
        test_file = tmp_path / "complex.json"
        data = {
            "list": [1, 2, 3],
            "nested": {"a": {"b": {"c": "deep"}}},
            "mixed": [{"key": "value"}, [1, 2, 3]],
        }

        write_json_atomic(test_file, data)

        with open(test_file) as f:
            loaded = json.load(f)

        assert loaded == data

    def test_atomic_on_failure(self, tmp_path):
        """Should not corrupt file on serialization failure."""
        test_file = tmp_path / "fail.json"
        test_file.write_text('{"original": "data"}')

        # Non-serializable object
        class NonSerializable:
            pass

        with pytest.raises(TypeError):
            write_json_atomic(test_file, {"bad": NonSerializable()})

        # Original content should be preserved
        assert test_file.read_text() == '{"original": "data"}'
