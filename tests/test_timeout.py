"""
Tests for LLM API timeout protection.

Tests the timeout wrapper functions that prevent infinite hangs when
network issues occur or the Claude API is slow/unresponsive.

Issue #79: Add timeout protection to all LLM API calls
"""

import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from apps.backend.core.exceptions import AgentTimeoutError
from apps.backend.core.timeout import (
    DEFAULT_TIMEOUT,
    MAX_TIMEOUT,
    MIN_TIMEOUT,
    get_agent_timeout,
    query_with_timeout,
    receive_with_timeout,
    with_timeout_generator,
)


class TestGetAgentTimeout:
    """Tests for get_agent_timeout() configuration."""

    def test_default_timeout(self):
        """Should return default timeout when env var not set."""
        with patch.dict(os.environ, {}, clear=True):
            timeout = get_agent_timeout()
            assert timeout == DEFAULT_TIMEOUT

    def test_custom_timeout(self):
        """Should return custom timeout from env var."""
        with patch.dict(os.environ, {"AGENT_SESSION_TIMEOUT": "600"}):
            timeout = get_agent_timeout()
            assert timeout == 600.0

    def test_min_timeout_enforced(self):
        """Should enforce minimum timeout."""
        with patch.dict(os.environ, {"AGENT_SESSION_TIMEOUT": "10"}):
            timeout = get_agent_timeout()
            assert timeout == MIN_TIMEOUT

    def test_max_timeout_enforced(self):
        """Should enforce maximum timeout."""
        with patch.dict(os.environ, {"AGENT_SESSION_TIMEOUT": "3600"}):
            timeout = get_agent_timeout()
            assert timeout == MAX_TIMEOUT

    def test_invalid_timeout_falls_back_to_default(self):
        """Should fall back to default on invalid value."""
        with patch.dict(os.environ, {"AGENT_SESSION_TIMEOUT": "invalid"}):
            timeout = get_agent_timeout()
            assert timeout == DEFAULT_TIMEOUT


class TestQueryWithTimeout:
    """Tests for query_with_timeout() wrapper."""

    @pytest.mark.asyncio
    async def test_successful_query(self):
        """Should successfully send query within timeout."""
        mock_client = MagicMock()
        mock_client.query = AsyncMock()

        await query_with_timeout(mock_client, "test message", timeout=5.0)

        mock_client.query.assert_called_once_with("test message")

    @pytest.mark.asyncio
    async def test_query_timeout(self):
        """Should raise AgentTimeoutError when query times out."""
        mock_client = MagicMock()

        # Simulate slow query that exceeds timeout
        async def slow_query(message):
            await asyncio.sleep(2.0)

        mock_client.query = slow_query

        with pytest.raises(AgentTimeoutError) as exc_info:
            await query_with_timeout(mock_client, "test message", timeout=0.1)

        assert "exceeded 0.1s timeout" in str(exc_info.value)
        assert "network issues" in str(exc_info.value).lower()

    @pytest.mark.asyncio
    async def test_query_uses_env_timeout(self):
        """Should use timeout from environment when not specified."""
        mock_client = MagicMock()
        mock_client.query = AsyncMock()

        with patch.dict(os.environ, {"AGENT_SESSION_TIMEOUT": "120"}):
            with patch("apps.backend.core.timeout.get_agent_timeout") as mock_get:
                mock_get.return_value = 120.0
                await query_with_timeout(mock_client, "test message")
                mock_get.assert_called_once()


