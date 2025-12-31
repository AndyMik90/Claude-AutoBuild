"""
Core Module Loader - bmad-master orchestrator and core workflows.

The Core module contains:
- bmad-master agent: Master orchestrator, knowledge custodian
- brainstorming workflow: Creative ideation with multiple techniques
- party-mode workflow: Multi-agent collaborative discussion

Based on BMAD Full Integration Product Brief Phase 1.
"""

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

from ..shared.cache import DiskLRUCache
from ..shared.schema_validator import SchemaType, validate_yaml
from ..shared.token_budget import TokenBudget, TokenCategory, estimate_tokens


@dataclass
class AgentPersona:
    """Parsed BMAD agent persona."""

    id: str
    name: str
    title: str
    role: str
    identity: str
    communication_style: str
    principles: list[str]
    critical_actions: list[str]
    menu: list[dict[str, str]]
    icon: str = ""
    module: str = "core"
    source_path: Path | None = None
    token_count: int = 0

    @classmethod
    def from_dict(cls, data: dict) -> "AgentPersona":
        """Reconstruct AgentPersona from dict (e.g., from cache)."""
        source = data.get("source_path")
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            title=data.get("title", ""),
            role=data.get("role", ""),
            identity=data.get("identity", ""),
            communication_style=data.get("communication_style", ""),
            principles=data.get("principles", []),
            critical_actions=data.get("critical_actions", []),
            menu=data.get("menu", []),
            icon=data.get("icon", ""),
            module=data.get("module", "core"),
            source_path=Path(source) if source else None,
            token_count=data.get("token_count", 0),
        )


@dataclass
class CoreModule:
    """Core module with bmad-master and core workflows."""

    master_agent: AgentPersona | None = None
    workflows: dict[str, Path] = field(default_factory=dict)
    tasks: dict[str, Path] = field(default_factory=dict)
    tools: dict[str, Path] = field(default_factory=dict)
    is_loaded: bool = False


