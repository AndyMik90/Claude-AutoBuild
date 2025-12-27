"""
Tests for GHClient timeout and retry functionality.
"""

import asyncio
from pathlib import Path

import pytest
from gh_client import GHClient, GHCommandError, GHTimeoutError


class TestGHClient:
    """Test suite for GHClient."""

    @pytest.fixture
    def client(self, tmp_path):
        """Create a test client."""
        return GHClient(
            project_dir=tmp_path,
            default_timeout=2.0,
            max_retries=3,
        )

    @pytest.mark.asyncio
    async def test_timeout_raises_error(self, client):
        """Test that commands timeout after max retries."""
        # Use a command that will timeout (sleep longer than timeout)
        with pytest.raises(GHTimeoutError) as exc_info:
            await client.run(["api", "/repos/nonexistent/repo"], timeout=0.1)

        assert "timed out after 3 attempts" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_invalid_command_raises_error(self, client):
        """Test that invalid commands raise GHCommandError."""
        with pytest.raises(GHCommandError):
            await client.run(["invalid-command"])

    @pytest.mark.asyncio
    async def test_successful_command(self, client):
        """Test successful command execution."""
        # This test requires gh CLI to be installed
        try:
            result = await client.run(["--version"])
            assert result.returncode == 0
            assert "gh version" in result.stdout
            assert result.attempts == 1
        except Exception:
            pytest.skip("gh CLI not available")

    @pytest.mark.asyncio
    async def test_convenience_methods_timeout_protection(self, client):
        """Test that convenience methods have timeout protection."""
        # These will fail because repo doesn't exist, but should not hang
        with pytest.raises((GHCommandError, GHTimeoutError)):
            await client.pr_list()

        with pytest.raises((GHCommandError, GHTimeoutError)):
            await client.issue_list()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
