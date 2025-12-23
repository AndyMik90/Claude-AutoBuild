"""
Caching Utilities
=================

Provides thread-safe caching for frequently accessed data to improve performance.
Includes LRU caching, file-based caching with TTL, and JSON file caching.

Enterprise features:
- Thread-safe operations
- TTL-based expiration
- Memory-efficient LRU eviction
- File modification tracking for cache invalidation
"""

import hashlib
import json
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from functools import wraps
from pathlib import Path
from typing import Any, Generic, TypeVar

T = TypeVar("T")


@dataclass
class CacheEntry(Generic[T]):
    """A single cache entry with value and metadata."""

    value: T
    created_at: float
    expires_at: float | None = None
    file_mtime: float | None = None  # For file-based cache invalidation

    def is_expired(self) -> bool:
        """Check if this entry has expired."""
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at

    def is_file_stale(self, current_mtime: float) -> bool:
        """Check if the source file has been modified."""
        if self.file_mtime is None:
            return False
        return current_mtime > self.file_mtime


class LRUCache(Generic[T]):
    """
    Thread-safe LRU cache with optional TTL.

    Uses OrderedDict for O(1) access and LRU eviction.
    """

    def __init__(self, maxsize: int = 128, ttl_seconds: float | None = None):
        """
        Initialize LRU cache.

        Args:
            maxsize: Maximum number of entries to store
            ttl_seconds: Optional time-to-live for entries
        """
        self._cache: OrderedDict[str, CacheEntry[T]] = OrderedDict()
        self._lock = threading.RLock()
        self._maxsize = maxsize
        self._ttl = ttl_seconds
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> T | None:
        """
        Get a value from the cache.

        Returns None if key not found or entry expired.
        """
        with self._lock:
            if key not in self._cache:
                self._misses += 1
                return None

            entry = self._cache[key]
            if entry.is_expired():
                del self._cache[key]
                self._misses += 1
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            self._hits += 1
            return entry.value

    def set(self, key: str, value: T, ttl: float | None = None) -> None:
        """
        Set a value in the cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Optional TTL override for this entry
        """
        with self._lock:
            expires_at = None
            effective_ttl = ttl if ttl is not None else self._ttl
            if effective_ttl is not None:
                expires_at = time.time() + effective_ttl

            self._cache[key] = CacheEntry(
                value=value,
                created_at=time.time(),
                expires_at=expires_at,
            )
            self._cache.move_to_end(key)

            # Evict oldest if over capacity
            while len(self._cache) > self._maxsize:
                self._cache.popitem(last=False)

    def delete(self, key: str) -> bool:
        """Delete an entry from the cache."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            self._cache.clear()

    @property
    def stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100) if total > 0 else 0.0
            return {
                "size": len(self._cache),
                "maxsize": self._maxsize,
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": f"{hit_rate:.1f}%",
            }


class JSONFileCache:
    """
    Cache for JSON files with automatic invalidation on file changes.

    Tracks file modification times and automatically invalidates cache
    when source files are modified.
    """

    def __init__(self, maxsize: int = 64, ttl_seconds: float = 300.0):
        """
        Initialize JSON file cache.

        Args:
            maxsize: Maximum number of files to cache
            ttl_seconds: TTL for cache entries (default 5 minutes)
        """
        self._cache: LRUCache[dict] = LRUCache(maxsize=maxsize, ttl_seconds=ttl_seconds)
        self._mtimes: dict[str, float] = {}
        self._lock = threading.RLock()

    def get(self, filepath: Path) -> dict | None:
        """
        Get cached JSON data for a file.

        Returns None if:
        - File not in cache
        - Cache entry expired
        - Source file has been modified
        """
        key = str(filepath.resolve())

        with self._lock:
            # Check if file exists and get mtime
            try:
                current_mtime = filepath.stat().st_mtime
            except OSError:
                # File doesn't exist, remove from cache if present
                self._cache.delete(key)
                return None

            # Check if file was modified since caching
            cached_mtime = self._mtimes.get(key)
            if cached_mtime is not None and current_mtime > cached_mtime:
                # File was modified, invalidate cache
                self._cache.delete(key)
                return None

            return self._cache.get(key)

    def set(self, filepath: Path, data: dict) -> None:
        """Cache JSON data for a file."""
        key = str(filepath.resolve())

        with self._lock:
            try:
                mtime = filepath.stat().st_mtime
            except OSError:
                mtime = time.time()

            self._mtimes[key] = mtime
            self._cache.set(key, data)

    def load(self, filepath: Path) -> dict | None:
        """
        Load JSON file with caching.

        This is the main entry point - it handles both cache hits and misses.
        """
        # Try cache first
        cached = self.get(filepath)
        if cached is not None:
            return cached

        # Cache miss - load from file
        if not filepath.exists():
            return None

        try:
            with open(filepath) as f:
                data = json.load(f)
            self.set(filepath, data)
            return data
        except (OSError, json.JSONDecodeError):
            return None

    def invalidate(self, filepath: Path) -> None:
        """Manually invalidate cache for a file."""
        key = str(filepath.resolve())
        with self._lock:
            self._cache.delete(key)
            self._mtimes.pop(key, None)

    def clear(self) -> None:
        """Clear all cached files."""
        with self._lock:
            self._cache.clear()
            self._mtimes.clear()

    @property
    def stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        return self._cache.stats


# Global cache instances for commonly accessed files
_implementation_plan_cache = JSONFileCache(maxsize=32, ttl_seconds=60.0)
_security_profile_cache = JSONFileCache(maxsize=16, ttl_seconds=300.0)
_context_cache = JSONFileCache(maxsize=32, ttl_seconds=120.0)


def get_implementation_plan_cache() -> JSONFileCache:
    """Get the global implementation plan cache."""
    return _implementation_plan_cache


def get_security_profile_cache() -> JSONFileCache:
    """Get the global security profile cache."""
    return _security_profile_cache


def get_context_cache() -> JSONFileCache:
    """Get the global context cache."""
    return _context_cache


def cached_json_load(filepath: Path, cache: JSONFileCache | None = None) -> dict | None:
    """
    Load a JSON file with caching.

    Uses the default implementation plan cache if no cache specified.
    """
    if cache is None:
        cache = _implementation_plan_cache
    return cache.load(filepath)


def lru_cache_method(maxsize: int = 128, ttl_seconds: float | None = None):
    """
    Decorator for caching instance method results.

    Unlike functools.lru_cache, this properly handles instance methods
    by using instance-specific cache storage.

    Args:
        maxsize: Maximum number of entries per instance
        ttl_seconds: Optional TTL for cache entries
    """

    def decorator(method: Callable) -> Callable:
        cache_attr = f"_cache_{method.__name__}"

        @wraps(method)
        def wrapper(self, *args, **kwargs):
            # Get or create cache for this instance
            if not hasattr(self, cache_attr):
                setattr(
                    self, cache_attr, LRUCache(maxsize=maxsize, ttl_seconds=ttl_seconds)
                )
            cache = getattr(self, cache_attr)

            # Create cache key from arguments
            key = _make_cache_key(args, kwargs)

            # Try cache
            result = cache.get(key)
            if result is not None:
                return result

            # Call method and cache result
            result = method(self, *args, **kwargs)
            if result is not None:
                cache.set(key, result)
            return result

        return wrapper

    return decorator


def _make_cache_key(args: tuple, kwargs: dict) -> str:
    """Create a stable cache key from function arguments."""
    # Convert args and kwargs to a hashable representation
    key_parts = []

    for arg in args:
        if isinstance(arg, Path):
            key_parts.append(str(arg.resolve()))
        elif isinstance(arg, (str, int, float, bool, type(None))):
            key_parts.append(str(arg))
        else:
            # For complex objects, use repr
            key_parts.append(repr(arg))

    for k, v in sorted(kwargs.items()):
        if isinstance(v, Path):
            key_parts.append(f"{k}={v.resolve()}")
        else:
            key_parts.append(f"{k}={v}")

    key_str = "|".join(key_parts)
    return hashlib.md5(key_str.encode()).hexdigest()


def clear_all_caches() -> None:
    """Clear all global caches. Useful for testing or after major changes."""
    _implementation_plan_cache.clear()
    _security_profile_cache.clear()
    _context_cache.clear()


def get_cache_stats() -> dict[str, dict[str, Any]]:
    """Get statistics for all global caches."""
    return {
        "implementation_plan": _implementation_plan_cache.stats,
        "security_profile": _security_profile_cache.stats,
        "context": _context_cache.stats,
    }
