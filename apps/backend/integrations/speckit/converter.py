"""
Spec-Kit to Auto-Claude Converter
=================================

Converts spec-kit format (spec.md, plan.md, tasks.md) to
Auto-Claude format (spec.md, requirements.json, context.json, implementation_plan.json).
"""

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from .config import SpecKitConfig


@dataclass
class SpecKitSpec:
    """Parsed spec-kit specification."""

    spec_id: str
    name: str
    domain: str
    spec_content: str
    plan_content: Optional[str] = None
    tasks_content: Optional[str] = None
    additional_files: dict[str, str] = field(default_factory=dict)

    # Extracted metadata
    overview: str = ""
    workflow_type: str = "feature"
    services: list[str] = field(default_factory=list)
    acceptance_criteria: list[str] = field(default_factory=list)
    tasks: list[dict] = field(default_factory=list)


@dataclass
class AutoClaudeSpec:
    """Auto-Claude specification format."""

    spec_md: str
    requirements_json: dict
    context_json: dict
    implementation_plan_json: Optional[dict] = None


class SpecKitConverter:
    """Converts between spec-kit and Auto-Claude formats."""

    def __init__(self, config: Optional[SpecKitConfig] = None):
        self.config = config or SpecKitConfig()

    def load_speckit_spec(self, spec_dir: Path) -> SpecKitSpec:
        """Load a spec-kit specification from a directory."""
        # Parse spec ID and name from directory
        dir_name = spec_dir.name
        match = re.match(r"(\d{3})-(.+)", dir_name)
        if match:
            spec_id = match.group(1)
            name = match.group(2).replace("-", " ").title()
        else:
            spec_id = "000"
            name = dir_name.replace("-", " ").title()

        # Determine domain from path
        domain = self._determine_domain(spec_dir)

        # Load spec files
        spec_file = spec_dir / self.config.spec_file
        plan_file = spec_dir / self.config.plan_file
        tasks_file = spec_dir / self.config.tasks_file

        spec_content = spec_file.read_text() if spec_file.exists() else ""
        plan_content = plan_file.read_text() if plan_file.exists() else None
        tasks_content = tasks_file.read_text() if tasks_file.exists() else None

        # Load additional files
        additional_files = {}
        for filename in self.config.additional_files:
            file_path = spec_dir / filename
            if file_path.exists():
                additional_files[filename] = file_path.read_text()

        # Create spec object
        spec = SpecKitSpec(
            spec_id=spec_id,
            name=name,
            domain=domain,
            spec_content=spec_content,
            plan_content=plan_content,
            tasks_content=tasks_content,
            additional_files=additional_files,
        )

        # Parse content to extract metadata
        self._parse_spec_content(spec)
        if tasks_content:
            self._parse_tasks_content(spec)

        return spec

    def convert_to_auto_claude(self, speckit_spec: SpecKitSpec) -> AutoClaudeSpec:
        """Convert spec-kit spec to Auto-Claude format."""
        # Build requirements.json
        requirements = self._build_requirements(speckit_spec)

        # Build context.json (minimal, will be populated by Auto-Claude agents)
        context = self._build_context(speckit_spec)

        # Build implementation_plan.json if tasks exist
        impl_plan = None
        if speckit_spec.tasks and self.config.convert_tasks_to_subtasks:
            impl_plan = self._build_implementation_plan(speckit_spec)

        # Adapt spec.md for Auto-Claude format
        spec_md = self._adapt_spec_md(speckit_spec)

        return AutoClaudeSpec(
            spec_md=spec_md,
            requirements_json=requirements,
            context_json=context,
            implementation_plan_json=impl_plan,
        )

    def write_auto_claude_spec(
        self, auto_claude_spec: AutoClaudeSpec, output_dir: Path
    ) -> None:
        """Write Auto-Claude spec files to directory."""
        output_dir.mkdir(parents=True, exist_ok=True)

        # Write spec.md
        (output_dir / "spec.md").write_text(auto_claude_spec.spec_md)

        # Write requirements.json
        (output_dir / "requirements.json").write_text(
            json.dumps(auto_claude_spec.requirements_json, indent=2)
        )

        # Write context.json
        (output_dir / "context.json").write_text(
            json.dumps(auto_claude_spec.context_json, indent=2)
        )

        # Write implementation_plan.json if present
        if auto_claude_spec.implementation_plan_json:
            (output_dir / "implementation_plan.json").write_text(
                json.dumps(auto_claude_spec.implementation_plan_json, indent=2)
            )

    def _determine_domain(self, spec_dir: Path) -> str:
        """Determine domain from spec directory path."""
        parts = spec_dir.parts

        # Look for platform or applets in path
        if "platform" in parts:
            return "platform"
        elif "applets" in parts:
            # Find domain after applets
            try:
                idx = parts.index("applets")
                if idx + 1 < len(parts):
                    return parts[idx + 1]
            except ValueError:
                pass

        # Try to determine from spec ID
        try:
            spec_id = int(re.match(r"(\d{3})", spec_dir.name).group(1))
            return self.config.numbering.get_domain(spec_id)
        except (AttributeError, ValueError):
            pass

        return "unknown"

    def _parse_spec_content(self, spec: SpecKitSpec) -> None:
        """Parse spec.md content to extract metadata."""
        content = spec.spec_content

        # Extract overview (first paragraph after title)
        overview_match = re.search(
            r"^#[^#\n]+\n+(.+?)(?=\n##|\n\n##|\Z)", content, re.MULTILINE | re.DOTALL
        )
        if overview_match:
            spec.overview = overview_match.group(1).strip()

        # Extract workflow type
        workflow_match = re.search(
            r"\*\*Type\*\*:\s*(\w+)", content, re.IGNORECASE
        )
        if workflow_match:
            spec.workflow_type = workflow_match.group(1).lower()

        # Extract acceptance criteria
        criteria = []
        criteria_section = re.search(
            r"(?:Success Criteria|Acceptance Criteria)[^\n]*\n(.*?)(?=\n##|\Z)",
            content,
            re.IGNORECASE | re.DOTALL,
        )
        if criteria_section:
            # Extract bullet points or checkboxes
            for line in criteria_section.group(1).split("\n"):
                line = line.strip()
                if line.startswith(("-", "*", "[ ]", "[x]")):
                    # Clean up the line
                    cleaned = re.sub(r"^[-*\[\]x\s]+", "", line).strip()
                    if cleaned:
                        criteria.append(cleaned)

        spec.acceptance_criteria = criteria

    def _parse_tasks_content(self, spec: SpecKitSpec) -> None:
        """Parse tasks.md content to extract tasks."""
        if not spec.tasks_content:
            return

        tasks = []
        current_task = None

        for line in spec.tasks_content.split("\n"):
            line = line.strip()

            # Check for task header (## or ### with checkbox)
            task_match = re.match(r"^#{2,3}\s*\[([x\s])\]\s*(.+)", line, re.IGNORECASE)
            if task_match:
                if current_task:
                    tasks.append(current_task)

                status = "completed" if task_match.group(1).lower() == "x" else "pending"
                current_task = {
                    "name": task_match.group(2).strip(),
                    "status": status,
                    "subtasks": [],
                }
                continue

            # Check for subtask (- [ ] or - [x])
            subtask_match = re.match(r"^-\s*\[([x\s])\]\s*(.+)", line, re.IGNORECASE)
            if subtask_match and current_task:
                status = "completed" if subtask_match.group(1).lower() == "x" else "pending"
                current_task["subtasks"].append(
                    {
                        "name": subtask_match.group(2).strip(),
                        "status": status,
                    }
                )

        if current_task:
            tasks.append(current_task)

        spec.tasks = tasks

    def _build_requirements(self, spec: SpecKitSpec) -> dict:
        """Build Auto-Claude requirements.json from spec-kit spec."""
        return {
            "task_description": spec.overview or f"Implement {spec.name}",
            "workflow_type": spec.workflow_type,
            "services": spec.services or ["backend"],
            "acceptance_criteria": spec.acceptance_criteria,
            "source": {
                "type": "spec-kit",
                "spec_id": spec.spec_id,
                "domain": spec.domain,
                "name": spec.name,
            },
        }

    def _build_context(self, spec: SpecKitSpec) -> dict:
        """Build Auto-Claude context.json from spec-kit spec."""
        return {
            "files_to_modify": {},
            "files_to_reference": [],
            "patterns": {},
            "speckit_metadata": {
                "domain": spec.domain,
                "spec_id": spec.spec_id,
                "has_plan": spec.plan_content is not None,
                "has_tasks": spec.tasks_content is not None,
                "additional_files": list(spec.additional_files.keys()),
            },
        }

    def _build_implementation_plan(self, spec: SpecKitSpec) -> dict:
        """Build Auto-Claude implementation_plan.json from spec-kit tasks."""
        subtasks = []

        for idx, task in enumerate(spec.tasks, start=1):
            # Create main subtask
            subtask = {
                "id": idx,
                "name": task["name"],
                "status": task["status"],
                "service": "backend",  # Default, can be overridden
                "dependencies": [],
            }

            # If task has subtasks, add them as separate entries
            if task.get("subtasks"):
                for sub_idx, sub in enumerate(task["subtasks"], start=1):
                    subtasks.append(
                        {
                            "id": f"{idx}.{sub_idx}",
                            "name": sub["name"],
                            "status": sub["status"],
                            "service": "backend",
                            "dependencies": [idx] if sub_idx == 1 else [f"{idx}.{sub_idx - 1}"],
                            "parent_task": idx,
                        }
                    )
            else:
                subtasks.append(subtask)

        return {
            "spec_name": f"{spec.spec_id}-{spec.name.lower().replace(' ', '-')}",
            "total_subtasks": len(subtasks),
            "completed_subtasks": len([s for s in subtasks if s["status"] == "completed"]),
            "current_subtask": next(
                (s["id"] for s in subtasks if s["status"] == "pending"), None
            ),
            "subtasks": subtasks,
            "source": "spec-kit",
        }

    def _adapt_spec_md(self, spec: SpecKitSpec) -> str:
        """Adapt spec.md for Auto-Claude format."""
        content = spec.spec_content

        # Add Auto-Claude metadata header if not present
        if not content.startswith("# Specification:"):
            # Try to get title from content
            title_match = re.match(r"^#\s*(.+)", content)
            title = title_match.group(1) if title_match else spec.name

            # Add standard Auto-Claude header
            header = f"# Specification: {title}\n\n"
            header += f"**Source**: spec-kit ({spec.domain}/{spec.spec_id})\n\n"

            # Insert after first title or at beginning
            if title_match:
                content = re.sub(r"^#\s*.+\n", header, content, count=1)
            else:
                content = header + content

        # Ensure required sections exist
        required_sections = [
            "## Overview",
            "## Workflow Type",
            "## Task Scope",
            "## Success Criteria",
        ]

        for section in required_sections:
            if section.lower() not in content.lower():
                # Try to map from common spec-kit sections
                mappings = {
                    "## Overview": ["## Summary", "## Description", "## Introduction"],
                    "## Workflow Type": ["## Type"],
                    "## Task Scope": ["## Scope", "## Requirements"],
                    "## Success Criteria": ["## Acceptance Criteria", "## Criteria", "## Done When"],
                }

                found = False
                for alt in mappings.get(section, []):
                    if alt.lower() in content.lower():
                        content = re.sub(
                            re.escape(alt), section, content, flags=re.IGNORECASE
                        )
                        found = True
                        break

                if not found:
                    # Add empty section at end
                    content += f"\n\n{section}\n\n[To be filled by Auto-Claude agents]\n"

        return content
