"""
Conflict Detector
=================

Detects conflicts between multiple task changes using rule-based analysis.

This module determines:
1. Which changes from different tasks overlap
2. Whether overlapping changes are compatible
3. What merge strategy can be used for compatible changes
4. Which conflicts need AI or human intervention

The goal is to resolve as many conflicts as possible without AI,
using deterministic rules based on semantic change types.

This is the main entry point that coordinates the conflict detection system.
The actual logic is organized into specialized modules:
- compatibility_rules: Rule definitions and indexing
- conflict_analysis: Core conflict detection algorithms
- conflict_explanation: Human-readable explanations
"""

from __future__ import annotations

import logging

from .compatibility_rules import (
    CompatibilityRule,
    build_default_rules,
    index_rules,
)
from .conflict_analysis import (
    detect_conflicts,
)
from .conflict_explanation import (
    explain_conflict,
    get_compatible_pairs,
)
from .types import (
    ChangeType,
    ConflictRegion,
    FileAnalysis,
    MergeStrategy,
    SemanticChange,
)

# Import debug utilities
try:
    from debug import debug, debug_success
except ImportError:

    def debug(*args, **kwargs):
        pass

    def debug_success(*args, **kwargs):
        pass


logger = logging.getLogger(__name__)
MODULE = "merge.conflict_detector"


class ConflictDetector:
    """
    Detects and classifies conflicts between task changes.

    Uses a comprehensive rule base to determine compatibility
    between different semantic change types, enabling maximum
    auto-merge capability.

    Example:
        detector = ConflictDetector()
        conflicts = detector.detect_conflicts({
            "task-001": analysis1,
            "task-002": analysis2,
        })
        for conflict in conflicts:
            if conflict.can_auto_merge:
                print(f"Can auto-merge with {conflict.merge_strategy}")
            else:
                print(f"Needs {conflict.severity} review")
    """

    def __init__(self):
        """Initialize with default compatibility rules."""
        debug(MODULE, "Initializing ConflictDetector")
        self._rules = build_default_rules()
        self._rule_index = index_rules(self._rules)
        debug_success(
            MODULE, "ConflictDetector initialized", rule_count=len(self._rules)
        )

    def add_rule(self, rule: CompatibilityRule) -> None:
        """
        Add a custom compatibility rule.

        Args:
            rule: The compatibility rule to add
        """
        self._rules.append(rule)
        self._rule_index[(rule.change_type_a, rule.change_type_b)] = rule
        if rule.bidirectional and rule.change_type_a != rule.change_type_b:
            self._rule_index[(rule.change_type_b, rule.change_type_a)] = rule

    def detect_conflicts(
        self,
        task_analyses: dict[str, FileAnalysis],
    ) -> list[ConflictRegion]:
        """
        Detect conflicts between multiple task changes to the same file.

        Args:
            task_analyses: Map of task_id -> FileAnalysis

        Returns:
            List of detected conflict regions
        """
        conflicts = detect_conflicts(task_analyses, self._rule_index)

        # Summary logging
        auto_mergeable = sum(1 for c in conflicts if c.can_auto_merge)
        from .types import ConflictSeverity

        critical = sum(1 for c in conflicts if c.severity == ConflictSeverity.CRITICAL)
        debug_success(
            MODULE,
            "Conflict detection complete",
            total_conflicts=len(conflicts),
            auto_mergeable=auto_mergeable,
            critical=critical,
        )

        return conflicts

    def get_compatible_pairs(
        self,
    ) -> list[tuple[ChangeType, ChangeType, MergeStrategy]]:
        """
        Get all compatible change type pairs and their strategies.

        Returns:
            List of (change_type_a, change_type_b, strategy) tuples
        """
        return get_compatible_pairs(self._rules)

    def explain_conflict(self, conflict: ConflictRegion) -> str:
        """
        Generate a human-readable explanation of a conflict.

        Args:
            conflict: The conflict region to explain

        Returns:
            Multi-line string explaining the conflict
        """
        return explain_conflict(conflict)


# Convenience function for backward compatibility and quick checks
def analyze_compatibility(
    change_a: SemanticChange,
    change_b: SemanticChange,
    detector: ConflictDetector | None = None,
) -> tuple[bool, MergeStrategy | None, str]:
    """
    Analyze compatibility between two specific changes.

    Convenience function for quick compatibility checks.

    Args:
        change_a: First semantic change
        change_b: Second semantic change
        detector: Optional detector instance (creates one if not provided)

    Returns:
        Tuple of (compatible, strategy, reason)
    """
    if detector is None:
        detector = ConflictDetector()

    from .conflict_analysis import analyze_compatibility as analyze_compat_internal

    return analyze_compat_internal(change_a, change_b, detector._rule_index)
