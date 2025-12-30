"""
BMM Module Loader - Main agile development module.

BMM (BMAD Main Module) contains:
- 9 Agents: PM, Architect, Dev, UX Designer, TEA, Analyst, SM, Tech Writer, Quick Flow Solo Dev
- 32 Workflows across 10 phases
- Teams configuration
- Templates and standards

Based on BMAD Full Integration Product Brief Phase 2.
"""

import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Any
from enum import Enum

from ..shared.cache import DiskLRUCache
from ..shared.token_budget import TokenBudget, TokenCategory, estimate_tokens


class BMMAgentRole(Enum):
    """BMM agent roles."""
    PM = "pm"
    ARCHITECT = "architect"
    DEVELOPER = "dev"
    UX_DESIGNER = "ux-designer"
    TEST_ARCHITECT = "tea"
    ANALYST = "analyst"
    SCRUM_MASTER = "sm"
    TECH_WRITER = "tech-writer"
    QUICK_FLOW = "quick-flow-solo-dev"


class BMMPhase(Enum):
    """BMM workflow phases."""
    ANALYSIS = "1-analysis"
    PLANNING = "2-plan-workflows"
    SOLUTIONING = "3-solutioning"
    IMPLEMENTATION = "4-implementation"
    QUICK_FLOW = "bmad-quick-flow"
    DOCUMENTATION = "document-project"
    DIAGRAMS = "excalidraw-diagrams"
    CONTEXT = "generate-project-context"
    TESTING = "testarch"
    STATUS = "workflow-status"


@dataclass
class BMMAgent:
    """Parsed BMM agent."""
    id: str
    name: str
    title: str
    role: BMMAgentRole
    identity: str
    communication_style: str
    principles: List[str]
    critical_actions: List[str]
    menu: List[Dict[str, str]]
    icon: str = ""
    source_path: Optional[Path] = None
    token_count: int = 0


@dataclass
class BMMWorkflow:
    """Reference to a BMM workflow."""
    name: str
    phase: BMMPhase
    path: Path
    description: str = ""
    agent_role: Optional[BMMAgentRole] = None


@dataclass
class BMMTeam:
    """Team configuration."""
    name: str
    roles: List[BMMAgentRole]
    path: Path


@dataclass
class BMMModule:
    """Complete BMM module."""
    agents: Dict[BMMAgentRole, BMMAgent] = field(default_factory=dict)
    workflows: Dict[str, BMMWorkflow] = field(default_factory=dict)
    teams: Dict[str, BMMTeam] = field(default_factory=dict)
    templates: Dict[str, Path] = field(default_factory=dict)
    is_loaded: bool = False


