"""
Tests for Validation Models
============================

Tests for spec/validate_pkg/models.py - ValidationResult string formatting.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from spec.validate_pkg.models import ValidationResult


class TestValidationResultStr:
    """Tests for ValidationResult.__str__ method."""

    def test_str_shows_checkpoint(self):
        """Checkpoint name appears in string output."""
        result = ValidationResult(
            valid=True, checkpoint="test_checkpoint", errors=[], warnings=[], fixes=[]
        )
        assert "test_checkpoint" in str(result)

    def test_str_shows_pass_when_valid(self):
        """PASS status shown for valid results."""
        result = ValidationResult(
            valid=True, checkpoint="test", errors=[], warnings=[], fixes=[]
        )
        assert "PASS" in str(result)

    def test_str_shows_fail_when_invalid(self):
        """FAIL status shown for invalid results."""
        result = ValidationResult(
            valid=False, checkpoint="test", errors=["An error"], warnings=[], fixes=[]
        )
        assert "FAIL" in str(result)

    def test_str_shows_errors(self):
        """Errors are displayed in output."""
        result = ValidationResult(
            valid=False,
            checkpoint="test",
            errors=["Error one", "Error two"],
            warnings=[],
            fixes=[],
        )
        output = str(result)
        assert "Error one" in output
        assert "Error two" in output
        assert "Errors:" in output

    def test_str_shows_warnings(self):
        """Warnings are displayed in output."""
        result = ValidationResult(
            valid=True,
            checkpoint="test",
            errors=[],
            warnings=["Warning one", "Warning two"],
            fixes=[],
        )
        output = str(result)
        assert "Warning one" in output
        assert "Warning two" in output
        assert "Warnings:" in output

    def test_str_shows_fixes_when_invalid(self):
        """Fixes shown only when result is invalid."""
        result = ValidationResult(
            valid=False,
            checkpoint="test",
            errors=["Some error"],
            warnings=[],
            fixes=["Fix suggestion one", "Fix suggestion two"],
        )
        output = str(result)
        assert "Fix suggestion one" in output
        assert "Fix suggestion two" in output
        assert "Suggested Fixes:" in output

    def test_str_hides_fixes_when_valid(self):
        """Fixes not shown when result is valid."""
        result = ValidationResult(
            valid=True,
            checkpoint="test",
            errors=[],
            warnings=[],
            fixes=["This should not appear"],
        )
        output = str(result)
        assert "This should not appear" not in output
        assert "Suggested Fixes:" not in output

    def test_str_empty_lists(self):
        """Empty lists produce clean output without section headers."""
        result = ValidationResult(
            valid=True, checkpoint="test", errors=[], warnings=[], fixes=[]
        )
        output = str(result)
        assert "Errors:" not in output
        assert "Warnings:" not in output
        assert "Suggested Fixes:" not in output
