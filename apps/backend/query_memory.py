#!/usr/bin/env python3
"""
Memory Query CLI for auto-claude-ui.

Provides a subprocess interface for querying the LadybugDB/Graphiti memory database.
Called from Node.js (Electron main process) via child_process.spawn().

Usage:
    python query_memory.py get-status <db-path> <database>
    python query_memory.py get-memories <db-path> <database> [--limit N]
    python query_memory.py search <db-path> <database> <query> [--limit N]
    python query_memory.py semantic-search <db-path> <database> <query> [--limit N]
    python query_memory.py get-entities <db-path> <database> [--limit N]

Output:
    JSON to stdout with structure: {"success": bool, "data": ..., "error": ...}
"""

import argparse
import asyncio
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path


# Apply LadybugDB monkeypatch BEFORE any graphiti imports
def apply_monkeypatch():
    """Apply LadybugDB monkeypatch or use native kuzu.

    Tries LadybugDB first (for embedded usage), falls back to native kuzu.
    """
    try:
        import real_ladybug

        sys.modules["kuzu"] = real_ladybug
        return "ladybug"
    except ImportError:
        pass

    # Try native kuzu as fallback
    try:
        import kuzu  # noqa: F401

        return "kuzu"
    except ImportError:
        return None


def serialize_value(val):
    """Convert non-JSON-serializable types to strings."""
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    if hasattr(val, "timestamp"):
        # kuzu Timestamp object
        return str(val)
    return val


def output_json(success: bool, data=None, error: str = None):
    """Output JSON result to stdout and exit."""
    result = {"success": success}
    if data is not None:
        result["data"] = data
    if error:
        result["error"] = error
    print(
        json.dumps(result, default=str)
    )  # Use default=str for any non-serializable types
    sys.exit(0 if success else 1)


def output_error(message: str):
    """Output error JSON and exit with failure."""
    output_json(False, error=message)


def get_db_connection(db_path: str, database: str):
    """Get a database connection."""
    try:
        # Try to import kuzu (might be real_ladybug via monkeypatch or native)
        try:
            import kuzu
        except ImportError:
            import real_ladybug as kuzu

        full_path = Path(db_path) / database
        if not full_path.exists():
            return None, f"Database not found at {full_path}"

        db = kuzu.Database(str(full_path))
        conn = kuzu.Connection(db)
        return conn, None
    except Exception as e:
        return None, str(e)


def cmd_get_status(args):
    """Get memory database status."""
    db_path = Path(args.db_path)
    database = args.database

    # Check if kuzu/LadybugDB is available
    db_backend = apply_monkeypatch()
    if not db_backend:
        output_json(
            True,
            data={
                "available": False,
                "ladybugInstalled": False,
                "databasePath": str(db_path),
                "database": database,
                "databaseExists": False,
                "message": "Neither kuzu nor LadybugDB is installed",
            },
        )
        return

    full_path = db_path / database
    db_exists = full_path.exists()

    # List available databases
    databases = []
    if db_path.exists():
        for item in db_path.iterdir():
            # Include both files and directories as potential databases
            if item.name.startswith("."):
                continue
            databases.append(item.name)

    # Try to connect and verify
    conn, error = get_db_connection(str(db_path), database)
    connected = conn is not None

    if connected:
        try:
            # Test query
            result = conn.execute("RETURN 1 as test")
            _ = result.get_as_df()
        except Exception as e:
            connected = False
            error = str(e)

    output_json(
        True,
        data={
            "available": True,
            "ladybugInstalled": True,
            "databasePath": str(db_path),
            "database": database,
            "databaseExists": db_exists,
            "connected": connected,
            "databases": databases,
            "error": error,
        },
    )


