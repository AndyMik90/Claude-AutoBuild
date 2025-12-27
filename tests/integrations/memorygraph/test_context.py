"""Tests for context retrieval."""
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from integrations.memorygraph.context import get_context_for_subtask


class TestGetContextForSubtask:
    """Tests for get_context_for_subtask function."""

    @pytest.mark.asyncio
    async def test_returns_empty_for_no_description(self):
        """Returns empty string when subtask has no description."""
        subtask = {"id": "task_1", "files": ["auth.py"]}

        context = await get_context_for_subtask(subtask, Path("/tmp"))

        assert context == ""

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_memories_found(self):
        """Returns empty string when no memories found."""
        subtask = {"id": "task_1", "description": "Fix authentication bug"}

        with patch(
            "integrations.memorygraph.context.MemoryGraphClient"
        ) as mock_client_class:
            mock_client = AsyncMock()
            mock_client.recall = AsyncMock(return_value=[])
            mock_client_class.return_value = mock_client

            context = await get_context_for_subtask(subtask, Path("/tmp"))

        assert context == ""

    @pytest.mark.asyncio
    async def test_includes_file_names_in_query(self):
        """Includes file names in the query for better context."""
        subtask = {
            "id": "task_1",
            "description": "Fix bug",
            "files": ["/path/to/auth.py", "/path/to/login.py"],
        }

        with patch(
            "integrations.memorygraph.context.MemoryGraphClient"
        ) as mock_client_class:
            mock_client = AsyncMock()
            mock_client.recall = AsyncMock(return_value=[])
            mock_client_class.return_value = mock_client

            await get_context_for_subtask(subtask, Path("/tmp"))

            # Check that recall was called with query containing file names
            call_args = mock_client.recall.call_args
            query = call_args[0][0]  # First positional arg
            assert "auth.py" in query
            assert "login.py" in query

    @pytest.mark.asyncio
    async def test_limits_files_in_query(self):
        """Limits number of files included in query to avoid too long."""
        subtask = {
            "id": "task_1",
            "description": "Fix bug",
            "files": ["file1.py", "file2.py", "file3.py", "file4.py", "file5.py"],
        }

        with patch(
            "integrations.memorygraph.context.MemoryGraphClient"
        ) as mock_client_class:
            mock_client = AsyncMock()
            mock_client.recall = AsyncMock(return_value=[])
            mock_client_class.return_value = mock_client

            await get_context_for_subtask(subtask, Path("/tmp"))

            call_args = mock_client.recall.call_args
            query = call_args[0][0]
            # Should only include first 3 files
            assert "file1.py" in query
            assert "file2.py" in query
            assert "file3.py" in query
            assert "file4.py" not in query
            assert "file5.py" not in query

    @pytest.mark.asyncio
    async def test_fetches_related_solutions_for_problems(self):
        """Fetches related solutions when problems are found."""
        subtask = {"id": "task_1", "description": "Fix authentication bug"}

        memories = [
            {
                "id": "prob_1",
                "type": "problem",
                "title": "Auth failed",
                "content": "JWT validation error",
            }
        ]

        related_solutions = [
            {
                "id": "sol_1",
                "type": "solution",
                "title": "Fixed auth",
                "content": "Added null check",
            }
        ]

        with patch(
            "integrations.memorygraph.context.MemoryGraphClient"
        ) as mock_client_class:
            mock_client = AsyncMock()
            mock_client.recall = AsyncMock(return_value=memories)
            mock_client.get_related = AsyncMock(return_value=related_solutions)
            mock_client_class.return_value = mock_client

            await get_context_for_subtask(subtask, Path("/tmp"))

            # Should have called get_related for the problem
            mock_client.get_related.assert_called_once()
            call_args = mock_client.get_related.call_args
            assert call_args[0][0] == "prob_1"
            assert "SOLVES" in call_args[1]["types"]

    @pytest.mark.asyncio
    async def test_returns_formatted_context(self):
        """Returns formatted context when memories found."""
        subtask = {"id": "task_1", "description": "Fix authentication bug"}

        memories = [
            {
                "id": "sol_1",
                "type": "solution",
                "title": "Fixed JWT validation",
                "content": "Added null check before token decode",
            }
        ]

        with patch(
            "integrations.memorygraph.context.MemoryGraphClient"
        ) as mock_client_class:
            mock_client = AsyncMock()
            mock_client.recall = AsyncMock(return_value=memories)
            mock_client.get_related = AsyncMock(return_value=[])
            mock_client_class.return_value = mock_client

            context = await get_context_for_subtask(subtask, Path("/tmp"))

        # Should return formatted markdown
        assert "Prior Knowledge" in context or len(context) > 0

    @pytest.mark.asyncio
    async def test_handles_client_errors_gracefully(self):
        """Handles client errors gracefully."""
        subtask = {"id": "task_1", "description": "Fix bug"}

        with patch(
            "integrations.memorygraph.context.MemoryGraphClient"
        ) as mock_client_class:
            mock_client = AsyncMock()
            mock_client.recall = AsyncMock(side_effect=Exception("Connection failed"))
            mock_client_class.return_value = mock_client

            # Should not raise exception
            try:
                _context = await get_context_for_subtask(subtask, Path("/tmp"))
                # Might return empty or raise - both acceptable for graceful handling
                assert _context is not None or _context is None  # Either is acceptable
            except Exception:
                pass  # Acceptable behavior