class CoreModuleLoader:
    """
    Loader for BMAD Core module.

    Provides access to:
    - bmad-master agent (orchestrator)
    - brainstorming workflow
    - party-mode workflow
    - Core tasks and tools
    """

    CORE_PATH = "src/core"

    def __init__(
        self,
        bmad_root: Path,
        cache: DiskLRUCache | None = None,
        token_budget: TokenBudget | None = None,
    ):
        self.bmad_root = Path(bmad_root)
        self.cache = cache
        self.token_budget = token_budget
        self._module: CoreModule | None = None

    @property
    def core_path(self) -> Path:
        """Path to core module."""
        return self.bmad_root / self.CORE_PATH

    def is_available(self) -> bool:
        """Check if core module exists."""
        return self.core_path.exists()

    def load(self, force: bool = False) -> CoreModule:
        """
        Load the core module.

        Returns CoreModule with agent and workflow references.
        """
        if self._module and self._module.is_loaded and not force:
            return self._module

        self._module = CoreModule()

        if not self.is_available():
            return self._module

        # Load bmad-master agent
        master_path = self.core_path / "agents" / "bmad-master.agent.yaml"
        if master_path.exists():
            self._module.master_agent = self._load_agent(master_path)

        # Discover workflows
        workflows_path = self.core_path / "workflows"
        if workflows_path.exists():
            for wf_dir in workflows_path.iterdir():
                if wf_dir.is_dir():
                    wf_file = wf_dir / "workflow.yaml"
                    if not wf_file.exists():
                        wf_file = wf_dir / "workflow.md"
                    if wf_file.exists():
                        self._module.workflows[wf_dir.name] = wf_file

        # Discover tasks
        tasks_path = self.core_path / "tasks"
        if tasks_path.exists():
            for task_file in tasks_path.glob("*.xml"):
                self._module.tasks[task_file.stem] = task_file
            for task_file in tasks_path.glob("*.csv"):
                self._module.tasks[task_file.stem] = task_file

        # Discover tools
        tools_path = self.core_path / "tools"
        if tools_path.exists():
            for tool_file in tools_path.glob("*.xml"):
                self._module.tools[tool_file.stem] = tool_file

        self._module.is_loaded = True
        return self._module

    def _load_agent(self, agent_path: Path) -> AgentPersona | None:
        """
        Load and parse a BMAD agent file.
        """
        cache_key = "agent:core:bmad-master"

        # Check cache
        if self.cache:
            cached = self.cache.get(cache_key)
            if cached:
                # Convert dict back to AgentPersona if needed
                if isinstance(cached, dict):
                    return AgentPersona.from_dict(cached)
                return cached

        if not agent_path.exists():
            return None

        content = agent_path.read_text()
        token_count = estimate_tokens(content)

        # Check token budget
        if self.token_budget:
            if not self.token_budget.can_afford(
                TokenCategory.AGENT_PERSONA, token_count
            ):
                return None
            self.token_budget.consume(TokenCategory.AGENT_PERSONA, token_count)

        try:
            data = yaml.safe_load(content)
        except yaml.YAMLError as e:
            logger.warning("Failed to parse YAML file %s: %s", agent_path, e)
            return None

        # Validate schema before processing
        validation = validate_yaml(data, SchemaType.AGENT)
        if not validation.valid:
            logger.warning(
                "Agent file %s failed schema validation: %s",
                agent_path,
                validation.errors,
            )
            return None
        if validation.warnings:
            logger.info("Agent file %s has warnings: %s", agent_path, validation.warnings)

        if not isinstance(data, dict) or "agent" not in data:
            return None

        agent_data = data["agent"]
        metadata = agent_data.get("metadata", {})
        persona = agent_data.get("persona", {})

        # Parse principles (may be string or list)
        principles = persona.get("principles", "")
        if isinstance(principles, str):
            principles = [
                p.strip("- ").strip() for p in principles.split("\n") if p.strip()
            ]

        agent = AgentPersona(
            id=metadata.get("id", "bmad-master"),
            name=metadata.get("name", "BMAD Master"),
            title=metadata.get("title", "Master Orchestrator"),
            role=persona.get("role", ""),
            identity=persona.get("identity", ""),
            communication_style=persona.get("communication_style", ""),
            principles=principles,
            critical_actions=agent_data.get("critical_actions", []),
            menu=agent_data.get("menu", []),
            icon=metadata.get("icon", ""),
            module="core",
            source_path=agent_path,
            token_count=token_count,
        )

        # Cache result
        if self.cache:
            self.cache.put(cache_key, agent, source_path=agent_path)

        return agent

    def get_master_agent(self) -> AgentPersona | None:
        """Get the bmad-master agent."""
        module = self.load()
        return module.master_agent

    def get_master_prompt(self) -> str:
        """
        Get the system prompt for bmad-master.

        Combines role, identity, principles, and critical actions.
        """
        agent = self.get_master_agent()
        if not agent:
            return ""

        principles_text = "\n".join(f"- {p}" for p in agent.principles)
        actions_text = "\n".join(f"- {a}" for a in agent.critical_actions)

        return f"""# {agent.title} ({agent.name}) {agent.icon}

## Role
{agent.role}

## Identity
{agent.identity}

## Communication Style
{agent.communication_style}

## Core Principles
{principles_text}

## Critical Actions
{actions_text}
"""

    def list_workflows(self) -> list[str]:
        """List available core workflows."""
        module = self.load()
        return list(module.workflows.keys())

    def get_workflow_path(self, name: str) -> Path | None:
        """Get path to a specific workflow."""
        module = self.load()
        return module.workflows.get(name)

    def list_tasks(self) -> list[str]:
        """List available core tasks."""
        module = self.load()
        return list(module.tasks.keys())

    def get_task_path(self, name: str) -> Path | None:
        """Get path to a specific task."""
        module = self.load()
        return module.tasks.get(name)

    def list_tools(self) -> list[str]:
        """List available core tools."""
        module = self.load()
        return list(module.tools.keys())

    def get_tool_path(self, name: str) -> Path | None:
        """Get path to a specific tool."""
        module = self.load()
        return module.tools.get(name)
