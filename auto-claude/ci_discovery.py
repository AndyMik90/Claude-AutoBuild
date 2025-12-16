"""Backward compatibility shim - import from analysis.ci_discovery instead."""
from analysis.ci_discovery import (
    CIConfig,
    CIWorkflow,
    CIDiscovery,
    discover_ci,
    get_ci_test_commands,
    get_ci_system,
    HAS_YAML,
)

__all__ = [
    "CIConfig",
    "CIWorkflow",
    "CIDiscovery",
    "discover_ci",
    "get_ci_test_commands",
    "get_ci_system",
    "HAS_YAML",
]
