"""
Discovery and Context Phase Implementations
============================================

Phases for project discovery and context gathering.
"""

from typing import TYPE_CHECKING

from task_logger import LogEntryType, LogPhase

from .. import context, discovery, requirements
from .models import MAX_RETRIES, PhaseResult

if TYPE_CHECKING:
    pass


class DiscoveryPhaseMixin:
    """Mixin for discovery-related phase methods."""

    async def phase_discovery(self) -> PhaseResult:
        """Analyze project structure."""
        errors = []
        retries = 0

        for attempt in range(MAX_RETRIES):
            retries = attempt

            success, output = discovery.run_discovery_script(
                self.project_dir,
                self.spec_dir,
            )

            if success:
                stats = discovery.get_project_index_stats(self.spec_dir)
                if stats:
                    self.task_logger.log(
                        f"Discovered {stats.get('file_count', 0)} files in project",
                        LogEntryType.SUCCESS,
                        LogPhase.PLANNING,
                    )
                self.ui.print_status("Created project_index.json", "success")
                spec_index = self.spec_dir / "project_index.json"
                return PhaseResult("discovery", True, [str(spec_index)], [], retries)

            errors.append(f"Attempt {attempt + 1}: {output}")
            self.task_logger.log(
                f"Discovery attempt {attempt + 1} failed",
                LogEntryType.ERROR,
                LogPhase.PLANNING,
            )
            self.ui.print_status(
                f"Attempt {attempt + 1} failed: {output[:200]}", "error"
            )

        return PhaseResult("discovery", False, [], errors, retries)

    async def phase_context(self) -> PhaseResult:
        """Discover relevant files for the task."""
        context_file = self.spec_dir / "context.json"

        if context_file.exists():
            self.ui.print_status("context.json already exists", "success")
            return PhaseResult("context", True, [str(context_file)], [], 0)

        # Load requirements for task description
        task = self.task_description
        services = []

        req = requirements.load_requirements(self.spec_dir)
        if req:
            task = req.get("task_description", task)
            services = req.get("services_involved", [])

        errors = []
        for attempt in range(MAX_RETRIES):
            self.ui.print_status(
                f"Running context discovery (attempt {attempt + 1})...", "progress"
            )

            success, output = context.run_context_discovery(
                self.project_dir,
                self.spec_dir,
                task or "unknown task",
                services,
            )

            if success:
                stats = context.get_context_stats(self.spec_dir)
                if stats:
                    self.task_logger.log(
                        f"Found {stats.get('files_to_modify', 0)} files to modify, "
                        f"{stats.get('files_to_reference', 0)} files to reference",
                        LogEntryType.SUCCESS,
                        LogPhase.PLANNING,
                    )
                self.ui.print_status("Created context.json", "success")
                return PhaseResult("context", True, [str(context_file)], [], attempt)

            errors.append(f"Attempt {attempt + 1}: {output}")
            self.ui.print_status(f"Attempt {attempt + 1} failed", "error")

        # Create minimal context if script fails
        context.create_minimal_context(self.spec_dir, task or "unknown task", services)
        self.ui.print_status("Created minimal context.json (script failed)", "success")
        return PhaseResult("context", True, [str(context_file)], errors, MAX_RETRIES)
