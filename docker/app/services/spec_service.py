"""Spec management service for Auto-Claude Docker Web UI."""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from config import Settings
from models import Project, Spec, SpecStatus


class SpecService:
    """Service for managing specs within projects."""

    def __init__(self, settings: Settings):
        self.settings = settings

    def _get_specs_dir(self, project: Project) -> Path:
        """Get the specs directory for a project."""
        return Path(project.path) / ".auto-claude" / "specs"

    def _parse_spec_id(self, spec_dir_name: str) -> tuple[str, str]:
        """Parse spec directory name into ID and name."""
        # Format: 001-feature-name or just feature-name
        match = re.match(r"^(\d+)-(.+)$", spec_dir_name)
        if match:
            return match.group(1), match.group(2)
        return spec_dir_name, spec_dir_name

    async def list_specs(self, project: Project) -> list[Spec]:
        """List all specs for a project."""
        specs_dir = self._get_specs_dir(project)

        if not specs_dir.exists():
            return []

        specs = []
        for spec_path in sorted(specs_dir.iterdir()):
            if spec_path.is_dir():
                spec_id, spec_name = self._parse_spec_id(spec_path.name)

                # Determine status based on files present
                status = SpecStatus.DRAFT
                if (spec_path / "spec.md").exists():
                    status = SpecStatus.READY
                if (spec_path / "implementation_plan.json").exists():
                    # Check if build is in progress or completed based on subtask statuses
                    try:
                        plan_data = json.loads(
                            (spec_path / "implementation_plan.json").read_text()
                        )
                        # Collect all subtask statuses from phases
                        subtask_statuses = []
                        for phase in plan_data.get("phases", []):
                            for subtask in phase.get("subtasks", []):
                                subtask_statuses.append(subtask.get("status", "pending"))

                        if subtask_statuses:
                            all_completed = all(s == "completed" for s in subtask_statuses)
                            any_in_progress = any(s == "in_progress" for s in subtask_statuses)
                            any_failed = any(s == "failed" for s in subtask_statuses)

                            if all_completed or any_failed:
                                status = SpecStatus.COMPLETED
                            elif any_in_progress:
                                status = SpecStatus.BUILDING
                    except (json.JSONDecodeError, Exception):
                        pass
                if (spec_path / "qa_report.md").exists():
                    status = SpecStatus.COMPLETED

                # Check for worktree (indicates it was merged or discarded)
                worktrees_dir = Path(project.path) / ".worktrees" / spec_path.name
                if not worktrees_dir.exists() and status == SpecStatus.COMPLETED:
                    status = SpecStatus.MERGED

                specs.append(
                    Spec(
                        id=spec_path.name,
                        name=spec_name.replace("-", " ").title(),
                        project_id=str(project.id),
                        status=status,
                        has_implementation_plan=(
                            spec_path / "implementation_plan.json"
                        ).exists(),
                        has_qa_report=(spec_path / "qa_report.md").exists(),
                    )
                )

        return specs

    async def get_spec(self, project: Project, spec_id: str) -> Optional[Spec]:
        """Get a spec by ID."""
        specs = await self.list_specs(project)
        for spec in specs:
            if spec.id == spec_id:
                return spec
        return None

    async def get_spec_content(
        self,
        project: Project,
        spec_id: str,
    ) -> Optional[str]:
        """Get the spec.md content."""
        spec_path = self._get_specs_dir(project) / spec_id / "spec.md"
        if spec_path.exists():
            return spec_path.read_text()
        return None

    async def get_implementation_plan(
        self,
        project: Project,
        spec_id: str,
    ) -> Optional[dict]:
        """Get the implementation plan."""
        plan_path = (
            self._get_specs_dir(project) / spec_id / "implementation_plan.json"
        )
        if plan_path.exists():
            try:
                return json.loads(plan_path.read_text())
            except json.JSONDecodeError:
                return None
        return None

    async def get_qa_report(
        self,
        project: Project,
        spec_id: str,
    ) -> Optional[str]:
        """Get the QA report."""
        qa_path = self._get_specs_dir(project) / spec_id / "qa_report.md"
        if qa_path.exists():
            return qa_path.read_text()
        return None

    async def get_next_spec_number(self, project: Project) -> int:
        """Get the next spec number."""
        specs = await self.list_specs(project)
        max_num = 0
        for spec in specs:
            match = re.match(r"^(\d+)-", spec.id)
            if match:
                num = int(match.group(1))
                max_num = max(max_num, num)
        return max_num + 1
