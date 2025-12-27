"""
Pytest configuration for MemoryGraph integration tests.
"""
import sys
from pathlib import Path

# Add apps/backend to path for imports
backend_path = Path(__file__).parent.parent.parent.parent / "apps" / "backend"
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))
