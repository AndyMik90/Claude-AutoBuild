"""
Story Converter

Converts BMAD stories/epics to Auto-Claude implementation plan format.
This bridges the gap between BMAD's user story format and Auto-Claude's subtask system.
"""

import json
import re
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class BMADStory:
    """Represents a BMAD user story."""

    id: str
    title: str
    description: str
    acceptance_criteria: list[str] = field(default_factory=list)
    priority: str = "medium"
    story_points: int | None = None
    epic: str | None = None
    dependencies: list[str] = field(default_factory=list)


@dataclass
class AutoClaudeSubtask:
    """Represents an Auto-Claude subtask."""

    id: str
    title: str
    description: str
    status: str = "pending"
    acceptance_criteria: list[str] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)
    estimated_complexity: str = "medium"
    files_to_modify: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "acceptance_criteria": self.acceptance_criteria,
            "dependencies": self.dependencies,
            "estimated_complexity": self.estimated_complexity,
            "files_to_modify": self.files_to_modify,
            "notes": self.notes,
        }


@dataclass
class ImplementationPlan:
    """Auto-Claude implementation plan format."""

    spec_id: str
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    status: str = "pending"
    subtasks: list[AutoClaudeSubtask] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "spec_id": self.spec_id,
            "created_at": self.created_at,
            "status": self.status,
            "subtasks": [s.to_dict() for s in self.subtasks],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent)


class StoryConverter:
    """Convert BMAD stories to Auto-Claude implementation plan format."""

    def __init__(self):
        self.complexity_mapping = {
            1: "trivial",
            2: "simple",
            3: "medium",
            5: "complex",
            8: "complex",
            13: "very_complex",
        }

    def convert_story(self, story: BMADStory) -> AutoClaudeSubtask:
        """
        Convert a single BMAD story to an Auto-Claude subtask.

        Args:
            story: BMAD story to convert

        Returns:
            Equivalent Auto-Claude subtask
        """
        # Determine complexity from story points
        complexity = "medium"
        if story.story_points:
            for points, comp in sorted(self.complexity_mapping.items()):
                if story.story_points <= points:
                    complexity = comp
                    break

        return AutoClaudeSubtask(
            id=self._normalize_id(story.id),
            title=story.title,
            description=story.description,
            acceptance_criteria=story.acceptance_criteria,
            dependencies=[self._normalize_id(d) for d in story.dependencies],
            estimated_complexity=complexity,
        )

    def convert_stories(
        self, stories: list[BMADStory], spec_id: str
    ) -> ImplementationPlan:
        """
        Convert multiple BMAD stories to an implementation plan.

        Args:
            stories: List of BMAD stories
            spec_id: Spec ID for the implementation plan

        Returns:
            Auto-Claude implementation plan
        """
        subtasks = [self.convert_story(s) for s in stories]

        return ImplementationPlan(
            spec_id=spec_id,
            subtasks=subtasks,
        )

    def convert_blueprint_to_plan(self, blueprint) -> ImplementationPlan:
        """
        Convert a Blueprint to an implementation plan.

        This allows running blueprints through Auto-Claude's standard
        implementation pipeline.

        Args:
            blueprint: Blueprint object

        Returns:
            Implementation plan with subtasks for each component
        """
        subtasks = []

        for component in blueprint.components:
            subtask = AutoClaudeSubtask(
                id=component.id,
                title=component.name,
                description=component.description,
                acceptance_criteria=[
                    ac.description for ac in component.acceptance_criteria
                ],
                dependencies=component.dependencies,
                files_to_modify=component.files,
                status=component.status.value
                if hasattr(component.status, "value")
                else str(component.status),
            )
            subtasks.append(subtask)

        return ImplementationPlan(
            spec_id=blueprint.spec_id or "blueprint",
            subtasks=subtasks,
        )

    def _normalize_id(self, id_str: str) -> str:
        """Normalize ID format for consistency."""
        # Remove common prefixes
        id_str = re.sub(r"^(story|task|epic|feature)[-_]", "", id_str, flags=re.I)

        # Convert to subtask format if needed
        if not id_str.startswith("subtask-"):
            return f"subtask-{id_str}"

        return id_str

    def parse_story_from_markdown(self, markdown: str) -> BMADStory:
        """
        Parse a BMAD story from markdown format.

        Expected format:
        # Story Title
        **ID:** STORY-001
        **Priority:** High
        **Story Points:** 5

        ## Description
        As a user, I want...

        ## Acceptance Criteria
        - Criterion 1
        - Criterion 2
        """
        lines = markdown.strip().split("\n")

        story = BMADStory(
            id="",
            title="",
            description="",
        )

        current_section = None
        description_lines = []
        criteria_lines = []

        for line in lines:
            line = line.strip()

            # Title
            if line.startswith("# "):
                story.title = line[2:]
                continue

            # Metadata
            if line.startswith("**ID:**"):
                story.id = line.replace("**ID:**", "").strip()
                continue
            if line.startswith("**Priority:**"):
                story.priority = line.replace("**Priority:**", "").strip().lower()
                continue
            if line.startswith("**Story Points:**"):
                try:
                    story.story_points = int(
                        line.replace("**Story Points:**", "").strip()
                    )
                except ValueError:
                    pass
                continue

            # Sections
            if line.startswith("## Description"):
                current_section = "description"
                continue
            if line.startswith("## Acceptance Criteria"):
                current_section = "criteria"
                continue
            if line.startswith("## "):
                current_section = None
                continue

            # Content
            if current_section == "description" and line:
                description_lines.append(line)
            elif current_section == "criteria" and line.startswith("- "):
                criteria_lines.append(line[2:])

        story.description = "\n".join(description_lines)
        story.acceptance_criteria = criteria_lines

        return story
