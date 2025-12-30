"""
Disk + LRU Cache System - Efficient caching for BMAD content.

Two-tier caching strategy:
1. Disk cache: Persistent storage of parsed YAML/MD content
2. LRU memory cache: Fast access for recently used items

Features:
- TTL-based expiration (default 1 hour)
- LRU eviction for memory cache
- HMAC-based integrity verification
- Automatic cache invalidation on source file changes

Based on BMAD Full Integration Product Brief ADR-002.
"""

import hashlib
import hmac
import json
import os
import sys
import threading
import time
from collections import OrderedDict
from dataclasses import asdict, dataclass, is_dataclass
from pathlib import Path
from typing import Any, Generic, TypeVar


def _serialize_value(obj: Any) -> Any:
    """Convert dataclasses and Paths to JSON-serializable format."""
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: _serialize_value(v) for k, v in asdict(obj).items()}
    elif isinstance(obj, Path):
        return str(obj)
    elif isinstance(obj, dict):
        return {k: _serialize_value(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_serialize_value(v) for v in obj]
    elif hasattr(obj, "value"):  # Enum
        return obj.value
    return obj


T = TypeVar("T")


@dataclass
class CacheEntry(Generic[T]):
    """A cached item with metadata."""

    key: str
    value: T
    created_at: float
    expires_at: float
    source_path: Path | None = None
    source_mtime: float | None = None
    hits: int = 0
    size_bytes: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() > self.expires_at

    @property
    def is_stale(self) -> bool:
        """Check if source file changed since caching."""
        if self.source_path and self.source_mtime:
            try:
                current_mtime = self.source_path.stat().st_mtime
                return current_mtime > self.source_mtime
            except FileNotFoundError:
                return True  # Source deleted, cache is stale
        return False

    def touch(self) -> None:
        """Record a cache hit."""
        self.hits += 1


class LRUCache(Generic[T]):
    """Thread-safe LRU cache with size limit."""

    def __init__(self, max_size: int = 100, max_bytes: int | None = None):
        self.max_size = max_size
        self.max_bytes = max_bytes or (50 * 1024 * 1024)  # 50MB default
        self._cache: OrderedDict[str, CacheEntry[T]] = OrderedDict()
        self._lock = threading.RLock()
        self._total_bytes = 0

    def get(self, key: str) -> T | None:
        """Get item from cache, returns None if not found or expired."""
        with self._lock:
            if key not in self._cache:
                return None

            entry = self._cache[key]

            # Check expiration and staleness
            if entry.is_expired or entry.is_stale:
                del self._cache[key]
                self._total_bytes -= entry.size_bytes
                return None

            # Move to end (most recently used)
            self._cache.move_to_end(key)
            entry.touch()
            return entry.value

    def put(
        self,
        key: str,
        value: T,
        ttl_seconds: int = 3600,
        source_path: Path | None = None,
    ) -> None:
        """Add item to cache with TTL."""
        with self._lock:
            # Estimate size using json (safer than pickle for untrusted objects)
            try:
                size_bytes = len(json.dumps(_serialize_value(value)).encode('utf-8'))
            except (TypeError, ValueError):
                # Fallback to sys.getsizeof for non-JSON-serializable objects
                size_bytes = sys.getsizeof(value)

            now = time.time()
            entry = CacheEntry(
                key=key,
                value=value,
                created_at=now,
                expires_at=now + ttl_seconds,
                source_path=source_path,
                source_mtime=source_path.stat().st_mtime
                if source_path and source_path.exists()
                else None,
                size_bytes=size_bytes,
            )

            # Remove old entry if exists
            if key in self._cache:
                old_entry = self._cache[key]
                self._total_bytes -= old_entry.size_bytes
                del self._cache[key]

            # Evict if necessary
            while (
                len(self._cache) >= self.max_size
                or self._total_bytes + size_bytes > self.max_bytes
            ):
                if not self._cache:
                    break
                # Remove least recently used (first item)
                _, evicted = self._cache.popitem(last=False)
                self._total_bytes -= evicted.size_bytes

            self._cache[key] = entry
            self._total_bytes += size_bytes

    def invalidate(self, key: str) -> bool:
        """Remove specific item from cache."""
        with self._lock:
            if key in self._cache:
                entry = self._cache.pop(key)
                self._total_bytes -= entry.size_bytes
                return True
            return False

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all items with key prefix."""
        with self._lock:
            keys_to_remove = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_remove:
                entry = self._cache.pop(key)
                self._total_bytes -= entry.size_bytes
            return len(keys_to_remove)

    def clear(self) -> None:
        """Clear all cached items."""
        with self._lock:
            self._cache.clear()
            self._total_bytes = 0

    def get_stats(self) -> dict:
        """Get cache statistics."""
        with self._lock:
            total_hits = sum(e.hits for e in self._cache.values())
            return {
                "size": len(self._cache),
                "max_size": self.max_size,
                "bytes_used": self._total_bytes,
                "max_bytes": self.max_bytes,
                "total_hits": total_hits,
                "entries": [
                    {
                        "key": k,
                        "hits": e.hits,
                        "age_seconds": time.time() - e.created_at,
                        "expires_in": e.expires_at - time.time(),
                        "size_bytes": e.size_bytes,
                    }
                    for k, e in self._cache.items()
                ],
            }


class DiskLRUCache(Generic[T]):
    """
    Two-tier cache: Disk persistence + LRU memory cache.

    Disk format: JSON files with HMAC integrity check
    Memory: LRU cache for fast repeated access
    """

    def __init__(
        self,
        cache_dir: Path,
        secret_key: str | None = None,
        memory_max_size: int = 100,
        memory_max_bytes: int = 50 * 1024 * 1024,
        default_ttl: int = 3600,
    ):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        # Use provided key or generate from machine ID
        self._secret = (secret_key or self._get_machine_key()).encode()

        # In-memory LRU layer
        self._memory = LRUCache[T](max_size=memory_max_size, max_bytes=memory_max_bytes)

        self.default_ttl = default_ttl

    def _get_machine_key(self) -> str:
        """Generate a machine-specific key for HMAC."""
        import platform

        # Cross-platform user ID: os.getuid() on POSIX, USERNAME on Windows
        user_id = os.getuid() if hasattr(os, 'getuid') else os.environ.get('USERNAME', 'default')
        machine_id = f"{platform.node()}-{user_id}"
        return hashlib.sha256(machine_id.encode()).hexdigest()[:32]

    def _compute_hmac(self, data: bytes) -> str:
        """Compute HMAC for data integrity."""
        return hmac.new(self._secret, data, hashlib.sha256).hexdigest()

    def _key_to_path(self, key: str) -> Path:
        """Convert cache key to file path."""
        # Use hash to handle long/special chars in keys
        key_hash = hashlib.md5(key.encode()).hexdigest()
        return self.cache_dir / f"{key_hash}.cache"

    def get(self, key: str) -> T | None:
        """
        Get item from cache.

        Checks memory first, then disk.
        """
        # Try memory cache first
        value = self._memory.get(key)
        if value is not None:
            return value

        # Try disk cache
        cache_file = self._key_to_path(key)
        if not cache_file.exists():
            return None

        try:
            with open(cache_file) as f:
                data = json.load(f)

            # Verify HMAC
            stored_hmac = data.get("hmac")
            content = json.dumps(data.get("content"), sort_keys=True).encode()
            if not hmac.compare_digest(stored_hmac, self._compute_hmac(content)):
                # Integrity check failed
                cache_file.unlink()
                return None

            # Check expiration
            if time.time() > data.get("expires_at", 0):
                cache_file.unlink()
                return None

            # Check source staleness
            source_path = data.get("source_path")
            source_mtime = data.get("source_mtime")
            if source_path and source_mtime:
                try:
                    current_mtime = Path(source_path).stat().st_mtime
                    if current_mtime > source_mtime:
                        cache_file.unlink()
                        return None
                except FileNotFoundError:
                    cache_file.unlink()
                    return None

            value = data["content"]

            # Promote to memory cache
            self._memory.put(
                key,
                value,
                ttl_seconds=int(data["expires_at"] - time.time()),
                source_path=Path(source_path) if source_path else None,
            )

            return value

        except (json.JSONDecodeError, KeyError, OSError):
            # Corrupted or invalid cache file
            try:
                cache_file.unlink()
            except Exception:
                pass
            return None

    def put(
        self,
        key: str,
        value: T,
        ttl_seconds: int | None = None,
        source_path: Path | None = None,
    ) -> None:
        """
        Store item in both memory and disk cache.
        """
        ttl = ttl_seconds or self.default_ttl
        expires_at = time.time() + ttl

        # Add to memory cache
        self._memory.put(key, value, ttl, source_path)

        # Serialize for disk - convert dataclasses to dicts
        try:
            serialized_value = _serialize_value(value)
            content_json = json.dumps(serialized_value, sort_keys=True, default=str)
        except (TypeError, ValueError):
            # If can't serialize to JSON, use pickle for memory only
            return

        # Compute HMAC
        content_hmac = self._compute_hmac(content_json.encode())

        # Write to disk
        cache_file = self._key_to_path(key)
        disk_data = {
            "key": key,
            "content": serialized_value,
            "expires_at": expires_at,
            "created_at": time.time(),
            "source_path": str(source_path) if source_path else None,
            "source_mtime": source_path.stat().st_mtime
            if source_path and source_path.exists()
            else None,
            "hmac": content_hmac,
        }

        try:
            with open(cache_file, "w") as f:
                json.dump(disk_data, f)
        except (OSError, TypeError):
            pass  # Disk write failed, memory cache still works

    def invalidate(self, key: str) -> bool:
        """Remove item from both caches."""
        memory_removed = self._memory.invalidate(key)

        cache_file = self._key_to_path(key)
        disk_removed = False
        if cache_file.exists():
            try:
                cache_file.unlink()
                disk_removed = True
            except OSError:
                pass

        return memory_removed or disk_removed

    def invalidate_prefix(self, prefix: str) -> int:
        """Remove all items with key prefix."""
        count = self._memory.invalidate_prefix(prefix)

        # For disk, we need to scan files
        for cache_file in self.cache_dir.glob("*.cache"):
            try:
                with open(cache_file) as f:
                    data = json.load(f)
                if data.get("key", "").startswith(prefix):
                    cache_file.unlink()
                    count += 1
            except Exception:
                pass

        return count

    def clear(self) -> None:
        """Clear all cached items."""
        self._memory.clear()

        # Clear disk cache
        for cache_file in self.cache_dir.glob("*.cache"):
            try:
                cache_file.unlink()
            except OSError:
                pass

    def get_stats(self) -> dict:
        """Get cache statistics."""
        memory_stats = self._memory.get_stats()

        # Count disk cache files
        disk_count = 0
        disk_bytes = 0
        for cache_file in self.cache_dir.glob("*.cache"):
            disk_count += 1
            disk_bytes += cache_file.stat().st_size

        return {
            "memory": memory_stats,
            "disk": {
                "count": disk_count,
                "bytes": disk_bytes,
                "directory": str(self.cache_dir),
            },
        }

    def cleanup_expired(self) -> int:
        """Remove expired entries from disk cache."""
        removed = 0
        now = time.time()

        for cache_file in self.cache_dir.glob("*.cache"):
            try:
                with open(cache_file) as f:
                    data = json.load(f)

                if now > data.get("expires_at", 0):
                    cache_file.unlink()
                    removed += 1
            except Exception:
                # Invalid file, remove it
                try:
                    cache_file.unlink()
                    removed += 1
                except Exception:
                    pass

        return removed
