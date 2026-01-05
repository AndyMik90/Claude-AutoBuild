"""
Spec-Kit Integration Layer for Auto-Claude
==========================================

This module provides integration between GitHub's spec-kit specification
methodology and Auto-Claude's autonomous execution framework.

Features:
- Native spec-kit template support (spec.md, plan.md, tasks.md)
- Platform/Applet organization (001-999 numbering scheme)
- Unified slash commands
- Bidirectional conversion between formats

Usage:
    from integrations.speckit import SpecKitIntegration

    integration = SpecKitIntegration(project_dir)
    auto_claude_spec = integration.convert_from_speckit(speckit_dir)
"""

from .config import SpecKitConfig
from .converter import SpecKitConverter
from .organization import SpecOrganization

__all__ = [
    "SpecKitConfig",
    "SpecKitConverter",
    "SpecOrganization",
]

__version__ = "0.1.0"
