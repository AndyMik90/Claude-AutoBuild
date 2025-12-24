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
    AGENT_MAPPING = {
        "pm": "pm.agent.yaml",
        "product_manager": "pm.agent.yaml",
        "architect": "architect.agent.yaml",
        "developer": "dev.agent.yaml",
        "dev": "dev.agent.yaml",
        "ux": "ux-designer.agent.yaml",
        "ux_designer": "ux-designer.agent.yaml",
        "qa": "tea.agent.yaml",
        "test_architect": "tea.agent.yaml",
        "analyst": "analyst.agent.yaml",
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

    def _convert_to_prompt(self, agent: dict) -> str:
        """Convert BMAD agent YAML structure to prompt string."""
        parts = []

        # Agent identity
        name = agent.get('name', 'Assistant')
        role = agent.get('role', '')
        parts.append(f"# {name}")
        if role:
            parts.append(f"\n**Role:** {role}\n")

        # Description
        description = agent.get('description', '')
        if description:
            parts.append(f"\n## Description\n{description}\n")

        # Responsibilities
        responsibilities = agent.get('responsibilities', [])
        if responsibilities:
            parts.append("\n## Responsibilities")
            for resp in responsibilities:
                parts.append(f"- {resp}")
            parts.append("")

        # Skills
        skills = agent.get('skills', [])
        if skills:
            parts.append("\n## Skills")
            for skill in skills:
                parts.append(f"- {skill}")
            parts.append("")

        # Guidelines
        guidelines = agent.get('guidelines', [])
        if guidelines:
            parts.append("\n## Guidelines")
            for guide in guidelines:
                parts.append(f"- {guide}")
            parts.append("")

        # Constraints
        constraints = agent.get('constraints', [])
        if constraints:
            parts.append("\n## Constraints")
            for constraint in constraints:
                parts.append(f"- {constraint}")
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
            'spec_creation': 'pm',
            'requirements': 'analyst',
            'discovery': 'analyst',
            'planning': 'architect',
            'design': 'architect',
            'implementation': 'developer',
            'coding': 'developer',
            'testing': 'qa',
            'qa': 'qa',
            'verification': 'qa',
            'ux': 'ux',
            'ui': 'ux',
        }

        return phase_mapping.get(phase.lower(), 'developer')
