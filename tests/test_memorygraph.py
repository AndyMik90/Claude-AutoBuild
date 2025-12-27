"""Tests for MemoryGraph integration."""
import os

# Add auto-claude to path
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "apps" / "backend"))

from integrations.memorygraph.client import MemoryGraphClient
from integrations.memorygraph.config import (
    MemoryGraphConfig,
    clear_config_cache,
    get_memorygraph_config,
    is_memorygraph_enabled,
)
from integrations.memorygraph.context import get_context_for_subtask
from integrations.memorygraph.formatting import format_context


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear config cache before each test."""
    clear_config_cache()
    yield
    clear_config_cache()


class TestIsMemoryGraphEnabled:
    """Tests for is_memorygraph_enabled function."""

    def test_returns_false_when_not_set(self):
        """Returns False when MEMORYGRAPH_ENABLED is not set."""
        with patch.dict(os.environ, {}, clear=True):
            assert is_memorygraph_enabled() is False

    def test_returns_false_when_disabled(self):
        """Returns False when MEMORYGRAPH_ENABLED is false."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "false"}, clear=True):
            assert is_memorygraph_enabled() is False

    def test_returns_true_when_enabled(self):
        """Returns True when MEMORYGRAPH_ENABLED is true."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "true"}, clear=True):
            assert is_memorygraph_enabled() is True

    def test_case_insensitive(self):
        """Environment variable check is case insensitive."""
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "True"}, clear=True):
            clear_config_cache()
            assert is_memorygraph_enabled() is True
        with patch.dict(os.environ, {"MEMORYGRAPH_ENABLED": "FALSE"}, clear=True):
            clear_config_cache()
            assert is_memorygraph_enabled() is False


class TestGetMemoryGraphConfig:
    """Tests for get_memorygraph_config function."""

    def test_default_config(self):
        """Returns default config when environment variables not set."""
        with patch.dict(os.environ, {}, clear=True):
            config = get_memorygraph_config()
            assert config["enabled"] is False
            assert config["backend"] == "sqlite"
            assert config["project_scoped"] is True

    def test_custom_backend(self):
        """Returns custom backend from environment."""
        with patch.dict(os.environ, {
            "MEMORYGRAPH_ENABLED": "true",
            "MEMORYGRAPH_BACKEND": "neo4j"
        }, clear=True):
            config = get_memorygraph_config()
            assert config["enabled"] is True
            assert config["backend"] == "neo4j"


class TestMemoryGraphConfig:
    """Tests for MemoryGraphConfig dataclass."""

    def test_from_env_defaults(self):
        """Config uses correct defaults."""
        with patch.dict(os.environ, {}, clear=True):
            config = MemoryGraphConfig.from_env()
            assert config.enabled is False
            assert config.backend == "sqlite"
            assert config.project_scoped is True

    def test_from_env_custom_values(self):
        """Config reads custom environment values."""
        with patch.dict(os.environ, {
            "MEMORYGRAPH_ENABLED": "true",
            "MEMORYGRAPH_BACKEND": "falkordb",
            "MEMORYGRAPH_PROJECT_SCOPED": "false"
        }, clear=True):
            config = MemoryGraphConfig.from_env()
            assert config.enabled is True
            assert config.backend == "falkordb"
            assert config.project_scoped is False


class TestMemoryGraphClient:
    """Tests for MemoryGraphClient."""

    @pytest.mark.asyncio
    async def test_client_initialization(self):
        """Client can be initialized."""
        client = MemoryGraphClient()
        assert client is not None

    @pytest.mark.asyncio
    async def test_recall_returns_empty_list_on_error(self):
        """Recall returns empty list when MCP server unavailable."""
        client = MemoryGraphClient()
        # Without MCP server running, should gracefully return empty
        result = await client.recall("test query")
        assert isinstance(result, list)
        assert len(result) == 0

    @pytest.mark.asyncio
    async def test_store_returns_none_on_error(self):
        """Store returns None when MCP server unavailable."""
        client = MemoryGraphClient()
        result = await client.store(
            memory_type="solution",
            title="test",
            content="test content"
        )
        assert result is None

    @pytest.mark.asyncio
    async def test_relate_returns_false_on_error(self):
        """Relate returns False when MCP server unavailable."""
        client = MemoryGraphClient()
        result = await client.relate("id1", "id2", "SOLVES")
        assert result is False

    @pytest.mark.asyncio
    async def test_get_related_returns_empty_list_on_error(self):
        """Get related returns empty list when MCP server unavailable."""
        client = MemoryGraphClient()
        result = await client.get_related("mem_123")
        assert isinstance(result, list)
        assert len(result) == 0


class TestContextFormatting:
    """Tests for context formatting."""

    def test_format_empty_memories(self):
        """Format returns empty string for no memories."""
        result = format_context([], [])
        assert result == ""

    def test_format_solutions_only(self):
        """Format displays solutions correctly."""
        memories = [
            {
                "id": "mem_1",
                "type": "solution",
                "title": "Fixed auth bug",
                "content": "Added null check to fix auth error"
            }
        ]
        result = format_context(memories, [])
        assert "Prior Knowledge" in result
        assert "What's worked before" in result
        assert "Fixed auth bug" in result

    def test_format_patterns(self):
        """Format displays patterns correctly."""
        memories = [
            {
                "id": "mem_2",
                "type": "code_pattern",
                "title": "Use async/await",
                "content": "Always use async/await for I/O operations"
            }
        ]
        result = format_context(memories, [])
        assert "Patterns to follow" in result
        assert "async/await" in result

    def test_format_gotchas(self):
        """Format displays gotchas correctly."""
        memories = [
            {
                "id": "mem_3",
                "type": "problem",
                "title": "Race condition",
                "content": "Database race condition in concurrent requests",
                "tags": ["gotcha"]
            }
        ]
        result = format_context(memories, [])
        assert "Watch out for" in result
        assert "Race condition" in result


class TestGetContextForSubtask:
    """Tests for get_context_for_subtask."""

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_memories(self):
        """Returns empty string when no memories found."""
        subtask = {
            "id": "task_1",
            "description": "Implement feature X",
            "files": []
        }
        # This will fail to connect to MCP server and return empty
        result = await get_context_for_subtask(subtask, Path("/tmp"))
        assert result == ""

    @pytest.mark.asyncio
    async def test_handles_missing_description(self):
        """Handles subtask without description gracefully."""
        subtask = {"id": "task_1"}
        result = await get_context_for_subtask(subtask, Path("/tmp"))
        assert result == ""
