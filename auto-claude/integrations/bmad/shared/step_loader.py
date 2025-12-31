"""
Step File Loader - JIT (Just-In-Time) loading of BMAD workflow steps.

Key features:
- Lazy loading: Steps loaded only when needed
- Token-aware: Tracks token consumption per step
- Caching: Parsed steps cached for reuse
- Path resolution: Handles BMAD path references

Based on BMAD Full Integration Product Brief ADR-001.
"""

import re
from collections import OrderedDict
from collections.abc import Iterator
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any

from .cache import DiskLRUCache
from .token_budget import TokenBudget, TokenCategory, estimate_tokens


class BoundedLRUDict(OrderedDict):
    """OrderedDict with a maximum size that evicts oldest entries."""

    def __init__(self, maxsize: int = 100, *args, **kwargs):
        self.maxsize = maxsize
        super().__init__(*args, **kwargs)

    def __setitem__(self, key, value):
        if key in self:
            self.move_to_end(key)
        super().__setitem__(key, value)
        while len(self) > self.maxsize:
            oldest = next(iter(self))
            del self[oldest]


class StepFormat(Enum):
    """Supported step file formats."""

    MARKDOWN = "md"
    XML = "xml"
    YAML = "yaml"


@dataclass
class StepContent:
    """Parsed content of a step file."""

    step_number: int
    goal: str
    actions: list[str]
    checks: list[dict[str, Any]]
    outputs: list[str]
    critical_notes: list[str]
    raw_content: str
    source_path: Path
    token_count: int = 0
    format: StepFormat = StepFormat.MARKDOWN

    @property
    def is_loaded(self) -> bool:
        return bool(self.raw_content)


@dataclass
class StepReference:
    """Reference to a step within a workflow (not yet loaded)."""

    step_number: int
    file_path: Path
    is_loaded: bool = False
    content: StepContent | None = None


