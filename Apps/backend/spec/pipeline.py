"""
Spec Creation Pipeline Orchestrator
====================================

Main orchestration logic for spec creation with dynamic complexity adaptation.

This module has been refactored into smaller components:
- pipeline/models.py: Data structures and utility functions
- pipeline/agent_runner.py: Agent execution logic
- pipeline/orchestrator.py: Main SpecOrchestrator class

For backward compatibility, this module re-exports the main classes and functions.
"""

# Re-export main classes and functions for backward compatibility
from .pipeline import SpecOrchestrator, get_specs_dir

__all__ = [
    "SpecOrchestrator",
    "get_specs_dir",
]
