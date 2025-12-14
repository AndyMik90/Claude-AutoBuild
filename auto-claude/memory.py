#!/usr/bin/env python3
"""
Session Memory System
=====================

Persists learnings between autonomous coding sessions to avoid rediscovering
codebase patterns, gotchas, and insights.

Architecture Decision:
    Memory System Hierarchy:
    
    PRIMARY: Graphiti (when GRAPHITI_ENABLED=true)
        - Graph-based knowledge storage with FalkorDB
        - Semantic search across sessions
        - Cross-project context retrieval
        - Rich relationship modeling
    
    FALLBACK: File-based (when Graphiti is disabled)
        - Zero external dependencies (no database required)
        - Human-readable files for debugging and inspection
        - Guaranteed availability (no network/service failures)
        - Simple backup and version control integration

    The agent.py orchestrator uses save_session_memory() which:
    1. Tries Graphiti first if enabled
    2. Falls back to file-based if Graphiti is disabled or fails
    
    This ensures memory is ALWAYS saved, regardless of configuration.

Each spec has its own memory directory:
    auto-claude/specs/001-feature/memory/
        ├── codebase_map.json      # Key files and their purposes
        ├── patterns.md            # Code patterns to follow
        ├── gotchas.md             # Pitfalls to avoid
        └── session_insights/
            ├── session_001.json   # What session 1 learned
            └── session_002.json   # What session 2 learned

Usage:
    # Save session insights
    from memory import save_session_insights
    insights = {
        "subtasks_completed": ["subtask-1"],
        "discoveries": {...},
        "what_worked": ["approach"],
        "what_failed": ["mistake"],
        "recommendations_for_next_session": ["tip"]
    }
    save_session_insights(spec_dir, session_num=1, insights=insights)

    # Load all past insights
    from memory import load_all_insights
    all_insights = load_all_insights(spec_dir)

    # Update codebase map
    from memory import update_codebase_map
    discoveries = {
        "src/api/auth.py": "Handles JWT authentication and token validation",
        "src/models/user.py": "User database model with password hashing"
    }
    update_codebase_map(spec_dir, discoveries)

    # Append gotcha
    from memory import append_gotcha
    append_gotcha(spec_dir, "Database connections must be explicitly closed in workers")

    # Append pattern
    from memory import append_pattern
    append_pattern(spec_dir, "Use try/except with specific exceptions, log errors with context")

Graphiti Integration:
    When GRAPHITI_ENABLED=true and a valid provider is configured, session insights
    and discoveries are also saved to the Graphiti knowledge graph.
    This enables semantic search and cross-session context retrieval.

    Supported providers:
    - LLM: OpenAI, Anthropic, Azure OpenAI, Ollama
    - Embedder: OpenAI, Voyage AI, Azure OpenAI, Ollama

    See graphiti_config.py for provider configuration details.

    # Check if Graphiti is enabled
    from memory import is_graphiti_memory_enabled
    if is_graphiti_memory_enabled():
        # Graphiti will automatically store data alongside file-based memory
        pass
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

# Configure logging
logger = logging.getLogger(__name__)


# =============================================================================
# Graphiti Integration Helpers
# =============================================================================

def is_graphiti_memory_enabled() -> bool:
    """
    Check if Graphiti memory integration is available.

    Returns True if:
    - GRAPHITI_ENABLED is set to true/1/yes
    - A valid LLM provider is configured (OpenAI, Anthropic, Azure, or Ollama)
    - A valid embedder provider is configured (OpenAI, Voyage, Azure, or Ollama)

    See graphiti_config.py for detailed provider requirements.
    """
    try:
        from graphiti_config import is_graphiti_enabled
        return is_graphiti_enabled()
    except ImportError:
        return False


def _get_graphiti_memory(spec_dir: Path, project_dir: Optional[Path] = None):
    """
    Get a GraphitiMemory instance if available.

    Args:
        spec_dir: Spec directory
        project_dir: Project root directory (defaults to spec_dir.parent.parent)

    Returns:
        GraphitiMemory instance or None if not available
    """
    if not is_graphiti_memory_enabled():
        return None

    try:
        from graphiti_memory import GraphitiMemory
        if project_dir is None:
            project_dir = spec_dir.parent.parent
        return GraphitiMemory(spec_dir, project_dir)
    except ImportError:
        return None


def _run_async(coro):
    """
    Run an async coroutine synchronously.

    Handles the case where we're already in an event loop.
    """
    try:
        loop = asyncio.get_running_loop()
        # Already in an event loop - create a task
        return asyncio.ensure_future(coro)
    except RuntimeError:
        # No event loop running - create one
        return asyncio.run(coro)


async def _save_to_graphiti_async(
    spec_dir: Path,
    session_num: int,
    insights: dict,
    project_dir: Optional[Path] = None,
) -> bool:
    """
    Save session insights to Graphiti (async helper).

    This is called in addition to file-based storage when Graphiti is enabled.
    """
    graphiti = _get_graphiti_memory(spec_dir, project_dir)
    if not graphiti:
        return False

    try:
        result = await graphiti.save_session_insights(session_num, insights)

        # Also save codebase discoveries if present
        discoveries = insights.get("discoveries", {})
        files_understood = discoveries.get("files_understood", {})
        if files_understood:
            await graphiti.save_codebase_discoveries(files_understood)

        # Save patterns
        for pattern in discoveries.get("patterns_found", []):
            await graphiti.save_pattern(pattern)

        # Save gotchas
        for gotcha in discoveries.get("gotchas_encountered", []):
            await graphiti.save_gotcha(gotcha)

        await graphiti.close()
        return result

    except Exception as e:
        logger.warning(f"Failed to save to Graphiti: {e}")
        try:
            await graphiti.close()
        except Exception:
            pass
        return False


# =============================================================================
# File-Based Memory Functions
# =============================================================================

def get_memory_dir(spec_dir: Path) -> Path:
    """
    Get the memory directory for a spec, creating it if needed.

    Args:
        spec_dir: Path to spec directory (e.g., auto-claude/specs/001-feature/)

    Returns:
        Path to memory directory
    """
    memory_dir = spec_dir / "memory"
    memory_dir.mkdir(exist_ok=True)
    return memory_dir


def get_session_insights_dir(spec_dir: Path) -> Path:
    """
    Get the session insights directory, creating it if needed.

    Args:
        spec_dir: Path to spec directory

    Returns:
        Path to session_insights directory
    """
    insights_dir = get_memory_dir(spec_dir) / "session_insights"
    insights_dir.mkdir(parents=True, exist_ok=True)
    return insights_dir


def save_session_insights(spec_dir: Path, session_num: int, insights: dict) -> None:
    """
    Save insights from a completed session.

    Args:
        spec_dir: Path to spec directory
        session_num: Session number (1-indexed)
        insights: Dictionary containing session learnings with keys:
            - subtasks_completed: list[str] - Subtask IDs completed
            - discoveries: dict - New file purposes, patterns, gotchas found
                - files_understood: dict[str, str] - {path: purpose}
                - patterns_found: list[str] - Pattern descriptions
                - gotchas_encountered: list[str] - Gotcha descriptions
            - what_worked: list[str] - Successful approaches
            - what_failed: list[str] - Unsuccessful approaches
            - recommendations_for_next_session: list[str] - Suggestions

    Example:
        insights = {
            "subtasks_completed": ["subtask-1", "subtask-2"],
            "discoveries": {
                "files_understood": {
                    "src/api/auth.py": "JWT authentication handler"
                },
                "patterns_found": ["Use async/await for all DB calls"],
                "gotchas_encountered": ["Must close DB connections in workers"]
            },
            "what_worked": ["Added comprehensive error handling first"],
            "what_failed": ["Tried inline validation - should use middleware"],
            "recommendations_for_next_session": ["Focus on integration tests next"]
        }
    """
    insights_dir = get_session_insights_dir(spec_dir)
    session_file = insights_dir / f"session_{session_num:03d}.json"

    # Build complete insight structure
    session_data = {
        "session_number": session_num,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "subtasks_completed": insights.get("subtasks_completed", []),
        "discoveries": insights.get("discoveries", {
            "files_understood": {},
            "patterns_found": [],
            "gotchas_encountered": []
        }),
        "what_worked": insights.get("what_worked", []),
        "what_failed": insights.get("what_failed", []),
        "recommendations_for_next_session": insights.get("recommendations_for_next_session", []),
    }

    # Write to file (always use file-based storage)
    with open(session_file, "w") as f:
        json.dump(session_data, f, indent=2)

    # Also save to Graphiti if enabled (non-blocking, errors logged but not raised)
    if is_graphiti_memory_enabled():
        try:
            _run_async(_save_to_graphiti_async(spec_dir, session_num, session_data))
            logger.info(f"Session {session_num} insights also saved to Graphiti")
        except Exception as e:
            # Don't fail the save if Graphiti fails - file-based is the primary storage
            logger.warning(f"Graphiti save failed (file-based save succeeded): {e}")


def load_all_insights(spec_dir: Path) -> list[dict]:
    """
    Load all session insights, ordered by session number.

    Args:
        spec_dir: Path to spec directory

    Returns:
        List of insight dictionaries, oldest to newest
    """
    insights_dir = get_session_insights_dir(spec_dir)

    if not insights_dir.exists():
        return []

    # Find all session JSON files
    session_files = sorted(insights_dir.glob("session_*.json"))

    insights = []
    for session_file in session_files:
        try:
            with open(session_file, "r") as f:
                insights.append(json.load(f))
        except (json.JSONDecodeError, IOError):
            # Skip corrupted files
            continue

    return insights


def update_codebase_map(spec_dir: Path, discoveries: dict[str, str]) -> None:
    """
    Update the codebase map with newly discovered file purposes.

    This function merges new discoveries with existing ones. If a file path
    already exists, its purpose will be updated.

    Args:
        spec_dir: Path to spec directory
        discoveries: Dictionary mapping file paths to their purposes
            Example: {
                "src/api/auth.py": "Handles JWT authentication",
                "src/models/user.py": "User database model"
            }
    """
    memory_dir = get_memory_dir(spec_dir)
    map_file = memory_dir / "codebase_map.json"

    # Load existing map or create new
    if map_file.exists():
        try:
            with open(map_file, "r") as f:
                codebase_map = json.load(f)
        except (json.JSONDecodeError, IOError):
            codebase_map = {}
    else:
        codebase_map = {}

    # Update with new discoveries
    codebase_map.update(discoveries)

    # Add metadata
    if "_metadata" not in codebase_map:
        codebase_map["_metadata"] = {}

    codebase_map["_metadata"]["last_updated"] = datetime.now(timezone.utc).isoformat()
    codebase_map["_metadata"]["total_files"] = len([k for k in codebase_map.keys() if k != "_metadata"])

    # Write back
    with open(map_file, "w") as f:
        json.dump(codebase_map, f, indent=2, sort_keys=True)

    # Also save to Graphiti if enabled
    if is_graphiti_memory_enabled() and discoveries:
        try:
            graphiti = _get_graphiti_memory(spec_dir)
            if graphiti:
                _run_async(graphiti.save_codebase_discoveries(discoveries))
                logger.info(f"Codebase discoveries also saved to Graphiti")
        except Exception as e:
            logger.warning(f"Graphiti codebase save failed: {e}")


def load_codebase_map(spec_dir: Path) -> dict[str, str]:
    """
    Load the codebase map.

    Args:
        spec_dir: Path to spec directory

    Returns:
        Dictionary mapping file paths to their purposes.
        Returns empty dict if no map exists.
    """
    memory_dir = get_memory_dir(spec_dir)
    map_file = memory_dir / "codebase_map.json"

    if not map_file.exists():
        return {}

    try:
        with open(map_file, "r") as f:
            codebase_map = json.load(f)

        # Remove metadata before returning
        codebase_map.pop("_metadata", None)
        return codebase_map

    except (json.JSONDecodeError, IOError):
        return {}


def append_gotcha(spec_dir: Path, gotcha: str) -> None:
    """
    Append a gotcha (pitfall to avoid) to the gotchas list.

    Gotchas are deduplicated - if the same gotcha already exists,
    it won't be added again.

    Args:
        spec_dir: Path to spec directory
        gotcha: Description of the pitfall to avoid

    Example:
        append_gotcha(spec_dir, "Database connections must be closed in workers")
        append_gotcha(spec_dir, "API rate limits: 100 req/min per IP")
    """
    memory_dir = get_memory_dir(spec_dir)
    gotchas_file = memory_dir / "gotchas.md"

    # Load existing gotchas
    existing_gotchas = set()
    if gotchas_file.exists():
        content = gotchas_file.read_text()
        # Extract bullet points
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("- "):
                existing_gotchas.add(line[2:].strip())

    # Add new gotcha if not duplicate
    gotcha_stripped = gotcha.strip()
    if gotcha_stripped and gotcha_stripped not in existing_gotchas:
        # Append to file
        with open(gotchas_file, "a") as f:
            if gotchas_file.stat().st_size == 0:
                # First entry - add header
                f.write("# Gotchas and Pitfalls\n\n")
                f.write("Things to watch out for in this codebase:\n\n")
            f.write(f"- {gotcha_stripped}\n")

        # Also save to Graphiti if enabled
        if is_graphiti_memory_enabled():
            try:
                graphiti = _get_graphiti_memory(spec_dir)
                if graphiti:
                    _run_async(graphiti.save_gotcha(gotcha_stripped))
            except Exception as e:
                logger.warning(f"Graphiti gotcha save failed: {e}")


def load_gotchas(spec_dir: Path) -> list[str]:
    """
    Load all gotchas.

    Args:
        spec_dir: Path to spec directory

    Returns:
        List of gotcha strings
    """
    memory_dir = get_memory_dir(spec_dir)
    gotchas_file = memory_dir / "gotchas.md"

    if not gotchas_file.exists():
        return []

    content = gotchas_file.read_text()
    gotchas = []

    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("- "):
            gotchas.append(line[2:].strip())

    return gotchas


def append_pattern(spec_dir: Path, pattern: str) -> None:
    """
    Append a code pattern to follow.

    Patterns are deduplicated - if the same pattern already exists,
    it won't be added again.

    Args:
        spec_dir: Path to spec directory
        pattern: Description of the code pattern

    Example:
        append_pattern(spec_dir, "Use try/except with specific exceptions")
        append_pattern(spec_dir, "All API responses use {success: bool, data: any, error: string}")
    """
    memory_dir = get_memory_dir(spec_dir)
    patterns_file = memory_dir / "patterns.md"

    # Load existing patterns
    existing_patterns = set()
    if patterns_file.exists():
        content = patterns_file.read_text()
        # Extract bullet points
        for line in content.split("\n"):
            line = line.strip()
            if line.startswith("- "):
                existing_patterns.add(line[2:].strip())

    # Add new pattern if not duplicate
    pattern_stripped = pattern.strip()
    if pattern_stripped and pattern_stripped not in existing_patterns:
        # Append to file
        with open(patterns_file, "a") as f:
            if patterns_file.stat().st_size == 0:
                # First entry - add header
                f.write("# Code Patterns\n\n")
                f.write("Established patterns to follow in this codebase:\n\n")
            f.write(f"- {pattern_stripped}\n")

        # Also save to Graphiti if enabled
        if is_graphiti_memory_enabled():
            try:
                graphiti = _get_graphiti_memory(spec_dir)
                if graphiti:
                    _run_async(graphiti.save_pattern(pattern_stripped))
            except Exception as e:
                logger.warning(f"Graphiti pattern save failed: {e}")


def load_patterns(spec_dir: Path) -> list[str]:
    """
    Load all code patterns.

    Args:
        spec_dir: Path to spec directory

    Returns:
        List of pattern strings
    """
    memory_dir = get_memory_dir(spec_dir)
    patterns_file = memory_dir / "patterns.md"

    if not patterns_file.exists():
        return []

    content = patterns_file.read_text()
    patterns = []

    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("- "):
            patterns.append(line[2:].strip())

    return patterns


def get_memory_summary(spec_dir: Path) -> dict[str, Any]:
    """
    Get a summary of all memory data for a spec.

    Useful for understanding what the system has learned so far.

    Args:
        spec_dir: Path to spec directory

    Returns:
        Dictionary with memory summary:
            - total_sessions: int
            - total_files_mapped: int
            - total_patterns: int
            - total_gotchas: int
            - recent_insights: list[dict] (last 3 sessions)
    """
    insights = load_all_insights(spec_dir)
    codebase_map = load_codebase_map(spec_dir)
    patterns = load_patterns(spec_dir)
    gotchas = load_gotchas(spec_dir)

    return {
        "total_sessions": len(insights),
        "total_files_mapped": len(codebase_map),
        "total_patterns": len(patterns),
        "total_gotchas": len(gotchas),
        "recent_insights": insights[-3:] if len(insights) > 3 else insights,
    }


def clear_memory(spec_dir: Path) -> None:
    """
    Clear all memory for a spec.

    WARNING: This deletes all session insights, codebase map, patterns, and gotchas.
    Use with caution - typically only needed when starting completely fresh.

    Args:
        spec_dir: Path to spec directory
    """
    memory_dir = get_memory_dir(spec_dir)

    if memory_dir.exists():
        import shutil
        shutil.rmtree(memory_dir)


# CLI interface for testing and manual management
if __name__ == "__main__":
    import argparse
    import sys

    parser = argparse.ArgumentParser(
        description="Session Memory System - Manage memory for auto-claude specs"
    )
    parser.add_argument(
        "--spec-dir",
        type=Path,
        required=True,
        help="Path to spec directory (e.g., auto-claude/specs/001-feature)",
    )
    parser.add_argument(
        "--action",
        choices=["summary", "list-insights", "list-map", "list-patterns", "list-gotchas", "clear"],
        default="summary",
        help="Action to perform",
    )

    args = parser.parse_args()

    if not args.spec_dir.exists():
        print(f"Error: Spec directory not found: {args.spec_dir}")
        sys.exit(1)

    if args.action == "summary":
        summary = get_memory_summary(args.spec_dir)
        print("\n" + "=" * 70)
        print("  MEMORY SUMMARY")
        print("=" * 70)
        print(f"\nSpec: {args.spec_dir.name}")
        print(f"Total sessions: {summary['total_sessions']}")
        print(f"Files mapped: {summary['total_files_mapped']}")
        print(f"Patterns: {summary['total_patterns']}")
        print(f"Gotchas: {summary['total_gotchas']}")

        if summary['recent_insights']:
            print("\nRecent sessions:")
            for insight in summary['recent_insights']:
                session_num = insight.get('session_number')
                subtasks = len(insight.get('subtasks_completed', []))
                print(f"  Session {session_num}: {subtasks} subtasks completed")

    elif args.action == "list-insights":
        insights = load_all_insights(args.spec_dir)
        print(json.dumps(insights, indent=2))

    elif args.action == "list-map":
        codebase_map = load_codebase_map(args.spec_dir)
        print(json.dumps(codebase_map, indent=2, sort_keys=True))

    elif args.action == "list-patterns":
        patterns = load_patterns(args.spec_dir)
        print("\nCode Patterns:")
        for pattern in patterns:
            print(f"  - {pattern}")

    elif args.action == "list-gotchas":
        gotchas = load_gotchas(args.spec_dir)
        print("\nGotchas:")
        for gotcha in gotchas:
            print(f"  - {gotcha}")

    elif args.action == "clear":
        confirm = input(f"Clear all memory for {args.spec_dir.name}? (yes/no): ")
        if confirm.lower() == "yes":
            clear_memory(args.spec_dir)
            print("Memory cleared.")
        else:
            print("Cancelled.")
