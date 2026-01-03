"""
Tests for UI Formatters
========================

Tests for ui/formatters.py - formatting output functions.
"""

import sys
from io import StringIO
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))


class TestPrintHeader:
    """Tests for print_header function."""

    def test_print_header_basic(self):
        """Prints header with just title."""
        from ui.formatters import print_header

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_header("Test Title")
        output = captured.getvalue()
        assert "Test Title" in output

    def test_print_header_with_subtitle(self):
        """Prints header with title and subtitle."""
        from ui.formatters import print_header

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_header("Title", subtitle="Subtitle")
        output = captured.getvalue()
        assert "Title" in output

    def test_print_header_custom_width(self):
        """Prints header with custom width."""
        from ui.formatters import print_header

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_header("Test", width=50)
        output = captured.getvalue()
        assert len(output) > 0


class TestPrintSection:
    """Tests for print_section function."""

    def test_print_section_basic(self):
        """Prints section with title."""
        from ui.formatters import print_section

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_section("Section Title")
        output = captured.getvalue()
        assert "Section Title" in output

    def test_print_section_custom_width(self):
        """Prints section with custom width."""
        from ui.formatters import print_section

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_section("Test", width=40)
        output = captured.getvalue()
        assert len(output) > 0


class TestPrintStatus:
    """Tests for print_status function."""

    def test_print_status_info(self):
        """Prints info status message."""
        from ui.formatters import print_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_status("Info message", status="info")
        output = captured.getvalue()
        assert "Info message" in output

    def test_print_status_success(self):
        """Prints success status message."""
        from ui.formatters import print_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_status("Success!", status="success")
        output = captured.getvalue()
        assert "Success!" in output

    def test_print_status_error(self):
        """Prints error status message."""
        from ui.formatters import print_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_status("Error occurred", status="error")
        output = captured.getvalue()
        assert "Error occurred" in output

    def test_print_status_warning(self):
        """Prints warning status message."""
        from ui.formatters import print_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_status("Warning!", status="warning")
        output = captured.getvalue()
        assert "Warning!" in output

    def test_print_status_pending(self):
        """Prints pending status message."""
        from ui.formatters import print_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_status("Waiting...", status="pending")
        output = captured.getvalue()
        assert "Waiting..." in output

    def test_print_status_progress(self):
        """Prints progress status message."""
        from ui.formatters import print_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_status("In progress", status="progress")
        output = captured.getvalue()
        assert "In progress" in output


class TestPrintKeyValue:
    """Tests for print_key_value function."""

    def test_print_key_value_basic(self):
        """Prints key-value pair."""
        from ui.formatters import print_key_value

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_key_value("Name", "Value")
        output = captured.getvalue()
        assert "Name" in output
        assert "Value" in output

    def test_print_key_value_custom_indent(self):
        """Prints key-value with custom indent."""
        from ui.formatters import print_key_value

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_key_value("Key", "Val", indent=4)
        output = captured.getvalue()
        assert "Key" in output


class TestPrintPhaseStatus:
    """Tests for print_phase_status function."""

    def test_print_phase_complete(self):
        """Prints complete phase status."""
        from ui.formatters import print_phase_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_phase_status("Build", 5, 5, status="complete")
        output = captured.getvalue()
        assert "Build" in output
        assert "5/5" in output

    def test_print_phase_in_progress(self):
        """Prints in-progress phase status."""
        from ui.formatters import print_phase_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_phase_status("Testing", 3, 10, status="in_progress")
        output = captured.getvalue()
        assert "Testing" in output
        assert "3/10" in output

    def test_print_phase_pending(self):
        """Prints pending phase status."""
        from ui.formatters import print_phase_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_phase_status("Deploy", 0, 5, status="pending")
        output = captured.getvalue()
        assert "Deploy" in output
        assert "0/5" in output

    def test_print_phase_blocked(self):
        """Prints blocked phase status."""
        from ui.formatters import print_phase_status

        captured = StringIO()
        with patch("sys.stdout", captured):
            print_phase_status("Release", 0, 1, status="blocked")
        output = captured.getvalue()
        assert "Release" in output
