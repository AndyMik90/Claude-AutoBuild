"""
Phase Models and Constants
===========================

Data structures and constants for phase execution.
"""

from dataclasses import dataclass


@dataclass
class PhaseResult:
    """Result of a phase execution."""

    phase: str
    success: bool
    output_files: list[str]
    errors: list[str]
    retries: int


# Maximum retry attempts for phase execution
MAX_RETRIES = 3
