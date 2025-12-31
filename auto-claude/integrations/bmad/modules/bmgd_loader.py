"""
BMGD Module Loader - Game Development module.

BMGD (BMAD Game Development) contains:
- 6 Agents: Game Designer, Game Architect, Game Dev, Game Solo Dev, Game SM, Game QA
- 29 Workflows across preproduction, design, technical, and production phases
- Game-specific templates and team configuration

Based on BMAD Full Integration Product Brief Phase 3.
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)

from ..shared.cache import DiskLRUCache
from ..shared.token_budget import TokenBudget, TokenCategory, estimate_tokens


class BMGDAgentRole(Enum):
    """BMGD agent roles."""

    GAME_DESIGNER = "game-designer"
    GAME_ARCHITECT = "game-architect"
    GAME_DEVELOPER = "game-dev"
    GAME_SOLO_DEV = "game-solo-dev"
    GAME_SCRUM_MASTER = "game-scrum-master"
    GAME_QA = "game-qa"


class BMGDPhase(Enum):
    """BMGD workflow phases."""

    PREPRODUCTION = "1-preproduction"
    DESIGN = "2-design"
    TECHNICAL = "3-technical"
    PRODUCTION = "4-production"
    QUICK_FLOW = "bmgd-quick-flow"
    TESTING = "gametest"
    STATUS = "workflow-status"


@dataclass
class BMGDAgent:
    """Parsed BMGD agent."""

    id: str
    name: str
    title: str
    role: BMGDAgentRole
    identity: str
    communication_style: str
    principles: list[str]
    critical_actions: list[str]
    menu: list[dict[str, str]]
    icon: str = ""
    source_path: Path | None = None
    token_count: int = 0

    @classmethod
    def from_dict(cls, data: dict) -> "BMGDAgent":
        """Reconstruct BMGDAgent from dict (e.g., from cache)."""
        source = data.get("source_path")
        role_value = data.get("role", "game-designer")
        role = role_value if isinstance(role_value, BMGDAgentRole) else BMGDAgentRole(role_value)
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            title=data.get("title", ""),
            role=role,
            identity=data.get("identity", ""),
            communication_style=data.get("communication_style", ""),
            principles=data.get("principles", []),
            critical_actions=data.get("critical_actions", []),
            menu=data.get("menu", []),
            icon=data.get("icon", ""),
            source_path=Path(source) if source else None,
            token_count=data.get("token_count", 0),
        )


@dataclass
class BMGDWorkflow:
    """Reference to a BMGD workflow."""

    name: str
    phase: BMGDPhase
    path: Path
    description: str = ""


@dataclass
class BMGDModule:
    """Complete BMGD module."""

    agents: dict[BMGDAgentRole, BMGDAgent] = field(default_factory=dict)
    workflows: dict[str, BMGDWorkflow] = field(default_factory=dict)
    teams: dict[str, Path] = field(default_factory=dict)
    is_loaded: bool = False


class BMGDModuleLoader:
    """Loader for BMAD Game Development module."""

    BMGD_PATH = "src/modules/bmgd"

    AGENT_FILES = {
        BMGDAgentRole.GAME_DESIGNER: "game-designer.agent.yaml",
        BMGDAgentRole.GAME_ARCHITECT: "game-architect.agent.yaml",
        BMGDAgentRole.GAME_DEVELOPER: "game-dev.agent.yaml",
        BMGDAgentRole.GAME_SOLO_DEV: "game-solo-dev.agent.yaml",
        BMGDAgentRole.GAME_SCRUM_MASTER: "game-scrum-master.agent.yaml",
        BMGDAgentRole.GAME_QA: "game-qa.agent.yaml",
    }

    def __init__(
        self,
        bmad_root: Path,
        cache: DiskLRUCache | None = None,
        token_budget: TokenBudget | None = None,
    ):
        self.bmad_root = Path(bmad_root)
        self.cache = cache
        self.token_budget = token_budget
        self._module: BMGDModule | None = None

    @property
    def bmgd_path(self) -> Path:
        return self.bmad_root / self.BMGD_PATH

    def is_available(self) -> bool:
        return self.bmgd_path.exists()

    def load(self, force: bool = False) -> BMGDModule:
        """Load the BMGD module."""
        if self._module and self._module.is_loaded and not force:
            return self._module

        self._module = BMGDModule()

        if not self.is_available():
            return self._module

        # Load agents
        agents_path = self.bmgd_path / "agents"
        if agents_path.exists():
            for role, filename in self.AGENT_FILES.items():
                agent_file = agents_path / filename
                if agent_file.exists():
                    agent = self._load_agent(agent_file, role)
                    if agent:
                        self._module.agents[role] = agent

        # Discover workflows
        workflows_path = self.bmgd_path / "workflows"
        if workflows_path.exists():
            for phase_dir in workflows_path.iterdir():
                if phase_dir.is_dir():
                    phase = self._parse_phase(phase_dir.name)
                    for wf_dir in phase_dir.iterdir():
                        if wf_dir.is_dir():
                            wf_file = wf_dir / "workflow.yaml"
                            if not wf_file.exists():
                                wf_file = wf_dir / "workflow.md"
                            if wf_file.exists():
                                self._module.workflows[wf_dir.name] = BMGDWorkflow(
                                    name=wf_dir.name,
                                    phase=phase,
                                    path=wf_file,
                                )

        # Load teams
        teams_path = self.bmgd_path / "teams"
        if teams_path.exists():
            for team_file in teams_path.glob("*.yaml"):
                self._module.teams[team_file.stem] = team_file

        self._module.is_loaded = True
        return self._module

    def _parse_phase(self, phase_name: str) -> BMGDPhase:
        for phase in BMGDPhase:
            if phase.value == phase_name.lower():
                return phase
        return BMGDPhase.PRODUCTION

    def _load_agent(self, agent_path: Path, role: BMGDAgentRole) -> BMGDAgent | None:
        cache_key = f"agent:bmgd:{role.value}"

        if self.cache:
            cached = self.cache.get(cache_key)
            if cached:
                # Convert dict back to BMGDAgent if needed
                if isinstance(cached, dict):
                    return BMGDAgent.from_dict(cached)
                return cached

        if not agent_path.exists():
            return None

        content = agent_path.read_text()
        token_count = estimate_tokens(content)

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

        if not isinstance(data, dict) or "agent" not in data:
            return None

        agent_data = data["agent"]
        metadata = agent_data.get("metadata", {})
        persona = agent_data.get("persona", {})

        principles = persona.get("principles", "")
        if isinstance(principles, str):
            principles = [
                p.strip("- ").strip() for p in principles.split("\n") if p.strip()
            ]

        agent = BMGDAgent(
            id=metadata.get("id", role.value),
            name=metadata.get("name", role.value.title()),
            title=metadata.get("title", ""),
            role=role,
            identity=persona.get("identity", ""),
            communication_style=persona.get("communication_style", ""),
            principles=principles,
            critical_actions=agent_data.get("critical_actions", []),
            menu=agent_data.get("menu", []),
            icon=metadata.get("icon", ""),
            source_path=agent_path,
            token_count=token_count,
        )

        if self.cache:
            self.cache.put(cache_key, agent, source_path=agent_path)

        return agent

    def get_agent(self, role: BMGDAgentRole) -> BMGDAgent | None:
        module = self.load()
        return module.agents.get(role)

    def list_agents(self) -> list[BMGDAgentRole]:
        module = self.load()
        return list(module.agents.keys())

    def list_workflows(self, phase: BMGDPhase | None = None) -> list[str]:
        module = self.load()
        if phase:
            return [name for name, wf in module.workflows.items() if wf.phase == phase]
        return list(module.workflows.keys())

    def get_workflow(self, name: str) -> BMGDWorkflow | None:
        module = self.load()
        return module.workflows.get(name)
