"""Backward compatibility shim - import from services.orchestrator instead."""
from services.orchestrator import (
    ServiceConfig,
    OrchestrationResult,
    ServiceOrchestrator,
    ServiceContext,
    is_multi_service_project,
    get_service_config,
)

__all__ = [
    "ServiceConfig",
    "OrchestrationResult",
    "ServiceOrchestrator",
    "ServiceContext",
    "is_multi_service_project",
    "get_service_config",
]
