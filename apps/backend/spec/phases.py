"""
Phase Execution Module
=======================

Individual phase implementations for spec creation pipeline.

This module has been refactored into a subpackage for better maintainability.
Import from this module for backward compatibility.
"""

# Re-export from the phases subpackage for backward compatibility
from .phases import MAX_RETRIES, PhaseExecutor, PhaseResult

__all__ = ["PhaseExecutor", "PhaseResult", "MAX_RETRIES"]
