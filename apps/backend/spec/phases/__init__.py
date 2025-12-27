"""
Phase Execution Module
=======================

Individual phase implementations for spec creation pipeline.

This module is organized into several submodules for better maintainability:
- models: PhaseResult dataclass and constants
- discovery_phases: Project discovery and context gathering
- requirements_phases: Requirements, historical context, and research
- spec_phases: Spec writing and self-critique
- planning_phases: Implementation planning and validation
- utils: Helper utilities for phase execution
"""

from .executor import PhaseExecutor
from .models import MAX_RETRIES, PhaseResult

__all__ = ["PhaseExecutor", "PhaseResult", "MAX_RETRIES"]
