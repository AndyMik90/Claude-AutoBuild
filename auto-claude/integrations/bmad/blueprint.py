"""
Blueprint Manager

Manages sequential component execution with verification gates.
This is the core data structure for the BMAD integration.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path

import yaml


class ComponentStatus(Enum):
    """Status of a blueprint component."""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    VERIFYING = "verifying"
    VERIFIED = "verified"
    FAILED = "failed"
    DONE = "done"


@dataclass
class AcceptanceCriterion:
    """An acceptance criterion for a component."""

    description: str
    verified: bool = False
    verified_at: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict:
        return {
            "description": self.description,
            "verified": self.verified,
            "verified_at": self.verified_at,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "AcceptanceCriterion":
        if isinstance(data, str):
            return cls(description=data)
        return cls(
            description=data.get("description", ""),
            verified=data.get("verified", False),
            verified_at=data.get("verified_at"),
            notes=data.get("notes"),
        )


@dataclass
class BlueprintComponent:
    """A component in the blueprint."""

    id: str
    name: str
    description: str
    status: ComponentStatus = ComponentStatus.PENDING
    files: list[str] = field(default_factory=list)
    acceptance_criteria: list[AcceptanceCriterion] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)
    started_at: str | None = None
    completed_at: str | None = None
    attempts: int = 0
    notes: list[str] = field(default_factory=list)
    implementation_notes: str | None = None
    key_decisions: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value
            if isinstance(self.status, ComponentStatus)
            else self.status,
            "files": self.files,
            "acceptance_criteria": [ac.to_dict() for ac in self.acceptance_criteria],
            "dependencies": self.dependencies,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "attempts": self.attempts,
            "notes": self.notes,
            "implementation_notes": self.implementation_notes,
            "key_decisions": self.key_decisions,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "BlueprintComponent":
        status_value = data.get("status", "pending")
        if isinstance(status_value, str):
            try:
                status = ComponentStatus(status_value)
            except ValueError:
                status = ComponentStatus.PENDING
        else:
            status = status_value

        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            description=data.get("description", ""),
            status=status,
            files=data.get("files", []),
            acceptance_criteria=[
                AcceptanceCriterion.from_dict(ac)
                for ac in data.get("acceptance_criteria", [])
            ],
            dependencies=data.get("dependencies", []),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            attempts=data.get("attempts", 0),
            notes=data.get("notes", []),
            implementation_notes=data.get("implementation_notes"),
            key_decisions=data.get("key_decisions", []),
        )

    def are_dependencies_met(self, completed_ids: set[str]) -> bool:
        """Check if all dependencies are completed."""
        return all(dep in completed_ids for dep in self.dependencies)


@dataclass
class Blueprint:
    """A blueprint containing multiple components to build sequentially."""

    name: str
    version: str
    description: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    created_by: str = "Auto-Claude"
    project_path: str | None = None
    spec_id: str | None = None
    strictness: str = "strict"
    components: list[BlueprintComponent] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "created_at": self.created_at,
            "created_by": self.created_by,
            "project_path": self.project_path,
            "spec_id": self.spec_id,
            "strictness": self.strictness,
            "components": [c.to_dict() for c in self.components],
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Blueprint":
        return cls(
            name=data.get("name", "Unnamed Blueprint"),
            version=data.get("version", "1.0.0"),
            description=data.get("description", ""),
            created_at=data.get("created_at", datetime.now().isoformat()),
            created_by=data.get("created_by", "Auto-Claude"),
            project_path=data.get("project_path"),
            spec_id=data.get("spec_id"),
            strictness=data.get("strictness", "strict"),
            components=[
                BlueprintComponent.from_dict(c) for c in data.get("components", [])
            ],
        )

    def get_completed_component_ids(self) -> set[str]:
        """Get IDs of all completed/verified components."""
        return {
            c.id
            for c in self.components
            if c.status in (ComponentStatus.VERIFIED, ComponentStatus.DONE)
        }

    def get_progress(self) -> dict:
        """Get progress statistics."""
        total = len(self.components)
        completed = sum(
            1
            for c in self.components
            if c.status in (ComponentStatus.VERIFIED, ComponentStatus.DONE)
        )
        in_progress = sum(
            1 for c in self.components if c.status == ComponentStatus.IN_PROGRESS
        )
        failed = sum(1 for c in self.components if c.status == ComponentStatus.FAILED)
        pending = sum(1 for c in self.components if c.status == ComponentStatus.PENDING)

        return {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "failed": failed,
            "pending": pending,
            "percent": round(completed / total * 100, 1) if total > 0 else 0,
        }


class BlueprintManager:
    """Manages sequential component execution with verification gates."""

    def __init__(self, blueprint_path: Path | str):
        self.path = Path(blueprint_path)
        self.blueprint = self._load()

    def _load(self) -> Blueprint:
        """Load blueprint from YAML file."""
        if not self.path.exists():
            raise FileNotFoundError(f"Blueprint not found: {self.path}")

        with open(self.path) as f:
            data = yaml.safe_load(f)

        # Handle both wrapped and unwrapped formats
        if "blueprint" in data:
            data = data["blueprint"]

        return Blueprint.from_dict(data)

    def save(self) -> None:
        """Save blueprint to file."""
        data = {"blueprint": self.blueprint.to_dict()}
        with open(self.path, "w") as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True)

    def get_next_pending(self) -> BlueprintComponent | None:
        """Get next component that's ready to work on (dependencies met)."""
        completed_ids = self.blueprint.get_completed_component_ids()

        for component in self.blueprint.components:
            if component.status == ComponentStatus.PENDING:
                if component.are_dependencies_met(completed_ids):
                    return component

        return None

    def update_status(
        self, component_id: str, status: ComponentStatus, notes: str | None = None
    ) -> bool:
        """Update component status and optionally add notes."""
        component = self.get_by_id(component_id)
        if not component:
            return False

        component.status = status

        # Update timestamps
        if status == ComponentStatus.IN_PROGRESS and not component.started_at:
            component.started_at = datetime.now().isoformat()
        elif status in (ComponentStatus.VERIFIED, ComponentStatus.DONE):
            component.completed_at = datetime.now().isoformat()

        # Add notes
        if notes:
            timestamp = datetime.now().isoformat()
            component.notes.append(f"[{timestamp}] {notes}")

        # Increment attempts on failures
        if status == ComponentStatus.FAILED:
            component.attempts += 1

        self.save()
        return True

    def get_by_id(self, component_id: str) -> BlueprintComponent | None:
        """Get component by ID."""
        for component in self.blueprint.components:
            if component.id == component_id:
                return component
        return None

    def get_by_name(self, name: str) -> BlueprintComponent | None:
        """Get component by name (case-insensitive partial match)."""
        name_lower = name.lower()
        for component in self.blueprint.components:
            if name_lower in component.name.lower():
                return component
        return None

    def get_all_pending(self) -> list[BlueprintComponent]:
        """Get all pending components."""
        return [
            c for c in self.blueprint.components if c.status == ComponentStatus.PENDING
        ]

    def get_all_failed(self) -> list[BlueprintComponent]:
        """Get all failed components."""
        return [
            c for c in self.blueprint.components if c.status == ComponentStatus.FAILED
        ]

    def is_complete(self) -> bool:
        """Check if all components are done."""
        return all(
            c.status in (ComponentStatus.VERIFIED, ComponentStatus.DONE)
            for c in self.blueprint.components
        )

    def get_progress(self) -> dict:
        """Get progress statistics."""
        return self.blueprint.get_progress()

    def add_note(self, component_id: str, note: str) -> bool:
        """Add a note to a component."""
        component = self.get_by_id(component_id)
        if not component:
            return False

        timestamp = datetime.now().isoformat()
        component.notes.append(f"[{timestamp}] {note}")
        self.save()
        return True

    def add_key_decision(self, component_id: str, decision: str) -> bool:
        """Add a key decision to a component."""
        component = self.get_by_id(component_id)
        if not component:
            return False

        component.key_decisions.append(decision)
        self.save()
        return True

    def mark_criterion_verified(
        self, component_id: str, criterion_index: int, notes: str | None = None
    ) -> bool:
        """Mark an acceptance criterion as verified."""
        component = self.get_by_id(component_id)
        if not component:
            return False

        if criterion_index >= len(component.acceptance_criteria):
            return False

        criterion = component.acceptance_criteria[criterion_index]
        criterion.verified = True
        criterion.verified_at = datetime.now().isoformat()
        if notes:
            criterion.notes = notes

        self.save()
        return True

    def reset_component(self, component_id: str) -> bool:
        """Reset a component to pending status."""
        component = self.get_by_id(component_id)
        if not component:
            return False

        component.status = ComponentStatus.PENDING
        component.notes.append(f"[{datetime.now().isoformat()}] Reset to pending")

        # Reset acceptance criteria
        for criterion in component.acceptance_criteria:
            criterion.verified = False
            criterion.verified_at = None
            criterion.notes = None

        self.save()
        return True
