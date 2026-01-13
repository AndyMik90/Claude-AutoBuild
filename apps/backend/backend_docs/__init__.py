"""
Backend Framework Documentation Module
========================================

Provides automatic fetching and caching of backend framework documentation
from Context7 and other sources.
"""

from .fetcher import (
    BACKEND_FRAMEWORK_DOCS,
    ensure_backend_docs_available,
    fetch_backend_framework_docs,
    get_cached_docs_path,
)

__all__ = [
    "BACKEND_FRAMEWORK_DOCS",
    "ensure_backend_docs_available",
    "fetch_backend_framework_docs",
    "get_cached_docs_path",
]
