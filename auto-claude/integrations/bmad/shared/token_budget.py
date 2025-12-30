"""
Token Budget Manager - Intelligent token allocation for BMAD sessions.

Ensures sessions stay under 50K tokens through:
- Tiered allocation (agent, workflow, steps, context)
- Dynamic reallocation based on actual usage
- Compression when approaching limits
- Usage tracking and reporting

Based on BMAD Full Integration Product Brief ADR-001.
"""

import threading
from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class TokenCategory(Enum):
    """Categories for token budget allocation."""

    AGENT_PERSONA = "agent_persona"  # Agent system prompts
    WORKFLOW_DEF = "workflow_definition"  # Workflow YAML/MD
    STEP_CONTENT = "step_content"  # Step file content (JIT loaded)
    USER_CONTEXT = "user_context"  # User-provided context
    OUTPUT = "output"  # Generated output
    OVERHEAD = "overhead"  # System overhead


@dataclass
class TokenAllocation:
    """Token allocation for a specific category."""

    category: TokenCategory
    allocated: int
    used: int = 0
    peak: int = 0

    @property
    def remaining(self) -> int:
        return max(0, self.allocated - self.used)

    @property
    def utilization(self) -> float:
        if self.allocated == 0:
            return 0.0
        return (self.used / self.allocated) * 100

    def consume(self, tokens: int) -> bool:
        """Consume tokens, return True if within budget."""
        self.used += tokens
        self.peak = max(self.peak, self.used)
        return self.used <= self.allocated

    def release(self, tokens: int) -> None:
        """Release tokens back to pool."""
        self.used = max(0, self.used - tokens)


@dataclass
class UsageSnapshot:
    """Point-in-time usage snapshot for tracking."""

    timestamp: datetime
    total_used: int
    total_budget: int
    by_category: dict[TokenCategory, int]


class TokenBudget:
    """
    Manages token budget for a BMAD session.

    Default allocation (50K total):
    - Agent Persona: 5K (10%)
    - Workflow Def: 3K (6%)
    - Step Content: 25K (50%) - largest, JIT loaded
    - User Context: 10K (20%)
    - Output: 5K (10%)
    - Overhead: 2K (4%)
    """

    DEFAULT_BUDGET = 50_000

    DEFAULT_ALLOCATIONS = {
        TokenCategory.AGENT_PERSONA: 5_000,
        TokenCategory.WORKFLOW_DEF: 3_000,
        TokenCategory.STEP_CONTENT: 25_000,
        TokenCategory.USER_CONTEXT: 10_000,
        TokenCategory.OUTPUT: 5_000,
        TokenCategory.OVERHEAD: 2_000,
    }

    def __init__(
        self,
        total_budget: int = DEFAULT_BUDGET,
        allocations: dict[TokenCategory, int] | None = None,
    ):
        self.total_budget = total_budget
        self._lock = threading.Lock()
        self._history: list[UsageSnapshot] = []

        # Initialize allocations
        if allocations:
            self._allocations = {
                cat: TokenAllocation(category=cat, allocated=amt)
                for cat, amt in allocations.items()
            }
        else:
            # Scale default allocations to match total budget
            scale = total_budget / self.DEFAULT_BUDGET
            self._allocations = {
                cat: TokenAllocation(category=cat, allocated=int(amt * scale))
                for cat, amt in self.DEFAULT_ALLOCATIONS.items()
            }

    @property
    def total_used(self) -> int:
        """Total tokens currently in use."""
        return sum(a.used for a in self._allocations.values())

    @property
    def total_remaining(self) -> int:
        """Total tokens remaining in budget."""
        return self.total_budget - self.total_used

    @property
    def utilization(self) -> float:
        """Overall budget utilization percentage."""
        return (self.total_used / self.total_budget) * 100

    def get_allocation(self, category: TokenCategory) -> TokenAllocation:
        """Get allocation for a category."""
        return self._allocations.get(category)

    def consume(self, category: TokenCategory, tokens: int) -> bool:
        """
        Consume tokens from a category.

        Returns True if consumption was within budget.
        If over category budget but under total, allows with warning.
        """
        with self._lock:
            allocation = self._allocations.get(category)
            if not allocation:
                return False

            success = allocation.consume(tokens)

            # Record snapshot if significant change
            if self.total_used % 5000 < tokens:
                self._record_snapshot()

            return success or self.total_used <= self.total_budget

    def release(self, category: TokenCategory, tokens: int) -> None:
        """Release tokens back to a category."""
        with self._lock:
            allocation = self._allocations.get(category)
            if allocation:
                allocation.release(tokens)

    def can_afford(self, category: TokenCategory, tokens: int) -> bool:
        """Check if we can afford to consume tokens."""
        allocation = self._allocations.get(category)
        if not allocation:
            return False

        # Check category budget first, then total
        if allocation.remaining >= tokens:
            return True

        # Can borrow from total if category exceeded
        return self.total_remaining >= tokens

    def reallocate(
        self, from_cat: TokenCategory, to_cat: TokenCategory, tokens: int
    ) -> bool:
        """
        Move budget allocation between categories.

        Useful when one category needs more than initially allocated.
        """
        with self._lock:
            from_alloc = self._allocations.get(from_cat)
            to_alloc = self._allocations.get(to_cat)

            if not from_alloc or not to_alloc:
                return False

            # Can only reallocate unused tokens
            if from_alloc.remaining < tokens:
                return False

            from_alloc.allocated -= tokens
            to_alloc.allocated += tokens
            return True

    def get_status(self) -> dict:
        """Get current budget status."""
        return {
            "total_budget": self.total_budget,
            "total_used": self.total_used,
            "total_remaining": self.total_remaining,
            "utilization_pct": round(self.utilization, 1),
            "by_category": {
                cat.value: {
                    "allocated": alloc.allocated,
                    "used": alloc.used,
                    "remaining": alloc.remaining,
                    "utilization_pct": round(alloc.utilization, 1),
                    "peak": alloc.peak,
                }
                for cat, alloc in self._allocations.items()
            },
            "warning": self.utilization > 80,
            "critical": self.utilization > 95,
        }

    def _record_snapshot(self) -> None:
        """Record a usage snapshot for history."""
        snapshot = UsageSnapshot(
            timestamp=datetime.now(),
            total_used=self.total_used,
            total_budget=self.total_budget,
            by_category={cat: alloc.used for cat, alloc in self._allocations.items()},
        )
        self._history.append(snapshot)

        # Keep last 100 snapshots
        if len(self._history) > 100:
            self._history = self._history[-100:]

    def estimate_tokens(self, text: str) -> int:
        """
        Estimate token count for text.

        Uses simple heuristic: ~4 chars per token for English.
        For more accurate counts, use tiktoken with actual model.
        """
        return len(text) // 4

    def compress_if_needed(self, threshold: float = 0.85) -> bool:
        """
        Check if compression is needed based on utilization.

        Returns True if utilization exceeds threshold.
        Caller should implement actual compression strategy.
        """
        return self.utilization > (threshold * 100)

    def reset(self) -> None:
        """Reset all usage counters (not allocations)."""
        with self._lock:
            for alloc in self._allocations.values():
                alloc.used = 0
                alloc.peak = 0
            self._history.clear()


# Convenience function for quick estimation
def estimate_tokens(text: str) -> int:
    """Quick token estimation (~4 chars per token)."""
    return len(text) // 4
