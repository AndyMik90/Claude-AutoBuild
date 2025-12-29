"""
Live integration tests for MemoryGraph MCP server.

These tests require a running MemoryGraph MCP server.
They are skipped if the server is not available.

Run with: pytest tests/integrations/memorygraph/test_integration_live.py -v
"""

import asyncio
import os
import subprocess
from pathlib import Path

import pytest

# sys.path is configured in conftest.py
from integrations.memorygraph.client import MemoryGraphClient
from integrations.memorygraph.context import get_context_for_subtask
from integrations.memorygraph.storage import save_to_memorygraph


def is_memorygraph_server_available() -> bool:
    """Check if MemoryGraph MCP server is available."""
    try:
        result = subprocess.run(
            ["memorygraph", "--version"],
            capture_output=True,
            timeout=5,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


# Skip all tests in this module if server not available
pytestmark = pytest.mark.skipif(
    not is_memorygraph_server_available(),
    reason="MemoryGraph MCP server not available",
)


class TestLiveMemoryGraphClient:
    """Live tests for MemoryGraphClient against real MCP server."""

    @pytest.mark.asyncio
    async def test_store_and_recall_memory(self):
        """Store a memory and recall it."""
        client = MemoryGraphClient(timeout=15.0)

        # Store a test memory with unique identifier
        test_id = f"integration_test_{os.getpid()}"
        memory_id = await client.store(
            memory_type="solution",
            title=f"Test Solution {test_id}",
            content=f"This is a test solution created by integration test {test_id}",
            tags=["integration-test", "auto-claude"],
            importance=0.5,
        )

        # Verify we got an ID back
        assert memory_id is not None, "Failed to store memory - got None ID"
        assert len(memory_id) > 0, "Got empty memory ID"

        print(f"Stored memory with ID: {memory_id}")

        # Give server time to index
        await asyncio.sleep(0.5)

        # Recall the memory
        memories = await client.recall(f"Test Solution {test_id}", limit=5)

        # Verify we found it
        assert len(memories) > 0, "Failed to recall stored memory"

        # Check the memory content
        found = False
        for mem in memories:
            if test_id in str(mem.get("content", "")) or test_id in str(
                mem.get("title", "")
            ):
                found = True
                break

        assert found, f"Could not find test memory in results: {memories}"

    @pytest.mark.asyncio
    async def test_store_and_relate_memories(self):
        """Store problem and solution, then create relationship."""
        client = MemoryGraphClient(timeout=15.0)

        test_id = f"relate_test_{os.getpid()}"

        # Store a problem
        problem_id = await client.store(
            memory_type="problem",
            title=f"Test Problem {test_id}",
            content=f"Integration test problem {test_id}",
            tags=["integration-test"],
            importance=0.6,
        )
        assert problem_id is not None, "Failed to store problem"

        # Store a solution
        solution_id = await client.store(
            memory_type="solution",
            title=f"Test Solution {test_id}",
            content=f"Integration test solution that fixes {test_id}",
            tags=["integration-test"],
            importance=0.7,
        )
        assert solution_id is not None, "Failed to store solution"

        # Create relationship
        success = await client.relate(
            from_id=solution_id,
            to_id=problem_id,
            relationship_type="SOLVES",
        )
        assert success is True, "Failed to create relationship"

        print(f"Created SOLVES relationship: {solution_id} -> {problem_id}")

        # Verify relationship by getting related memories
        related = await client.get_related(problem_id, types=["SOLVES"])

        # Should find the solution
        print(f"Related memories: {related}")

    @pytest.mark.asyncio
    async def test_graceful_timeout_handling(self):
        """Verify client handles slow responses gracefully."""
        # Very short timeout to trigger timeout handling
        client = MemoryGraphClient(timeout=0.001)

        # This should timeout but not raise - returns empty/None
        memories = await client.recall("test query")
        assert memories == [], "Should return empty list on timeout"

        result = await client.store(
            memory_type="solution",
            title="Timeout Test",
            content="Should timeout",
            tags=[],
        )
        assert result is None, "Should return None on timeout"


class TestLiveSaveToMemoryGraph:
    """Live tests for save_to_memorygraph function."""

    @pytest.mark.asyncio
    async def test_save_session_insights(self):
        """Save real session insights to MemoryGraph."""
        test_id = f"session_test_{os.getpid()}"

        session_output = {
            "what_failed": [f"Authentication failed during {test_id}"],
            "what_worked": [f"Fixed auth by adding null check in {test_id}"],
            "patterns_found": [f"Always validate tokens before use ({test_id})"],
        }

        # This should complete without error
        await save_to_memorygraph(session_output, Path("/tmp/test-project"))

        # Verify by recalling
        client = MemoryGraphClient(timeout=15.0)
        await asyncio.sleep(1.0)  # Give time to index

        memories = await client.recall(test_id, limit=10)
        print(f"Found {len(memories)} memories for session test")

        # Should have stored memories (recall may return summary or individual items)
        assert (
            len(memories) >= 1
        ), f"Expected at least 1 memory result, got {len(memories)}"

        # Verify the test_id appears in the response content
        found_test_id = False
        for mem in memories:
            if test_id in str(mem):
                found_test_id = True
                break
        assert found_test_id, f"Test ID {test_id} not found in memories"


class TestLiveContextRetrieval:
    """Live tests for context retrieval."""

    @pytest.mark.asyncio
    async def test_get_context_for_subtask(self):
        """Retrieve context for a subtask from real memories."""
        # First, store some memories to retrieve
        client = MemoryGraphClient(timeout=15.0)
        test_id = f"context_test_{os.getpid()}"

        await client.store(
            memory_type="solution",
            title=f"JWT Validation Fix {test_id}",
            content=f"Added null check before token decode to fix NPE ({test_id})",
            tags=["auth", "jwt", "integration-test"],
            importance=0.8,
        )

        await asyncio.sleep(1.0)  # Give time to index

        # Now retrieve context
        subtask = {
            "id": "task_1",
            "description": f"Fix JWT authentication issue {test_id}",
            "files": ["auth.py"],
        }

        context = await get_context_for_subtask(subtask, Path("/tmp"))

        print(f"Retrieved context:\n{context}")

        # Context might be empty if no relevant memories, but shouldn't error
        assert isinstance(context, str)


class TestLiveRoundTrip:
    """End-to-end round trip test."""

    @pytest.mark.asyncio
    async def test_full_round_trip(self):
        """
        Full round trip: store session insights -> retrieve context.

        This tests the complete flow that would happen in production.
        """
        test_id = f"roundtrip_{os.getpid()}"

        # 1. Simulate session completion with insights
        session_output = {
            "what_failed": [f"Database connection timeout in {test_id}"],
            "what_worked": [f"Increased connection pool size fixed {test_id}"],
        }

        await save_to_memorygraph(session_output, Path(f"/tmp/{test_id}"))

        # 2. Wait for indexing
        await asyncio.sleep(1.5)

        # 3. Simulate new subtask that could benefit from past knowledge
        subtask = {
            "id": "new_task",
            "description": f"Fix database connection issues {test_id}",
            "files": ["db.py", "connection.py"],
        }

        context = await get_context_for_subtask(subtask, Path(f"/tmp/{test_id}"))

        print(f"Round trip context:\n{context}")

        # The context should ideally contain our stored solution
        # But this depends on the recall algorithm finding it relevant
        assert isinstance(context, str)

        # Direct recall should definitely find it
        client = MemoryGraphClient(timeout=15.0)
        memories = await client.recall(test_id, limit=10)

        assert len(memories) >= 1, f"Should find memories for {test_id}"
        print(f"Direct recall found {len(memories)} memories")
