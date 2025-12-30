"""
CIS Module Loader - Creative & Innovation module.

CIS (Creative Innovation Studio) contains:
- 6 Agents: Innovation Strategist, Creative Problem Solver, Design Thinking Coach,
            Presentation Master, Brainstorming Coach, Storyteller
- 4 Workflows: design-thinking, innovation-strategy, problem-solving, storytelling
- Creative team configuration

Based on BMAD Full Integration Product Brief Phase 4.
"""

import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional
from enum import Enum

from ..shared.cache import DiskLRUCache
from ..shared.token_budget import TokenBudget, TokenCategory, estimate_tokens


class CISAgentRole(Enum):
    """CIS agent roles."""
    INNOVATION_STRATEGIST = "innovation-strategist"
    CREATIVE_PROBLEM_SOLVER = "creative-problem-solver"
    DESIGN_THINKING_COACH = "design-thinking-coach"
    PRESENTATION_MASTER = "presentation-master"
    BRAINSTORMING_COACH = "brainstorming-coach"
    STORYTELLER = "storyteller"


class CISWorkflowType(Enum):
    """CIS workflow types."""
    DESIGN_THINKING = "design-thinking"
    INNOVATION_STRATEGY = "innovation-strategy"
    PROBLEM_SOLVING = "problem-solving"
    STORYTELLING = "storytelling"


@dataclass
class CISAgent:
    """Parsed CIS agent."""
    id: str
    name: str
    title: str
    role: CISAgentRole
    identity: str
    communication_style: str
    principles: List[str]
    critical_actions: List[str]
    menu: List[Dict[str, str]]
    icon: str = ""
    source_path: Optional[Path] = None
    token_count: int = 0


@dataclass
class CISWorkflow:
    """Reference to a CIS workflow."""
    name: str
    workflow_type: CISWorkflowType
    path: Path
    description: str = ""


@dataclass
class CISModule:
    """Complete CIS module."""
    agents: Dict[CISAgentRole, CISAgent] = field(default_factory=dict)
    workflows: Dict[str, CISWorkflow] = field(default_factory=dict)
    teams: Dict[str, Path] = field(default_factory=dict)
    is_loaded: bool = False


class CISModuleLoader:
    """Loader for BMAD Creative & Innovation module."""

    CIS_PATH = "src/modules/cis"

    AGENT_FILES = {
        CISAgentRole.INNOVATION_STRATEGIST: "innovation-strategist.agent.yaml",
        CISAgentRole.CREATIVE_PROBLEM_SOLVER: "creative-problem-solver.agent.yaml",
        CISAgentRole.DESIGN_THINKING_COACH: "design-thinking-coach.agent.yaml",
        CISAgentRole.PRESENTATION_MASTER: "presentation-master.agent.yaml",
        CISAgentRole.BRAINSTORMING_COACH: "brainstorming-coach.agent.yaml",
        CISAgentRole.STORYTELLER: "storyteller/storyteller.agent.yaml",
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
        self._module: Optional[CISModule] = None

    @property
    def cis_path(self) -> Path:
        return self.bmad_root / self.CIS_PATH

    def is_available(self) -> bool:
        return self.cis_path.exists()

    def load(self, force: bool = False) -> CISModule:
        """Load the CIS module."""
        if self._module and self._module.is_loaded and not force:
            return self._module

        self._module = CISModule()

        if not self.is_available():
            return self._module

        # Load agents
        agents_path = self.cis_path / "agents"
        if agents_path.exists():
            for role, filename in self.AGENT_FILES.items():
                agent_file = agents_path / filename
                if agent_file.exists():
                    agent = self._load_agent(agent_file, role)
                    if agent:
                        self._module.agents[role] = agent

        # Discover workflows
        workflows_path = self.cis_path / "workflows"
        if workflows_path.exists():
            for wf_dir in workflows_path.iterdir():
                if wf_dir.is_dir():
                    wf_type = self._parse_workflow_type(wf_dir.name)
                    wf_file = wf_dir / "workflow.yaml"
                    if not wf_file.exists():
                        wf_file = wf_dir / "workflow.md"
                    if wf_file.exists():
                        self._module.workflows[wf_dir.name] = CISWorkflow(
                            name=wf_dir.name,
                            workflow_type=wf_type,
                            path=wf_file,
                        )

        # Load teams
        teams_path = self.cis_path / "teams"
        if teams_path.exists():
            for team_file in teams_path.glob("*.yaml"):
                self._module.teams[team_file.stem] = team_file

        self._module.is_loaded = True
        return self._module

    def _parse_workflow_type(self, name: str) -> CISWorkflowType:
        for wf_type in CISWorkflowType:
            if wf_type.value == name.lower():
                return wf_type
        return CISWorkflowType.PROBLEM_SOLVING

    def _load_agent(self, agent_path: Path, role: CISAgentRole) -> Optional[CISAgent]:
        cache_key = f"agent:cis:{role.value}"

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

        agent = CISAgent(
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

    def get_agent(self, role: CISAgentRole) -> Optional[CISAgent]:
        module = self.load()
        return module.agents.get(role)

    def list_agents(self) -> List[CISAgentRole]:
        module = self.load()
        return list(module.agents.keys())

    def list_workflows(self) -> List[str]:
        module = self.load()
        return list(module.workflows.keys())

    def get_workflow(self, name: str) -> Optional[CISWorkflow]:
        module = self.load()
        return module.workflows.get(name)
