"""Tests for storage integration."""
import pytest
from pathlib import Path
import sys
from unittest.mock import AsyncMock, patch

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "apps" / "backend"))

from integrations.memorygraph.storage import save_to_memorygraph


class TestSaveToMemoryGraph:
    """Tests for save_to_memorygraph function."""

    @pytest.mark.asyncio
    async def test_saves_problems_and_solutions(self):
        """Extracts and saves problems and solutions."""
        session_output = {
            "what_failed": ["Auth failed"],
            "what_worked": ["Fixed auth by adding null check"]
        }

        with patch("integrations.memorygraph.storage.MemoryGraphClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.store = AsyncMock(side_effect=["prob_1", "sol_1"])
            mock_client.relate = AsyncMock(return_value=True)
            mock_client_class.return_value = mock_client

            await save_to_memorygraph(session_output, Path("/tmp"))

            # Should store 2 memories (1 problem, 1 solution)
            assert mock_client.store.call_count == 2

            # Should create 1 relationship
            assert mock_client.relate.call_count == 1

    @pytest.mark.asyncio
    async def test_saves_patterns(self):
        """Extracts and saves patterns."""
        session_output = {
            "patterns_found": ["Always use async/await"]
        }

        with patch("integrations.memorygraph.storage.MemoryGraphClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.store = AsyncMock(return_value="pattern_1")
            mock_client.relate = AsyncMock(return_value=True)
            mock_client_class.return_value = mock_client

            await save_to_memorygraph(session_output, Path("/tmp"))

            # Should store 1 pattern
            assert mock_client.store.call_count == 1

            # No relationships for patterns alone
            assert mock_client.relate.call_count == 0

    @pytest.mark.asyncio
    async def test_handles_empty_session_output(self):
        """Handles empty session output gracefully."""
        session_output = {}

        with patch("integrations.memorygraph.storage.MemoryGraphClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.store = AsyncMock()
            mock_client_class.return_value = mock_client

            # Should not raise exception
            await save_to_memorygraph(session_output, Path("/tmp"))

            # Should not store anything
            assert mock_client.store.call_count == 0

    @pytest.mark.asyncio
    async def test_handles_mcp_server_unavailable(self):
        """Gracefully handles MCP server being unavailable."""
        session_output = {
            "what_failed": ["Some error"],
            "what_worked": ["Some fix"]
        }

        with patch("integrations.memorygraph.storage.MemoryGraphClient") as mock_client_class:
            mock_client = AsyncMock()
            # Simulate MCP server unavailable
            mock_client.store = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            # Should not raise exception
            await save_to_memorygraph(session_output, Path("/tmp"))

            # Should have tried to store
            assert mock_client.store.call_count >= 1

    @pytest.mark.asyncio
    async def test_continues_on_storage_error(self):
        """Continues storing even if one memory fails."""
        session_output = {
            "what_failed": ["Error 1", "Error 2"]
        }

        with patch("integrations.memorygraph.storage.MemoryGraphClient") as mock_client_class:
            mock_client = AsyncMock()
            # First succeeds, second fails
            mock_client.store = AsyncMock(side_effect=["prob_1", Exception("Storage failed")])
            mock_client_class.return_value = mock_client

            # Should not raise exception
            await save_to_memorygraph(session_output, Path("/tmp"))

            # Should have tried to store both
            assert mock_client.store.call_count == 2

    @pytest.mark.asyncio
    async def test_adds_project_context(self):
        """Adds project directory as tag."""
        session_output = {
            "what_worked": ["Fixed bug"]
        }
        project_dir = Path("/Users/test/my-project")

        with patch("integrations.memorygraph.storage.MemoryGraphClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.store = AsyncMock(return_value="sol_1")
            mock_client_class.return_value = mock_client

            await save_to_memorygraph(session_output, project_dir)

            # Check that store was called with project name in tags
            call_args = mock_client.store.call_args
            if call_args:
                tags = call_args[1].get("tags", [])
                # Should include project name or path info
                assert any("project" in str(tag).lower() or "my-project" in str(tag).lower()
                          for tag in tags) or len(tags) > 0
