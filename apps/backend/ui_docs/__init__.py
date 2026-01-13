"""
UI Framework Documentation Module
==================================

Automatically fetches and caches UI framework documentation for autonomous agents.
Uses Context7 (primary) and Firecrawl (fallback) to fetch documentation.
"""

from .fetcher import (
    ensure_ui_docs_available,
    fetch_ui_framework_docs,
    get_cached_docs_path,
)

__all__ = ["ensure_ui_docs_available", "fetch_ui_framework_docs", "get_cached_docs_path"]