def cmd_get_memories(args):
    """Get episodic memories from the database."""
    if not apply_monkeypatch():
        output_error("Neither kuzu nor LadybugDB is installed")
        return

    conn, error = get_db_connection(args.db_path, args.database)
    if not conn:
        output_error(error or "Failed to connect to database")
        return

    try:
        limit = args.limit or 20

        # Query episodic nodes with parameterized query
        query = """
            MATCH (e:Episodic)
            RETURN e.uuid as uuid, e.name as name, e.created_at as created_at,
                   e.content as content, e.source_description as description,
                   e.group_id as group_id
            ORDER BY e.created_at DESC
            LIMIT $limit
        """

        result = conn.execute(query, parameters={"limit": limit})
        df = result.get_as_df()

        memories = []
        for _, row in df.iterrows():
            memory = {
                "id": row.get("uuid") or row.get("name", "unknown"),
                "name": row.get("name", ""),
                "type": infer_episode_type(row.get("name", ""), row.get("content", "")),
                "timestamp": row.get("created_at") or datetime.now().isoformat(),
                "content": row.get("content")
                or row.get("description")
                or row.get("name", ""),
                "description": row.get("description", ""),
                "group_id": row.get("group_id", ""),
            }

            # Extract session number if present
            session_num = extract_session_number(row.get("name", ""))
            if session_num:
                memory["session_number"] = session_num

            memories.append(memory)

        output_json(True, data={"memories": memories, "count": len(memories)})

    except Exception as e:
        # Table might not exist yet
        if "Episodic" in str(e) and (
            "not exist" in str(e).lower() or "cannot" in str(e).lower()
        ):
            output_json(True, data={"memories": [], "count": 0})
        else:
            output_error(f"Query failed: {e}")


def cmd_search(args):
    """Search memories by keyword."""
    if not apply_monkeypatch():
        output_error("Neither kuzu nor LadybugDB is installed")
        return

    conn, error = get_db_connection(args.db_path, args.database)
    if not conn:
        output_error(error or "Failed to connect to database")
        return

    try:
        limit = args.limit or 20
        search_query = args.query.lower()

        # Search in episodic nodes using CONTAINS with parameterized query
        query = """
            MATCH (e:Episodic)
            WHERE toLower(e.name) CONTAINS $search_query
               OR toLower(e.content) CONTAINS $search_query
               OR toLower(e.source_description) CONTAINS $search_query
            RETURN e.uuid as uuid, e.name as name, e.created_at as created_at,
                   e.content as content, e.source_description as description,
                   e.group_id as group_id
            ORDER BY e.created_at DESC
            LIMIT $limit
        """

        result = conn.execute(
            query, parameters={"search_query": search_query, "limit": limit}
        )
        df = result.get_as_df()

        memories = []
        for _, row in df.iterrows():
            memory = {
                "id": row.get("uuid") or row.get("name", "unknown"),
                "name": row.get("name", ""),
                "type": infer_episode_type(row.get("name", ""), row.get("content", "")),
                "timestamp": row.get("created_at") or datetime.now().isoformat(),
                "content": row.get("content")
                or row.get("description")
                or row.get("name", ""),
                "description": row.get("description", ""),
                "group_id": row.get("group_id", ""),
                "score": 1.0,  # Keyword match score
            }

            session_num = extract_session_number(row.get("name", ""))
            if session_num:
                memory["session_number"] = session_num

            memories.append(memory)

        output_json(
            True,
            data={"memories": memories, "count": len(memories), "query": args.query},
        )

    except Exception as e:
        if "Episodic" in str(e) and (
            "not exist" in str(e).lower() or "cannot" in str(e).lower()
        ):
            output_json(True, data={"memories": [], "count": 0, "query": args.query})
        else:
            output_error(f"Search failed: {e}")


def cmd_semantic_search(args):
    """
    Perform semantic vector search using Graphiti embeddings.

    Falls back to keyword search if:
    - Embedder provider not configured
    - Graphiti initialization fails
    - Search fails for any reason
    """
    # Check if embedder is configured via environment
    embedder_provider = os.environ.get("GRAPHITI_EMBEDDER_PROVIDER", "").lower()

    if not embedder_provider:
        # No embedder configured, fall back to keyword search
        return cmd_search(args)

    # Try semantic search
    try:
        result = asyncio.run(_async_semantic_search(args))
        if result.get("success"):
            output_json(True, data=result.get("data"))
        else:
            # Semantic search failed, fall back to keyword search
            return cmd_search(args)
    except Exception as e:
        # Any error, fall back to keyword search
        sys.stderr.write(f"Semantic search failed, falling back to keyword: {e}\n")
        return cmd_search(args)


