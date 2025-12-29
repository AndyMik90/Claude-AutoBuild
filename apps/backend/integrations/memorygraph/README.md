# MemoryGraph Integration for Auto-Claude

**Status: Phase 1, 2 & 3 Complete**

This integration provides invisible memory capabilities for Auto-Claude agents using the MemoryGraph MCP server.

## Philosophy

"Just works" - Enable one environment variable and agents gain memory across sessions, specs, and builds.

## Quick Start

```bash
# In your .env file
MEMORYGRAPH_ENABLED=true

# That's it! Agents now have memory.
```

## What's Implemented

### Phase 1: Foundation ✅

**Configuration** (`config.py`)
- `is_memorygraph_enabled()` - Check if enabled via env var
- `get_memorygraph_config()` - Get config with sensible defaults
- `MemoryGraphConfig` - Dataclass for configuration

**MCP Client** (`client.py`)
- `MemoryGraphClient` - Async client for MemoryGraph MCP server
  - `recall(query, limit)` - Search for relevant memories
  - `store(type, title, content, tags, importance)` - Store new memory
  - `relate(from_id, to_id, relationship_type)` - Create relationships
  - `get_related(memory_id, types)` - Get related memories
- Graceful error handling - returns empty/None if server unavailable
- Uses subprocess to communicate with `memorygraph` command

### Phase 2: Context Injection ✅

**Context Retrieval** (`context.py`)
- `get_context_for_subtask(subtask, project_dir)` - Get relevant context
  - Builds query from subtask description + file names
  - Calls `recall_memories` for fuzzy search
  - Finds related solutions for problems
  - Returns formatted markdown or empty string

**Context Formatting** (`formatting.py`)
- `format_context(memories, solutions)` - Format as readable markdown
  - Groups by type: Solutions, Patterns, Gotchas
  - Truncates long content to avoid bloat
  - Returns "Prior Knowledge" section for prompt injection

### Phase 3: Insight Extraction ✅

**Insight Extractor** (`extractor.py`)
- `InsightExtractor` - Extract structured insights from session output
  - `extract_problems(session_output)` - Extract from failures, errors, QA rejections
  - `extract_solutions(session_output)` - Extract from successes, fixes applied
  - `extract_patterns(session_output)` - Extract or infer patterns
  - Uses simple pattern matching and heuristics (no LLM required)

**Relationship Inference** (`relationships.py`)
- `infer_relationships(problems, solutions, client)` - Link memories
  - Creates SOLVES relationships between solutions and problems
  - Uses same-session heuristic for linking
  - Continues gracefully on individual failures

**Storage Integration** (`storage.py`)
- `save_to_memorygraph(session_output, project_dir)` - Save insights after session
  - Extracts problems, solutions, patterns
  - Stores each to MemoryGraph with project tags
  - Creates relationships between related memories
  - Async, non-blocking operation
  - Graceful error handling - never crashes

## Architecture

```text
┌─────────────────────────────────────────────────┐
│              Auto-Claude Agent                  │
│                                                 │
│  1. get_context_for_subtask(subtask)           │
│  2. Context injected into system prompt        │
│  3. Agent works with prior knowledge           │
└─────────────────────────────────────────────────┘
                      │
                      │ MCP Protocol
                      ▼
┌─────────────────────────────────────────────────┐
│           MemoryGraph MCP Server                │
│                                                 │
│  - recall_memories (fuzzy search)              │
│  - get_related_memories (graph traversal)      │
│  - store_memory (save insights)                │
│  - create_relationship (link memories)         │
└─────────────────────────────────────────────────┘
```

## Usage Example

### Before Session: Context Injection

```python
from integrations.memorygraph import (
    is_memorygraph_enabled,
    get_context_for_subtask
)

# Check if enabled
if is_memorygraph_enabled():
    # Get context for a subtask
    subtask = {
        "id": "task_1",
        "description": "Fix authentication bug",
        "files": ["auth.py", "login.py"]
    }

    context = await get_context_for_subtask(subtask, project_dir)

    # Inject into agent prompt
    if context:
        system_prompt = f"{base_prompt}\n\n{context}"
```

### After Session: Insight Storage

