"""
File Evolution Tracker - Backward Compatibility Module
=======================================================

This module maintains backward compatibility by re-exporting the
FileEvolutionTracker class from the refactored file_evolution package.

The actual implementation has been modularized into:
- file_evolution/storage.py: File storage and persistence
- file_evolution/baseline_capture.py: Baseline state capture
- file_evolution/modification_tracker.py: Modification recording
- file_evolution/evolution_queries.py: Query and analysis methods
- file_evolution/tracker.py: Main FileEvolutionTracker class

For new code, prefer importing directly from the package:
    from .file_evolution import FileEvolutionTracker
"""

from .file_evolution import FileEvolutionTracker

__all__ = ["FileEvolutionTracker"]
