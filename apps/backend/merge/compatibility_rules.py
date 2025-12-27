"""
Compatibility Rules
===================

Defines rules for determining compatibility between different semantic change types.

This module contains:
- CompatibilityRule dataclass
- Default compatibility rule definitions
- Rule indexing for fast lookup
"""

from __future__ import annotations

from dataclasses import dataclass

from .types import ChangeType, MergeStrategy


@dataclass
class CompatibilityRule:
    """
    A rule defining compatibility between two change types.

    Attributes:
        change_type_a: First change type
        change_type_b: Second change type (can be same as a)
        compatible: Whether these changes can be auto-merged
        strategy: If compatible, which strategy to use
        reason: Human-readable explanation
        bidirectional: If True, rule applies both ways (a,b) and (b,a)
    """

    change_type_a: ChangeType
    change_type_b: ChangeType
    compatible: bool
    strategy: MergeStrategy | None = None
    reason: str = ""
    bidirectional: bool = True


def build_default_rules() -> list[CompatibilityRule]:
    """Build the default set of compatibility rules."""
    rules = []

    # ========================================
    # IMPORT RULES - Generally compatible
    # ========================================

    # Multiple imports from different modules = always compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_IMPORT,
            change_type_b=ChangeType.ADD_IMPORT,
            compatible=True,
            strategy=MergeStrategy.COMBINE_IMPORTS,
            reason="Adding different imports is always compatible",
        )
    )

    # Import addition + removal = check if same module
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_IMPORT,
            change_type_b=ChangeType.REMOVE_IMPORT,
            compatible=False,  # Need to check if same import
            strategy=MergeStrategy.AI_REQUIRED,
            reason="Import add/remove may conflict if same module",
        )
    )

    # ========================================
    # FUNCTION RULES
    # ========================================

    # Adding different functions = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_FUNCTION,
            change_type_b=ChangeType.ADD_FUNCTION,
            compatible=True,
            strategy=MergeStrategy.APPEND_FUNCTIONS,
            reason="Adding different functions is compatible",
        )
    )

    # Adding function + modifying different function = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_FUNCTION,
            change_type_b=ChangeType.MODIFY_FUNCTION,
            compatible=True,
            strategy=MergeStrategy.APPEND_FUNCTIONS,
            reason="Adding a function doesn't affect modifications to other functions",
        )
    )

    # Modifying same function = conflict (but may be resolvable)
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.MODIFY_FUNCTION,
            change_type_b=ChangeType.MODIFY_FUNCTION,
            compatible=False,
            strategy=MergeStrategy.AI_REQUIRED,
            reason="Multiple modifications to same function need analysis",
        )
    )

    # ========================================
    # REACT HOOK RULES
    # ========================================

    # Multiple hook additions = compatible (order matters, but predictable)
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_HOOK_CALL,
            change_type_b=ChangeType.ADD_HOOK_CALL,
            compatible=True,
            strategy=MergeStrategy.ORDER_BY_DEPENDENCY,
            reason="Multiple hooks can be added with correct ordering",
        )
    )

    # Hook addition + JSX wrap = compatible (hooks first, then wrap)
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_HOOK_CALL,
            change_type_b=ChangeType.WRAP_JSX,
            compatible=True,
            strategy=MergeStrategy.HOOKS_THEN_WRAP,
            reason="Hooks are added at function start, wrap is on return",
        )
    )

    # Hook addition + function modification = usually compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_HOOK_CALL,
            change_type_b=ChangeType.MODIFY_FUNCTION,
            compatible=True,
            strategy=MergeStrategy.HOOKS_FIRST,
            reason="Hooks go at start, other modifications likely elsewhere",
        )
    )

    # ========================================
    # JSX RULES
    # ========================================

    # Multiple JSX wraps = need to determine order
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.WRAP_JSX,
            change_type_b=ChangeType.WRAP_JSX,
            compatible=True,
            strategy=MergeStrategy.ORDER_BY_DEPENDENCY,
            reason="Multiple wraps can be nested in correct order",
        )
    )

    # JSX wrap + element addition = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.WRAP_JSX,
            change_type_b=ChangeType.ADD_JSX_ELEMENT,
            compatible=True,
            strategy=MergeStrategy.APPEND_STATEMENTS,
            reason="Wrapping and adding elements are independent",
        )
    )

    # Prop modifications = may conflict
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.MODIFY_JSX_PROPS,
            change_type_b=ChangeType.MODIFY_JSX_PROPS,
            compatible=True,
            strategy=MergeStrategy.COMBINE_PROPS,
            reason="Props can usually be combined if different",
        )
    )

    # ========================================
    # CLASS/METHOD RULES
    # ========================================

    # Adding methods to same class = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_METHOD,
            change_type_b=ChangeType.ADD_METHOD,
            compatible=True,
            strategy=MergeStrategy.APPEND_METHODS,
            reason="Adding different methods is compatible",
        )
    )

    # Modifying same method = conflict
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.MODIFY_METHOD,
            change_type_b=ChangeType.MODIFY_METHOD,
            compatible=False,
            strategy=MergeStrategy.AI_REQUIRED,
            reason="Multiple modifications to same method need analysis",
        )
    )

    # Adding class + modifying existing class = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_CLASS,
            change_type_b=ChangeType.MODIFY_CLASS,
            compatible=True,
            strategy=MergeStrategy.APPEND_FUNCTIONS,
            reason="New classes don't conflict with modifications",
        )
    )

    # ========================================
    # VARIABLE RULES
    # ========================================

    # Adding different variables = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_VARIABLE,
            change_type_b=ChangeType.ADD_VARIABLE,
            compatible=True,
            strategy=MergeStrategy.APPEND_STATEMENTS,
            reason="Adding different variables is compatible",
        )
    )

    # Adding constant + variable = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_CONSTANT,
            change_type_b=ChangeType.ADD_VARIABLE,
            compatible=True,
            strategy=MergeStrategy.APPEND_STATEMENTS,
            reason="Constants and variables are independent",
        )
    )

    # ========================================
    # TYPE RULES (TypeScript)
    # ========================================

    # Adding different types = compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_TYPE,
            change_type_b=ChangeType.ADD_TYPE,
            compatible=True,
            strategy=MergeStrategy.APPEND_FUNCTIONS,
            reason="Adding different types is compatible",
        )
    )

    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_INTERFACE,
            change_type_b=ChangeType.ADD_INTERFACE,
            compatible=True,
            strategy=MergeStrategy.APPEND_FUNCTIONS,
            reason="Adding different interfaces is compatible",
        )
    )

    # Modifying same interface = conflict
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.MODIFY_INTERFACE,
            change_type_b=ChangeType.MODIFY_INTERFACE,
            compatible=False,
            strategy=MergeStrategy.AI_REQUIRED,
            reason="Multiple interface modifications need analysis",
        )
    )

    # ========================================
    # DECORATOR RULES (Python)
    # ========================================

    # Adding decorators = usually compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_DECORATOR,
            change_type_b=ChangeType.ADD_DECORATOR,
            compatible=True,
            strategy=MergeStrategy.ORDER_BY_DEPENDENCY,
            reason="Decorators can be stacked with correct order",
        )
    )

    # ========================================
    # COMMENT RULES - Low priority
    # ========================================

    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.ADD_COMMENT,
            change_type_b=ChangeType.ADD_COMMENT,
            compatible=True,
            strategy=MergeStrategy.APPEND_STATEMENTS,
            reason="Comments are independent",
        )
    )

    # Formatting changes are always compatible
    rules.append(
        CompatibilityRule(
            change_type_a=ChangeType.FORMATTING_ONLY,
            change_type_b=ChangeType.FORMATTING_ONLY,
            compatible=True,
            strategy=MergeStrategy.ORDER_BY_TIME,
            reason="Formatting doesn't affect semantics",
        )
    )

    return rules


def index_rules(
    rules: list[CompatibilityRule],
) -> dict[tuple[ChangeType, ChangeType], CompatibilityRule]:
    """
    Create an index for fast rule lookup.

    Args:
        rules: List of compatibility rules

    Returns:
        Dictionary mapping (change_type_a, change_type_b) tuples to rules
    """
    index = {}
    for rule in rules:
        index[(rule.change_type_a, rule.change_type_b)] = rule
        if rule.bidirectional and rule.change_type_a != rule.change_type_b:
            index[(rule.change_type_b, rule.change_type_a)] = rule
    return index
