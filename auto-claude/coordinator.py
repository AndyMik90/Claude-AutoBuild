#!/usr/bin/env python3
"""
Multi-Agent Parallelism Coordinator - Per-Spec Architecture
============================================================

Implements a swarm coordination pattern for parallel execution of independent chunks.
Each spec gets its own worktree in .worktrees/{spec-name}/.

Architecture:
1. Create per-spec worktree: .worktrees/{spec-name}/
2. Each worker gets a temporary worktree: .worktrees/worker-{id}/
3. Workers merge INTO the spec's worktree (not base branch)
4. User can cd into spec worktree, run the app, test the feature
5. Only merges to user's project when they explicitly approve

Benefits:
- User can TEST the complete feature before accepting it
- All work is collected in one place for review
- No partial merges - it's all or nothing
- Easy to discard if the feature doesn't work
- Multiple specs can be worked on simultaneously (per-spec isolation)

Prerequisites:
- Git 2.5+ (for worktree support)
- implementation_plan.json must exist (planner runs first if needed)

Enhanced with status updates for ccstatusline integration.
"""

import asyncio
import json
import subprocess
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

from implementation_plan import ImplementationPlan, Phase, Chunk, ChunkStatus
from worktree import WorktreeManager
from ui import (
    Icons,
    icon,
    box,
    success,
    error,
    warning,
    info,
    muted,
    highlight,
    bold,
    print_status,
    print_key_value,
    StatusManager,
    BuildState,
)
from task_logger import get_task_logger, LogPhase


class WorkerStatus(Enum):
    """Status of a worker."""
    IDLE = "idle"
    WORKING = "working"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class WorkerAssignment:
    """Tracks what a worker is doing."""
    worker_id: str
    phase_id: int
    chunk_id: str
    branch_name: str
    worktree_path: Path
    status: WorkerStatus
    started_at: Optional[str] = None
    completed_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "worker_id": self.worker_id,
            "phase_id": self.phase_id,
            "chunk_id": self.chunk_id,
            "branch_name": self.branch_name,
            "worktree_path": str(self.worktree_path),
            "status": self.status.value,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
        }


@dataclass
class ParallelGroup:
    """Phases that can run in parallel."""
    phases: list[Phase]
    all_dependencies_met: bool

    def __post_init__(self):
        """Validate that phases can actually run in parallel."""
        # Check for file conflicts between phases
        file_sets = []
        for phase in self.phases:
            phase_files = set()
            for chunk in phase.chunks:
                phase_files.update(chunk.files_to_modify)
                phase_files.update(chunk.files_to_create)
            file_sets.append(phase_files)

        # Ensure no file overlap
        for i, files_a in enumerate(file_sets):
            for j, files_b in enumerate(file_sets[i+1:], i+1):
                overlap = files_a & files_b
                if overlap:
                    raise ValueError(
                        f"Phases {self.phases[i].name} and {self.phases[j].name} "
                        f"cannot run in parallel - they modify the same files: {overlap}"
                    )


