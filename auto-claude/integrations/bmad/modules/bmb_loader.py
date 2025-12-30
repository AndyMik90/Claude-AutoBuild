"""
BMB Module Loader - BMAD Builder module.

BMB (BMAD Builder) contains:
- 1 Agent: bmad-builder - Creates custom agents, modules, and workflows
- 7 Workflows: create-agent, create-module, create-workflow, edit-agent,
               edit-workflow, workflow-compliance-check
- Example agents for reference

Based on BMAD Full Integration Product Brief Phase 5.
"""

import yaml
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional
from enum import Enum

from ..shared.cache import DiskLRUCache
from ..shared.token_budget import TokenBudget, TokenCategory, estimate_tokens


class BMBWorkflowType(Enum):
    """BMB workflow types."""
    CREATE_AGENT = "create-agent"
    CREATE_MODULE = "create-module"
    CREATE_WORKFLOW = "create-workflow"
    EDIT_AGENT = "edit-agent"
    EDIT_WORKFLOW = "edit-workflow"
    COMPLIANCE_CHECK = "workflow-compliance-check"


@dataclass
class BMBAgent:
    """The bmad-builder agent."""
    id: str
    name: str
    title: str
    identity: str
    communication_style: str
    principles: List[str]
    critical_actions: List[str]
    menu: List[Dict[str, str]]
    icon: str = ""
    source_path: Optional[Path] = None
    token_count: int = 0


@dataclass
class BMBWorkflow:
    """Reference to a BMB workflow."""
    name: str
    workflow_type: BMBWorkflowType
    path: Path
    description: str = ""


@dataclass
class ExampleAgent:
    """Example agent provided for reference."""
    name: str
    path: Path
    description: str = ""


@dataclass
class BMBModule:
    """Complete BMB module."""
    builder_agent: Optional[BMBAgent] = None
    workflows: Dict[str, BMBWorkflow] = field(default_factory=dict)
    example_agents: Dict[str, ExampleAgent] = field(default_factory=dict)
    is_loaded: bool = False


class BMBModuleLoader:
    """Loader for BMAD Builder module."""

    BMB_PATH = "src/modules/bmb"

    def __init__(
        self,
        bmad_root: Path,
        cache: Optional[DiskLRUCache] = None,
        token_budget: Optional[TokenBudget] = None
    ):
        self.bmad_root = Path(bmad_root)
        self.cache = cache
        self.token_budget = token_budget
        self._module: Optional[BMBModule] = None

    @property
    def bmb_path(self) -> Path:
        return self.bmad_root / self.BMB_PATH

    def is_available(self) -> bool:
        return self.bmb_path.exists()

    def load(self, force: bool = False) -> BMBModule:
        """Load the BMB module."""
        if self._module and self._module.is_loaded and not force:
            return self._module

        self._module = BMBModule()

        if not self.is_available():
            return self._module

        # Load bmad-builder agent
        agent_file = self.bmb_path / "agents" / "bmad-builder.agent.yaml"
        if agent_file.exists():
            self._module.builder_agent = self._load_agent(agent_file)

        # Discover workflows
        workflows_path = self.bmb_path / "workflows"
        if workflows_path.exists():
            for wf_dir in workflows_path.iterdir():
                if wf_dir.is_dir():
                    wf_type = self._parse_workflow_type(wf_dir.name)
                    wf_file = wf_dir / "workflow.yaml"
                    if not wf_file.exists():
                        wf_file = wf_dir / "workflow.md"
                    if wf_file.exists():
                        self._module.workflows[wf_dir.name] = BMBWorkflow(
                            name=wf_dir.name,
                            workflow_type=wf_type,
                            path=wf_file,
                        )

        # Discover example agents
        examples_path = self.bmb_path / "agents" / "examples"
        if examples_path.exists():
            for agent_file in examples_path.glob("*.agent.yaml"):
                self._module.example_agents[agent_file.stem] = ExampleAgent(
                    name=agent_file.stem,
                    path=agent_file,
                )
            # Also check subdirectories
            for agent_dir in examples_path.iterdir():
                if agent_dir.is_dir():
                    for agent_file in agent_dir.glob("*.agent.yaml"):
                        self._module.example_agents[agent_file.stem] = ExampleAgent(
                            name=agent_file.stem,
                            path=agent_file,
                        )

        self._module.is_loaded = True
        return self._module

    def _parse_workflow_type(self, name: str) -> BMBWorkflowType:
        for wf_type in BMBWorkflowType:
            if wf_type.value == name.lower():
                return wf_type
        return BMBWorkflowType.CREATE_AGENT

    def _load_agent(self, agent_path: Path) -> Optional[BMBAgent]:
        cache_key = "agent:bmb:bmad-builder"

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

        agent = BMBAgent(
            id=metadata.get('id', 'bmad-builder'),
            name=metadata.get('name', 'BMAD Builder'),
            title=metadata.get('title', 'Agent Builder'),
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

    def get_builder_agent(self) -> Optional[BMBAgent]:
        """Get the bmad-builder agent."""
        module = self.load()
        return module.builder_agent

    def list_workflows(self) -> List[str]:
        module = self.load()
        return list(module.workflows.keys())

    def get_workflow(self, name: str) -> Optional[BMBWorkflow]:
        module = self.load()
        return module.workflows.get(name)

    def list_example_agents(self) -> List[str]:
        """List available example agents."""
        module = self.load()
        return list(module.example_agents.keys())

    def get_example_agent(self, name: str) -> Optional[ExampleAgent]:
        """Get an example agent reference."""
        module = self.load()
        return module.example_agents.get(name)
