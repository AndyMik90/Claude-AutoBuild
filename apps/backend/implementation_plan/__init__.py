#!/usr/bin/env python3
"""
Implementation Plan Package
============================

Core data structures and utilities for subtask-based implementation plans.
Replaces the test-centric feature_list.json with implementation_plan.json.

The key insight: Tests verify outcomes, but SUBTASKS define implementation steps.
For complex multi-service features, implementation order matters.

Workflow Types:
- feature: Standard multi-service feature (phases = services)
- refactor: Migration/refactor work (phases = stages: add, migrate, remove)
- investigation: Bug hunting (phases = investigate, hypothesize, fix)
- migration: Data migration (phases = prepare, test, execute, cleanup)
- simple: Single-service enhancement (minimal overhead)

Package Structure:
- enums.py: All enumeration types (WorkflowType, PhaseType, etc.)
- verification.py: Verification models for testing subtasks
- subtask.py: Subtask model representing a unit of work
- phase.py: Phase model grouping subtasks with dependencies
- plan.py: ImplementationPlan model for complete feature plans
- factories.py: Factory functions for creating different plan types
"""

# Export all public types and functions for backwards compatibility
from .enums import (
    ChunkStatus,  # Backwards compatibility
    PhaseType,
    SubtaskStatus,
    VerificationType,
    WorkflowType,
)
from .factories import (
    create_feature_plan,
    create_investigation_plan,
    create_refactor_plan,
)
from .phase import Phase
from .plan import ImplementationPlan
from .subtask import Chunk, Subtask  # Chunk is backwards compatibility alias
from .verification import Verification

__all__ = [
    # Enums
    "WorkflowType",
    "PhaseType",
    "SubtaskStatus",
    "VerificationType",
    # Models
    "Verification",
    "Subtask",
    "Phase",
    "ImplementationPlan",
    # Factories
    "create_feature_plan",
    "create_investigation_plan",
    "create_refactor_plan",
    # Backwards compatibility
    "Chunk",
    "ChunkStatus",
]
