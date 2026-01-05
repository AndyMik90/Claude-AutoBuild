"""
Spec Organization
=================

Manages the platform/applet organizational structure for specs,
including discovery, navigation, and ID assignment.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Optional

from .config import NumberingScheme, SpecKitConfig


@dataclass
class SpecInfo:
    """Information about a discovered spec."""

    spec_id: int
    name: str
    domain: str
    category: str  # "platform" or "applets"
    path: Path
    has_spec: bool = False
    has_plan: bool = False
    has_tasks: bool = False


@dataclass
class DomainInfo:
    """Information about a spec domain."""

    name: str
    category: str
    id_range: tuple[int, int]
    specs: list[SpecInfo] = field(default_factory=list)

    @property
    def spec_count(self) -> int:
        return len(self.specs)

    @property
    def next_available_id(self) -> Optional[int]:
        """Get next available ID in this domain."""
        if not self.specs:
            return self.id_range[0]

        used_ids = {s.spec_id for s in self.specs}
        for i in range(self.id_range[0], self.id_range[1] + 1):
            if i not in used_ids:
                return i
        return None


class SpecOrganization:
    """Manages spec-kit organizational structure."""

    def __init__(self, project_dir: Path, config: Optional[SpecKitConfig] = None):
        self.project_dir = project_dir
        self.config = config or SpecKitConfig()
        self.specs_dir = project_dir / self.config.specs_dir
        self._domains: dict[str, DomainInfo] = {}
        self._specs: dict[int, SpecInfo] = {}

    def discover_specs(self) -> dict[str, DomainInfo]:
        """Discover all specs in the project."""
        self._domains = {}
        self._specs = {}

        if not self.specs_dir.exists():
            return self._domains

        # Initialize domains
        numbering = self.config.numbering
        domain_defs = [
            ("platform", "platform", (numbering.PLATFORM_MIN, numbering.PLATFORM_MAX)),
            ("research", "applets", (numbering.RESEARCH_MIN, numbering.RESEARCH_MAX)),
            ("compliance", "applets", (numbering.COMPLIANCE_MIN, numbering.COMPLIANCE_MAX)),
            ("change", "applets", (numbering.CHANGE_MIN, numbering.CHANGE_MAX)),
            ("governance", "applets", (numbering.GOVERNANCE_MIN, numbering.GOVERNANCE_MAX)),
            ("publishing", "applets", (numbering.PUBLISHING_MIN, numbering.PUBLISHING_MAX)),
            ("acquisition", "applets", (numbering.ACQUISITION_MIN, numbering.ACQUISITION_MAX)),
            ("future", "applets", (numbering.FUTURE_MIN, numbering.FUTURE_MAX)),
        ]

        for name, category, id_range in domain_defs:
            self._domains[name] = DomainInfo(
                name=name, category=category, id_range=id_range
            )

        # Discover platform specs
        platform_dir = self.specs_dir / "platform"
        if platform_dir.exists():
            for spec_dir in platform_dir.iterdir():
                if spec_dir.is_dir():
                    spec_info = self._parse_spec_dir(spec_dir, "platform", "platform")
                    if spec_info:
                        self._specs[spec_info.spec_id] = spec_info
                        self._domains["platform"].specs.append(spec_info)

        # Discover applet specs
        applets_dir = self.specs_dir / "applets"
        if applets_dir.exists():
            for domain_dir in applets_dir.iterdir():
                if domain_dir.is_dir():
                    domain_name = domain_dir.name
                    if domain_name in self._domains:
                        for spec_dir in domain_dir.iterdir():
                            if spec_dir.is_dir():
                                spec_info = self._parse_spec_dir(
                                    spec_dir, domain_name, "applets"
                                )
                                if spec_info:
                                    self._specs[spec_info.spec_id] = spec_info
                                    self._domains[domain_name].specs.append(spec_info)

        return self._domains

    def get_spec(self, spec_id: int) -> Optional[SpecInfo]:
        """Get spec info by ID."""
        if not self._specs:
            self.discover_specs()
        return self._specs.get(spec_id)

    def get_spec_by_name(self, name: str) -> Optional[SpecInfo]:
        """Get spec info by name (fuzzy match)."""
        if not self._specs:
            self.discover_specs()

        name_lower = name.lower().replace("-", " ").replace("_", " ")
        for spec in self._specs.values():
            spec_name_lower = spec.name.lower().replace("-", " ").replace("_", " ")
            if name_lower in spec_name_lower or spec_name_lower in name_lower:
                return spec
        return None

    def get_domain(self, domain_name: str) -> Optional[DomainInfo]:
        """Get domain info by name."""
        if not self._domains:
            self.discover_specs()
        return self._domains.get(domain_name)

    def iter_specs(self, domain: Optional[str] = None) -> Iterator[SpecInfo]:
        """Iterate over specs, optionally filtered by domain."""
        if not self._specs:
            self.discover_specs()

        for spec in self._specs.values():
            if domain is None or spec.domain == domain:
                yield spec

    def create_spec_directory(
        self,
        name: str,
        domain: str,
        spec_id: Optional[int] = None,
    ) -> Path:
        """Create a new spec directory with proper organization."""
        if not self._domains:
            self.discover_specs()

        domain_info = self._domains.get(domain)
        if not domain_info:
            raise ValueError(f"Unknown domain: {domain}")

        # Get spec ID
        if spec_id is None:
            spec_id = domain_info.next_available_id
            if spec_id is None:
                raise ValueError(f"No available IDs in domain: {domain}")

        # Validate spec ID is in domain range
        if not (domain_info.id_range[0] <= spec_id <= domain_info.id_range[1]):
            raise ValueError(
                f"Spec ID {spec_id} is not in range for domain {domain}: "
                f"{domain_info.id_range[0]}-{domain_info.id_range[1]}"
            )

        # Check ID not already used
        if spec_id in self._specs:
            raise ValueError(f"Spec ID {spec_id} is already used")

        # Build directory path
        slug = name.lower().replace(" ", "-").replace("_", "-")
        dir_name = f"{spec_id:03d}-{slug}"

        if domain_info.category == "platform":
            spec_path = self.specs_dir / "platform" / dir_name
        else:
            spec_path = self.specs_dir / "applets" / domain / dir_name

        # Create directory
        spec_path.mkdir(parents=True, exist_ok=True)

        return spec_path

    def get_auto_claude_spec_name(self, spec_info: SpecInfo) -> str:
        """Get the Auto-Claude spec name for a spec-kit spec."""
        slug = spec_info.name.lower().replace(" ", "-").replace("_", "-")
        return f"{spec_info.spec_id:03d}-{slug}"

    def _parse_spec_dir(
        self, spec_dir: Path, domain: str, category: str
    ) -> Optional[SpecInfo]:
        """Parse a spec directory to extract info."""
        # Parse ID and name from directory name
        match = re.match(r"(\d{3})-(.+)", spec_dir.name)
        if not match:
            return None

        try:
            spec_id = int(match.group(1))
        except ValueError:
            return None

        name = match.group(2).replace("-", " ").title()

        # Check for spec files
        spec_file = spec_dir / self.config.spec_file
        plan_file = spec_dir / self.config.plan_file
        tasks_file = spec_dir / self.config.tasks_file

        return SpecInfo(
            spec_id=spec_id,
            name=name,
            domain=domain,
            category=category,
            path=spec_dir,
            has_spec=spec_file.exists(),
            has_plan=plan_file.exists(),
            has_tasks=tasks_file.exists(),
        )

    def print_summary(self) -> str:
        """Print a summary of discovered specs."""
        if not self._domains:
            self.discover_specs()

        lines = ["# Spec Organization Summary", ""]

        # Platform specs
        platform = self._domains.get("platform")
        if platform and platform.specs:
            lines.append("## Platform Specs")
            lines.append("")
            for spec in sorted(platform.specs, key=lambda s: s.spec_id):
                status = []
                if spec.has_spec:
                    status.append("spec")
                if spec.has_plan:
                    status.append("plan")
                if spec.has_tasks:
                    status.append("tasks")
                status_str = ", ".join(status) if status else "empty"
                lines.append(f"- [{spec.spec_id:03d}] {spec.name} ({status_str})")
            lines.append("")

        # Applet domains
        for domain_name in ["research", "compliance", "change", "governance", "publishing", "acquisition"]:
            domain = self._domains.get(domain_name)
            if domain and domain.specs:
                lines.append(f"## {domain_name.title()} Applets")
                lines.append("")
                for spec in sorted(domain.specs, key=lambda s: s.spec_id):
                    status = []
                    if spec.has_spec:
                        status.append("spec")
                    if spec.has_plan:
                        status.append("plan")
                    if spec.has_tasks:
                        status.append("tasks")
                    status_str = ", ".join(status) if status else "empty"
                    lines.append(f"- [{spec.spec_id:03d}] {spec.name} ({status_str})")
                lines.append("")

        return "\n".join(lines)
