"""
BMAD Module Loaders - Load agents and workflows from BMAD modules.

Modules:
- Core: bmad-master orchestrator, brainstorming, party-mode
- BMM: 9 agile agents, 32 workflows (main development module)
- BMGD: 6 game dev agents, 29 workflows
- CIS: 6 creative agents, 4 workflows
- BMB: 1 builder agent, 7 workflows
"""

from .core_loader import CoreModuleLoader
from .bmm_loader import BMMModuleLoader
from .bmgd_loader import BMGDModuleLoader
from .cis_loader import CISModuleLoader
from .bmb_loader import BMBModuleLoader

__all__ = [
    'CoreModuleLoader',
    'BMMModuleLoader',
    'BMGDModuleLoader',
    'CISModuleLoader',
    'BMBModuleLoader',
]
