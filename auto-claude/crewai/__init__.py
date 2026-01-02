"""
CrewAI Integration for Auto-Claude.

This package provides CrewAI-based orchestration as a top-level layer
that delegates to Auto-Claude for technical execution.

Crews:
- ProductManagementCrew: Transforms user requests into actionable specs
- DevelopmentCrew: Executes technical implementation via Auto-Claude
- QAReleasesCrew: Validates implementations and manages releases

Flows:
- DevelopmentWorkflowFlow: Orchestrates the complete development lifecycle

Notifications:
- NotificationService: Multi-channel notification delivery
- EscalationManager: Human escalation management
"""

from .config import (
    get_agent_model,
    get_crewai_config,
    is_crewai_enabled,
)

from .crews import (
    create_product_management_crew,
    create_development_crew,
    create_qa_release_crew,
)

from .flows import (
    DevelopmentWorkflowFlow,
    WorkflowState,
    WorkflowStatus,
    TaskType,
    run_development_workflow,
)

from .notifications import (
    NotificationService,
    EscalationManager,
    NotificationType,
    NotificationPriority,
    EscalationReason,
)

__all__ = [
    # Config
    "get_agent_model",
    "get_crewai_config",
    "is_crewai_enabled",
    # Crews
    "create_product_management_crew",
    "create_development_crew",
    "create_qa_release_crew",
    # Flows
    "DevelopmentWorkflowFlow",
    "WorkflowState",
    "WorkflowStatus",
    "TaskType",
    "run_development_workflow",
    # Notifications
    "NotificationService",
    "EscalationManager",
    "NotificationType",
    "NotificationPriority",
    "EscalationReason",
]
