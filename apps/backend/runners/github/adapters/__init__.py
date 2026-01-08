"""
GitHub Frontend State Adapters
==============================

Adapters for mapping backend state to frontend formats.
"""

from .frontend_state import (
    FrontendStateAdapter,
    FrontendStatus,
    to_frontend_status,
    to_frontend_queue_item,
)

__all__ = [
    "FrontendStateAdapter",
    "FrontendStatus",
    "to_frontend_status",
    "to_frontend_queue_item",
]
