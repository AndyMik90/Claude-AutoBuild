"""
Data models for the implementation planner.
"""

from dataclasses import dataclass

from implementation_plan import WorkflowType


@dataclass
class PlannerContext:
    """Context gathered for planning."""

    spec_content: str
    project_index: dict
    task_context: dict
    services_involved: list[str]
    workflow_type: WorkflowType
    files_to_modify: list[dict]
    files_to_reference: list[dict]
