"""
GitHub Orchestrator Services
============================

Service layer for GitHub automation workflows.

NOTE: Uses lazy imports to avoid circular dependency with context_gatherer.py.
The circular import chain was: orchestrator → context_gatherer → services.io_utils
→ services/__init__ → pr_review_engine → context_gatherer (circular!)
"""

from __future__ import annotations

# Lazy import mapping - classes are loaded on first access
_LAZY_IMPORTS: dict[str, tuple[str, str]] = {
    "AutoFixProcessor": (".autofix_processor", "AutoFixProcessor"),
    "BatchProcessor": (".batch_processor", "BatchProcessor"),
    "PRReviewEngine": (".pr_review_engine", "PRReviewEngine"),
    "PromptManager": (".prompt_manager", "PromptManager"),
    "ResponseParser": (".response_parsers", "ResponseParser"),
    "TriageEngine": (".triage_engine", "TriageEngine"),
}

__all__ = [
    "PromptManager",
    "ResponseParser",
    "PRReviewEngine",
    "TriageEngine",
    "AutoFixProcessor",
    "BatchProcessor",
]

# Cache for lazily loaded modules
_loaded: dict[str, object] = {}


def __getattr__(name: str) -> object:
    """Lazy import handler - loads classes on first access."""
    if name in _LAZY_IMPORTS:
        if name not in _loaded:
            module_name, attr_name = _LAZY_IMPORTS[name]
            import importlib

            module = importlib.import_module(module_name, __name__)
            _loaded[name] = getattr(module, attr_name)
        return _loaded[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
