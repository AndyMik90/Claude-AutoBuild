"""Tests for MemoryGraph MCP client."""
import json
import pytest
from pathlib import Path
import sys
from unittest.mock import AsyncMock, Mock, patch

# Add auto-claude to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "apps" / "backend"))

from integrations.memorygraph.client import MemoryGraphClient


class TestMemoryGraphClient:
    """Tests for MemoryGraphClient."""

    @pytest.mark.asyncio
    async def test_recall_parses_json_array_response(self):
        """Parses JSON array from MCP TextContent response."""
        client = MemoryGraphClient()

        # Simulate MCP response with JSON array in TextContent
        mock_result = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps([
                        {
                            "id": "mem123",
                            "type": "solution",
                            "title": "Fixed auth bug",
                            "content": "Added null check",
                            "importance": 0.8,
                            "tags": ["auth", "bugfix"]
                        },
                        {
                            "id": "mem456",
                            "type": "problem",
                            "title": "Auth fails",
                            "content": "NPE on login",
                            "importance": 0.7,
                            "tags": ["auth", "error"]
                        }
                    ])
                }
            ]
        }

        with patch.object(client, '_call_tool', return_value=mock_result):
            memories = await client.recall("auth bug", limit=5)

        assert len(memories) == 2
        assert memories[0]["id"] == "mem123"
        assert memories[0]["type"] == "solution"
        assert memories[1]["id"] == "mem456"

    @pytest.mark.asyncio
    async def test_recall_parses_formatted_text_response(self):
        """Parses formatted text output from MCP response."""
        client = MemoryGraphClient()

        # Simulate MCP response with formatted text
        formatted_text = """**1. Fixed auth bug** (ID: mem123)
Type: solution | Importance: 0.8
Tags: auth, bugfix

Added null check

---

**2. Auth fails** (ID: mem456)
Type: problem | Importance: 0.7
Tags: auth, error

NPE on login"""

        mock_result = {
            "content": [
                {
                    "type": "text",
                    "text": formatted_text
                }
            ]
        }

        with patch.object(client, '_call_tool', return_value=mock_result):
            memories = await client.recall("auth bug", limit=5)

        assert len(memories) == 2
        assert memories[0]["id"] == "mem123"
        assert memories[0]["type"] == "solution"
        assert memories[0]["title"] == "Fixed auth bug"
        assert memories[1]["id"] == "mem456"

    @pytest.mark.asyncio
    async def test_recall_handles_empty_response(self):
        """Handles empty MCP response gracefully."""
        client = MemoryGraphClient()

        with patch.object(client, '_call_tool', return_value=None):
            memories = await client.recall("nonexistent", limit=5)

        assert memories == []

    @pytest.mark.asyncio
    async def test_store_extracts_memory_id_from_success_message(self):
        """Extracts memory ID from success message in MCP response."""
        client = MemoryGraphClient()

        # Simulate MCP response with success message
        mock_result = {
            "content": [
                {
                    "type": "text",
                    "text": "Memory stored successfully with ID: abc123def456"
                }
            ]
        }

        with patch.object(client, '_call_tool', return_value=mock_result):
            memory_id = await client.store(
                memory_type="solution",
                title="Fixed bug",
                content="Added check",
                tags=["bugfix"],
                importance=0.8
            )

        assert memory_id == "abc123def456"

    @pytest.mark.asyncio
    async def test_store_extracts_id_from_various_formats(self):
        """Extracts memory ID from different message formats."""
        client = MemoryGraphClient()

        test_cases = [
            ("Memory stored successfully with ID: abc123", "abc123"),
            ("Stored memory ID: def456", "def456"),
            ("Created with ID:xyz789", "xyz789"),
            ("Memory ID: 123abc456def", "123abc456def"),
        ]

        for message, expected_id in test_cases:
            mock_result = {
                "content": [{"type": "text", "text": message}]
            }

            with patch.object(client, '_call_tool', return_value=mock_result):
                memory_id = await client.store(
                    memory_type="solution",
                    title="Test",
                    content="Test",
                )

            assert memory_id == expected_id, f"Failed to extract ID from: {message}"

    @pytest.mark.asyncio
    async def test_store_returns_none_on_error(self):
        """Returns None when store fails."""
        client = MemoryGraphClient()

        with patch.object(client, '_call_tool', return_value=None):
            memory_id = await client.store(
                memory_type="solution",
                title="Test",
                content="Test",
            )

        assert memory_id is None

    @pytest.mark.asyncio
    async def test_graceful_failure_on_timeout(self):
        """Handles timeout gracefully without raising exception."""
        client = MemoryGraphClient()

        # _call_tool already handles timeout and returns None
        with patch.object(client, '_call_tool', return_value=None):
            # Should not raise exception
            memories = await client.recall("test")
            assert memories == []

    @pytest.mark.asyncio
    async def test_graceful_failure_on_invalid_json(self):
        """Handles malformed JSON response gracefully."""
        client = MemoryGraphClient()

        # Simulate response with invalid JSON
        mock_result = {
            "content": [
                {
                    "type": "text",
                    "text": "{invalid json here"
                }
            ]
        }

        with patch.object(client, '_call_tool', return_value=mock_result):
            # Should not raise exception
            memories = await client.recall("test")
            # Should fall back to text parsing or return empty
            assert isinstance(memories, list)

    @pytest.mark.asyncio
    async def test_graceful_failure_on_missing_content_field(self):
        """Handles response with missing content field."""
        client = MemoryGraphClient()

        # Simulate response without content field
        mock_result = {"error": "Something went wrong"}

        with patch.object(client, '_call_tool', return_value=mock_result):
            memories = await client.recall("test")
            assert memories == []

    @pytest.mark.asyncio
    async def test_get_related_parses_response(self):
        """Parses related memories from MCP response."""
        client = MemoryGraphClient()

        mock_result = {
            "content": [
                {
                    "type": "text",
                    "text": json.dumps([
                        {
                            "id": "rel123",
                            "type": "problem",
                            "title": "Original issue",
                            "relationship": "SOLVES"
                        }
                    ])
                }
            ]
        }

        with patch.object(client, '_call_tool', return_value=mock_result):
            related = await client.get_related("mem123")

        assert len(related) == 1
        assert related[0]["id"] == "rel123"
        assert related[0]["relationship"] == "SOLVES"

    @pytest.mark.asyncio
    async def test_relate_returns_true_on_success(self):
        """Returns True when relationship is created successfully."""
        client = MemoryGraphClient()

        mock_result = {
            "content": [
                {
                    "type": "text",
                    "text": "Relationship created successfully"
                }
            ]
        }

        with patch.object(client, '_call_tool', return_value=mock_result):
            success = await client.relate("mem1", "mem2", "SOLVES")

        assert success is True

    @pytest.mark.asyncio
    async def test_relate_returns_false_on_error(self):
        """Returns False when relationship creation fails."""
        client = MemoryGraphClient()

        with patch.object(client, '_call_tool', return_value=None):
            success = await client.relate("mem1", "mem2", "SOLVES")

        assert success is False

    @pytest.mark.asyncio
    async def test_call_tool_builds_correct_mcp_request(self):
        """Builds correct JSON-RPC 2.0 request for MCP."""
        client = MemoryGraphClient()

        # Mock subprocess to capture the request
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(
            json.dumps({"jsonrpc": "2.0", "id": 1, "result": {}}).encode(),
            b""
        ))

        with patch('asyncio.create_subprocess_exec', return_value=mock_proc):
            await client._call_tool("recall_memories", {"query": "test", "limit": 5})

        # Check that communicate was called with correct JSON-RPC request
        call_args = mock_proc.communicate.call_args
        request_bytes = call_args[0][0]
        request = json.loads(request_bytes.decode())

        assert request["jsonrpc"] == "2.0"
        assert request["method"] == "tools/call"
        assert request["params"]["name"] == "recall_memories"
        assert request["params"]["arguments"] == {"query": "test", "limit": 5}

    @pytest.mark.asyncio
    async def test_handles_mcp_server_not_installed(self):
        """Gracefully handles MemoryGraph not being installed."""
        client = MemoryGraphClient()

        # Simulate FileNotFoundError when memorygraph command doesn't exist
        with patch('asyncio.create_subprocess_exec', side_effect=FileNotFoundError()):
            memories = await client.recall("test")

        assert memories == []

    @pytest.mark.asyncio
    async def test_handles_mcp_server_error_response(self):
        """Handles MCP error response gracefully."""
        client = MemoryGraphClient()

        # Simulate MCP error response
        mock_proc = AsyncMock()
        mock_proc.returncode = 0
        mock_proc.communicate = AsyncMock(return_value=(
            json.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "error": {
                    "code": -32600,
                    "message": "Invalid request"
                }
            }).encode(),
            b""
        ))

        with patch('asyncio.create_subprocess_exec', return_value=mock_proc):
            result = await client._call_tool("invalid_tool", {})

        assert result is None
