#!/usr/bin/env python3
"""
Plan Factory Functions
======================

Factory functions for creating different types of implementation plans:
feature plans, investigation plans, and refactor plans.
"""

from datetime import datetime

from .enums import PhaseType, WorkflowType
from .phase import Phase
from .plan import ImplementationPlan
from .subtask import Subtask, SubtaskStatus


def create_feature_plan(
    feature: str,
    services: list[str],
    phases_config: list[dict],
) -> ImplementationPlan:
    """
    Create a standard feature implementation plan.

    Args:
        feature: Name of the feature
        services: List of services involved
        phases_config: List of phase configurations

    Returns:
        ImplementationPlan ready for use
    """
    phases = []
    for i, config in enumerate(phases_config, 1):
        subtasks = [Subtask.from_dict(s) for s in config.get("subtasks", [])]
        phase = Phase(
            phase=i,
            name=config["name"],
            type=PhaseType(config.get("type", "implementation")),
            subtasks=subtasks,
            depends_on=config.get("depends_on", []),
            parallel_safe=config.get("parallel_safe", False),
        )
        phases.append(phase)

    return ImplementationPlan(
        feature=feature,
        workflow_type=WorkflowType.FEATURE,
        services_involved=services,
        phases=phases,
        created_at=datetime.now().isoformat(),
    )


def create_investigation_plan(
    bug_description: str,
    services: list[str],
) -> ImplementationPlan:
    """
    Create an investigation plan for debugging.

    This creates a structured approach:
    1. Reproduce & Instrument
    2. Investigate
    3. Fix (blocked until investigation complete)
    """
    phases = [
        Phase(
            phase=1,
            name="Reproduce & Instrument",
            type=PhaseType.INVESTIGATION,
            subtasks=[
                Subtask(
                    id="add-logging",
                    description="Add detailed logging around suspected areas",
                    expected_output="Logs capture relevant state and events",
                ),
                Subtask(
                    id="create-repro",
                    description="Create reliable reproduction steps",
                    expected_output="Can reproduce bug on demand",
                ),
            ],
        ),
        Phase(
            phase=2,
            name="Identify Root Cause",
            type=PhaseType.INVESTIGATION,
            depends_on=[1],
            subtasks=[
                Subtask(
                    id="analyze",
                    description="Analyze logs and behavior",
                    expected_output="Root cause hypothesis with evidence",
                ),
            ],
        ),
        Phase(
            phase=3,
            name="Implement Fix",
            type=PhaseType.IMPLEMENTATION,
            depends_on=[2],
            subtasks=[
                Subtask(
                    id="fix",
                    description="[TO BE DETERMINED FROM INVESTIGATION]",
                    status=SubtaskStatus.BLOCKED,
                ),
                Subtask(
                    id="regression-test",
                    description="Add regression test to prevent recurrence",
                    status=SubtaskStatus.BLOCKED,
                ),
            ],
        ),
    ]

    return ImplementationPlan(
        feature=f"Fix: {bug_description}",
        workflow_type=WorkflowType.INVESTIGATION,
        services_involved=services,
        phases=phases,
        created_at=datetime.now().isoformat(),
    )


def create_refactor_plan(
    refactor_description: str,
    services: list[str],
    stages: list[dict],
) -> ImplementationPlan:
    """
    Create a refactor plan with stage-based phases.

    Typical stages:
    1. Add new system alongside old
    2. Migrate consumers
    3. Remove old system
    4. Cleanup
    """
    phases = []
    for i, stage in enumerate(stages, 1):
        subtasks = [Subtask.from_dict(s) for s in stage.get("subtasks", [])]
        phase = Phase(
            phase=i,
            name=stage["name"],
            type=PhaseType(stage.get("type", "implementation")),
            subtasks=subtasks,
            depends_on=stage.get("depends_on", [i - 1] if i > 1 else []),
        )
        phases.append(phase)

    return ImplementationPlan(
        feature=refactor_description,
        workflow_type=WorkflowType.REFACTOR,
        services_involved=services,
        phases=phases,
        created_at=datetime.now().isoformat(),
    )
