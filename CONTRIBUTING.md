# Contributing to Auto Claude

Thank you for your interest in contributing to Auto Claude! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
  - [Python Backend](#python-backend)
  - [Electron Frontend](#electron-frontend)
- [Running from Source](#running-from-source)
- [Pre-commit Hooks](#pre-commit-hooks)
- [Code Style](#code-style)
- [Testing](#testing)
- [Continuous Integration](#continuous-integration)
- [Git Workflow](#git-workflow)
  - [Branch Naming](#branch-naming)
  - [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)
- [Architecture Overview](#architecture-overview)

## Prerequisites

Before contributing, ensure you have the following installed:

- **Python 3.8+** - For the backend framework
- **Node.js 18+** - For the Electron frontend
- **pnpm** - Package manager for the frontend (`npm install -g pnpm`)
- **uv** (recommended) or **pip** - Python package manager
- **Git** - Version control

## Development Setup

The project consists of two main components:

1. **Python Backend** (`auto-claude/`) - The core autonomous coding framework
2. **Electron Frontend** (`auto-claude-ui/`) - Optional desktop UI

### Python Backend

```bash
# Navigate to the auto-claude directory
cd auto-claude

# Create virtual environment (using uv - recommended)
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -r requirements.txt

# Or using standard Python
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Install test dependencies
pip install -r ../tests/requirements-test.txt

# Set up environment
cp .env.example .env
# Edit .env and add your CLAUDE_CODE_OAUTH_TOKEN (get it via: claude setup-token)
```

### Electron Frontend

```bash
# Navigate to the UI directory
cd auto-claude-ui

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Package for distribution
pnpm package
```

## Running from Source

If you want to run Auto Claude from source (for development or testing unreleased features), follow these steps:

### Step 1: Clone and Set Up Python Backend

```bash
git clone https://github.com/AndyMik90/Auto-Claude.git
cd Auto-Claude/auto-claude

# Using uv (recommended)
uv venv && uv pip install -r requirements.txt

# Or using standard Python
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env and add your CLAUDE_CODE_OAUTH_TOKEN (get it via: claude setup-token)
```

### Step 2: Run the Desktop UI

```bash
cd ../auto-claude-ui

# Install dependencies
pnpm install

# Development mode (hot reload)
pnpm dev

# Or production build
pnpm run build && pnpm run start
```

<details>
<summary><b>Windows users:</b> If installation fails with node-gyp errors, click here</summary>

Auto Claude automatically downloads prebuilt binaries for Windows. If prebuilts aren't available for your Electron version yet, you'll need Visual Studio Build Tools:

1. Download [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Select "Desktop development with C++" workload
3. In "Individual Components", add "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs"
4. Restart terminal and run `pnpm install` again

</details>

> **Note:** For regular usage, we recommend downloading the pre-built releases from [GitHub Releases](https://github.com/AndyMik90/Auto-Claude/releases). Running from source is primarily for contributors and those testing unreleased features.

## Pre-commit Hooks

We use [pre-commit](https://pre-commit.com/) to run linting and formatting checks before each commit. This ensures code quality and consistency across the project.

### Setup

```bash
# Install pre-commit
pip install pre-commit

# Install the git hooks (run once after cloning)
pre-commit install
```

### What Runs on Commit

When you commit, the following checks run automatically:

| Check | Scope | Description |
|-------|-------|-------------|
| **ruff** | `auto-claude/` | Python linter with auto-fix |
| **ruff-format** | `auto-claude/` | Python code formatter |
| **eslint** | `auto-claude-ui/` | TypeScript/React linter |
| **typecheck** | `auto-claude-ui/` | TypeScript type checking |
| **trailing-whitespace** | All files | Removes trailing whitespace |
| **end-of-file-fixer** | All files | Ensures files end with newline |
| **check-yaml** | All files | Validates YAML syntax |
| **check-added-large-files** | All files | Prevents large file commits |

### Running Manually

```bash
# Run all checks on all files
pre-commit run --all-files

# Run a specific hook
pre-commit run ruff --all-files

# Skip hooks temporarily (not recommended)
git commit --no-verify -m "message"
```

### If a Check Fails

1. **Ruff auto-fixes**: Some issues are fixed automatically. Stage the changes and commit again.
2. **ESLint errors**: Fix the reported issues in your code.
3. **Type errors**: Resolve TypeScript type issues before committing.

## Code Style

### Python

- Follow PEP 8 style guidelines
- Use type hints for function signatures
- Use docstrings for public functions and classes
- Keep functions focused and under 50 lines when possible
- Use meaningful variable and function names

```python
# Good
def get_next_chunk(spec_dir: Path) -> dict | None:
    """
    Find the next pending chunk in the implementation plan.

    Args:
        spec_dir: Path to the spec directory

    Returns:
        The next chunk dict or None if all chunks are complete
    """
    ...

# Avoid
def gnc(sd):
    ...
```

### TypeScript/React

- Use TypeScript strict mode
- Follow the existing component patterns in `auto-claude-ui/src/`
- Use functional components with hooks
- Prefer named exports over default exports
- Use the UI components from `src/renderer/components/ui/`

```typescript
// Good
export function TaskCard({ task, onEdit }: TaskCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  ...
}

// Avoid
export default function(props) {
  ...
}
```

### General

- No trailing whitespace
- Use 2 spaces for indentation in TypeScript/JSON, 4 spaces in Python
- End files with a newline
- Keep line length under 100 characters when practical

## Testing

### Python Tests

```bash
# Run all tests
pytest tests/ -v

# Run a specific test file
pytest tests/test_security.py -v

# Run a specific test
pytest tests/test_security.py::test_bash_command_validation -v

# Skip slow tests
pytest tests/ -m "not slow"

# Run with coverage
pytest tests/ --cov=auto-claude --cov-report=html
```

Test configuration is in `tests/pytest.ini`.

### Frontend Tests

```bash
cd auto-claude-ui

# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run E2E tests (requires built app)
pnpm build
pnpm test:e2e

# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```

### Testing Requirements

Before submitting a PR:

1. **All existing tests must pass**
2. **New features should include tests**
3. **Bug fixes should include a regression test**
4. **Test coverage should not decrease significantly**

## Continuous Integration

All pull requests and pushes to `main` trigger automated CI checks via GitHub Actions.

### Workflows

| Workflow | Trigger | What it checks |
|----------|---------|----------------|
| **CI** | Push to `main`, PRs | Python tests (3.11 & 3.12), Frontend tests |
| **Lint** | Push to `main`, PRs | Ruff (Python), ESLint + TypeScript (Frontend) |
| **Test on Tag** | Version tags (`v*`) | Full test suite before release |

### PR Requirements

Before a PR can be merged:

1. All CI checks must pass (green checkmarks)
2. Python tests pass on both Python 3.11 and 3.12
3. Frontend tests pass
4. Linting passes (no ruff or eslint errors)
5. TypeScript type checking passes

### Running CI Checks Locally

```bash
# Python tests
cd auto-claude
source .venv/bin/activate
pytest ../tests/ -v

# Frontend tests
cd auto-claude-ui
pnpm test
pnpm lint
pnpm typecheck
```

## Git Workflow

### Branch Naming

Use descriptive branch names with a prefix indicating the type of change:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `feature/` | New feature | `feature/add-dark-mode` |
| `fix/` | Bug fix | `fix/memory-leak-in-worker` |
| `docs/` | Documentation | `docs/update-readme` |
| `refactor/` | Code refactoring | `refactor/simplify-auth-flow` |
| `test/` | Test additions/fixes | `test/add-integration-tests` |
| `chore/` | Maintenance tasks | `chore/update-dependencies` |

### Commit Messages

Write clear, concise commit messages that explain the "why" behind changes:

```bash
# Good
git commit -m "Add retry logic for failed API calls

Implements exponential backoff for transient failures.
Fixes #123"

# Avoid
git commit -m "fix stuff"
git commit -m "WIP"
```

**Format:**
```
<type>: <subject>

<body>

<footer>
```

- **type**: feat, fix, docs, style, refactor, test, chore
- **subject**: Short description (50 chars max, imperative mood)
- **body**: Detailed explanation if needed (wrap at 72 chars)
- **footer**: Reference issues, breaking changes

## Pull Request Process

1. **Fork the repository** and create your branch from `main`

2. **Make your changes** following the code style guidelines

3. **Test thoroughly**:
   ```bash
   # Python
   pytest tests/ -v

   # Frontend
   cd auto-claude-ui && pnpm test && pnpm lint && pnpm typecheck
   ```

4. **Update documentation** if your changes affect:
   - Public APIs
   - Configuration options
   - User-facing behavior

5. **Create the Pull Request**:
   - Use a clear, descriptive title
   - Reference any related issues
   - Describe what changes you made and why
   - Include screenshots for UI changes
   - List any breaking changes

6. **PR Title Format**:
   ```
   <type>: <description>
   ```
   Examples:
   - `feat: Add support for custom prompts`
   - `fix: Resolve memory leak in worker process`
   - `docs: Update installation instructions`

7. **Review Process**:
   - Address reviewer feedback promptly
   - Keep the PR focused on a single concern
   - Squash commits if requested

## Issue Reporting

### Bug Reports

When reporting a bug, include:

1. **Clear title** describing the issue
2. **Environment details**:
   - OS and version
   - Python version
   - Node.js version (for UI issues)
   - Auto Claude version
3. **Steps to reproduce** the issue
4. **Expected behavior** vs **actual behavior**
5. **Error messages** or logs (if applicable)
6. **Screenshots** (for UI issues)

### Feature Requests

When requesting a feature:

1. **Describe the problem** you're trying to solve
2. **Explain your proposed solution**
3. **Consider alternatives** you've thought about
4. **Provide context** on your use case

## Architecture Overview

Auto Claude consists of two main parts:

### Python Backend (`auto-claude/`)

The core autonomous coding framework:

- **Entry Points**: `run.py` (build runner), `spec_runner.py` (spec creator)
- **Agent System**: `agent.py`, `client.py`, `prompts/`
- **Execution**: `coordinator.py` (parallel), `worktree.py` (isolation)
- **Memory**: `memory.py` (file-based), `graphiti_memory.py` (graph-based)
- **QA**: `qa_loop.py`, `prompts/qa_*.md`

### Electron Frontend (`auto-claude-ui/`)

Optional desktop interface:

- **Main Process**: `src/main/` - Electron main process, IPC handlers
- **Renderer**: `src/renderer/` - React UI components
- **Shared**: `src/shared/` - Types and utilities

For detailed architecture information, see [CLAUDE.md](CLAUDE.md).

---

## Questions?

If you have questions about contributing, feel free to:

1. Open a GitHub issue with the `question` label
2. Review existing issues and discussions

Thank you for contributing to Auto Claude!
