"""
Workflow Parser - Dual format parser for BMAD workflows.

Supports two workflow formats:
1. YAML format (workflow.yaml) - Structured configuration
2. Markdown format (workflow.md) - Human-readable with XML-like tags

Extracts:
- Workflow metadata (name, description, author)
- Configuration references
- Step references (for JIT loading)
- Checkpoint handlers
- Agent assignments

Based on BMAD Full Integration Product Brief ADR-003.
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import yaml

from .cache import DiskLRUCache
from .token_budget import TokenBudget, TokenCategory, estimate_tokens


class WorkflowFormat(Enum):
    """Supported workflow file formats."""

    YAML = "yaml"
    MARKDOWN = "md"
    UNKNOWN = "unknown"


@dataclass
class CheckpointHandler:
    """Handler for workflow checkpoints (interactive decision points)."""

    key: str
    action: str
    target_workflow: str | None = None
    description: str | None = None


@dataclass
class WorkflowStep:
    """Step definition within a workflow."""

    number: int
    goal: str
    file_reference: str | None = None
    is_inline: bool = False
    inline_content: str | None = None


@dataclass
class ParsedWorkflow:
    """Complete parsed workflow with all metadata."""

    name: str
    description: str
    author: str
    module: str  # bmm, bmgd, cis, bmb
    phase: str  # 1-analysis, 4-implementation, etc.

    # Configuration
    config_source: str | None = None
    output_folder: str | None = None

    # Context
    project_context: str | None = None
    instructions_path: str | None = None
    checklist_path: str | None = None

    # Steps
    steps: list[WorkflowStep] = field(default_factory=list)
    total_steps: int = 0

    # Handlers
    checkpoint_handlers: list[CheckpointHandler] = field(default_factory=list)

    # Related workflows
    related_workflows: dict[str, str] = field(default_factory=dict)

    # Metadata
    source_path: Path | None = None
    format: WorkflowFormat = WorkflowFormat.UNKNOWN
    standalone: bool = True
    web_bundle: bool = False

    # Agent assignment
    assigned_agent: str | None = None

    # Token tracking
    token_count: int = 0


class WorkflowParser:
    """
    Parser for BMAD workflow files.

    Handles both YAML and Markdown formats, extracting
    workflow structure without loading full step content.
    """

    # Markdown patterns for inline steps
    STEP_PATTERN = re.compile(r'<step\s+n="(\d+)"[^>]*goal="([^"]*)"', re.DOTALL)

    # Checkpoint handler pattern
    CHECKPOINT_PATTERN = re.compile(
        r'<on-select\s+key="([^"]*)">(.*?)</on-select>', re.DOTALL
    )

    # Critical instruction pattern
    CRITICAL_PATTERN = re.compile(r"<critical>(.*?)</critical>", re.DOTALL)

    def __init__(
        self,
        bmad_root: Path,
        cache: DiskLRUCache | None = None,
        token_budget: TokenBudget | None = None,
    ):
        self.bmad_root = Path(bmad_root)
        self.cache = cache
        self.token_budget = token_budget

    def detect_format(self, file_path: Path) -> WorkflowFormat:
        """Detect workflow file format from extension."""
        suffix = file_path.suffix.lower()
        if suffix in (".yaml", ".yml"):
            return WorkflowFormat.YAML
        elif suffix == ".md":
            return WorkflowFormat.MARKDOWN
        return WorkflowFormat.UNKNOWN

    def parse(self, file_path: Path, force: bool = False) -> ParsedWorkflow | None:
        """
        Parse a workflow file.

        Checks cache first, then parses from disk.
        """
        file_path = Path(file_path)
        cache_key = f"workflow:{file_path}"

        # Check cache
        if self.cache and not force:
            cached = self.cache.get(cache_key)
            if cached:
                return cached

        if not file_path.exists():
            return None

        # Read content
        content = file_path.read_text()
        token_count = estimate_tokens(content)

        # Check token budget
        if self.token_budget:
            if not self.token_budget.can_afford(
                TokenCategory.WORKFLOW_DEF, token_count
            ):
                return None
            self.token_budget.consume(TokenCategory.WORKFLOW_DEF, token_count)

        # Parse based on format
        fmt = self.detect_format(file_path)
        if fmt == WorkflowFormat.YAML:
            workflow = self._parse_yaml(content, file_path)
        elif fmt == WorkflowFormat.MARKDOWN:
            workflow = self._parse_markdown(content, file_path)
        else:
            return None

        if workflow:
            workflow.token_count = token_count
            workflow.source_path = file_path
            workflow.format = fmt

            # Infer module and phase from path
            self._infer_module_phase(workflow, file_path)

            # Cache result
            if self.cache:
                self.cache.put(cache_key, workflow, source_path=file_path)

        return workflow

    def _parse_yaml(self, content: str, file_path: Path) -> ParsedWorkflow:
        """Parse YAML workflow format."""
        try:
            data = yaml.safe_load(content)
        except yaml.YAMLError:
            return None

        if not isinstance(data, dict):
            return None

        # Extract basic metadata
        workflow = ParsedWorkflow(
            name=data.get("name", file_path.stem),
            description=data.get("description", ""),
            author=data.get("author", "BMAD"),
            module="",
            phase="",
            config_source=data.get("config_source"),
            output_folder=data.get("output_folder"),
            project_context=data.get("project_context"),
            instructions_path=data.get("instructions"),
            checklist_path=data.get("checklist"),
            standalone=data.get("standalone", True),
            web_bundle=data.get("web_bundle", False),
        )

        # Extract related workflows
        for key, value in data.items():
            if key.endswith("_workflow") and isinstance(value, str):
                workflow.related_workflows[key] = value

        # Count steps from instructions file if referenced
        if workflow.instructions_path:
            instructions = self._resolve_path(workflow.instructions_path, file_path)
            if instructions.exists():
                instructions_content = instructions.read_text()
                steps = self.STEP_PATTERN.findall(instructions_content)
                workflow.total_steps = len(steps)
                for step_match in steps:
                    workflow.steps.append(
                        WorkflowStep(
                            number=int(step_match[0]),
                            goal=step_match[1],
                            is_inline=True,
                        )
                    )

        return workflow

    def _parse_markdown(self, content: str, file_path: Path) -> ParsedWorkflow:
        """Parse Markdown workflow format (with XML-like tags)."""
        # Extract name from first heading
        name_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        name = name_match.group(1) if name_match else file_path.stem

        # Extract description
        desc_match = re.search(r"^#[^#].*?\n\n(.+?)(?:\n\n|$)", content, re.DOTALL)
        description = desc_match.group(1).strip() if desc_match else ""

        workflow = ParsedWorkflow(
            name=name,
            description=description,
            author="BMAD",
            module="",
            phase="",
        )

        # Extract inline steps
        steps = self.STEP_PATTERN.findall(content)
        workflow.total_steps = len(steps)
        for step_match in steps:
            workflow.steps.append(
                WorkflowStep(
                    number=int(step_match[0]), goal=step_match[1], is_inline=True
                )
            )

        # Extract checkpoint handlers
        handlers = self.CHECKPOINT_PATTERN.findall(content)
        for handler_match in handlers:
            workflow.checkpoint_handlers.append(
                CheckpointHandler(key=handler_match[0], action=handler_match[1].strip())
            )

        # Extract critical instructions
        criticals = self.CRITICAL_PATTERN.findall(content)
        # Could store these if needed

        return workflow

    def _resolve_path(self, path_ref: str, workflow_path: Path) -> Path:
        """Resolve BMAD path references."""
        path_str = path_ref

        # Handle placeholders
        path_str = path_str.replace("{project-root}", str(self.bmad_root))
        path_str = path_str.replace("{installed_path}", str(workflow_path.parent))

        resolved = Path(path_str)
        if not resolved.is_absolute():
            resolved = workflow_path.parent / resolved

        return resolved.resolve()

    def _infer_module_phase(self, workflow: ParsedWorkflow, file_path: Path) -> None:
        """Infer module and phase from file path."""
        path_parts = file_path.parts

        # Look for module indicators
        modules = ["bmm", "bmgd", "cis", "bmb", "core"]
        for part in path_parts:
            if part.lower() in modules:
                workflow.module = part.lower()
                break

        # Look for phase indicators
        phases = [
            "1-analysis",
            "2-plan-workflows",
            "3-solutioning",
            "4-implementation",
            "bmad-quick-flow",
            "bmgd-quick-flow",
            "testarch",
            "gametest",
        ]
        for part in path_parts:
            if part.lower() in phases or part.lower().startswith(
                ("1-", "2-", "3-", "4-")
            ):
                workflow.phase = part.lower()
                break

    def list_workflows(self, module: str | None = None) -> list[Path]:
        """
        List all workflow files in BMAD.

        Optionally filter by module (bmm, bmgd, cis, bmb, core).
        """
        workflows = []

        # Define search paths
        if module:
            if module == "core":
                search_paths = [self.bmad_root / "src" / "core" / "workflows"]
            else:
                search_paths = [
                    self.bmad_root / "src" / "modules" / module / "workflows"
                ]
        else:
            search_paths = [
                self.bmad_root / "src" / "core" / "workflows",
                self.bmad_root / "src" / "modules" / "bmm" / "workflows",
                self.bmad_root / "src" / "modules" / "bmgd" / "workflows",
                self.bmad_root / "src" / "modules" / "cis" / "workflows",
                self.bmad_root / "src" / "modules" / "bmb" / "workflows",
            ]

        # Find workflow files
        for search_path in search_paths:
            if search_path.exists():
                for wf_file in search_path.rglob("workflow.yaml"):
                    workflows.append(wf_file)
                for wf_file in search_path.rglob("workflow.md"):
                    workflows.append(wf_file)

        return workflows

    def get_workflow_by_name(self, name: str) -> ParsedWorkflow | None:
        """
        Find and parse a workflow by name.

        Searches all modules for matching workflow.
        """
        all_workflows = self.list_workflows()

        for wf_path in all_workflows:
            # Check directory name
            if wf_path.parent.name.lower() == name.lower():
                return self.parse(wf_path)

            # Check parsed name
            parsed = self.parse(wf_path)
            if parsed and parsed.name.lower() == name.lower():
                return parsed

        return None
