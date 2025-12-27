"""
MemoryGraph MCP Client
======================

Client for calling MemoryGraph MCP server tools.
Uses subprocess to communicate with the MCP server via stdio.
"""

import asyncio
import json
import logging
import re

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

    def _parse_mcp_content(self, result: dict | None) -> list[dict]:
        """
        Parse MCP response content into list of memory dicts.

        Args:
            result: MCP tool result containing content array

        Returns:
            List of memory dicts or empty list
        """
        if result is None:
            return []

        if isinstance(result, dict):
            content = result.get("content", [])
            if isinstance(content, list) and content:
                # First content item usually has the text response
                text_content = content[0].get("text", "")

                # Try to parse as JSON if it looks like JSON
                if text_content.startswith("[") or text_content.startswith("{"):
                    try:
                        parsed = json.loads(text_content)
                        # If single object, wrap in list
                        if isinstance(parsed, dict):
                            return [parsed]
                        return parsed if isinstance(parsed, list) else []
                    except json.JSONDecodeError:
                        pass

                # Parse structured text response
                return self._parse_memories_text(text_content)

        return []

    def _parse_memories_text(self, text: str) -> list[dict]:
        """
        Parse memory text response into list of dicts.

        Handles formatted text output like:
        **1. Title** (ID: xxx)
        Type: solution | Importance: 0.8
        Tags: tag1, tag2

        Content here

        ---

        Args:
            text: Formatted text from MCP response

        Returns:
            List of memory dicts
        """
        memories = []
        # Split by --- separator (common in formatted outputs)
        sections = text.split("\n---\n")

        for section in sections:
            if not section.strip():
                continue

            memory = {}

            # Extract ID from (ID: xxx) - supports UUIDs with hyphens
            id_match = re.search(r"\(ID:\s*([a-zA-Z0-9-]+)\)", section)
            if id_match:
                memory["id"] = id_match.group(1)

            # Extract title from **N. Title** format
            title_match = re.search(r"\*\*\d+\.\s*([^*]+)\*\*", section)
            if title_match:
                memory["title"] = title_match.group(1).strip()

            # Extract type
            type_match = re.search(r"Type:\s*(\w+)", section)
            if type_match:
                memory["type"] = type_match.group(1)

            # Extract importance
            importance_match = re.search(r"Importance:\s*([\d.]+)", section)
            if importance_match:
                memory["importance"] = float(importance_match.group(1))

            # Extract tags
            tags_match = re.search(r"Tags:\s*([^\n]+)", section)
            if tags_match:
                tags_str = tags_match.group(1).strip()
                memory["tags"] = [tag.strip() for tag in tags_str.split(",")]

            # Extract content (everything after the metadata)
            # Find the last metadata line and take everything after
            lines = section.split("\n")
            content_lines = []
            in_content = False
            for line in lines:
                # Skip lines with metadata markers
                if re.match(r"^\*\*\d+\.", line) or re.match(
                    r"^(Type|Tags|Importance):", line
                ):
                    continue
                if line.strip() and not line.startswith("(ID:"):
                    in_content = True
                if in_content:
                    content_lines.append(line)

            if content_lines:
                memory["content"] = "\n".join(content_lines).strip()

            # Only add if we extracted at least an ID or title
            if "id" in memory or "title" in memory:
                memories.append(memory)

        return memories

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

        return self._parse_mcp_content(result)

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

        if result is None:
            return None

        # Extract memory ID from response
        if isinstance(result, dict):
            content = result.get("content", [])
            if isinstance(content, list) and content:
                text = content[0].get("text", "")
                # Look for "Memory stored successfully with ID: xxx" or similar
                # Supports UUIDs with hyphens
                match = re.search(r"ID:\s*([a-zA-Z0-9-]+)", text)
                if match:
                    return match.group(1)

        return None

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

        return self._parse_mcp_content(result)
