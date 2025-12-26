"""
MemoryGraph Integration Configuration
=====================================

Configuration for MemoryGraph MCP server integration.
"""

import os
from dataclasses import dataclass
from typing import Literal


@dataclass
class MemoryGraphConfig:
    """Configuration for MemoryGraph integration."""

    enabled: bool = False
    backend: str = "sqlite"
    project_scoped: bool = True

    @classmethod
    def from_env(cls) -> "MemoryGraphConfig":
        """Create config from environment variables."""
        enabled_str = os.environ.get("MEMORYGRAPH_ENABLED", "").lower()
        enabled = enabled_str in ("true", "1", "yes")

        backend = os.environ.get("MEMORYGRAPH_BACKEND", "sqlite")

        project_scoped_str = os.environ.get("MEMORYGRAPH_PROJECT_SCOPED", "true").lower()
        project_scoped = project_scoped_str in ("true", "1", "yes")

        return cls(
            enabled=enabled,
            backend=backend,
            project_scoped=project_scoped
        )


def is_memorygraph_enabled() -> bool:
    """
    Check if MemoryGraph integration is enabled.

    Returns True if MEMORYGRAPH_ENABLED is set to true/1/yes.
    """
    config = MemoryGraphConfig.from_env()
    return config.enabled


def get_memorygraph_config() -> dict:
    """
    Get MemoryGraph configuration.

    Returns:
        Dict with configuration values and sensible defaults.
    """
    config = MemoryGraphConfig.from_env()
    return {
        "enabled": config.enabled,
        "backend": config.backend,
        "project_scoped": config.project_scoped,
    }
