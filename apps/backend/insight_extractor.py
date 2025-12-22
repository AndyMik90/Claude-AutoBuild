"""
Insight Extractor Re-export
===========================

Re-exports the insight_extractor module from analysis/ for backwards compatibility.
Uses importlib to avoid triggering analysis/__init__.py imports.
"""

import importlib.util
import sys
from pathlib import Path

# Load the module directly without going through the package
_module_path = Path(__file__).parent / "analysis" / "insight_extractor.py"
_spec = importlib.util.spec_from_file_location("_insight_extractor_impl", _module_path)
_module = importlib.util.module_from_spec(_spec)
sys.modules["_insight_extractor_impl"] = _module
_spec.loader.exec_module(_module)

# Re-export all public functions
extract_session_insights = _module.extract_session_insights
gather_extraction_inputs = _module.gather_extraction_inputs
get_changed_files = _module.get_changed_files
get_commit_messages = _module.get_commit_messages
get_extraction_model = _module.get_extraction_model
get_session_diff = _module.get_session_diff
is_extraction_enabled = _module.is_extraction_enabled
parse_insights = _module.parse_insights
run_insight_extraction = _module.run_insight_extraction

__all__ = [
    "extract_session_insights",
    "gather_extraction_inputs",
    "get_changed_files",
    "get_commit_messages",
    "get_extraction_model",
    "get_session_diff",
    "is_extraction_enabled",
    "parse_insights",
    "run_insight_extraction",
]
