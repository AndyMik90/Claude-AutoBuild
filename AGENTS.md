# AGENTS.md

Guidance for AI coding agents working in this repository.

## Quick Reference

### Python Backend (apps/backend/)

```bash
# Setup (one-time)
cd apps/backend && uv venv && uv pip install -r requirements.txt
uv pip install -r ../../tests/requirements-test.txt

# Run all tests
apps/backend/.venv/bin/pytest tests/ -v

# Run single test file
apps/backend/.venv/bin/pytest tests/test_security.py -v

# Run specific test function
apps/backend/.venv/bin/pytest tests/test_security.py::test_bash_command_validation -v

# Skip slow/integration tests
apps/backend/.venv/bin/pytest tests/ -m "not slow and not integration"

# Lint (auto-fix)
ruff check apps/backend/ --fix

# Format
ruff format apps/backend/
```

### Frontend (apps/frontend/)

```bash
cd apps/frontend

# Run all tests
npm test

# Run single test file
npm test -- src/renderer/features/tasks/TaskCard.test.tsx

# Watch mode
npm run test:watch

# Lint
npm run lint
npm run lint:fix  # auto-fix

# Type check
npm run typecheck

# Build
npm run build
```

### From Repository Root

```bash
npm run test:backend    # Python tests
npm run lint            # Frontend lint
npm test                # Frontend tests
```

## Code Style

### Python

**Formatter**: Ruff (4-space indent, double quotes, 100 char lines)

**Imports** - Order: stdlib, third-party, local. Use facade modules when available:
```python
import json
import logging
from pathlib import Path
from typing import Any

from core.client import create_client
from debug import debug, debug_error
```

**Type hints** - Required for function signatures:
```python
def get_next_chunk(spec_dir: Path, project_dir: Path | None = None) -> dict | None:
    """Find the next pending chunk in the implementation plan."""
    ...
```

**Docstrings** - Required for public functions/classes:
```python
def process_task(task_id: str, options: dict[str, Any]) -> TaskResult:
    """
    Process a task with the given options.

    Args:
        task_id: Unique identifier for the task
        options: Configuration options

    Returns:
        TaskResult with status and output
    """
```

**Naming**:
- `snake_case` for functions, variables, modules
- `PascalCase` for classes
- `SCREAMING_SNAKE_CASE` for constants
- Private: prefix with `_` (e.g., `_internal_helper`)

### TypeScript/React

**Formatter**: ESLint + Prettier (2-space indent)

**Imports** - Order: React, external libs, internal modules, types:
```typescript
import { useState, useCallback } from 'react';
import { motion } from 'motion/react';

import { Button } from '@/shared/components/ui/button';
import { useTaskStore } from '../stores/task-store';
import type { Task, TaskStatus } from '@/shared/types';
```

**Components** - Functional with hooks, named exports:
```typescript
export function TaskCard({ task, onEdit }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  // ...
}
```

**Types** - Prefer `type` over `interface`, explicit typing:
```typescript
type TaskCardProps = {
  task: Task;
  onEdit: (id: string) => void;
};
```

**Naming**:
- `PascalCase` for components, types
- `camelCase` for functions, variables, hooks
- Hooks: `use` prefix (e.g., `useTaskStore`)
- Stores: `kebab-case` with `-store` suffix

### Critical Rules

1. **NO type suppression**: Never use `as any`, `@ts-ignore`, `@ts-expect-error`
2. **NO empty catch blocks**: Always handle or log errors
3. **NO hardcoded strings in UI**: Use i18n translation keys
4. **Claude SDK only**: Use `create_client()` from `core.client`, never raw Anthropic API

### i18n (Frontend)

All user-facing text must use translation keys:
```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation(['navigation', 'common']);
<span>{t('navigation:items.settings')}</span>  // Correct
<span>Settings</span>                           // Wrong
```

Translation files: `apps/frontend/src/shared/i18n/locales/{en,fr}/*.json`

## Testing

### Python Test Markers

```bash
# Skip slow tests
pytest -m "not slow"

# Skip integration tests
pytest -m "not integration"

# Run only async tests
pytest -m "asyncio"
```

### Test File Patterns

- Python: `test_*.py` with `test_*` functions
- TypeScript: `*.test.tsx` or `*.test.ts`

## Pre-commit Hooks

Runs automatically on commit:
- **ruff**: Python lint + format
- **eslint**: TypeScript lint
- **typecheck**: TypeScript type checking
- **pytest**: Python tests (skips slow/integration)

Run manually: `pre-commit run --all-files`

## Git Workflow

- Branch from `develop` (not `main`)
- PR target: `develop`
- Commit format: `type(scope): description`
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Project Structure

```
apps/
  backend/           # Python - agents, specs, QA pipeline
    core/            # Client, auth, security
    agents/          # Agent implementations
    prompts/         # Agent system prompts
  frontend/          # Electron + React
    src/main/        # Electron main process
    src/renderer/    # React UI (feature-based)
    src/shared/      # Shared types/utils
tests/               # Python test suite
```

## Error Handling

**Python**:
```python
try:
    result = process_task(task_id)
except TaskNotFoundError as e:
    logger.error(f"Task not found: {e}")
    raise
except Exception as e:
    logger.exception(f"Unexpected error processing {task_id}")
    raise RuntimeError(f"Failed to process task: {e}") from e
```

**TypeScript**:
```typescript
try {
  await fetchTask(id);
} catch (error) {
  console.error('Failed to fetch task:', error);
  throw error;
}
```
