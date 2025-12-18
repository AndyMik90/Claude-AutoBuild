"""
Validation Models
=================

Data models for validation results and related structures.
"""

from dataclasses import dataclass


@dataclass
class ValidationResult:
    """Result of a validation check."""

    valid: bool
    checkpoint: str
    errors: list[str]
    warnings: list[str]
    fixes: list[str]  # Suggested fixes

    def __str__(self) -> str:
        """Format the validation result as a readable string.

        Returns:
            A formatted string representation of the validation result
        """
        lines = [f"Checkpoint: {self.checkpoint}"]
        lines.append(f"Status: {'PASS' if self.valid else 'FAIL'}")

        if self.errors:
            lines.append("\nErrors:")
            for err in self.errors:
                lines.append(f"  [X] {err}")

        if self.warnings:
            lines.append("\nWarnings:")
            for warn in self.warnings:
                lines.append(f"  [!] {warn}")

        if self.fixes and not self.valid:
            lines.append("\nSuggested Fixes:")
            for fix in self.fixes:
                lines.append(f"  -> {fix}")

        return "\n".join(lines)
