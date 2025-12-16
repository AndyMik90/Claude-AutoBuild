"""Backward compatibility shim - import from analysis.test_discovery instead."""
from analysis.test_discovery import (
    TestFramework,
    TestDiscoveryResult,
    TestDiscovery,
    discover_tests,
    get_test_command,
    get_test_frameworks,
    FRAMEWORK_PATTERNS,
)

__all__ = [
    "TestFramework",
    "TestDiscoveryResult",
    "TestDiscovery",
    "discover_tests",
    "get_test_command",
    "get_test_frameworks",
    "FRAMEWORK_PATTERNS",
]
