"""
BMAD Integration for Auto-Claude

This module provides integration between BMAD-METHOD's structured agile methodology
and Auto-Claude's autonomous execution engine.

Key components:
- BlueprintManager: Manages sequential component execution with verification gates
- BlueprintBuildOrchestrator: Orchestrates the build process for blueprint components
- BMADAgentLoader: Loads and converts BMAD agents for Auto-Claude use
- StoryConverter: Converts BMAD stories to Auto-Claude subtasks
- ComponentReferenceParser: Parses user references like "Fix Component 3"
- VerificationGate: Verifies component meets acceptance criteria before proceeding
"""

from .blueprint import BlueprintManager, Blueprint, BlueprintComponent, ComponentStatus
from .blueprint_build import BlueprintBuildOrchestrator

__all__ = [
    'BlueprintManager',
    'Blueprint',
    'BlueprintComponent',
    'ComponentStatus',
    'BlueprintBuildOrchestrator',
]
