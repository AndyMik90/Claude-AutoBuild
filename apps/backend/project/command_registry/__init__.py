"""
Command Registry Package
========================

Centralized command registry for dynamic security profiles.
Maps technologies to their associated commands for building
tailored security allowlists.

This package is organized into focused modules:
- base: Core shell commands and validated commands
- languages: Programming language-specific commands
- package_managers: Package manager commands
- frameworks: Framework-specific commands
- databases: Database client and ORM commands
- infrastructure: DevOps and infrastructure commands
- cloud: Cloud provider CLI commands
- code_quality: Linting, formatting, and security tools
- version_managers: Runtime version management tools
"""

from .base import BASE_COMMANDS, VALIDATED_COMMANDS
from .cloud import CLOUD_COMMANDS
from .code_quality import CODE_QUALITY_COMMANDS
from .databases import DATABASE_COMMANDS
from .frameworks import FRAMEWORK_COMMANDS
from .infrastructure import INFRASTRUCTURE_COMMANDS
from .languages import LANGUAGE_COMMANDS
from .package_managers import PACKAGE_MANAGER_COMMANDS
from .version_managers import VERSION_MANAGER_COMMANDS

__all__ = [
    # Base commands
    "BASE_COMMANDS",
    "VALIDATED_COMMANDS",
    # Technology-specific command registries
    "LANGUAGE_COMMANDS",
    "PACKAGE_MANAGER_COMMANDS",
    "FRAMEWORK_COMMANDS",
    "DATABASE_COMMANDS",
    "INFRASTRUCTURE_COMMANDS",
    "CLOUD_COMMANDS",
    "CODE_QUALITY_COMMANDS",
    "VERSION_MANAGER_COMMANDS",
]
