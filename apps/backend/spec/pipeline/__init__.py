"""
Pipeline Module
================

Refactored spec creation pipeline with modular components.

Components:
- models: Data structures and utility functions
- agent_runner: Agent execution logic
- orchestrator: Main SpecOrchestrator class
"""

from init import init_auto_claude_dir

from .models import (
    cleanup_incomplete_pending_folders,
    find_existing_spec_for_task,
    get_specs_dir,
    prompt_for_existing_spec_action,
)
from .orchestrator import SpecOrchestrator

__all__ = [
    "SpecOrchestrator",
    "get_specs_dir",
    "init_auto_claude_dir",
    "find_existing_spec_for_task",
    "prompt_for_existing_spec_action",
    "cleanup_incomplete_pending_folders",
]