class TestReceiveWithTimeout:
    """Tests for receive_with_timeout() async generator wrapper."""

    @pytest.mark.asyncio
    async def test_successful_receive(self):
        """Should successfully receive all messages within timeout."""
        mock_client = MagicMock()

        # Simulate async generator
        async def mock_receive():
            for i in range(3):
                await asyncio.sleep(0.01)
                yield MagicMock(content=[MagicMock(text=f"message {i}")])

        mock_client.receive_response = mock_receive

        messages = []
        async for msg in receive_with_timeout(mock_client, timeout=5.0):
            messages.append(msg)

        assert len(messages) == 3

    @pytest.mark.asyncio
    async def test_receive_timeout(self):
        """Should raise AgentTimeoutError when receive times out."""
        mock_client = MagicMock()

        # Simulate slow response that exceeds timeout
        async def slow_receive():
            await asyncio.sleep(2.0)
            yield MagicMock(content=[])

        mock_client.receive_response = slow_receive

        with pytest.raises(AgentTimeoutError) as exc_info:
            async for _ in receive_with_timeout(mock_client, timeout=0.1):
                pass

        assert "exceeded 0.1s timeout" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_receive_timeout_mid_stream(self):
        """Should timeout if generator hangs waiting for next message."""
        mock_client = MagicMock()

        # Simulate response that hangs mid-stream
        async def hanging_receive():
            yield MagicMock(content=[MagicMock(text="message 1")])
            await asyncio.sleep(2.0)  # Hang waiting for next message
            yield MagicMock(content=[MagicMock(text="message 2")])

        mock_client.receive_response = hanging_receive

        with pytest.raises(AgentTimeoutError):
            async for _ in receive_with_timeout(mock_client, timeout=0.1):
                pass


class TestWithTimeoutGenerator:
    """Tests for with_timeout_generator() generic async generator wrapper."""

    @pytest.mark.asyncio
    async def test_successful_iteration(self):
        """Should successfully iterate through all items."""

        async def test_generator():
            for i in range(5):
                await asyncio.sleep(0.01)
                yield i

        items = []
        async for item in with_timeout_generator(
            test_generator(), timeout=5.0, operation="Test operation"
        ):
            items.append(item)

        assert items == [0, 1, 2, 3, 4]

    @pytest.mark.asyncio
    async def test_timeout_on_slow_generator(self):
        """Should timeout if generator takes too long overall."""

        async def slow_generator():
            for i in range(10):
                await asyncio.sleep(0.2)
                yield i

        with pytest.raises(AgentTimeoutError) as exc_info:
            async for _ in with_timeout_generator(
                slow_generator(), timeout=0.5, operation="Slow operation"
            ):
                pass

        assert "Slow operation" in str(exc_info.value)
        assert "exceeded 0.5s timeout" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_timeout_waiting_for_next_item(self):
        """Should timeout if generator hangs waiting for next item.
        
        This is the CRITICAL fix for issue #79 - the timeout must fire
        even if the generator hangs waiting for the next message, not
        just if it takes too long overall.
        """

        async def hanging_generator():
            yield 1
            # Simulate hanging while waiting for next item
            await asyncio.sleep(2.0)
            yield 2

        with pytest.raises(AgentTimeoutError):
            items = []
            async for item in with_timeout_generator(
                hanging_generator(), timeout=0.1, operation="Test"
            ):
                items.append(item)
            # Should have received first item but timed out waiting for second
            assert len(items) <= 1

    @pytest.mark.asyncio
    async def test_empty_generator(self):
        """Should handle empty generator gracefully."""

        async def empty_generator():
            return
            yield  # Never reached

        items = []
        async for item in with_timeout_generator(
            empty_generator(), timeout=1.0, operation="Empty"
        ):
            items.append(item)

        assert items == []


class TestErrorMessages:
    """Tests for error message quality."""

    @pytest.mark.asyncio
    async def test_timeout_error_message_helpful(self):
        """Timeout errors should have clear, actionable messages."""
        mock_client = MagicMock()

        async def slow_query(message):
            await asyncio.sleep(1.0)

        mock_client.query = slow_query

        with pytest.raises(AgentTimeoutError) as exc_info:
            await query_with_timeout(mock_client, "test", timeout=0.1)

        error_msg = str(exc_info.value)
        # Should explain what happened
        assert "timeout" in error_msg.lower()
        # Should suggest action
        assert "network" in error_msg.lower() or "connection" in error_msg.lower()
        # Should mention retry
        assert "try again" in error_msg.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
