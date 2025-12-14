"""
Task Tool Integration for Parallel Subtask Execution
=====================================================

Wrapper around Claude Code SDK's Task tool for spawning parallel subagents.
This replaces the complex SwarmCoordinator with a simpler approach that
leverages Claude Code's built-in parallel execution capabilities.

Design Principles:
- SDK handles subagent spawning, isolation, and coordination
- Python orchestrator only needs to generate prompts and monitor progress
- All work happens in the spec worktree (no worker branches)
- Fallback to sequential execution if parallel isn't needed/available

Usage:
    coordinator = TaskToolCoordinator(client, spec_dir, project_dir)
    await coordinator.run_subtasks_parallel(subtasks, max_parallel=3)
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

from client import create_client
from implementation_plan import ImplementationPlan, Subtask, SubtaskStatus
from prompt_generator import generate_subtask_prompt, load_subtask_context, format_context_for_prompt


logger = logging.getLogger(__name__)


class TaskToolCoordinator:
    """
    Coordinates parallel subtask execution using Claude Code Task tool.

    Much simpler than SwarmCoordinator - SDK handles:
    - Subagent spawning (up to 10 parallel)
    - Isolated context windows
    - Scheduling and resource management
    - Progress tracking

    This coordinator generates prompts and lets the agent use Task tool
    to spawn subagents for parallel work.
    """

    def __init__(
        self,
        spec_dir: Path,
        project_dir: Path,
        model: str = "claude-sonnet-4-20250514",
        max_parallel: int = 3,
    ):
        """
        Initialize the Task Tool coordinator.

        Args:
            spec_dir: Directory containing the spec and implementation plan
            project_dir: Root project directory (or spec worktree path)
            model: Claude model to use for subagents
            max_parallel: Maximum number of parallel subagents (1-10)
        """
        self.spec_dir = spec_dir
        self.project_dir = project_dir
        self.model = model
        self.max_parallel = min(max(1, max_parallel), 10)  # Clamp to 1-10

        # Load implementation plan
        self.plan_file = spec_dir / "implementation_plan.json"
        self.plan: Optional[ImplementationPlan] = None

        if self.plan_file.exists():
            self.plan = ImplementationPlan.load(self.plan_file)

    def get_pending_subtasks(self) -> list[Subtask]:
        """Get all pending subtasks that can be worked on."""
        if not self.plan:
            return []

        pending = []
        for phase in self.plan.phases:
            # Check if phase dependencies are satisfied
            deps_satisfied = True
            for dep_id in phase.depends_on:
                dep_phase = next((p for p in self.plan.phases if p.id == dep_id), None)
                if dep_phase and not all(s.status == SubtaskStatus.COMPLETED for s in dep_phase.subtasks):
                    deps_satisfied = False
                    break

            if deps_satisfied:
                for subtask in phase.subtasks:
                    if subtask.status == SubtaskStatus.PENDING:
                        pending.append(subtask)

        return pending

    def get_parallelizable_subtasks(self, subtasks: list[Subtask]) -> list[list[Subtask]]:
        """
        Group subtasks into batches that can run in parallel.

        Subtasks within the same phase can potentially run in parallel
        if they don't modify the same files.

        Args:
            subtasks: List of pending subtasks

        Returns:
            List of batches, where each batch can run in parallel
        """
        if not subtasks:
            return []

        # Group by phase
        phase_groups: dict[str, list[Subtask]] = {}
        for subtask in subtasks:
            phase_id = subtask.id.split("-")[0] if "-" in subtask.id else "default"
            if phase_id not in phase_groups:
                phase_groups[phase_id] = []
            phase_groups[phase_id].append(subtask)

        # For now, return each phase group as a batch
        # In the future, we could do smarter file conflict detection
        batches = []
        for phase_subtasks in phase_groups.values():
            # Split into batches of max_parallel
            for i in range(0, len(phase_subtasks), self.max_parallel):
                batch = phase_subtasks[i:i + self.max_parallel]
                batches.append(batch)

        return batches

    async def run_subtask_session(
        self,
        subtask: Subtask,
        phase: Optional[dict] = None,
    ) -> bool:
        """
        Run a single subtask session using the SDK.

        Args:
            subtask: The subtask to implement
            phase: Optional phase context

        Returns:
            True if subtask was completed successfully
        """
        # Convert Subtask dataclass to dict for prompt generator
        subtask_dict = {
            "id": subtask.id,
            "description": subtask.description,
            "status": subtask.status.value,
            "service": getattr(subtask, "service", None),
            "files_to_modify": getattr(subtask, "files_to_modify", []),
            "files_to_create": getattr(subtask, "files_to_create", []),
            "patterns_from": getattr(subtask, "patterns_from", []),
            "verification": getattr(subtask, "verification", None),
        }

        # Generate the subtask prompt
        prompt = generate_subtask_prompt(
            spec_dir=self.spec_dir,
            project_dir=self.project_dir,
            subtask=subtask_dict,
            phase=phase or {},
            attempt_count=0,
            recovery_hints=None,
        )

        # Load and append context
        context = load_subtask_context(self.spec_dir, self.project_dir, subtask_dict)
        if context.get("patterns") or context.get("files_to_modify"):
            prompt += "\n\n" + format_context_for_prompt(context)

        # Create client for this subtask
        client = create_client(
            project_dir=self.project_dir,
            spec_dir=self.spec_dir,
            model=self.model,
            agent_type="coder",
        )

        try:
            logger.info(f"Starting subtask: {subtask.id}")
            print(f"\n[Subtask {subtask.id}] Starting...")

            async with client:
                await client.query(prompt)

                # Collect response
                response_text = ""
                async for msg in client.receive_response():
                    msg_type = type(msg).__name__
                    if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                        for block in msg.content:
                            block_type = type(block).__name__
                            if block_type == "TextBlock" and hasattr(block, "text"):
                                response_text += block.text

            # Reload plan to check if subtask was marked complete
            if self.plan_file.exists():
                updated_plan = ImplementationPlan.load(self.plan_file)
                for phase in updated_plan.phases:
                    for s in phase.subtasks:
                        if s.id == subtask.id:
                            if s.status == SubtaskStatus.COMPLETED:
                                logger.info(f"Subtask {subtask.id} completed successfully")
                                print(f"[Subtask {subtask.id}] Completed!")
                                return True

            logger.warning(f"Subtask {subtask.id} not marked as completed")
            print(f"[Subtask {subtask.id}] Not completed")
            return False

        except Exception as e:
            logger.error(f"Error running subtask {subtask.id}: {e}")
            print(f"[Subtask {subtask.id}] Error: {e}")
            return False

    async def run_subtasks_parallel(
        self,
        subtasks: list[Subtask],
    ) -> dict[str, bool]:
        """
        Execute subtasks in parallel using asyncio.

        Since the Claude Code SDK doesn't directly expose Task tool spawning,
        we achieve parallelism by running multiple SDK sessions concurrently.

        Args:
            subtasks: List of subtasks to execute

        Returns:
            Dict mapping subtask_id to success status
        """
        results: dict[str, bool] = {}

        if not subtasks:
            return results

        # Group into parallelizable batches
        batches = self.get_parallelizable_subtasks(subtasks)

        logger.info(f"Running {len(subtasks)} subtasks in {len(batches)} batch(es)")
        print(f"\nParallel execution: {len(subtasks)} subtasks, {len(batches)} batch(es)")
        print(f"Max parallel: {self.max_parallel}")

        for batch_idx, batch in enumerate(batches):
            print(f"\n--- Batch {batch_idx + 1}/{len(batches)} ({len(batch)} subtasks) ---")

            # Create tasks for parallel execution
            tasks = [
                self.run_subtask_session(subtask)
                for subtask in batch
            ]

            # Run batch in parallel
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Record results
            for subtask, result in zip(batch, batch_results):
                if isinstance(result, Exception):
                    logger.error(f"Subtask {subtask.id} failed with exception: {result}")
                    results[subtask.id] = False
                else:
                    results[subtask.id] = result

            # Small delay between batches
            if batch_idx < len(batches) - 1:
                await asyncio.sleep(1)

        return results

    async def run_next_batch(self) -> tuple[int, int]:
        """
        Run the next batch of pending subtasks.

        Returns:
            (completed_count, failed_count)
        """
        pending = self.get_pending_subtasks()

        if not pending:
            return 0, 0

        # Take at most max_parallel subtasks
        batch = pending[:self.max_parallel]

        results = await self.run_subtasks_parallel(batch)

        completed = sum(1 for v in results.values() if v)
        failed = sum(1 for v in results.values() if not v)

        return completed, failed


async def run_parallel_build(
    spec_dir: Path,
    project_dir: Path,
    model: str = "claude-sonnet-4-20250514",
    max_parallel: int = 3,
    max_iterations: int = 100,
) -> bool:
    """
    Run the full parallel build loop.

    This is a simplified alternative to run_autonomous_agent that uses
    parallel subtask execution.

    Args:
        spec_dir: Directory containing the spec
        project_dir: Root project directory
        model: Claude model to use
        max_parallel: Maximum parallel subtasks
        max_iterations: Maximum number of build iterations

    Returns:
        True if build completed successfully
    """
    coordinator = TaskToolCoordinator(
        spec_dir=spec_dir,
        project_dir=project_dir,
        model=model,
        max_parallel=max_parallel,
    )

    iteration = 0

    while iteration < max_iterations:
        iteration += 1
        print(f"\n{'='*60}")
        print(f"Build Iteration {iteration}")
        print(f"{'='*60}")

        completed, failed = await coordinator.run_next_batch()

        if completed == 0 and failed == 0:
            # No pending subtasks
            print("\nNo pending subtasks - checking build status...")

            # Reload plan and check completion
            if coordinator.plan_file.exists():
                plan = ImplementationPlan.load(coordinator.plan_file)
                all_subtasks = [s for p in plan.phases for s in p.subtasks]
                all_completed = all(s.status == SubtaskStatus.COMPLETED for s in all_subtasks)

                if all_completed:
                    print("\nBuild complete! All subtasks finished.")
                    return True
                else:
                    pending = [s for s in all_subtasks if s.status == SubtaskStatus.PENDING]
                    print(f"\nBuild incomplete: {len(pending)} subtasks still pending")
                    print("This may be due to unsatisfied phase dependencies.")
                    break

        print(f"\nBatch results: {completed} completed, {failed} failed")

        if failed > 0:
            print(f"Warning: {failed} subtask(s) failed in this batch")
            # Continue trying - recovery may help

        # Small delay between iterations
        await asyncio.sleep(2)

    return False


# === Convenience Functions ===

def get_parallel_status(spec_dir: Path) -> dict:
    """
    Get the current parallel build status.

    Returns dict with:
    - pending: list of pending subtask IDs
    - completed: list of completed subtask IDs
    - failed: list of failed subtask IDs
    - can_parallelize: bool indicating if parallel execution is possible
    """
    plan_file = spec_dir / "implementation_plan.json"

    if not plan_file.exists():
        return {
            "pending": [],
            "completed": [],
            "failed": [],
            "can_parallelize": False,
        }

    plan = ImplementationPlan.load(plan_file)

    pending = []
    completed = []
    failed = []

    for phase in plan.phases:
        for subtask in phase.subtasks:
            if subtask.status == SubtaskStatus.PENDING:
                pending.append(subtask.id)
            elif subtask.status == SubtaskStatus.COMPLETED:
                completed.append(subtask.id)
            elif subtask.status == SubtaskStatus.FAILED:
                failed.append(subtask.id)

    return {
        "pending": pending,
        "completed": completed,
        "failed": failed,
        "can_parallelize": len(pending) > 1,
    }
