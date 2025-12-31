"""
BMAD Workflow Loader

Loads and maps BMAD workflows for use with Auto-Claude blueprint execution.
BMAD workflows provide structured processes for each development phase.
"""

import os
from pathlib import Path

import yaml

# Default BMAD installation paths
DEFAULT_BMAD_PATHS = [
    Path.home() / "Desktop" / "BMAD-METHOD",
    Path.home() / "BMAD-METHOD",
    Path("/usr/local/share/bmad-method"),
]


class BMADWorkflowLoader:
    """Load and map BMAD workflows for Auto-Claude use."""

    # BMAD workflow phases and their directories
    WORKFLOW_PHASES = {
        "analysis": "1-analysis",
        "planning": "2-plan-workflows",
        "solutioning": "3-solutioning",
        "implementation": "4-implementation",
        "quick_flow": "bmad-quick-flow",
        "documentation": "document-project",
        "testing": "testarch",
    }

    # Mapping Auto-Claude phases to BMAD workflow phases
    PHASE_MAPPING = {
        # Discovery & Requirements -> Analysis
        "spec_creation": ["analysis"],
        "requirements": ["analysis"],
        "discovery": ["analysis"],
        # Planning & Design -> Plan workflows
        "planning": ["planning", "solutioning"],
        "design": ["planning"],
        "prd": ["planning"],
        "ux_design": ["planning"],
        # Architecture -> Solutioning
        "architecture": ["solutioning"],
        "tech_spec": ["solutioning"],
        # Implementation
        "implementation": ["implementation"],
        "coding": ["implementation"],
        "development": ["implementation"],
        "quick_flow": ["quick_flow"],
        # Documentation
        "documentation": ["documentation"],
        "docs": ["documentation"],
        # Testing
        "testing": ["testing"],
        "qa": ["testing"],
        "verification": ["testing"],
    }

    def __init__(self, bmad_path: Path | None = None):
        """
        Initialize the workflow loader.

        Args:
            bmad_path: Path to BMAD-METHOD installation.
                       If not provided, searches default locations.
        """
        self.bmad_path = self._find_bmad_path(bmad_path)
        self.workflows_path = self._get_workflows_path()

    def _find_bmad_path(self, custom_path: Path | None) -> Path | None:
        """Find BMAD installation path."""
        if custom_path:
            if custom_path.exists():
                return custom_path
            return None

        # Check environment variable
        env_path = os.environ.get("BMAD_PATH")
        if env_path and Path(env_path).exists():
            return Path(env_path)

        # Check default paths
        for path in DEFAULT_BMAD_PATHS:
            if path.exists():
                return path

        return None

    def _get_workflows_path(self) -> Path | None:
        """Get the path to BMAD workflows directory."""
        if not self.bmad_path:
            return None

        workflows_path = self.bmad_path / "src" / "modules" / "bmm" / "workflows"
        if workflows_path.exists():
            return workflows_path

        # Try alternative structure
        workflows_path = self.bmad_path / "workflows"
        if workflows_path.exists():
            return workflows_path

        return None

    def is_available(self) -> bool:
        """Check if BMAD workflows are available."""
        return self.workflows_path is not None

    def list_workflow_phases(self) -> list[str]:
        """List available workflow phases."""
        if not self.workflows_path:
            return []

        phases = []
        for phase_name, dir_name in self.WORKFLOW_PHASES.items():
            phase_path = self.workflows_path / dir_name
            if phase_path.exists():
                phases.append(phase_name)

        return phases

    def list_workflows(self, phase: str = None) -> list[dict]:
        """
        List available workflows, optionally filtered by phase.

        Args:
            phase: Optional phase to filter by

        Returns:
            List of workflow info dictionaries
        """
        if not self.workflows_path:
            return []

        workflows = []

        # Determine which phases to scan
        phases_to_scan = {}
        if phase:
            bmad_phases = self.PHASE_MAPPING.get(phase.lower(), [phase.lower()])
            for bp in bmad_phases:
                if bp in self.WORKFLOW_PHASES:
                    phases_to_scan[bp] = self.WORKFLOW_PHASES[bp]
        else:
            phases_to_scan = self.WORKFLOW_PHASES

        for phase_name, dir_name in phases_to_scan.items():
            phase_path = self.workflows_path / dir_name
            if not phase_path.exists():
                continue

            # Find workflow.yaml files in subdirectories
            for workflow_dir in phase_path.iterdir():
                if workflow_dir.is_dir():
                    workflow_file = workflow_dir / "workflow.yaml"
                    if workflow_file.exists():
                        workflow_data = self._load_workflow(workflow_file)
                        if workflow_data:
                            workflows.append(
                                {
                                    "phase": phase_name,
                                    "name": workflow_data.get(
                                        "name", workflow_dir.name
                                    ),
                                    "description": workflow_data.get("description", ""),
                                    "path": str(workflow_file),
                                    "data": workflow_data,
                                }
                            )

        return workflows

    def _load_workflow(self, workflow_path: Path) -> dict | None:
        """Load a workflow YAML file."""
        try:
            with open(workflow_path, encoding="utf-8") as f:
                return yaml.safe_load(f)
        except (yaml.YAMLError, OSError, IOError):
            return None

    def get_workflow(self, name: str) -> dict | None:
        """
        Get a specific workflow by name.

        Args:
            name: Workflow name

        Returns:
            Workflow data or None
        """
        all_workflows = self.list_workflows()
        for wf in all_workflows:
            if wf["name"] == name:
                return wf
        return None

    def get_workflows_for_phase(self, phase: str) -> list[dict]:
        """
        Get all workflows applicable to an Auto-Claude phase.

        Args:
            phase: Auto-Claude phase name

        Returns:
            List of applicable workflows
        """
        return self.list_workflows(phase)

    def get_workflow_instructions(self, workflow_path: str) -> str:
        """
        Load workflow instructions markdown.

        Args:
            workflow_path: Path to workflow.yaml

        Returns:
            Instructions markdown content
        """
        workflow_data = self._load_workflow(Path(workflow_path))
        if not workflow_data:
            return ""

        # Try to load instructions file
        installed_path = workflow_data.get("installed_path", "")
        if installed_path:
            # Resolve the path (replace placeholders)
            installed_path = installed_path.replace(
                "{project-root}", str(self.bmad_path)
            )
            instructions_file = Path(installed_path) / "instructions.md"
            if instructions_file.exists():
                return instructions_file.read_text()

        # Try direct instructions reference
        instructions_ref = workflow_data.get("instructions", "")
        if instructions_ref:
            instructions_ref = instructions_ref.replace(
                "{project-root}", str(self.bmad_path)
            )
            instructions_ref = instructions_ref.replace(
                "{installed_path}", installed_path
            )
            instructions_path = Path(instructions_ref)
            if instructions_path.exists():
                return instructions_path.read_text()

        return ""

    def get_phase_context(self, phase: str) -> str:
        """
        Get combined context for a phase from all applicable workflows.

        Args:
            phase: Auto-Claude phase name

        Returns:
            Combined workflow context as a prompt string
        """
        workflows = self.get_workflows_for_phase(phase)
        if not workflows:
            return ""

        parts = [f"# BMAD Workflows for {phase.title()} Phase\n"]

        for wf in workflows:
            parts.append(f"\n## {wf['name']}")
            if wf["description"]:
                parts.append(f"\n{wf['description']}\n")

            instructions = self.get_workflow_instructions(wf["path"])
            if instructions:
                parts.append(
                    f"\n### Instructions\n{instructions[:2000]}..."
                )  # Limit size

        return "\n".join(parts)


# Mapping of BMAD workflow status phases
WORKFLOW_STATUS_MAPPING = {
    "pending": "not_started",
    "in_progress": "in_progress",
    "verifying": "verification",
    "verified": "completed",
    "failed": "blocked",
    "blocked": "blocked",
}
