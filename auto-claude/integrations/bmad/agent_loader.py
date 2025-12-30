"""
BMAD Agent Loader

Loads and converts BMAD agents for use with Auto-Claude.
BMAD agents provide role-based expertise (PM, Architect, Developer, etc.)
"""

from pathlib import Path
from typing import Optional
import yaml
import os


# Default BMAD installation paths
DEFAULT_BMAD_PATHS = [
    Path.home() / "Desktop" / "BMAD-METHOD",
    Path.home() / "BMAD-METHOD",
    Path("/usr/local/share/bmad-method"),
]


class BMADAgentLoader:
    """Load and convert BMAD agents for Auto-Claude use."""

    # Mapping of agent types to BMAD agent files
    # BMAD has 9 agents: analyst, architect, dev, pm, quick-flow-solo-dev, sm, tea, tech-writer, ux-designer
    AGENT_MAPPING = {
        # Product Manager - Requirements and Product
        "pm": "pm.agent.yaml",
        "product_manager": "pm.agent.yaml",

        # Architect - System Design
        "architect": "architect.agent.yaml",
        "system_architect": "architect.agent.yaml",

        # Developer - Implementation
        "developer": "dev.agent.yaml",
        "dev": "dev.agent.yaml",
        "coder": "dev.agent.yaml",

        # UX Designer - User Experience
        "ux": "ux-designer.agent.yaml",
        "ux_designer": "ux-designer.agent.yaml",
        "designer": "ux-designer.agent.yaml",

        # Test Architect - QA and Testing
        "qa": "tea.agent.yaml",
        "test_architect": "tea.agent.yaml",
        "tea": "tea.agent.yaml",
        "tester": "tea.agent.yaml",

        # Business Analyst - Analysis
        "analyst": "analyst.agent.yaml",
        "business_analyst": "analyst.agent.yaml",

        # Scrum Master - Sprint Management
        "sm": "sm.agent.yaml",
        "scrum_master": "sm.agent.yaml",
        "sprint_manager": "sm.agent.yaml",

        # Technical Writer - Documentation
        "tech_writer": "tech-writer.agent.yaml",
        "technical_writer": "tech-writer.agent.yaml",
        "writer": "tech-writer.agent.yaml",
        "docs": "tech-writer.agent.yaml",

        # Quick Flow Solo Dev - Fast Implementation
        "quick_flow": "quick-flow-solo-dev.agent.yaml",
        "solo_dev": "quick-flow-solo-dev.agent.yaml",
        "quick_dev": "quick-flow-solo-dev.agent.yaml",
    }

    def __init__(self, bmad_path: Optional[Path] = None):
        """
        Initialize the loader.

        Args:
            bmad_path: Path to BMAD-METHOD installation.
                       If not provided, searches default locations.
        """
        self.bmad_path = self._find_bmad_path(bmad_path)
        self.agents_path = self._get_agents_path()

    def _find_bmad_path(self, custom_path: Optional[Path]) -> Optional[Path]:
        """Find BMAD installation path."""
        if custom_path:
            if custom_path.exists():
                return custom_path
            return None

        # Check environment variable
        env_path = os.environ.get('BMAD_PATH')
        if env_path and Path(env_path).exists():
            return Path(env_path)

        # Check default paths
        for path in DEFAULT_BMAD_PATHS:
            if path.exists():
                return path

        return None

    def _get_agents_path(self) -> Optional[Path]:
        """Get the path to BMAD agents directory."""
        if not self.bmad_path:
            return None

        agents_path = self.bmad_path / "src" / "modules" / "bmm" / "agents"
        if agents_path.exists():
            return agents_path

        # Try alternative structure
        agents_path = self.bmad_path / "agents"
        if agents_path.exists():
            return agents_path

        return None

    def is_available(self) -> bool:
        """Check if BMAD agents are available."""
        return self.agents_path is not None

    def list_agents(self) -> list[str]:
        """List available agent types."""
        if not self.agents_path:
            return []

        agents = []
        for file in self.agents_path.glob("*.agent.yaml"):
            agent_name = file.stem.replace(".agent", "")
            agents.append(agent_name)

        return agents

    def load_agent(self, agent_type: str) -> Optional[dict]:
        """
        Load a BMAD agent YAML file.

        Args:
            agent_type: Type of agent (pm, architect, developer, etc.)

        Returns:
            Agent configuration as dictionary, or None if not found
        """
        if not self.agents_path:
            return None

        # Get the agent file name
        agent_file = self.AGENT_MAPPING.get(agent_type.lower())
        if not agent_file:
            # Try direct file name
            agent_file = f"{agent_type}.agent.yaml"

        agent_path = self.agents_path / agent_file
        if not agent_path.exists():
            return None

        with open(agent_path, 'r') as f:
            return yaml.safe_load(f)

    def get_agent_prompt(self, agent_type: str) -> str:
        """
        Convert BMAD agent to Auto-Claude prompt format.

        Args:
            agent_type: Type of agent

        Returns:
            Formatted prompt string
        """
        agent = self.load_agent(agent_type)
        if not agent:
            return f"You are an expert {agent_type}."

        return self._convert_to_prompt(agent)

    def _convert_to_prompt(self, agent_data: dict) -> str:
        """Convert BMAD agent YAML structure to prompt string."""
        parts = []

        # BMAD format uses nested 'agent' key
        agent = agent_data.get('agent', agent_data)

        # Get metadata (BMAD format: agent.metadata.name, agent.metadata.title)
        metadata = agent.get('metadata', {})
        name = metadata.get('name') or metadata.get('title') or 'Assistant'
        title = metadata.get('title', '')

        # Get persona (BMAD format: agent.persona.role, agent.persona.identity, etc.)
        persona = agent.get('persona', {})
        role = persona.get('role', '')
        identity = persona.get('identity', '')
        communication_style = persona.get('communication_style', '')
        principles = persona.get('principles', '')

        # Build prompt
        if title:
            parts.append(f"# {title}")
        else:
            parts.append(f"# {name}")

        if role:
            parts.append(f"\n**Role:** {role}\n")

        # Identity/Description
        if identity:
            parts.append(f"\n## Identity\n{identity}\n")

        # Communication Style
        if communication_style:
            parts.append(f"\n## Communication Style\n{communication_style}\n")

        # Principles/Guidelines
        if principles:
            parts.append(f"\n## Principles\n{principles}\n")

        # Legacy format support - Responsibilities, Skills, Guidelines, Constraints
        responsibilities = agent.get('responsibilities', [])
        if responsibilities:
            parts.append("\n## Responsibilities")
            for resp in responsibilities:
                parts.append(f"- {resp}")
            parts.append("")

        skills = agent.get('skills', [])
        if skills:
            parts.append("\n## Skills")
            for skill in skills:
                parts.append(f"- {skill}")
            parts.append("")

        guidelines = agent.get('guidelines', [])
        if guidelines:
            parts.append("\n## Guidelines")
            for guide in guidelines:
                parts.append(f"- {guide}")
            parts.append("")

        constraints = agent.get('constraints', [])
        if constraints:
            parts.append("\n## Constraints")
            for constraint in constraints:
                parts.append(f"- {constraint}")
            parts.append("")

        # Menu commands (BMAD specific)
        menu = agent.get('menu', [])
        if menu:
            parts.append("\n## Available Commands")
            for item in menu:
                trigger = item.get('trigger', '')
                description = item.get('description', '')
                if trigger and description:
                    parts.append(f"- **{trigger}**: {description}")
            parts.append("")

        return "\n".join(parts)

    def enhance_prompt(self, base_prompt: str, agent_type: str) -> str:
        """
        Inject BMAD agent expertise into an existing prompt.

        Args:
            base_prompt: The base Auto-Claude prompt
            agent_type: Type of BMAD agent to inject

        Returns:
            Enhanced prompt with BMAD agent context
        """
        agent_prompt = self.get_agent_prompt(agent_type)

        return f"""
{agent_prompt}

---

{base_prompt}
"""

    def get_agent_for_phase(self, phase: str) -> str:
        """
        Get appropriate agent based on the current build phase.

        Args:
            phase: Current phase (spec_creation, planning, implementation, etc.)

        Returns:
            Agent type suitable for this phase
        """
        phase_mapping = {
            # Discovery & Requirements
            'spec_creation': 'pm',
            'requirements': 'analyst',
            'discovery': 'analyst',
            'analysis': 'analyst',
            'prd': 'pm',
            'product': 'pm',

            # Architecture & Design
            'planning': 'architect',
            'design': 'architect',
            'architecture': 'architect',
            'tech_spec': 'architect',
            'solutioning': 'architect',

            # Implementation
            'implementation': 'developer',
            'coding': 'developer',
            'development': 'developer',
            'build': 'developer',
            'quick_flow': 'quick_flow',

            # Testing & QA
            'testing': 'qa',
            'qa': 'qa',
            'verification': 'qa',
            'validation': 'qa',

            # UX/UI
            'ux': 'ux',
            'ui': 'ux',
            'user_experience': 'ux',
            'ux_design': 'ux',

            # Documentation
            'documentation': 'tech_writer',
            'docs': 'tech_writer',
            'readme': 'tech_writer',
            'diagrams': 'tech_writer',

            # Sprint Management
            'sprint': 'sm',
            'story': 'sm',
            'sprint_planning': 'sm',
            'retrospective': 'sm',
        }

        return phase_mapping.get(phase.lower(), 'developer')

    def get_all_agents(self) -> dict[str, str]:
        """
        Get all available BMAD agents with their prompts.

        Returns:
            Dictionary of agent_type -> prompt string
        """
        agents = {}
        for agent_name in self.list_agents():
            prompt = self.get_agent_prompt(agent_name)
            if prompt:
                agents[agent_name] = prompt
        return agents

    def get_agent_metadata(self, agent_type: str) -> dict:
        """
        Get agent metadata (name, title, icon, etc.)

        Args:
            agent_type: Type of agent

        Returns:
            Dictionary with metadata or empty dict if not found
        """
        agent = self.load_agent(agent_type)
        if not agent:
            return {}

        agent_data = agent.get('agent', agent)
        return agent_data.get('metadata', {})

    def get_agent_menu(self, agent_type: str) -> list:
        """
        Get agent menu commands (BMAD workflows/actions)

        Args:
            agent_type: Type of agent

        Returns:
            List of menu items with triggers and descriptions
        """
        agent = self.load_agent(agent_type)
        if not agent:
            return []

        agent_data = agent.get('agent', agent)
        return agent_data.get('menu', [])
