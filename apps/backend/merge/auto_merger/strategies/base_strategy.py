"""
Base Strategy
=============

Base class for merge strategy handlers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ...types import MergeResult
from ..context import MergeContext


class MergeStrategyHandler(ABC):
    """Base class for merge strategy handlers."""

    @abstractmethod
    def execute(self, context: MergeContext) -> MergeResult:
        """
        Execute the merge strategy.

        Args:
            context: The merge context with baseline and task snapshots

        Returns:
            MergeResult with merged content or error
        """
        pass
