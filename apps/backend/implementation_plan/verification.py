#!/usr/bin/env python3
"""
Verification Models
===================

Defines how to verify that a subtask is complete.
"""

from dataclasses import dataclass

from .enums import VerificationType


@dataclass
class Verification:
    """How to verify a subtask is complete."""

    type: VerificationType
    run: str | None = None  # Command to run
    url: str | None = None  # URL for API/browser tests
    method: str | None = None  # HTTP method for API tests
    expect_status: int | None = None  # Expected HTTP status
    expect_contains: str | None = None  # Expected content
    scenario: str | None = None  # Description for browser/manual tests

    def to_dict(self) -> dict:
        """Convert to dictionary representation."""
        result = {"type": self.type.value}
        for key in [
            "run",
            "url",
            "method",
            "expect_status",
            "expect_contains",
            "scenario",
        ]:
            val = getattr(self, key)
            if val is not None:
                result[key] = val
        return result

    @classmethod
    def from_dict(cls, data: dict) -> "Verification":
        """Create Verification from dictionary."""
        return cls(
            type=VerificationType(data.get("type", "none")),
            run=data.get("run"),
            url=data.get("url"),
            method=data.get("method"),
            expect_status=data.get("expect_status"),
            expect_contains=data.get("expect_contains"),
            scenario=data.get("scenario"),
        )
