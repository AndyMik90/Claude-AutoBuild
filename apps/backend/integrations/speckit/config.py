"""
Spec-Kit Configuration
======================

Configuration for spec-kit integration including:
- Directory structure patterns
- Numbering scheme definitions
- Template mappings
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class NumberingScheme:
    """Defines the spec-kit numbering scheme for organization."""

    # Platform Infrastructure
    PLATFORM_MIN: int = 1
    PLATFORM_MAX: int = 99

    # Applet Domains
    RESEARCH_MIN: int = 101
    RESEARCH_MAX: int = 199

    COMPLIANCE_MIN: int = 201
    COMPLIANCE_MAX: int = 299

    CHANGE_MIN: int = 301
    CHANGE_MAX: int = 399

    GOVERNANCE_MIN: int = 401
    GOVERNANCE_MAX: int = 499

    PUBLISHING_MIN: int = 501
    PUBLISHING_MAX: int = 599

    ACQUISITION_MIN: int = 601
    ACQUISITION_MAX: int = 699

    # Future/Gap
    FUTURE_MIN: int = 901
    FUTURE_MAX: int = 999

    def get_domain(self, spec_id: int) -> str:
        """Get the domain name for a spec ID."""
        if self.PLATFORM_MIN <= spec_id <= self.PLATFORM_MAX:
            return "platform"
        elif self.RESEARCH_MIN <= spec_id <= self.RESEARCH_MAX:
            return "research"
        elif self.COMPLIANCE_MIN <= spec_id <= self.COMPLIANCE_MAX:
            return "compliance"
        elif self.CHANGE_MIN <= spec_id <= self.CHANGE_MAX:
            return "change"
        elif self.GOVERNANCE_MIN <= spec_id <= self.GOVERNANCE_MAX:
            return "governance"
        elif self.PUBLISHING_MIN <= spec_id <= self.PUBLISHING_MAX:
            return "publishing"
        elif self.ACQUISITION_MIN <= spec_id <= self.ACQUISITION_MAX:
            return "acquisition"
        elif self.FUTURE_MIN <= spec_id <= self.FUTURE_MAX:
            return "future"
        else:
            return "unknown"

    def get_next_id(self, domain: str, existing_ids: list[int]) -> int:
        """Get the next available ID for a domain."""
        domain_range = self._get_domain_range(domain)
        if not domain_range:
            raise ValueError(f"Unknown domain: {domain}")

        min_id, max_id = domain_range
        domain_ids = [i for i in existing_ids if min_id <= i <= max_id]

        if not domain_ids:
            return min_id

        next_id = max(domain_ids) + 1
        if next_id > max_id:
            raise ValueError(f"No more IDs available in domain: {domain}")

        return next_id

    def _get_domain_range(self, domain: str) -> Optional[tuple[int, int]]:
        """Get the ID range for a domain."""
        ranges = {
            "platform": (self.PLATFORM_MIN, self.PLATFORM_MAX),
            "research": (self.RESEARCH_MIN, self.RESEARCH_MAX),
            "compliance": (self.COMPLIANCE_MIN, self.COMPLIANCE_MAX),
            "change": (self.CHANGE_MIN, self.CHANGE_MAX),
            "governance": (self.GOVERNANCE_MIN, self.GOVERNANCE_MAX),
            "publishing": (self.PUBLISHING_MIN, self.PUBLISHING_MAX),
            "acquisition": (self.ACQUISITION_MIN, self.ACQUISITION_MAX),
            "future": (self.FUTURE_MIN, self.FUTURE_MAX),
        }
        return ranges.get(domain)


@dataclass
class SpecKitConfig:
    """Configuration for spec-kit integration."""

    # Enable spec-kit mode
    enabled: bool = True

    # Spec-kit specs directory (relative to project root)
    specs_dir: str = "specs"

    # Use platform/applet organization
    use_organization: bool = True

    # Numbering scheme
    numbering: NumberingScheme = field(default_factory=NumberingScheme)

    # Template files expected in spec-kit format
    spec_file: str = "spec.md"
    plan_file: str = "plan.md"
    tasks_file: str = "tasks.md"

    # Additional spec-kit files to look for
    additional_files: list[str] = field(
        default_factory=lambda: [
            "data-model.md",
            "api-spec.md",
            "ui-spec.md",
            "test-plan.md",
        ]
    )

    # Auto-Claude output directory (within .auto-claude)
    output_dir: str = ".auto-claude/specs"

    # Whether to preserve original spec-kit structure alongside Auto-Claude
    preserve_original: bool = True

    # Convert spec-kit tasks.md to Auto-Claude subtasks
    convert_tasks_to_subtasks: bool = True

    @classmethod
    def from_file(cls, config_path: Path) -> "SpecKitConfig":
        """Load configuration from a JSON file."""
        import json

        if not config_path.exists():
            return cls()

        with open(config_path) as f:
            data = json.load(f)

        # Handle nested numbering config
        numbering_data = data.pop("numbering", {})
        numbering = NumberingScheme(**numbering_data) if numbering_data else NumberingScheme()

        return cls(numbering=numbering, **data)

    def to_dict(self) -> dict:
        """Convert configuration to dictionary."""
        return {
            "enabled": self.enabled,
            "specs_dir": self.specs_dir,
            "use_organization": self.use_organization,
            "numbering": {
                "platform": [self.numbering.PLATFORM_MIN, self.numbering.PLATFORM_MAX],
                "research": [self.numbering.RESEARCH_MIN, self.numbering.RESEARCH_MAX],
                "compliance": [self.numbering.COMPLIANCE_MIN, self.numbering.COMPLIANCE_MAX],
                "change": [self.numbering.CHANGE_MIN, self.numbering.CHANGE_MAX],
                "governance": [self.numbering.GOVERNANCE_MIN, self.numbering.GOVERNANCE_MAX],
                "publishing": [self.numbering.PUBLISHING_MIN, self.numbering.PUBLISHING_MAX],
                "acquisition": [self.numbering.ACQUISITION_MIN, self.numbering.ACQUISITION_MAX],
                "future": [self.numbering.FUTURE_MIN, self.numbering.FUTURE_MAX],
            },
            "spec_file": self.spec_file,
            "plan_file": self.plan_file,
            "tasks_file": self.tasks_file,
            "additional_files": self.additional_files,
            "output_dir": self.output_dir,
            "preserve_original": self.preserve_original,
            "convert_tasks_to_subtasks": self.convert_tasks_to_subtasks,
        }
