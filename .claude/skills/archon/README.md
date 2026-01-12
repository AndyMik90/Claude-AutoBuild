# Archon Integration Skill

Query Archon knowledge base, manage tasks, and sync project data.

## Quick Start

**Trigger phrases:**
- "search archon for X"
- "create archon task for Y"
- "query knowledge base about Z"

**What it does:**
Interfaces with Archon MCP for knowledge management, task tracking, and cross-spec learning.

## Key Operations

### Knowledge Base Search

```python
# Search docs (keep queries SHORT: 2-5 keywords)
rag_search_knowledge_base(query="React hooks useState", match_count=5)

# Search code examples
rag_search_code_examples(query="JWT validation", match_count=3)

# Read full page
rag_read_full_page(page_id="uuid-here")
```

### Task Management

```python
# Find tasks
find_tasks(project_id="proj-id", filter_by="status", filter_value="todo")

# Create task
manage_task(
    action="create",
    project_id="proj-id",
    title="Implement feature",
    status="todo",
    assignee="Coder Agent"
)

# Update task status
manage_task(action="update", task_id="task-id", status="doing")
```

### Project Sync

```python
# Create project for Auto-Claude spec
manage_project(
    action="create",
    title="Spec 001: Authentication",
    description="OAuth with Supabase"
)

# Store project ID for future sync
echo "project-uuid" > .auto-claude/specs/001-auth/.archon_project_id
```

## Integration Workflows

### 1. Before Implementing (Cross-Spec Learning)

```
User: "I'm about to implement OAuth authentication"

1. Search Archon: "OAuth authentication patterns"
2. Read relevant pages for gotchas
3. Apply learnings to current implementation
```

### 2. During Implementation (Task Tracking)

```
1. Spec created → Create Archon project
2. Plan created → Create Archon tasks for subtasks
3. Coding → Update task status (todo → doing → review → done)
4. QA complete → Mark all tasks done
```

### 3. After Implementation (Knowledge Storage)

```
1. Extract session insights
2. Store patterns in Archon RAG
3. Document gotchas for future reference
```

## RAG Query Best Practices

**GOOD Queries (2-5 keywords):**
- "JWT validation Express"
- "React hooks authentication"
- "WebSocket real-time updates"

**BAD Queries (too long):**
- "How do I implement JWT token validation in Express middleware with proper error handling?"
- "React hooks useState useEffect useContext useReducer useMemo useCallback"

## Requirements

- Archon MCP server running (http://localhost:8051/mcp)
- SUPABASE_URL and SUPABASE_KEY in environment
- Archon integration enabled in `.claude/settings.json`

## Related

- **auto-claude-spec** - Specs sync to Archon projects
- **auto-claude-build** - Tasks sync during builds
- **observability** - Session insights stored in Archon RAG
