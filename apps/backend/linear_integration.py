"""
Linear integration module facade.

Provides Linear project management integration.
Re-exports from integrations.linear.integration for clean imports.
"""

from integrations.linear.integration import (
    LinearManager,
    get_linear_manager,
    is_linear_enabled,
    prepare_coder_linear_instructions,
    prepare_planner_linear_instructions,
)

__all__ = [
    "LinearManager",
    "get_linear_manager",
    "is_linear_enabled",
    "prepare_coder_linear_instructions",
    "prepare_planner_linear_instructions",
]
