"""
Services Module
===============

Background services and orchestration for Auto Claude.
"""

from .context import ServiceContext
from .orchestrator import ServiceOrchestrator
from .recovery import RecoveryManager
from .convex_manager import ConvexManager, get_convex_manager

__all__ = [
    "ServiceContext",
    "ServiceOrchestrator",
    "RecoveryManager",
    "ConvexManager",
    "get_convex_manager",
]