```python
from integrations.memorygraph import (
    is_memorygraph_enabled,
    save_to_memorygraph
)
import asyncio

# After session completes
if is_memorygraph_enabled():
    session_output = {
        "what_failed": ["JWT validation failed with None token"],
        "what_worked": ["Added null check before JWT decode"],
        "patterns_found": ["Always validate input before processing"]
    }

    # Save asynchronously - doesn't block
    asyncio.create_task(save_to_memorygraph(session_output, project_dir))
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORYGRAPH_ENABLED` | `false` | Enable/disable MemoryGraph integration |
| `MEMORYGRAPH_BACKEND` | `sqlite` | Backend to use (sqlite, neo4j, falkordb, etc.) |
| `MEMORYGRAPH_PROJECT_SCOPED` | `true` | Enable cross-spec learning |

## Testing

All functionality is tested with graceful degradation:

```bash
cd /Users/gregorydickson/Auto-Claude
python3 -m pytest tests/integrations/memorygraph/ -v
```

**Test Coverage:**
- MCP Client: 18 tests ✅ (including UUID support, timeout config, process cleanup)
- Context Retrieval: 7 tests ✅
- Context Formatting: 12 tests ✅
- Insight Extraction: 20 tests ✅
- Relationship Inference: 5 tests ✅
- Storage Integration: 6 tests ✅

**Total: 68 tests passing**

## Integration with memory_manager.py

**Status: COMPLETE** - MemoryGraph is now integrated into `apps/backend/agents/memory_manager.py`.

The integration provides:
- **Tri-layer memory strategy**: Graphiti (primary), file-based (fallback), MemoryGraph (parallel)
- **Parallel async storage**: Uses `asyncio.create_task()` for non-blocking saves
- **Context retrieval**: `get_memorygraph_context()` for subtask context injection
- **Debug output**: Memory system status shows MemoryGraph configuration

```python
# memory_manager.py now includes:

# Status functions
is_memorygraph_enabled()      # Check if MEMORYGRAPH_ENABLED=true
get_memorygraph_status()      # Get config for debugging

# Context retrieval (for subtasks)
await get_memorygraph_context(project_dir, subtask)

# Automatic storage (in save_session_memory)
if is_memorygraph_enabled():
    asyncio.create_task(_save_to_memorygraph_async(insights, project_dir))
```

## Troubleshooting

### MemoryGraph server not found

```text
ERROR: MemoryGraph command not found - is it installed?
```

**Solution:** Install MemoryGraph MCP server:
```bash
pip install memorygraph
# or
pipx install memorygraph
```

### No memories being stored
1. Check that `MEMORYGRAPH_ENABLED=true` in your `.env`
2. Verify MemoryGraph server is running: `memorygraph --health`
3. Check logs for warnings about storage failures

### No context being retrieved
1. Verify memories exist: `memorygraph recall "your query"`
2. Check that subtask description matches stored content
3. Enable debug logging to see retrieval attempts

## Next Steps (Not Yet Implemented)

### Phase 4: Polish
- Performance monitoring and optimization
- Enhanced error reporting
- Integration testing with live MCP server
- Load testing with large memory graphs

## Files

```text
apps/backend/integrations/memorygraph/
├── __init__.py          # Module exports + lazy loading
├── config.py            # Configuration management
├── client.py            # MCP client for MemoryGraph server
├── context.py           # Context retrieval from memories
├── formatting.py        # Format memories for prompts
├── extractor.py         # Extract insights from session output
├── relationships.py     # Infer and create memory relationships
├── storage.py           # Save insights to MemoryGraph
└── README.md           # This file

tests/integrations/memorygraph/
├── test_extractor.py    # 18 tests for insight extraction
├── test_relationships.py # 5 tests for relationship inference
└── test_storage.py      # 6 tests for storage integration
```

## Design Principles

1. **Invisible**: Agents don't know memory exists - they just work better
2. **Graceful**: If MemoryGraph is unavailable, agents work normally
3. **Minimal**: One environment variable to enable
4. **Async**: Non-blocking operations, won't slow down agents
5. **Tested**: Comprehensive test coverage with mocked MCP server

## Integration Points

This integration is designed to work alongside:
- ✅ Graphiti (can coexist)
- ✅ File-based memory (fallback)
- ✅ memory_manager.py (integrated)

## License

Follows Auto-Claude's licensing (AGPL 3.0)
