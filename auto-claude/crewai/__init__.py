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
"""

from .config import (
    get_agent_model,
    get_crewai_config,
    is_crewai_enabled,
)

__all__ = [
    "get_agent_model",
    "get_crewai_config",
    "is_crewai_enabled",
]
