"""
Phase Executor
==============

Main class that executes individual phases of spec creation.
Combines all phase implementation mixins.
"""

from collections.abc import Callable
from pathlib import Path

from .discovery_phases import DiscoveryPhaseMixin
from .planning_phases import PlanningPhaseMixin
from .requirements_phases import RequirementsPhaseMixin
from .spec_phases import SpecPhaseMixin
from .utils import run_script


class PhaseExecutor(
    DiscoveryPhaseMixin,
    RequirementsPhaseMixin,
    SpecPhaseMixin,
    PlanningPhaseMixin,
):
    """
    Executes individual phases of spec creation.

    This class combines multiple mixins, each handling a specific category of phases:
    - DiscoveryPhaseMixin: Discovery and context gathering phases
    - RequirementsPhaseMixin: Requirements, historical context, and research phases
    - SpecPhaseMixin: Spec writing and self-critique phases
    - PlanningPhaseMixin: Implementation planning and validation phases
    """

    def __init__(
        self,
        project_dir: Path,
        spec_dir: Path,
        task_description: str,
        spec_validator,
        run_agent_fn: Callable,
        task_logger,
        ui_module,
    ):
        """
        Initialize the phase executor.

        Args:
            project_dir: Root directory of the project
            spec_dir: Directory for spec outputs
            task_description: Description of the task to implement
            spec_validator: Validator for spec files
            run_agent_fn: Async function to run agent with a prompt
            task_logger: Logger for task progress
            ui_module: UI module for status messages
        """
        self.project_dir = project_dir
        self.spec_dir = spec_dir
        self.task_description = task_description
        self.spec_validator = spec_validator
        self.run_agent_fn = run_agent_fn
        self.task_logger = task_logger
        self.ui = ui_module

    def _run_script(self, script: str, args: list[str]) -> tuple[bool, str]:
        """
        Run a Python script and return (success, output).

        Args:
            script: Name of the script to run
            args: Command-line arguments for the script

        Returns:
            Tuple of (success: bool, output: str)
        """
        return run_script(self.project_dir, script, args)
