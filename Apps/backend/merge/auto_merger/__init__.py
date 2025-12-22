"""
Auto Merger Module
==================

Modular auto-merger with strategy-based architecture.
"""

from .context import MergeContext
from .merger import AutoMerger

__all__ = ["AutoMerger", "MergeContext"]