class SwarmCoordinator:
    """
    Coordinates parallel execution of chunks using a staging worktree.

    The coordinator:
    1. Runs planner session first if no implementation_plan.json exists
    2. Creates a STAGING worktree where all work is collected
    3. Each worker gets a temporary worktree for isolation
    4. Workers merge their completed work INTO staging
    5. At the end, user has a complete feature to test in staging
    6. User can then merge staging to their project when ready
    """

    def __init__(
        self,
        spec_dir: Path,
        project_dir: Path,
        max_workers: int = 3,
        model: str = "claude-opus-4-5-20251101",
        verbose: bool = False,
    ):
        self.spec_dir = spec_dir
        self.project_dir = project_dir
        self.max_workers = max_workers
        self.model = model
        self.verbose = verbose

        # State tracking
        self.workers: dict[str, WorkerAssignment] = {}
        self.claimed_files: dict[str, str] = {}  # file_path -> worker_id
        self.plan: Optional[ImplementationPlan] = None
        self.worktree_manager: Optional[WorktreeManager] = None

        # Progress tracking file
        self.progress_file = spec_dir / "parallel_progress.json"

        # Merge lock for serializing merges to staging
        self._merge_lock = asyncio.Lock()

        # Status manager for ccstatusline
        self.status_manager = StatusManager(project_dir)

    def _get_base_branch(self) -> str:
        """Get the current branch to use as base for workers."""
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=self.project_dir,
            capture_output=True,
            text=True,
        )
        return result.stdout.strip()

    def _get_spec_name(self) -> str:
        """Get the spec name for branch naming."""
        return self.spec_dir.name

    def load_implementation_plan(self) -> ImplementationPlan:
        """Load the implementation plan from spec directory."""
        plan_file = self.spec_dir / "implementation_plan.json"

        if not plan_file.exists():
            raise FileNotFoundError(
                f"Implementation plan not found: {plan_file}\n"
                "The planner session should have created this."
            )

        self.plan = ImplementationPlan.load(plan_file)
        return self.plan

    def save_implementation_plan(self):
        """Save the updated implementation plan."""
        if self.plan:
            plan_file = self.spec_dir / "implementation_plan.json"
            self.plan.save(plan_file)

    def get_available_chunks(self) -> list[tuple[Phase, Chunk]]:
        """
        Get chunks that are ready to be worked on.

        A chunk is available if:
        - Its phase dependencies are met
        - It's not claimed by another worker
        - Its files aren't claimed by another worker
        - Its status is PENDING
        """
        if not self.plan:
            return []

        available = []
        available_phases = self.plan.get_available_phases()

        for phase in available_phases:
            for chunk in phase.chunks:
                if chunk.status != ChunkStatus.PENDING:
                    continue

                # Check if chunk is already claimed
                if any(w.chunk_id == chunk.id for w in self.workers.values()):
                    continue

                # Check if any of chunk's files are claimed
                chunk_files = set(chunk.files_to_modify + chunk.files_to_create)
                if any(f in self.claimed_files for f in chunk_files):
                    continue

                available.append((phase, chunk))

        return available

    def claim_chunk(
        self,
        worker_id: str,
        phase: Phase,
        chunk: Chunk,
        worktree_path: Path,
        branch_name: str,
    ) -> bool:
        """Claim a chunk for a worker."""
        # Check if chunk already claimed
        if any(w.chunk_id == chunk.id for w in self.workers.values()):
            return False

        # Check if any files already claimed
        chunk_files = set(chunk.files_to_modify + chunk.files_to_create)
        if any(f in self.claimed_files for f in chunk_files):
            return False

        # Claim the files
        for file_path in chunk_files:
            self.claimed_files[file_path] = worker_id

        # Create worker assignment
        assignment = WorkerAssignment(
            worker_id=worker_id,
            phase_id=phase.phase,
            chunk_id=chunk.id,
            branch_name=branch_name,
            worktree_path=worktree_path,
            status=WorkerStatus.WORKING,
            started_at=datetime.now().isoformat(),
        )

        self.workers[worker_id] = assignment

        # Update chunk status
        chunk.status = ChunkStatus.IN_PROGRESS
        chunk.started_at = datetime.now().isoformat()

        return True

    def release_chunk(
        self,
        worker_id: str,
        chunk_id: str,
        success: bool,
        output: Optional[str] = None,
    ) -> None:
        """Release a chunk after completion or failure."""
        if worker_id not in self.workers:
            return

        assignment = self.workers[worker_id]

        # Update assignment
        assignment.completed_at = datetime.now().isoformat()
        assignment.status = WorkerStatus.COMPLETED if success else WorkerStatus.FAILED

        # Find and update the chunk
        for phase in self.plan.phases:
            for chunk in phase.chunks:
                if chunk.id == chunk_id:
                    if success:
                        chunk.complete(output)
                    else:
                        chunk.fail(output)
                    break

        # Release claimed files
        chunk_files = [f for f, wid in self.claimed_files.items() if wid == worker_id]
        for file_path in chunk_files:
            del self.claimed_files[file_path]

        # Remove worker assignment
        del self.workers[worker_id]

    async def run_planner_session(self, working_dir: Optional[Path] = None) -> bool:
        """
        Run the planner session to create implementation_plan.json.

        Args:
            working_dir: Directory to run the planner in. If None, uses project_dir.
                        When in parallel mode, this should be the worktree path.
        """
        content = [
            bold(f"{icon(Icons.GEAR)} PLANNER SESSION"),
            "",
            muted("Creating implementation plan from spec..."),
        ]
        print()
        print(box(content, width=70, style="heavy"))
        print()

        # Use provided working directory or fall back to project directory
        planner_dir = working_dir or self.project_dir

        # Initialize task logger and start planning phase
        task_logger = get_task_logger(self.spec_dir)
        if task_logger:
            task_logger.start_phase(LogPhase.PLANNING, "Starting implementation planning...")

        # Update status
        self.status_manager.set_active(self.spec_dir.name, BuildState.PLANNING)

        # Import here to avoid circular dependency
        from agent import run_agent_session
        from client import create_client
        from prompt_generator import generate_planner_prompt

        # Create client for planner (uses worktree if provided, else main project)
        client = create_client(planner_dir, self.spec_dir, self.model)

        # Generate planner prompt
        prompt = generate_planner_prompt(self.spec_dir, planner_dir)

        # Run the planner session
        async with client:
            status, response = await run_agent_session(
                client, prompt, self.spec_dir, self.verbose
            )

        # Check if plan was created
        plan_file = self.spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            print_status("Planner did not create implementation_plan.json", "error")
            if task_logger:
                task_logger.end_phase(LogPhase.PLANNING, success=False, message="Failed to create implementation plan")
            return False

        print_status("Implementation plan created successfully", "success")

        # End planning phase in task logger
        if task_logger:
            task_logger.end_phase(LogPhase.PLANNING, success=True, message="Implementation plan created")

        # Note: Linear task creation now happens in spec_runner.py after requirements gathering
        # Linear status updates happen via linear_updater.py mini-agents

        return True

    async def merge_worker_to_spec(self, worker_id: str, branch_name: str, worktree_path: Path) -> bool:
        """
        Merge a worker's completed work into the spec's worktree.

        Uses a lock to serialize merges.
        """
        async with self._merge_lock:
            spec_name = self._get_spec_name()
            spec_path = self.worktree_manager.get_worktree_path(spec_name)
            if not spec_path.exists():
                print(f"Worker {worker_id}: No spec worktree found for {spec_name}!")
                return False

            print(f"Worker {worker_id}: Merging into spec worktree...")

            # Merge the worker branch into spec worktree
            result = subprocess.run(
                ["git", "merge", "--no-ff", branch_name,
                 "-m", f"auto-claude: Merge {branch_name}"],
                cwd=spec_path,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                print(f"  Merge conflict! Aborting merge...")
                subprocess.run(
                    ["git", "merge", "--abort"],
                    cwd=spec_path,
                    capture_output=True,
                )
                return False

            print(f"  Successfully merged {branch_name} into spec worktree")
            return True

    async def run_worker(
        self,
        worker_id: str,
        phase: Phase,
        chunk: Chunk,
    ) -> bool:
        """
        Run a single worker on a chunk using a dedicated worktree.

        Worker creates work in its own worktree, then merges to staging.
        """
        content = [
            bold(f"{icon(Icons.WORKER)} WORKER {worker_id}: Starting {chunk.id}"),
            "",
            f"Phase: {highlight(phase.name)}",
            f"Description: {chunk.description[:60]}..." if len(chunk.description) > 60 else f"Description: {chunk.description}",
        ]
        print()
        print(box(content, width=70, style="light"))
        print()

        # Update status with worker count
        active_workers = len([w for w in self.workers.values() if w.status == WorkerStatus.WORKING])
        self.status_manager.update_workers(active_workers + 1, self.max_workers)

        # Get spec worktree info to branch from
        spec_name = self._get_spec_name()
        spec_info = self.worktree_manager.get_worktree_info(spec_name)
        if not spec_info:
            print(f"Worker {worker_id}: No spec worktree for {spec_name}!")
            return False

        # Create temporary worktree for this worker (branching from spec's worktree)
        try:
            worktree_path, branch_name = self.worktree_manager.create_worker_worktree(
                spec_name, worker_id, chunk.id
            )
            print_status(f"Created worker worktree: {worktree_path.name} (from {spec_info.branch})", "success")

        except Exception as e:
            print_status(f"Worker {worker_id}: Failed to create worktree: {e}", "error")
            return False

        # Claim the chunk
        if not self.claim_chunk(worker_id, phase, chunk, worktree_path, branch_name):
            print(f"Worker {worker_id}: Failed to claim chunk {chunk.id}")
            self._cleanup_worker_worktree(worktree_path, branch_name)
            return False

        try:
            # Import here to avoid circular dependency
            from agent import run_agent_session
            from client import create_client
            from prompts import get_coding_prompt

            # Create client for this worker - uses worker's worktree
            client = create_client(worktree_path, self.spec_dir, self.model)

            # Generate prompt for this specific chunk
            prompt = get_coding_prompt(self.spec_dir)

            # Add chunk-specific instructions
            prompt += f"\n\n## ASSIGNED CHUNK\n\n"
            prompt += f"You are working on a SPECIFIC chunk. Focus ONLY on this:\n\n"
            prompt += f"**Chunk ID:** {chunk.id}\n"
            prompt += f"**Description:** {chunk.description}\n"

            if chunk.files_to_modify:
                prompt += f"**Files to modify:** {', '.join(chunk.files_to_modify)}\n"
            if chunk.files_to_create:
                prompt += f"**Files to create:** {', '.join(chunk.files_to_create)}\n"

            prompt += f"\n**IMPORTANT:** Commit your changes when done.\n"

            # Run the agent session
            print_status(f"Worker {worker_id}: Running in worktree {worktree_path.name}...", "progress")
            async with client:
                status, response = await run_agent_session(
                    client, prompt, self.spec_dir, self.verbose
                )

            chunk_success = status == "continue" or status == "complete"

            # Commit any uncommitted work
            if chunk_success:
                subprocess.run(
                    ["git", "add", "."],
                    cwd=worktree_path,
                    check=False,
                )
                result = subprocess.run(
                    ["git", "commit", "-m", f"auto-claude: Complete {chunk.id}\n\n{chunk.description}"],
                    cwd=worktree_path,
                    capture_output=True,
                    text=True,
                )
                if result.returncode == 0:
                    print_status(f"Worker {worker_id}: Committed changes", "success")
                elif "nothing to commit" not in result.stdout + result.stderr:
                    print_status(f"Worker {worker_id}: Commit issue: {result.stderr}", "warning")

            # Release the chunk
            self.release_chunk(worker_id, chunk.id, chunk_success, response)

            # Update status with completed chunk count
            if self.plan:
                progress = self.plan.get_progress()
                self.status_manager.update_chunks(
                    completed=progress.get("completed_chunks", 0),
                    total=progress.get("total_chunks", 0),
                    in_progress=progress.get("in_progress_chunks", 0),
                )

            # Update worker count
            active_workers = len([w for w in self.workers.values() if w.status == WorkerStatus.WORKING])
            self.status_manager.update_workers(active_workers, self.max_workers)

            # Merge to spec worktree if successful
            if chunk_success:
                merge_success = await self.merge_worker_to_spec(
                    worker_id, branch_name, worktree_path
                )
                if not merge_success:
                    print_status(f"Worker {worker_id}: Merge to spec worktree failed for {chunk.id}", "error")
                    # Mark chunk as failed due to merge conflict
                    for p in self.plan.phases:
                        for c in p.chunks:
                            if c.id == chunk.id:
                                c.fail("Merge conflict")
                    chunk_success = False

            # Clean up worker worktree
            self._cleanup_worker_worktree(worktree_path, branch_name)

            return chunk_success

        except Exception as e:
            print_status(f"Worker {worker_id}: Error executing chunk {chunk.id}: {e}", "error")

            # Clean up on error
            self.release_chunk(worker_id, chunk.id, False, str(e))
            self._cleanup_worker_worktree(worktree_path, branch_name)

            # Update worker count
            active_workers = len([w for w in self.workers.values() if w.status == WorkerStatus.WORKING])
            self.status_manager.update_workers(active_workers, self.max_workers)

            return False

    def _cleanup_worker_worktree(self, worktree_path: Path, branch_name: str) -> None:
        """Clean up a worker's temporary worktree."""
        # Remove worktree
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(worktree_path)],
            cwd=self.project_dir,
            capture_output=True,
        )

        # Delete branch
        subprocess.run(
            ["git", "branch", "-D", branch_name],
            cwd=self.project_dir,
            capture_output=True,
        )

        # Prune
        subprocess.run(
            ["git", "worktree", "prune"],
            cwd=self.project_dir,
            capture_output=True,
        )

    def save_progress(self):
        """Save parallel execution progress."""
        progress_data = {
            "active_workers": len(self.workers),
            "workers": {wid: w.to_dict() for wid, w in self.workers.items()},
            "claimed_files": self.claimed_files,
            "last_update": datetime.now().isoformat(),
        }

        with open(self.progress_file, "w") as f:
            json.dump(progress_data, f, indent=2)

    def load_progress(self):
        """Load parallel execution progress if it exists."""
        if self.progress_file.exists():
            with open(self.progress_file) as f:
                data = json.load(f)
                # Restore state if needed
                # For now, we start fresh each time

    async def run_parallel(self) -> Path:
        """
        Main coordination loop.

        Returns the path to the spec's worktree where all work is collected.
        """
        content = [
            bold(f"{icon(Icons.LIGHTNING)} PARALLEL EXECUTION MODE"),
            "",
            f"Max Workers: {highlight(str(self.max_workers))}",
            muted("All work collected in spec worktree for testing"),
        ]
        print()
        print(box(content, width=70, style="heavy"))
        print()

        # Get the base branch FIRST (before any worktree operations)
        base_branch = self._get_base_branch()
        print_key_value("Base branch", base_branch)

        # Initialize worktree manager BEFORE running planner
        # This ensures the planner runs in the worktree, not the main project
        self.worktree_manager = WorktreeManager(self.project_dir, base_branch)
        self.worktree_manager.setup()

        # Create or get the per-spec worktree FIRST
        spec_name = self._get_spec_name()
        spec_info = self.worktree_manager.get_or_create_worktree(spec_name)
        print_key_value("Spec worktree", str(spec_info.path))
        print_key_value("Spec branch", spec_info.branch)
        print()

        # Check if implementation plan exists, run planner if not
        # IMPORTANT: Run planner in the worktree to avoid changing user's branch
        plan_file = self.spec_dir / "implementation_plan.json"
        if not plan_file.exists():
            planner_success = await self.run_planner_session(working_dir=spec_info.path)
            if not planner_success:
                print_status("Failed to create implementation plan. Exiting.", "error")
                return None

        # Initialize task logger and start coding phase
        task_logger = get_task_logger(self.spec_dir)
        if task_logger:
            task_logger.start_phase(LogPhase.CODING, "Starting parallel implementation...")

        # Initialize status
        self.status_manager.set_active(self.spec_dir.name, BuildState.BUILDING)
        self.status_manager.update_workers(0, self.max_workers)

        # Load the implementation plan
        self.load_implementation_plan()

        # Update status with initial chunk counts
        progress = self.plan.get_progress()
        self.status_manager.update_chunks(
            completed=progress.get("completed_chunks", 0),
            total=progress.get("total_chunks", 0),
            in_progress=0,
        )

        # Load any existing progress
        self.load_progress()

        # Track worker tasks
        worker_tasks: dict[str, asyncio.Task] = {}
        next_worker_id = 1

        try:
            while True:
                # Get available chunks
                available_chunks = self.get_available_chunks()

                # Check if we're done - verify actual completion, not just lack of available work
                if not available_chunks and not worker_tasks:
                    progress = self.plan.get_progress()
                    if progress['is_complete']:
                        print_status("All chunks completed!", "success")
                    else:
                        # Chunks are pending but blocked by dependencies or in weird state
                        remaining = progress['total_chunks'] - progress['completed_chunks']
                        print_status(f"Exited with {remaining} chunks still pending (may be blocked by dependencies)", "warning")
                    break

                # Assign chunks to available workers
                while len(worker_tasks) < self.max_workers and available_chunks:
                    phase, chunk = available_chunks.pop(0)
                    worker_id = str(next_worker_id)
                    next_worker_id += 1

                    print_status(f"Assigned chunk {chunk.id} to worker {worker_id}", "info")

                    # Start worker task
                    task = asyncio.create_task(
                        self.run_worker(worker_id, phase, chunk)
                    )
                    worker_tasks[worker_id] = task

                # Wait for at least one worker to complete
                if worker_tasks:
                    done, pending = await asyncio.wait(
                        worker_tasks.values(),
                        return_when=asyncio.FIRST_COMPLETED,
                    )

                    # Remove completed tasks
                    for task in done:
                        # Find which worker completed
                        for wid, t in list(worker_tasks.items()):
                            if t == task:
                                try:
                                    result = await task
                                    if result:
                                        print_status(f"Worker {wid} completed: SUCCESS", "success")
                                    else:
                                        print_status(f"Worker {wid} completed: FAILED", "error")
                                except Exception as e:
                                    print_status(f"Worker {wid} crashed: {e}", "error")
                                del worker_tasks[wid]
                                break

                    # Save progress
                    self.save_implementation_plan()
                    self.save_progress()
                else:
                    # No workers and no available chunks - might be waiting on dependencies
                    await asyncio.sleep(1)

        finally:
            # Clean up only worker worktrees, preserve spec worktree
            print_status("Cleaning up worker worktrees...", "info")
            self.worktree_manager.cleanup_all_workers()

        # Print final summary
        progress = self.plan.get_progress()
        is_truly_complete = progress['is_complete']

        if is_truly_complete:
            content = [
                success(f"{icon(Icons.SUCCESS)} BUILD COMPLETE!"),
                "",
                f"Completed: {progress['completed_chunks']}/{progress['total_chunks']} chunks",
            ]
        else:
            remaining = progress['total_chunks'] - progress['completed_chunks']
            content = [
                warning(f"{icon(Icons.WARNING)} BUILD INCOMPLETE"),
                "",
                f"Completed: {progress['completed_chunks']}/{progress['total_chunks']} chunks",
                f"Remaining: {remaining} chunks still pending",
            ]

        if progress['failed_chunks'] > 0:
            content.append(warning(f"{icon(Icons.WARNING)} Failed chunks: {progress['failed_chunks']}"))
        print()
        print(box(content, width=70, style="heavy"))

        # End coding phase in task logger - only claim success if truly complete
        if task_logger:
            if is_truly_complete:
                success_msg = "All chunks completed successfully"
                task_logger.end_phase(LogPhase.CODING, success=True, message=success_msg)
            else:
                remaining = progress['total_chunks'] - progress['completed_chunks']
                fail_msg = f"Exited with {remaining} chunks incomplete"
                if progress['failed_chunks'] > 0:
                    fail_msg += f" ({progress['failed_chunks']} failed)"
                task_logger.end_phase(LogPhase.CODING, success=False, message=fail_msg)

        # Update status based on actual completion
        if is_truly_complete:
            self.status_manager.update(state=BuildState.COMPLETE)
        else:
            self.status_manager.update(state=BuildState.PAUSED)

        # Show spec worktree info
        spec_path = self.worktree_manager.get_worktree_path(spec_name)
        if spec_path.exists():
            summary = self.worktree_manager.get_change_summary(spec_name)
            test_commands = self.worktree_manager.get_test_commands(spec_name)

            content = [
                bold(f"{icon(Icons.PLAY)} YOUR FEATURE IS READY TO TEST"),
                "",
                f"All work collected in: {highlight(str(spec_path))}",
            ]
            print()
            print(box(content, width=70, style="light"))

            if summary["new_files"] + summary["modified_files"] + summary["deleted_files"] > 0:
                print()
                print(bold("Changes:"))
                if summary["new_files"] > 0:
                    print(success(f"  + {summary['new_files']} new files"))
                if summary["modified_files"] > 0:
                    print(info(f"  ~ {summary['modified_files']} modified files"))
                if summary["deleted_files"] > 0:
                    print(error(f"  - {summary['deleted_files']} deleted files"))

            print()
            print("To test it:")
            print(highlight(f"  cd {spec_path}"))
            for cmd in test_commands[:2]:  # Show first 2 commands
                print(f"  {cmd}")
            print()

            print("When you're happy with it:")
            print(highlight(f"  python auto-claude/run.py --spec {spec_name} --merge"))
            print()

            print("To see what changed:")
            print(muted(f"  python auto-claude/run.py --spec {spec_name} --review"))
            print()

        return spec_path
