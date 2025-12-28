"""
MemoryGraph MCP Client
======================

Client for calling MemoryGraph MCP server tools.
Uses subprocess to communicate with the MCP server via stdio.
"""

import asyncio
import json
import logging

from .parser import extract_memory_id, parse_mcp_content

logger = logging.getLogger(__name__)


class MemoryGraphClient:
    """Simple client for calling MemoryGraph MCP tools.

    This client communicates with the MemoryGraph MCP server via stdio
    using the JSON-RPC 2.0 protocol used by MCP.

    Gracefully handles errors - if MCP server is unavailable, methods
    return sensible defaults (empty lists, None, False) without raising
    exceptions.
    """

    # Default timeout for MCP calls (seconds)
    DEFAULT_TIMEOUT = 10.0

    def __init__(self, timeout: float | None = None):
        """Initialize the client.

        Args:
            timeout: Timeout in seconds for MCP calls (default: 10.0)
        """
        self._request_id = 0
        self._timeout = timeout or self.DEFAULT_TIMEOUT

    def _next_id(self) -> int:
        """Get next request ID."""
        self._request_id += 1
        return self._request_id

    async def _call_tool(self, tool_name: str, arguments: dict) -> dict | None:
        """
        Call an MCP tool via the MemoryGraph server.

        Args:
            tool_name: Name of the tool to call
            arguments: Tool arguments

        Returns:
            Tool result dict or None on error
        """
        proc = None
        try:
            # Build MCP request
            request = {
                "jsonrpc": "2.0",
                "id": self._next_id(),
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
            }

            # Try to call memorygraph via subprocess
            # This will fail gracefully if memorygraph is not installed or running
            proc = await asyncio.create_subprocess_exec(
                "memorygraph",
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            # Send request with configurable timeout
            request_json = json.dumps(request) + "\n"
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(request_json.encode()), timeout=self._timeout
            )

            # Parse response
            if proc.returncode != 0:
                logger.debug(
                    f"MemoryGraph server returned error code {proc.returncode}"
                )
                return None

            response = json.loads(stdout.decode())
            if "error" in response:
                logger.debug(f"MemoryGraph tool error: {response['error']}")
                return None

            return response.get("result")

        except FileNotFoundError:
            logger.debug("MemoryGraph command not found - is it installed?")
            return None
        except asyncio.TimeoutError:
            logger.debug(f"MemoryGraph request timeout after {self._timeout}s")
            # Kill the process on timeout
            if proc is not None:
                try:
                    proc.kill()
                    await proc.wait()
                except ProcessLookupError:
                    pass  # Process already terminated
            return None
        except Exception as e:
            logger.debug(f"MemoryGraph client error: {e}")
            return None
        finally:
            # Ensure process is cleaned up
            if proc is not None and proc.returncode is None:
                try:
                    proc.kill()
                    await proc.wait()
                except ProcessLookupError:
                    pass  # Process already terminated

    async def recall(self, query: str, limit: int = 5) -> list[dict]:
        """
        Call recall_memories MCP tool.

        Args:
            query: Search query
            limit: Maximum number of results

        Returns:
            List of memory dicts or empty list on error
        """
        result = await self._call_tool(
            "recall_memories", {"query": query, "limit": limit}
        )

        return parse_mcp_content(result)

    async def store(
        self,
        memory_type: str,
        title: str,
        content: str,
        tags: list[str] | None = None,
        importance: float = 0.7,
    ) -> str | None:
        """
        Call store_memory MCP tool.

        Args:
            memory_type: Type of memory (solution, problem, error, etc.)
            title: Memory title
            content: Memory content
            tags: Optional list of tags
            importance: Importance score (0.0-1.0)

        Returns:
            Memory ID or None on error
        """
        result = await self._call_tool(
            "store_memory",
            {
                "type": memory_type,
                "title": title,
                "content": content,
                "tags": tags or [],
                "importance": importance,
            },
        )

        return extract_memory_id(result)

    async def relate(self, from_id: str, to_id: str, relationship_type: str) -> bool:
        """
        Call create_relationship MCP tool.

        Args:
            from_id: Source memory ID
            to_id: Target memory ID
            relationship_type: Relationship type (SOLVES, CAUSES, etc.)

        Returns:
            True if successful, False on error
        """
        result = await self._call_tool(
            "create_relationship",
            {
                "from_memory_id": from_id,
                "to_memory_id": to_id,
                "relationship_type": relationship_type,
            },
        )

        return result is not None

    async def get_related(
        self, memory_id: str, types: list[str] | None = None
    ) -> list[dict]:
        """
        Call get_related_memories MCP tool.

        Args:
            memory_id: Memory ID to get relationships for
            types: Optional filter by relationship types

        Returns:
            List of related memory dicts or empty list on error
        """
        args = {"memory_id": memory_id}
        if types:
            args["relationship_types"] = types

        result = await self._call_tool("get_related_memories", args)

        return parse_mcp_content(result)
