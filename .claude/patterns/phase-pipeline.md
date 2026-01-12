# Phase Pipeline Pattern

Auto-Claude's multi-phase pipeline pattern for building software features autonomously.

## Pattern Overview

```
Spec Creation → Planning → Coding → QA → Fix Loop → Merge
```

Each phase has a specialized agent with specific responsibilities.

## Phases

### 1. Spec Creation

**Agent**: spec_gatherer, spec_researcher, spec_writer, spec_critic
**Duration**: 10-30 minutes
**Output**: spec.md, requirements.json, context.json

**Key Activities**:
- Gather user requirements through conversation
- Research external APIs/integrations (if needed)
- Discover codebase context
- Write specification with acceptance criteria
- Self-critique (for complex specs)

### 2. Planning

**Agent**: planner
**Duration**: 5-15 minutes
**Output**: implementation_plan.json

**Key Activities**:
- Read spec.md for requirements
- Query Graphiti memory for similar patterns
- Analyze codebase structure
- Create 3-8 subtasks with dependencies
- Estimate complexity per subtask

### 3. Coding

**Agent**: coder (can spawn subagents)
**Duration**: 30-120 minutes
**Output**: Code changes in isolated worktree

**Key Activities**:
- Execute subtasks sequentially (or parallel via subagents)
- Query Graphiti for context
- Write code following project conventions
- Record discoveries for future reference
- Handle errors with recovery logic

### 4. QA

**Agent**: qa_reviewer
**Duration**: 5-15 minutes
**Output**: qa_report.md

**Key Activities**:
- Read spec.md for acceptance criteria
- Validate all criteria met
- Run tests (if test suite exists)
- Check build succeeds
- E2E testing (for frontend via Electron MCP)

### 5. Fix Loop (if QA rejects)

**Agent**: qa_fixer
**Duration**: 10-30 minutes per iteration
**Output**: Code fixes, updated QA report

**Key Activities**:
- Read QA_FIX_REQUEST.md for issues
- Fix issues iteratively
- Re-run tests
- Request QA re-validation

**Max iterations**: 3 (default)

## Integration Points

### Graphiti Memory
- **Planning**: Query for similar implementations
- **Coding**: Load context for subtask execution
- **Post-session**: Store insights and patterns

### Archon Sync
- **Spec creation**: Create Archon project
- **Planning**: Create Archon tasks
- **Coding**: Update task status
- **QA**: Store QA report

### OTEL Tracing
- **All phases**: Emit spans for observability
- **Attributes**: phase, spec_dir, subtask_id, tokens
- **Backend**: Arize Phoenix (localhost:6006)

## Success Criteria

**Spec Validation**:
- Clear acceptance criteria
- Implementation plan has 3-8 subtasks
- Context discovery found relevant files

**Build Success**:
- All subtasks completed
- QA accepts on first try (or within 3 iterations)
- Tests pass
- Build succeeds

**Quality Metrics**:
- < 10% plan validation failures
- > 80% QA acceptance on first try
- < 3 fix iterations average

## Failure Recovery

### Planning Failure
- Structured outputs eliminate JSON parsing failures
- Fallback: Re-plan with simplified subtasks

### Coding Stuck
- Recovery agent (coder_recovery.md prompt)
- Fallback: Manual intervention

### QA Rejection
- Fix loop (up to 3 iterations)
- Fallback: User review and manual fixes

## Best Practices

1. **Spec quality matters**: Better specs → better builds
2. **Parallel subtasks**: Use subagents when subtasks are independent
3. **Memory integration**: Always query Graphiti before implementing
4. **Test in worktree**: Always review before merging
5. **Learn from failures**: Store insights in Graphiti/Archon