class StepFileLoader:
    """
    JIT loader for BMAD workflow step files.

    Steps are referenced but not loaded until explicitly requested.
    This keeps token usage minimal until content is actually needed.
    """

    # Pattern for extracting step definitions from workflow YAML
    STEP_PATTERN = re.compile(
        r'<step\s+n="(\d+)"[^>]*goal="([^"]*)"[^>]*>(.*?)</step>', re.DOTALL
    )

    # Pattern for action elements
    ACTION_PATTERN = re.compile(r"<action[^>]*>(.*?)</action>", re.DOTALL)

    # Pattern for check elements
    CHECK_PATTERN = re.compile(r'<check\s+if="([^"]*)">(.*?)</check>', re.DOTALL)

    # Pattern for critical notes
    CRITICAL_PATTERN = re.compile(r"<critical>(.*?)</critical>", re.DOTALL)

    # Pattern for output elements
    OUTPUT_PATTERN = re.compile(r"<output>(.*?)</output>", re.DOTALL)

    def __init__(
        self,
        bmad_root: Path,
        cache: DiskLRUCache | None = None,
        token_budget: TokenBudget | None = None,
    ):
        self.bmad_root = Path(bmad_root)
        self.cache = cache
        self.token_budget = token_budget
        # Bounded LRU dict to prevent unbounded memory growth
        self._loaded_steps: BoundedLRUDict = BoundedLRUDict(maxsize=100)

    def resolve_path(self, path_ref: str, workflow_path: Path | None = None) -> Path:
        """
        Resolve BMAD path references with security validation.

        Handles patterns like:
        - {project-root}/_bmad/...
        - {installed_path}/step-1.md
        - Relative paths from workflow location

        Security: Validates resolved path is within allowed directories
        to prevent path traversal attacks.
        """
        # Replace common BMAD placeholders
        path_str = path_ref

        # Handle {project-root} - maps to BMAD root
        path_str = path_str.replace("{project-root}", str(self.bmad_root))

        # Handle {installed_path} - relative to workflow
        if "{installed_path}" in path_str and workflow_path:
            installed_path = workflow_path.parent
            path_str = path_str.replace("{installed_path}", str(installed_path))

        # Convert to Path
        resolved = Path(path_str)

        # If not absolute, make relative to workflow or BMAD root
        if not resolved.is_absolute():
            if workflow_path:
                resolved = workflow_path.parent / resolved
            else:
                resolved = self.bmad_root / resolved

        resolved = resolved.resolve()

        # SECURITY: Validate resolved path is within allowed directories
        # Prevent path traversal attacks via malicious workflow references
        allowed_roots = [self.bmad_root.resolve()]
        if workflow_path:
            allowed_roots.append(workflow_path.parent.resolve())

        is_safe = False
        for allowed_root in allowed_roots:
            try:
                resolved.relative_to(allowed_root)
                is_safe = True
                break
            except ValueError:
                continue

        if not is_safe:
            raise ValueError(
                f"Security: Path traversal blocked. Resolved path '{resolved}' "
                f"is outside allowed directories."
            )

        return resolved

    def discover_steps(self, workflow_path: Path) -> list[StepReference]:
        """
        Discover all step references in a workflow without loading content.

        Returns list of StepReference objects that can be loaded on demand.
        """
        steps = []

        if not workflow_path.exists():
            return steps

        # Check for step files in workflow directory
        workflow_dir = workflow_path.parent

        # Look for numbered step files
        for step_file in sorted(workflow_dir.glob("step-*.md")):
            match = re.match(r"step-(\d+)", step_file.stem)
            if match:
                step_num = int(match.group(1))
                steps.append(
                    StepReference(
                        step_number=step_num, file_path=step_file, is_loaded=False
                    )
                )

        # Also check for instructions.md which might contain inline steps
        instructions = workflow_dir / "instructions.md"
        if instructions.exists():
            # Parse inline step count without loading full content
            content = instructions.read_text()
            inline_steps = self.STEP_PATTERN.findall(content)
            for step_match in inline_steps:
                step_num = int(step_match[0])
                # Only add if not already found as separate file
                if not any(s.step_number == step_num for s in steps):
                    steps.append(
                        StepReference(
                            step_number=step_num,
                            file_path=instructions,
                            is_loaded=False,
                        )
                    )

        return sorted(steps, key=lambda s: s.step_number)

    def load_step(
        self, step_ref: StepReference, force: bool = False
    ) -> StepContent | None:
        """
        Load a specific step's content (JIT loading).

        Checks cache first, then loads from disk.
        Tracks token usage via budget manager.
        """
        cache_key = f"step:{step_ref.file_path}:{step_ref.step_number}"

        # Check cache first
        if self.cache and not force:
            cached = self.cache.get(cache_key)
            if cached:
                step_ref.is_loaded = True
                step_ref.content = cached
                return cached

        # Load from disk
        if not step_ref.file_path.exists():
            return None

        raw_content = step_ref.file_path.read_text()
        token_count = estimate_tokens(raw_content)

        # Check token budget before loading
        if self.token_budget:
            if not self.token_budget.can_afford(
                TokenCategory.STEP_CONTENT, token_count
            ):
                # Over budget - return None or raise
                return None
            self.token_budget.consume(TokenCategory.STEP_CONTENT, token_count)

        # Parse the step content
        step_content = self._parse_step(
            raw_content, step_ref.step_number, step_ref.file_path
        )
        step_content.token_count = token_count

        # Cache the result
        if self.cache:
            self.cache.put(cache_key, step_content, source_path=step_ref.file_path)

        step_ref.is_loaded = True
        step_ref.content = step_content
        self._loaded_steps[cache_key] = step_content

        return step_content

    def load_steps_range(
        self, steps: list[StepReference], start: int, end: int
    ) -> list[StepContent]:
        """
        Load a range of steps (useful for lookahead planning).
        """
        loaded = []
        for step_ref in steps:
            if start <= step_ref.step_number <= end:
                content = self.load_step(step_ref)
                if content:
                    loaded.append(content)
        return loaded

    def load_next_step(
        self, steps: list[StepReference], current_step: int
    ) -> StepContent | None:
        """
        Load the next step after current (JIT for sequential execution).
        """
        for step_ref in steps:
            if step_ref.step_number == current_step + 1:
                return self.load_step(step_ref)
        return None

    def iter_steps(self, steps: list[StepReference]) -> Iterator[StepContent]:
        """
        Iterator that loads steps on demand.

        Use this for memory-efficient sequential processing.
        """
        for step_ref in sorted(steps, key=lambda s: s.step_number):
            content = self.load_step(step_ref)
            if content:
                yield content

    def _parse_step(
        self, content: str, step_number: int, source_path: Path
    ) -> StepContent:
        """
        Parse step content from Markdown/XML format.
        """
        # Determine format
        if "<step" in content:
            return self._parse_xml_step(content, step_number, source_path)
        else:
            return self._parse_markdown_step(content, step_number, source_path)

    def _parse_xml_step(
        self, content: str, step_number: int, source_path: Path
    ) -> StepContent:
        """Parse XML-formatted step."""
        goal = ""
        actions = []
        checks = []
        outputs = []
        critical_notes = []

        # Find the step block for this number
        step_matches = self.STEP_PATTERN.findall(content)
        for match in step_matches:
            if int(match[0]) == step_number:
                goal = match[1]
                step_content = match[2]

                # Extract actions
                actions = [a.strip() for a in self.ACTION_PATTERN.findall(step_content)]

                # Extract checks
                for check_match in self.CHECK_PATTERN.findall(step_content):
                    checks.append(
                        {"condition": check_match[0], "content": check_match[1].strip()}
                    )

                # Extract outputs
                outputs = [o.strip() for o in self.OUTPUT_PATTERN.findall(step_content)]

                # Extract critical notes
                critical_notes = [
                    c.strip() for c in self.CRITICAL_PATTERN.findall(step_content)
                ]

                break

        return StepContent(
            step_number=step_number,
            goal=goal,
            actions=actions,
            checks=checks,
            outputs=outputs,
            critical_notes=critical_notes,
            raw_content=content,
            source_path=source_path,
            format=StepFormat.XML,
        )

    def _parse_markdown_step(
        self, content: str, step_number: int, source_path: Path
    ) -> StepContent:
        """Parse Markdown-formatted step."""
        lines = content.split("\n")

        goal = ""
        actions = []
        checks = []
        outputs = []
        critical_notes = []

        current_section = None

        for line in lines:
            line = line.strip()

            # Detect section headers
            if line.startswith("## ") or line.startswith("# "):
                header = line.lstrip("#").strip().lower()
                if "goal" in header:
                    current_section = "goal"
                elif "action" in header:
                    current_section = "actions"
                elif "check" in header or "verification" in header:
                    current_section = "checks"
                elif "output" in header:
                    current_section = "outputs"
                elif "critical" in header or "important" in header:
                    current_section = "critical"
                continue

            # Parse content based on section
            if line.startswith("- ") or line.startswith("* "):
                item = line[2:].strip()
                if current_section == "goal":
                    goal = item
                elif current_section == "actions":
                    actions.append(item)
                elif current_section == "checks":
                    checks.append({"condition": "", "content": item})
                elif current_section == "outputs":
                    outputs.append(item)
                elif current_section == "critical":
                    critical_notes.append(item)
            elif line and current_section == "goal" and not goal:
                goal = line

        # If no structured sections, treat whole content as single action
        if not actions and not goal:
            goal = f"Step {step_number}"
            actions = [content.strip()]

        return StepContent(
            step_number=step_number,
            goal=goal,
            actions=actions,
            checks=checks,
            outputs=outputs,
            critical_notes=critical_notes,
            raw_content=content,
            source_path=source_path,
            format=StepFormat.MARKDOWN,
        )

    def unload_step(self, step_ref: StepReference) -> int:
        """
        Unload a step to free tokens.

        Returns tokens freed.
        """
        if not step_ref.is_loaded or not step_ref.content:
            return 0

        tokens_freed = step_ref.content.token_count

        # Release tokens
        if self.token_budget:
            self.token_budget.release(TokenCategory.STEP_CONTENT, tokens_freed)

        # Clear reference
        cache_key = f"step:{step_ref.file_path}:{step_ref.step_number}"
        self._loaded_steps.pop(cache_key, None)

        step_ref.is_loaded = False
        step_ref.content = None

        return tokens_freed

    def get_loaded_count(self) -> int:
        """Get count of currently loaded steps."""
        return len(self._loaded_steps)

    def get_loaded_tokens(self) -> int:
        """Get total tokens of loaded steps."""
        return sum(s.token_count for s in self._loaded_steps.values())
