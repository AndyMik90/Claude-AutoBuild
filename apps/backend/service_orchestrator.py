"""Backward compatibility shim - import from services.orchestrator instead."""

from services.orchestrator import (
    OrchestrationResult,
    ServiceConfig,
    ServiceContext,
    ServiceOrchestrator,
    get_service_config,
    is_multi_service_project,
)

__all__ = [
    "ServiceConfig",
    "OrchestrationResult",
    "ServiceOrchestrator",
    "ServiceContext",
    "is_multi_service_project",
    "get_service_config",
]
