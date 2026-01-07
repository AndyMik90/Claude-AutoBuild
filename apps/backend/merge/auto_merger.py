"""
Auto Merger
===========

Deterministic merge strategies that don't require AI intervention.

This module implements the merge strategies identified by ConflictDetector
as auto-mergeable. Each strategy is a pure Python algorithm that combines
changes from multiple tasks in a predictable way.

Strategies:
- COMBINE_IMPORTS: Merge import statements from multiple tasks
- HOOKS_FIRST: Add hooks at function start, then other changes
- HOOKS_THEN_WRAP: Add hooks first, then wrap return in JSX
- APPEND_FUNCTIONS: Add new functions after existing ones
- APPEND_METHODS: Add new methods to class
- COMBINE_PROPS: Merge JSX/object props
- ORDER_BY_DEPENDENCY: Analyze dependencies and order appropriately
- ORDER_BY_TIME: Apply changes in chronological order

This file now serves as a backward-compatible entry point to the refactored
auto_merger module. The actual implementation has been split into:
- auto_merger/context.py - MergeContext dataclass
- auto_merger/helpers.py - Helper utilities
- auto_merger/strategies/ - Individual strategy implementations
- auto_merger/merger.py - Main AutoMerger coordinator
"""

from __future__ import annotations

# Re-export for backward compatibility
from .auto_merger import AutoMerger, MergeContext

__all__ = ["AutoMerger", "MergeContext"]
