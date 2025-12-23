"""
Tests for core/cache.py
========================

Tests for the caching utilities including LRU cache, JSON file cache,
and cache decorators.
"""

import json
import tempfile
import threading
import time
from pathlib import Path

import pytest


# Import the cache module
from core.cache import (
    JSONFileCache,
    LRUCache,
    _make_cache_key,
    cached_json_load,
    clear_all_caches,
    get_cache_stats,
    get_implementation_plan_cache,
)


class TestLRUCache:
    """Tests for LRUCache class."""

    def test_basic_get_set(self):
        """Test basic get and set operations."""
        cache: LRUCache[str] = LRUCache(maxsize=10)
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"

    def test_get_missing_key(self):
        """Test getting a key that doesn't exist."""
        cache: LRUCache[str] = LRUCache(maxsize=10)
        assert cache.get("nonexistent") is None

    def test_lru_eviction(self):
        """Test that LRU eviction works correctly."""
        cache: LRUCache[int] = LRUCache(maxsize=3)
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)

        # Access 'a' to make it most recently used
        cache.get("a")

        # Add new item, should evict 'b' (least recently used)
        cache.set("d", 4)

        assert cache.get("a") == 1  # Still present
        assert cache.get("b") is None  # Evicted
        assert cache.get("c") == 3  # Still present
        assert cache.get("d") == 4  # Just added

    def test_ttl_expiration(self):
        """Test TTL-based expiration."""
        cache: LRUCache[str] = LRUCache(maxsize=10, ttl_seconds=0.1)
        cache.set("key", "value")

        assert cache.get("key") == "value"

        # Wait for expiration
        time.sleep(0.15)

        assert cache.get("key") is None

    def test_delete(self):
        """Test delete operation."""
        cache: LRUCache[str] = LRUCache(maxsize=10)
        cache.set("key", "value")
        assert cache.delete("key") is True
        assert cache.get("key") is None
        assert cache.delete("nonexistent") is False

    def test_clear(self):
        """Test clear operation."""
        cache: LRUCache[str] = LRUCache(maxsize=10)
        cache.set("key1", "value1")
        cache.set("key2", "value2")
        cache.clear()
        assert cache.get("key1") is None
        assert cache.get("key2") is None

    def test_stats(self):
        """Test cache statistics."""
        cache: LRUCache[str] = LRUCache(maxsize=10)
        cache.set("key", "value")

        cache.get("key")  # Hit
        cache.get("nonexistent")  # Miss

        stats = cache.stats
        assert stats["hits"] == 1
        assert stats["misses"] == 1
        assert stats["size"] == 1
        assert "50.0%" in stats["hit_rate"]

    def test_thread_safety(self):
        """Test thread-safe operations."""
        cache: LRUCache[int] = LRUCache(maxsize=100)
        results = []

        def worker(thread_id: int):
            for i in range(100):
                key = f"key_{thread_id}_{i}"
                cache.set(key, thread_id * 1000 + i)
                value = cache.get(key)
                if value is not None:
                    results.append(value)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # All operations should complete without errors
        assert len(results) > 0


class TestJSONFileCache:
    """Tests for JSONFileCache class."""

    def test_load_file(self):
        """Test loading a JSON file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            data = {"key": "value", "number": 42}
            filepath.write_text(json.dumps(data))

            cache = JSONFileCache(maxsize=10)
            result = cache.load(filepath)

            assert result == data

    def test_cache_hit(self):
        """Test that cache returns cached data on second load."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            data = {"key": "value"}
            filepath.write_text(json.dumps(data))

            cache = JSONFileCache(maxsize=10)

            # First load - cache miss
            result1 = cache.load(filepath)

            # Modify file (but cache should still return old data)
            # We're not modifying mtime in a detectable way here
            # so the cache should return the cached value
            result2 = cache.load(filepath)

            assert result1 == result2

    def test_invalidate_on_file_change(self):
        """Test cache invalidation when file is modified."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            data1 = {"version": 1}
            filepath.write_text(json.dumps(data1))

            cache = JSONFileCache(maxsize=10, ttl_seconds=60)
            result1 = cache.load(filepath)
            assert result1 == data1

            # Wait a bit and modify file
            time.sleep(0.1)
            data2 = {"version": 2}
            filepath.write_text(json.dumps(data2))

            # Cache should detect file modification and reload
            result2 = cache.load(filepath)
            assert result2 == data2

    def test_manual_invalidate(self):
        """Test manual cache invalidation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            data = {"key": "value"}
            filepath.write_text(json.dumps(data))

            cache = JSONFileCache(maxsize=10)
            cache.load(filepath)
            cache.invalidate(filepath)

            # Should reload from file
            assert cache.get(filepath) is None

    def test_nonexistent_file(self):
        """Test loading a file that doesn't exist."""
        cache = JSONFileCache(maxsize=10)
        result = cache.load(Path("/nonexistent/file.json"))
        assert result is None

    def test_invalid_json(self):
        """Test loading an invalid JSON file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "invalid.json"
            filepath.write_text("not valid json {")

            cache = JSONFileCache(maxsize=10)
            result = cache.load(filepath)
            assert result is None


class TestCacheKey:
    """Tests for cache key generation."""

    def test_simple_args(self):
        """Test cache key with simple arguments."""
        key1 = _make_cache_key(("a", 1, True), {})
        key2 = _make_cache_key(("a", 1, True), {})
        assert key1 == key2

    def test_different_args(self):
        """Test that different arguments produce different keys."""
        key1 = _make_cache_key(("a",), {})
        key2 = _make_cache_key(("b",), {})
        assert key1 != key2

    def test_path_args(self):
        """Test cache key with Path arguments."""
        key1 = _make_cache_key((Path("/test/path"),), {})
        key2 = _make_cache_key((Path("/test/path"),), {})
        assert key1 == key2

    def test_kwargs(self):
        """Test cache key with keyword arguments."""
        key1 = _make_cache_key((), {"a": 1, "b": 2})
        key2 = _make_cache_key((), {"b": 2, "a": 1})  # Different order
        assert key1 == key2


class TestGlobalCaches:
    """Tests for global cache instances and utilities."""

    def test_get_implementation_plan_cache(self):
        """Test getting the global implementation plan cache."""
        cache = get_implementation_plan_cache()
        assert isinstance(cache, JSONFileCache)

    def test_clear_all_caches(self):
        """Test clearing all global caches."""
        # Add something to cache
        cache = get_implementation_plan_cache()
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            filepath.write_text('{"test": true}')
            cache.load(filepath)

        clear_all_caches()

        # Stats should show empty caches
        stats = get_cache_stats()
        assert stats["implementation_plan"]["size"] == 0

    def test_cached_json_load(self):
        """Test the cached_json_load convenience function."""
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = Path(tmpdir) / "test.json"
            data = {"key": "value"}
            filepath.write_text(json.dumps(data))

            # Clear first to ensure clean state
            clear_all_caches()

            result = cached_json_load(filepath)
            assert result == data
