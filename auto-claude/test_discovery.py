"""Backward compatibility shim - import from analysis.test_discovery instead."""

from analysis.test_discovery import (
    FRAMEWORK_PATTERNS,
    TestDiscovery,
    TestDiscoveryResult,
    TestFramework,
    discover_tests,
    get_test_command,
    get_test_frameworks,
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
