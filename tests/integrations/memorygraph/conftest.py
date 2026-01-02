"""
Pytest configuration for MemoryGraph integration tests.

Note: Python path is configured via pythonpath in tests/pytest.ini
"""

import pytest


@pytest.fixture
def cleanup_test_memories():
    """
    Track memory IDs created during tests for cleanup.

    Usage:
        async def test_something(cleanup_test_memories):
            memory_id = await client.store(...)
            cleanup_test_memories.append(memory_id)

    Note: Actual cleanup requires delete_memory MCP tool which may not be
    available in all MemoryGraph configurations. This fixture tracks IDs
    for manual cleanup or future automated cleanup when API is available.
    """
    memory_ids: list[str] = []

    yield memory_ids

    # Log tracked memories for manual cleanup if needed
    if memory_ids:
        print(f"\n[Test Cleanup] Tracked {len(memory_ids)} test memories: {memory_ids}")
        # Future: When delete API is available, cleanup here
        # from integrations.memorygraph.client import MemoryGraphClient
        # client = MemoryGraphClient()
        # for memory_id in memory_ids:
        #     await client.delete(memory_id)
