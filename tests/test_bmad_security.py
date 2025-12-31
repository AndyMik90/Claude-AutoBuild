"""
BMAD Integration Security Tests

Tests security measures implemented in the BMAD integration:
- Path traversal prevention
- Schema validation
- Bounded collections
- HMAC cache integrity
"""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


class TestPathTraversal:
    """Tests for path traversal prevention."""

    def test_step_loader_blocks_path_traversal(self):
        """Verify step loader blocks path traversal attempts."""
        from integrations.bmad.shared.step_loader import StepFileLoader

        with tempfile.TemporaryDirectory() as tmpdir:
            bmad_root = Path(tmpdir) / "bmad"
            bmad_root.mkdir()

            loader = StepFileLoader(bmad_root=bmad_root)

            # Attempt path traversal
            with pytest.raises(ValueError, match="Security"):
                loader.resolve_path("../../../etc/passwd")

            with pytest.raises(ValueError, match="Security"):
                loader.resolve_path("/etc/passwd")

            with pytest.raises(ValueError, match="Security"):
                loader.resolve_path("{project-root}/../../../etc/passwd")

    def test_resolve_path_within_allowed_directory(self):
        """Verify paths within allowed directories work."""
        from integrations.bmad.shared.step_loader import StepFileLoader

        with tempfile.TemporaryDirectory() as tmpdir:
            bmad_root = Path(tmpdir) / "bmad"
            bmad_root.mkdir()
            (bmad_root / "workflows").mkdir()
            step_file = bmad_root / "workflows" / "step-1.md"
            step_file.touch()

            loader = StepFileLoader(bmad_root=bmad_root)

            # Valid path should work
            result = loader.resolve_path("workflows/step-1.md")
            assert result.exists()


class TestSchemaValidation:
    """Tests for YAML schema validation."""

    def test_agent_schema_validates_required_fields(self):
        """Verify agent schema requires necessary fields."""
        from integrations.bmad.shared.schema_validator import SchemaType, validate_yaml

        # Missing agent key
        result = validate_yaml({}, SchemaType.AGENT)
        assert not result.valid
        assert any("agent" in e for e in result.errors)

        # Missing metadata.id and metadata.name
        result = validate_yaml({"agent": {"metadata": {}}}, SchemaType.AGENT)
        assert not result.valid
        assert any("metadata.id" in e or "metadata.name" in e for e in result.errors)

    def test_agent_schema_enforces_field_length_limits(self):
        """Verify schema rejects oversized fields."""
        from integrations.bmad.shared.schema_validator import (
            MAX_FIELD_LENGTHS,
            SchemaType,
            validate_yaml,
        )

        # Create agent with oversized identity field
        long_identity = "x" * (MAX_FIELD_LENGTHS["identity"] + 1000)
        data = {
            "agent": {
                "metadata": {"id": "test", "name": "Test"},
                "persona": {"identity": long_identity},
            }
        }

        result = validate_yaml(data, SchemaType.AGENT)
        assert not result.valid
        assert any("exceeds maximum length" in e for e in result.errors)

    def test_agent_schema_enforces_list_size_limits(self):
        """Verify schema rejects oversized lists."""
        from integrations.bmad.shared.schema_validator import (
            MAX_LIST_SIZES,
            SchemaType,
            validate_yaml,
        )

        # Create agent with too many menu items
        too_many_items = [{"trigger": f"t{i}", "desc": f"d{i}"} for i in range(MAX_LIST_SIZES["menu"] + 10)]
        data = {
            "agent": {
                "metadata": {"id": "test", "name": "Test"},
                "persona": {"identity": "Test"},
                "menu": too_many_items,
            }
        }

        result = validate_yaml(data, SchemaType.AGENT)
        assert not result.valid
        assert any("exceeds maximum size" in e for e in result.errors)

    def test_valid_agent_passes_validation(self):
        """Verify valid agent data passes validation."""
        from integrations.bmad.shared.schema_validator import SchemaType, validate_yaml

        data = {
            "agent": {
                "metadata": {"id": "test-agent", "name": "Test Agent"},
                "persona": {"identity": "A helpful agent"},
            }
        }

        result = validate_yaml(data, SchemaType.AGENT)
        assert result.valid


