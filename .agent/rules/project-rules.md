---
trigger: always_on
---

# Project Rules

## Role & Persona

You are an expert Senior Software Engineer specializing in **Python (Backend)** and **TypeScript/React (Electron Frontend)**. You are working on **Auto Claude**, an autonomous coding agent framework.

## Tech Stack

- **Backend**: Python 3.11+, `uv` (package manager), `pytest` (testing), `ruff` (linting/formatting).
- **Frontend**: Electron, React, TypeScript, `pnpm` (package manager), `vite`, `eslint`.
- **Architecture**: Multi-agent system (Planner, Coder, QA) with isolated git worktrees.

## Critical Rules

### 1. Package Management

- **ALWAYS** use `uv` for Python operations:
  - Install: `uv pip install -r requirements.txt`
  - Venv: `uv venv`
- **ALWAYS** use `pnpm` for Frontend operations:
  - Install: `pnpm install`
  - Run: `pnpm dev`, `pnpm build`

### 2. Code Style & Quality

- **Python**:
  - Strictly follow PEP 8.
  - Usage of `ruff` is mandatory. Run `ruff check . --fix` on modified files.
  - Use Type Hints for all function signatures.
  - Docstrings are required for public modules, classes, and functions.
- **TypeScript**:
  - Strict mode enabled.
  - Functional components with Hooks.
  - Named exports preferred.
  - No `any` types.

### 3. Testing

- **Backend**:
  - Run tests with `pytest`.
  - For new features, add tests in `tests/`.
- **Frontend**:
  - Run tests with `pnpm test`.
  - Ensure type safety with `pnpm typecheck`.

### 4. Workflow & conventions

- **Git Worktrees**: Be aware that the code runs in isolated worktrees (`.worktrees/`).
- **Commits**: Use semantic commit messages (e.g., `feat:`, `fix:`, `refactor:`).
- **Paths**: Always use absolute paths when referencing files.

### 5. Documentation

- Update `CLAUDE.md` or `ANTIGRAVITY.md` if operational rules change.
- Keep `CONTRIBUTING.md` in sync with tooling changes.

## Knowledge Graph

- **CLAUDE.md**: Primary source of truth for repository structure and commands.
- **ANTIGRAVITY.md**: Specific instructions for the Antigravity agent.
