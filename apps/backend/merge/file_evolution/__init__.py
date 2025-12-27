"""
File Evolution Package
=======================

Modular file evolution tracking system.

Components:
- storage: File storage and persistence
- baseline_capture: Baseline state capture
- modification_tracker: Modification recording and analysis
- evolution_queries: Query and analysis methods
- tracker: Main FileEvolutionTracker class
"""

from .baseline_capture import DEFAULT_EXTENSIONS, BaselineCapture
from .evolution_queries import EvolutionQueries
from .modification_tracker import ModificationTracker
from .storage import EvolutionStorage
from .tracker import FileEvolutionTracker

__all__ = [
    "FileEvolutionTracker",
    "EvolutionStorage",
    "BaselineCapture",
    "ModificationTracker",
    "EvolutionQueries",
    "DEFAULT_EXTENSIONS",
]