async def _async_semantic_search(args):
    """Async implementation of semantic search using GraphitiClient."""
    if not apply_monkeypatch():
        return {"success": False, "error": "LadybugDB not installed"}

    try:
        # Add auto-claude to path for imports
        auto_claude_dir = Path(__file__).parent
        if str(auto_claude_dir) not in sys.path:
            sys.path.insert(0, str(auto_claude_dir))

        # Import Graphiti components
        from integrations.graphiti.config import GraphitiConfig
        from integrations.graphiti.queries_pkg.client import GraphitiClient

        # Create config from environment
        config = GraphitiConfig.from_env()

        # Override database location from CLI args
        # Note: We only override db_path/database for CLI-specified locations.
        # The config.enabled flag is respected - if the user has disabled memory,
        # this CLI tool should not be used. The caller (main()) routes to this
        # function only when semantic-search command is explicitly requested.
        config.db_path = args.db_path
        config.database = args.database

        # Validate embedder configuration using public API
        validation_errors = config.get_validation_errors()
        if validation_errors:
            return {
                "success": False,
                "error": f"Embedder provider not properly configured: {'; '.join(validation_errors)}",
            }

        # Initialize client
        client = GraphitiClient(config)
        initialized = await client.initialize()

        if not initialized:
            return {"success": False, "error": "Failed to initialize Graphiti client"}

        try:
            # Perform semantic search using Graphiti
            limit = args.limit or 20
            search_query = args.query

            # Use Graphiti's search method
            search_results = await client.graphiti.search(
                query=search_query,
                num_results=limit,
            )

            # Transform results to our format
            memories = []
            for result in search_results:
                # Handle both edge and episode results
                if hasattr(result, "fact"):
                    # Edge result (relationship)
                    memory = {
                        "id": getattr(result, "uuid", "unknown"),
                        "name": result.fact[:100] if result.fact else "",
                        "type": "session_insight",
                        "timestamp": getattr(
                            result, "created_at", datetime.now().isoformat()
                        ),
                        "content": result.fact or "",
                        "score": getattr(result, "score", 1.0),
                    }
                elif hasattr(result, "content"):
                    # Episode result
                    memory = {
                        "id": getattr(result, "uuid", "unknown"),
                        "name": getattr(result, "name", "")[:100],
                        "type": infer_episode_type(
                            getattr(result, "name", ""), getattr(result, "content", "")
                        ),
                        "timestamp": getattr(
                            result, "created_at", datetime.now().isoformat()
                        ),
                        "content": result.content or "",
                        "score": getattr(result, "score", 1.0),
                    }
                else:
                    # Generic result
                    memory = {
                        "id": str(getattr(result, "uuid", "unknown")),
                        "name": str(result)[:100],
                        "type": "session_insight",
                        "timestamp": datetime.now().isoformat(),
                        "content": str(result),
                        "score": 1.0,
                    }

                session_num = extract_session_number(memory.get("name", ""))
                if session_num:
                    memory["session_number"] = session_num

                memories.append(memory)

            return {
                "success": True,
                "data": {
                    "memories": memories,
                    "count": len(memories),
                    "query": search_query,
                    "search_type": "semantic",
                    "embedder": config.embedder_provider,
                },
            }

        finally:
            await client.close()

    except ImportError as e:
        return {"success": False, "error": f"Missing dependencies: {e}"}
    except Exception as e:
        return {"success": False, "error": f"Semantic search failed: {e}"}


