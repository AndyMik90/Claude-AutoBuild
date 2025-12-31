"""
Intelligent Task Delegation System
===================================

A meta-coordinator that analyzes tasks and routes them to specialist agents
using predefined workflow patterns.
"""

from delegation.models import (
    DelegationContext,
    DelegationStatus,
    StepResult,
    generate_delegation_name,
)

__all__ = [
    "DelegationContext",
    "DelegationStatus",
    "StepResult",
    "generate_delegation_name",
]