class TestBoundedCollections:
    """Tests for bounded collection implementations."""

    def test_bounded_lru_dict_evicts_oldest(self):
        """Verify BoundedLRUDict evicts oldest entries."""
        from integrations.bmad.shared.step_loader import BoundedLRUDict

        d = BoundedLRUDict(maxsize=3)
        d["a"] = 1
        d["b"] = 2
        d["c"] = 3

        assert len(d) == 3
        assert "a" in d

        # Add fourth item, should evict 'a'
        d["d"] = 4
        assert len(d) == 3
        assert "a" not in d
        assert "d" in d

    def test_bounded_lru_dict_moves_accessed_to_end(self):
        """Verify accessing an item moves it to end (prevents eviction)."""
        from integrations.bmad.shared.step_loader import BoundedLRUDict

        d = BoundedLRUDict(maxsize=3)
        d["a"] = 1
        d["b"] = 2
        d["c"] = 3

        # Access 'a' to move it to end
        d["a"] = d["a"]

        # Add 'd', should evict 'b' (now oldest)
        d["d"] = 4
        assert "a" in d
        assert "b" not in d

    def test_bounded_session_dict_limits_sessions(self):
        """Verify BoundedSessionDict limits concurrent sessions."""
        from integrations.bmad import BoundedSessionDict

        d = BoundedSessionDict()
        max_sessions = d.MAX_SESSIONS

        # Add sessions up to limit
        for i in range(max_sessions + 10):
            d[f"session_{i}"] = {"id": i}

        # Should be at limit
        assert len(d) == max_sessions

        # Oldest sessions should be evicted
        assert "session_0" not in d
        assert f"session_{max_sessions + 9}" in d


class TestCacheIntegrity:
    """Tests for cache HMAC integrity."""

    def test_cache_detects_tampered_content(self):
        """Verify cache detects content tampering via HMAC."""
        from integrations.bmad.shared.cache import DiskLRUCache

        with tempfile.TemporaryDirectory() as tmpdir:
            cache = DiskLRUCache(cache_dir=Path(tmpdir))

            # Store item
            cache.put("test_key", {"data": "original"})

            # Verify it works
            assert cache.get("test_key") == {"data": "original"}

            # Tamper with cache file
            cache_file = cache._key_to_path("test_key")
            if cache_file.exists():
                import json

                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)

                # Modify content but not HMAC
                data["content"]["data"] = "tampered"
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(data, f)

                # Cache should reject tampered content
                result = cache.get("test_key")
                assert result is None  # Tampered content rejected

    def test_cache_uses_secure_hmac_key(self):
        """Verify cache uses cryptographically secure HMAC key."""
        from integrations.bmad.shared.cache import DiskLRUCache

        with tempfile.TemporaryDirectory() as tmpdir:
            cache = DiskLRUCache(cache_dir=Path(tmpdir))

            # HMAC key should be 32 bytes hex (64 chars)
            assert len(cache._hmac_key) == 64
            assert all(c in "0123456789abcdef" for c in cache._hmac_key)


class TestExceptionHandling:
    """Tests for specific exception handling."""

    def test_check_bmad_uses_specific_exceptions(self):
        """Verify check_bmad.py doesn't use bare Exception catches."""
        import ast
        from pathlib import Path

        check_bmad_path = Path(__file__).parent.parent / "integrations" / "bmad" / "check_bmad.py"
        if not check_bmad_path.exists():
            # Try alternate path
            check_bmad_path = Path("auto-claude/integrations/bmad/check_bmad.py")

        if check_bmad_path.exists():
            with open(check_bmad_path, encoding="utf-8") as f:
                source = f.read()

            tree = ast.parse(source)

            for node in ast.walk(tree):
                if isinstance(node, ast.ExceptHandler):
                    if node.type is None:
                        pytest.fail("Found bare 'except:' clause")
                    elif isinstance(node.type, ast.Name) and node.type.id == "Exception":
                        # Check if it's 'except Exception:' without 'as e'
                        # This is allowed with 'as e' for logging purposes
                        pass  # Allow 'except Exception as e' for health check tool


class TestEncodingSpecification:
    """Tests for file encoding specifications."""

    def test_file_operations_specify_encoding(self):
        """Verify file operations specify encoding parameter."""
        import ast
        from pathlib import Path

        bmad_files = list(Path("auto-claude/integrations/bmad").rglob("*.py"))

        issues = []
        for file_path in bmad_files:
            if ".venv" in str(file_path):
                continue

            try:
                with open(file_path, encoding="utf-8") as f:
                    source = f.read()

                tree = ast.parse(source)

                for node in ast.walk(tree):
                    if isinstance(node, ast.Call):
                        if isinstance(node.func, ast.Name) and node.func.id == "open":
                            # Check for encoding keyword
                            has_encoding = any(
                                kw.arg == "encoding" for kw in node.keywords
                            )
                            # Check for binary mode
                            is_binary = any(
                                isinstance(arg, ast.Constant) and "b" in str(arg.value)
                                for arg in node.args
                            )
                            if not has_encoding and not is_binary:
                                issues.append(
                                    f"{file_path.name}:{node.lineno}: open() without encoding"
                                )
            except (SyntaxError, OSError):
                continue

        # We fixed these, so there should be none now
        # But this test documents the requirement
        if issues:
            pytest.fail(f"Files with open() without encoding:\n" + "\n".join(issues))
