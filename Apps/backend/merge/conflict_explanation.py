"""
Conflict Explanation
====================

Utilities for generating human-readable explanations of conflicts.

This module provides functions to help users understand:
- What conflicts exist
- Why they cannot be auto-merged
- What strategy can be used to resolve them
"""

from __future__ import annotations

from .compatibility_rules import CompatibilityRule
from .types import ChangeType, ConflictRegion, MergeStrategy


def explain_conflict(conflict: ConflictRegion) -> str:
    """
    Generate a human-readable explanation of a conflict.

    Args:
        conflict: The conflict region to explain

    Returns:
        Multi-line string explaining the conflict
    """
    lines = [
        f"Conflict in {conflict.file_path} at {conflict.location}",
        f"Tasks involved: {', '.join(conflict.tasks_involved)}",
        f"Severity: {conflict.severity.value}",
        "",
    ]

    if conflict.can_auto_merge:
        lines.append(
            f"Can be auto-merged using strategy: {conflict.merge_strategy.value}"
        )
    else:
        lines.append("Cannot be auto-merged:")
        lines.append(f"  Reason: {conflict.reason}")

    lines.append("")
    lines.append("Changes:")
    for ct in conflict.change_types:
        lines.append(f"  - {ct.value}")

    return "\n".join(lines)


def get_compatible_pairs(
    rules: list[CompatibilityRule],
) -> list[tuple[ChangeType, ChangeType, MergeStrategy | None]]:
    """
    Get all compatible change type pairs and their strategies.

    Args:
        rules: List of compatibility rules

    Returns:
        List of (change_type_a, change_type_b, strategy) tuples for compatible pairs
    """
    pairs = []
    for rule in rules:
        if rule.compatible:
            pairs.append((rule.change_type_a, rule.change_type_b, rule.strategy))
    return pairs


def format_compatibility_summary(rules: list[CompatibilityRule]) -> str:
    """
    Format a summary of all compatibility rules.

    Args:
        rules: List of compatibility rules

    Returns:
        Multi-line string summarizing all rules
    """
    lines = ["Compatibility Rules Summary", "=" * 50, ""]

    compatible_count = sum(1 for r in rules if r.compatible)
    incompatible_count = len(rules) - compatible_count

    lines.append(f"Total rules: {len(rules)}")
    lines.append(f"Compatible: {compatible_count}")
    lines.append(f"Incompatible: {incompatible_count}")
    lines.append("")

    # Group by compatibility
    lines.append("Compatible Pairs:")
    lines.append("-" * 50)
    for rule in rules:
        if rule.compatible:
            strategy = rule.strategy.value if rule.strategy else "N/A"
            lines.append(f"  {rule.change_type_a.value} + {rule.change_type_b.value}")
            lines.append(f"    Strategy: {strategy}")
            lines.append(f"    Reason: {rule.reason}")
            lines.append("")

    lines.append("Incompatible Pairs:")
    lines.append("-" * 50)
    for rule in rules:
        if not rule.compatible:
            lines.append(f"  {rule.change_type_a.value} + {rule.change_type_b.value}")
            lines.append(f"    Reason: {rule.reason}")
            lines.append("")

    return "\n".join(lines)