class BMMModuleLoader:
    """
    Loader for BMAD BMM (Main) module.

    Provides access to all 9 agents and 32+ workflows.
    """

    BMM_PATH = "src/modules/bmm"

    # Agent file mapping
    AGENT_FILES = {
        BMMAgentRole.PM: "pm.agent.yaml",
        BMMAgentRole.ARCHITECT: "architect.agent.yaml",
        BMMAgentRole.DEVELOPER: "dev.agent.yaml",
        BMMAgentRole.UX_DESIGNER: "ux-designer.agent.yaml",
        BMMAgentRole.TEST_ARCHITECT: "tea.agent.yaml",
        BMMAgentRole.ANALYST: "analyst.agent.yaml",
        BMMAgentRole.SCRUM_MASTER: "sm.agent.yaml",
        BMMAgentRole.TECH_WRITER: "tech-writer.agent.yaml",
        BMMAgentRole.QUICK_FLOW: "quick-flow-solo-dev.agent.yaml",
    }

    def __init__(
        self,
        bmad_root: Path,
        cache: Optional[DiskLRUCache] = None,
        token_budget: Optional[TokenBudget] = None
    ):
        self.bmad_root = Path(bmad_root)
        self.cache = cache
        self.token_budget = token_budget
        self._module: Optional[BMMModule] = None

    @property
    def bmm_path(self) -> Path:
        """Path to BMM module."""
        return self.bmad_root / self.BMM_PATH

    def is_available(self) -> bool:
        """Check if BMM module exists."""
        return self.bmm_path.exists()

    def load(self, force: bool = False) -> BMMModule:
        """Load the BMM module."""
        if self._module and self._module.is_loaded and not force:
            return self._module

        self._module = BMMModule()

        if not self.is_available():
            return self._module

        # Load agents
        agents_path = self.bmm_path / "agents"
        if agents_path.exists():
            for role, filename in self.AGENT_FILES.items():
                agent_file = agents_path / filename
                if agent_file.exists():
                    agent = self._load_agent(agent_file, role)
                    if agent:
                        self._module.agents[role] = agent

        # Discover workflows
        workflows_path = self.bmm_path / "workflows"
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
                                self._module.workflows[wf_dir.name] = BMMWorkflow(
                                    name=wf_dir.name,
                                    phase=phase,
                                    path=wf_file,
                                )

        # Load teams
        teams_path = self.bmm_path / "teams"
        if teams_path.exists():
            for team_file in teams_path.glob("*.yaml"):
                team = self._load_team(team_file)
                if team:
                    self._module.teams[team.name] = team

        # Discover templates
        data_path = self.bmm_path / "data"
        if data_path.exists():
            for template_file in data_path.glob("*.md"):
                self._module.templates[template_file.stem] = template_file

        self._module.is_loaded = True
        return self._module

    def _parse_phase(self, phase_name: str) -> BMMPhase:
        """Parse phase name to enum."""
        for phase in BMMPhase:
            if phase.value == phase_name.lower():
                return phase
        return BMMPhase.IMPLEMENTATION  # default

    def _load_agent(self, agent_path: Path, role: BMMAgentRole) -> Optional[BMMAgent]:
        """Load and parse a BMM agent file."""
        cache_key = f"agent:bmm:{role.value}"

        if self.cache:
            cached = self.cache.get(cache_key)
            if cached:
                return cached

        if not agent_path.exists():
            return None

        content = agent_path.read_text()
        token_count = estimate_tokens(content)

        if self.token_budget:
            if not self.token_budget.can_afford(TokenCategory.AGENT_PERSONA, token_count):
                return None
            self.token_budget.consume(TokenCategory.AGENT_PERSONA, token_count)

        try:
            data = yaml.safe_load(content)
        except yaml.YAMLError:
            return None

        if not isinstance(data, dict) or 'agent' not in data:
            return None

        agent_data = data['agent']
        metadata = agent_data.get('metadata', {})
        persona = agent_data.get('persona', {})

        principles = persona.get('principles', '')
        if isinstance(principles, str):
            principles = [p.strip('- ').strip() for p in principles.split('\n') if p.strip()]

        agent = BMMAgent(
            id=metadata.get('id', role.value),
            name=metadata.get('name', role.value.title()),
            title=metadata.get('title', ''),
            role=role,
            identity=persona.get('identity', ''),
            communication_style=persona.get('communication_style', ''),
            principles=principles,
            critical_actions=agent_data.get('critical_actions', []),
            menu=agent_data.get('menu', []),
            icon=metadata.get('icon', ''),
            source_path=agent_path,
            token_count=token_count,
        )

        if self.cache:
            self.cache.put(cache_key, agent, source_path=agent_path)

        return agent

    def _load_team(self, team_path: Path) -> Optional[BMMTeam]:
        """Load team configuration."""
        try:
            data = yaml.safe_load(team_path.read_text())
            roles = []
            for role_str in data.get('roles', []):
                try:
                    roles.append(BMMAgentRole(role_str))
                except ValueError:
                    pass
            return BMMTeam(
                name=data.get('name', team_path.stem),
                roles=roles,
                path=team_path,
            )
        except Exception:
            return None

    def get_agent(self, role: BMMAgentRole) -> Optional[BMMAgent]:
        """Get a specific agent."""
        module = self.load()
        return module.agents.get(role)

    def get_agent_prompt(self, role: BMMAgentRole) -> str:
        """Get system prompt for an agent."""
        agent = self.get_agent(role)
        if not agent:
            return ""

        # Handle both dataclass and dict (from cache)
        def _get(obj, attr, default=''):
            if isinstance(obj, dict):
                return obj.get(attr, default)
            return getattr(obj, attr, default)

        principles_text = '\n'.join(f"- {p}" for p in _get(agent, 'principles', []))
        actions_text = '\n'.join(f"- {a}" for a in _get(agent, 'critical_actions', []))

        title = _get(agent, 'title', '')
        name = _get(agent, 'name', '')
        icon = _get(agent, 'icon', '')
        role_val = _get(agent, 'role', role.value)
        if hasattr(role_val, 'value'):
            role_val = role_val.value
        identity = _get(agent, 'identity', '')
        comm_style = _get(agent, 'communication_style', '')

        return f"""# {title} ({name}) {icon}

## Role
{role_val}

## Identity
{identity}

## Communication Style
{comm_style}

## Core Principles
{principles_text}

## Critical Actions
{actions_text}
"""

    def list_agents(self) -> List[BMMAgentRole]:
        """List available agents."""
        module = self.load()
        return list(module.agents.keys())

    def list_workflows(self, phase: Optional[BMMPhase] = None) -> List[str]:
        """List workflows, optionally filtered by phase."""
        module = self.load()
        if phase:
            return [name for name, wf in module.workflows.items() if wf.phase == phase]
        return list(module.workflows.keys())

    def get_workflow(self, name: str) -> Optional[BMMWorkflow]:
        """Get a specific workflow."""
        module = self.load()
        return module.workflows.get(name)

    def list_teams(self) -> List[str]:
        """List available teams."""
        module = self.load()
        return list(module.teams.keys())

    def get_team(self, name: str) -> Optional[BMMTeam]:
        """Get a team configuration."""
        module = self.load()
        return module.teams.get(name)