def cmd_get_entities(args):
    """Get entity memories (patterns, gotchas, etc.) from the database."""
    if not apply_monkeypatch():
        output_error("Neither kuzu nor LadybugDB is installed")
        return

    conn, error = get_db_connection(args.db_path, args.database)
    if not conn:
        output_error(error or "Failed to connect to database")
        return

    try:
        limit = args.limit or 20

        # Query entity nodes with parameterized query
        query = """
            MATCH (e:Entity)
            RETURN e.uuid as uuid, e.name as name, e.summary as summary,
                   e.created_at as created_at
            ORDER BY e.created_at DESC
            LIMIT $limit
        """

        result = conn.execute(query, parameters={"limit": limit})
        df = result.get_as_df()

        entities = []
        for _, row in df.iterrows():
            if not row.get("summary"):
                continue

            entity = {
                "id": row.get("uuid") or row.get("name", "unknown"),
                "name": row.get("name", ""),
                "type": infer_entity_type(row.get("name", "")),
                "timestamp": row.get("created_at") or datetime.now().isoformat(),
                "content": row.get("summary", ""),
            }
            entities.append(entity)

        output_json(True, data={"entities": entities, "count": len(entities)})

    except Exception as e:
        if "Entity" in str(e) and (
            "not exist" in str(e).lower() or "cannot" in str(e).lower()
        ):
            output_json(True, data={"entities": [], "count": 0})
        else:
            output_error(f"Query failed: {e}")


def infer_episode_type(name: str, content: str = "") -> str:
    """Infer the episode type from its name and content."""
    name_lower = (name or "").lower()
    content_lower = (content or "").lower()

    if "session_" in name_lower or '"type": "session_insight"' in content_lower:
        return "session_insight"
    if "pattern" in name_lower or '"type": "pattern"' in content_lower:
        return "pattern"
    if "gotcha" in name_lower or '"type": "gotcha"' in content_lower:
        return "gotcha"
    if "codebase" in name_lower or '"type": "codebase_discovery"' in content_lower:
        return "codebase_discovery"
    if "task_outcome" in name_lower or '"type": "task_outcome"' in content_lower:
        return "task_outcome"

    return "session_insight"


def infer_entity_type(name: str) -> str:
    """Infer the entity type from its name."""
    name_lower = (name or "").lower()

    if "pattern" in name_lower:
        return "pattern"
    if "gotcha" in name_lower:
        return "gotcha"
    if "file_insight" in name_lower or "codebase" in name_lower:
        return "codebase_discovery"

    return "session_insight"


def extract_session_number(name: str) -> int | None:
    """Extract session number from episode name."""
    match = re.search(r"session[_-]?(\d+)", name or "", re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            pass
    return None


def main():
    parser = argparse.ArgumentParser(
        description="Query LadybugDB memory database for auto-claude-ui"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # get-status command
    status_parser = subparsers.add_parser("get-status", help="Get database status")
    status_parser.add_argument("db_path", help="Path to database directory")
    status_parser.add_argument("database", help="Database name")

    # get-memories command
    memories_parser = subparsers.add_parser(
        "get-memories", help="Get episodic memories"
    )
    memories_parser.add_argument("db_path", help="Path to database directory")
    memories_parser.add_argument("database", help="Database name")
    memories_parser.add_argument(
        "--limit", type=int, default=20, help="Maximum results"
    )

    # search command
    search_parser = subparsers.add_parser("search", help="Search memories")
    search_parser.add_argument("db_path", help="Path to database directory")
    search_parser.add_argument("database", help="Database name")
    search_parser.add_argument("query", help="Search query")
    search_parser.add_argument("--limit", type=int, default=20, help="Maximum results")

    # semantic-search command
    semantic_parser = subparsers.add_parser(
        "semantic-search",
        help="Semantic vector search (falls back to keyword if embedder not configured)",
    )
    semantic_parser.add_argument("db_path", help="Path to database directory")
    semantic_parser.add_argument("database", help="Database name")
    semantic_parser.add_argument("query", help="Search query")
    semantic_parser.add_argument(
        "--limit", type=int, default=20, help="Maximum results"
    )

    # get-entities command
    entities_parser = subparsers.add_parser("get-entities", help="Get entity memories")
    entities_parser.add_argument("db_path", help="Path to database directory")
    entities_parser.add_argument("database", help="Database name")
    entities_parser.add_argument(
        "--limit", type=int, default=20, help="Maximum results"
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        output_error("No command specified")
        return

    # Route to command handler
    commands = {
        "get-status": cmd_get_status,
        "get-memories": cmd_get_memories,
        "search": cmd_search,
        "semantic-search": cmd_semantic_search,
        "get-entities": cmd_get_entities,
    }

    handler = commands.get(args.command)
    if handler:
        handler(args)
    else:
        output_error(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
