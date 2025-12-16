"""
Output streaming and reporting utilities.

Handles real-time streaming of ideation results and progress reporting.
"""

import sys

from .types import IdeationPhaseResult


class OutputStreamer:
    """Handles streaming of ideation results and progress updates."""

    @staticmethod
    def stream_ideation_complete(ideation_type: str, ideas_count: int) -> None:
        """Signal that an ideation type has completed successfully.

        Args:
            ideation_type: The ideation type that completed
            ideas_count: Number of ideas generated
        """
        print(f"IDEATION_TYPE_COMPLETE:{ideation_type}:{ideas_count}")
        sys.stdout.flush()

    @staticmethod
    def stream_ideation_failed(ideation_type: str) -> None:
        """Signal that an ideation type has failed.

        Args:
            ideation_type: The ideation type that failed
        """
        print(f"IDEATION_TYPE_FAILED:{ideation_type}")
        sys.stdout.flush()

    async def stream_ideation_result(
        self, ideation_type: str, phase_executor, max_retries: int = 3
    ) -> IdeationPhaseResult:
        """Run a single ideation type and stream results when complete.

        Args:
            ideation_type: The ideation type to run
            phase_executor: PhaseExecutor instance
            max_retries: Maximum number of recovery attempts

        Returns:
            IdeationPhaseResult for the completed phase
        """
        result = await phase_executor.execute_ideation_type(ideation_type, max_retries)

        if result.success:
            # Signal that this type is complete - UI can now show these ideas
            self.stream_ideation_complete(ideation_type, result.ideas_count)
        else:
            self.stream_ideation_failed(ideation_type)

        return result
