"""
I/O Utilities for GitHub Services
=================================

This module re-exports safe I/O utilities from core.io_utils for
backwards compatibility. New code should import directly from core.io_utils.
"""

from __future__ import annotations

# Re-export from core for backwards compatibility
from core.io_utils import is_pipe_broken, reset_pipe_state, safe_print

__all__ = ["safe_print", "is_pipe_broken", "reset_pipe_state"]
