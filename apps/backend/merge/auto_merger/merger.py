"""
Auto Merger
===========

Main merger class that coordinates strategy execution.
"""

from __future__ import annotations

import logging

from ..types import MergeDecision, MergeResult, MergeStrategy
from .context import MergeContext
from .strategies import (
    AppendStrategy,
    HooksStrategy,
    ImportStrategy,
    MergeStrategyHandler,
    OrderingStrategy,
    PropsStrategy,
)
from .strategies.hooks_strategy import HooksThenWrapStrategy

logger = logging.getLogger(__name__)


class AutoMerger:
    """
    Performs deterministic merges without AI.

    This class implements various merge strategies that can be applied
    when the ConflictDetector determines changes are compatible.

    Example:
        merger = AutoMerger()
        result = merger.merge(context, MergeStrategy.COMBINE_IMPORTS)
        if result.success:
            print(result.merged_content)
    """

    def __init__(self):
        """Initialize the auto merger with strategy handlers."""
        self._strategy_handlers: dict[MergeStrategy, MergeStrategyHandler] = {
            MergeStrategy.COMBINE_IMPORTS: ImportStrategy(),
            MergeStrategy.HOOKS_FIRST: HooksStrategy(),
            MergeStrategy.HOOKS_THEN_WRAP: HooksThenWrapStrategy(),
            MergeStrategy.APPEND_FUNCTIONS: AppendStrategy.Functions(),
            MergeStrategy.APPEND_METHODS: AppendStrategy.Methods(),
            MergeStrategy.COMBINE_PROPS: PropsStrategy(),
            MergeStrategy.ORDER_BY_DEPENDENCY: OrderingStrategy.ByDependency(),
            MergeStrategy.ORDER_BY_TIME: OrderingStrategy.ByTime(),
            MergeStrategy.APPEND_STATEMENTS: AppendStrategy.Statements(),
        }

    def merge(
        self,
        context: MergeContext,
        strategy: MergeStrategy,
    ) -> MergeResult:
        """
        Perform a merge using the specified strategy.

        Args:
            context: The merge context with baseline and task snapshots
            strategy: The merge strategy to use

        Returns:
            MergeResult with merged content or error
        """
        handler = self._strategy_handlers.get(strategy)

        if not handler:
            return MergeResult(
                decision=MergeDecision.FAILED,
                file_path=context.file_path,
                error=f"No handler for strategy: {strategy.value}",
            )

        try:
            return handler.execute(context)
        except Exception as e:
            logger.exception(f"Auto-merge failed with strategy {strategy.value}")
            return MergeResult(
                decision=MergeDecision.FAILED,
                file_path=context.file_path,
                error=f"Auto-merge failed: {str(e)}",
            )

    def can_handle(self, strategy: MergeStrategy) -> bool:
        """Check if this merger can handle a strategy."""
        return strategy in self._strategy_handlers
