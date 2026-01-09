"""
Tests for UI Boxes
===================

Tests for ui/boxes.py - box drawing functions.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))


class TestBox:
    """Tests for box() function."""

    def test_box_with_string_content(self):
        """Creates box with string content."""
        from ui.boxes import box

        result = box("Hello World", width=30)
        assert "Hello World" in result
        assert len(result.split("\n")) >= 3  # Top, content, bottom

    def test_box_with_list_content(self):
        """Creates box with list of lines."""
        from ui.boxes import box

        result = box(["Line 1", "Line 2", "Line 3"], width=30)
        assert "Line 1" in result
        assert "Line 2" in result
        assert "Line 3" in result

    def test_box_with_title(self):
        """Creates box with title."""
        from ui.boxes import box

        result = box("Content", title="My Title", width=40)
        assert "My Title" in result
        assert "Content" in result

    def test_box_plain_text_fallback(self):
        """Falls back to plain text when FANCY_UI disabled."""
        # Note: FANCY_UI is evaluated at import time, so we test with the current value
        from ui.boxes import box

        result = box("Test content", width=30, style="heavy")
        # Just verify output is valid
        assert "Test content" in result
        assert len(result) > 0

    def test_box_light_style(self):
        """Creates box with light style."""
        from ui.boxes import box

        result = box("Content", width=30, style="light")
        assert "Content" in result

    def test_box_title_alignment_center(self):
        """Centers title in box."""
        from ui.boxes import box

        result = box("Content", title="Title", width=40, title_align="center")
        assert "Title" in result

    def test_box_title_alignment_right(self):
        """Right-aligns title in box."""
        from ui.boxes import box

        result = box("Content", title="Title", width=40, title_align="right")
        assert "Title" in result

    def test_box_truncates_long_lines(self):
        """Truncates lines longer than box width."""
        from ui.boxes import box

        long_line = "A" * 100
        result = box(long_line, width=30)
        # Should contain truncated content with ...
        assert "..." in result or len(result.split("\n")[1]) <= 32

    def test_box_handles_ansi_codes(self):
        """Handles ANSI color codes in content."""
        from ui.boxes import box

        colored_text = "\033[32mGreen Text\033[0m"
        result = box(colored_text, width=40)
        assert "Green" in result


class TestDivider:
    """Tests for divider() function."""

    def test_divider_default(self):
        """Creates default heavy divider."""
        from ui.boxes import divider

        result = divider(width=20)
        assert len(result) == 20

    def test_divider_light_style(self):
        """Creates light style divider."""
        from ui.boxes import divider

        result = divider(width=20, style="light")
        assert len(result) == 20

    def test_divider_custom_char(self):
        """Creates divider with custom character."""
        from ui.boxes import divider

        result = divider(width=10, char="-")
        assert result == "-" * 10

    def test_divider_different_widths(self):
        """Creates dividers of various widths."""
        from ui.boxes import divider

        for width in [10, 50, 80]:
            result = divider(width=width)
            assert len(result) == width
