# Antigravity Context & Instructions

This file provides context and operational guidelines for Antigravity when working on the **Auto Claude** repository. Only Antigravity should prioritize the instructions in this file.

> **🔀 Fork Note**: This is the `auto-claude-gemini` fork with multi-provider support. See [Fork Documentation](#fork-documentation) below.

## Project Overview

**Auto Claude** is a multi-agent autonomous coding framework that builds software through coordinated AI agent sessions. It uses the Claude Code SDK (or similar agent interfaces) to run agents in isolated workspaces with security controls.

**Key Components**:

- **Python Backend** (`auto-claude/`): Core framework, agent logic, security.
- **Electron Frontend** (`auto-claude-ui/`): Desktop UI for managing specs and agents.

## Development Guidelines

### Tooling Strategy

- **Python**: Use `uv` for package management (fast, reliable).
- **Node/Frontend**: Use `pnpm`.

### Commands & Workflows

#### Python Backend (`auto-claude/`)

| Action              | Command                                                          |
| :------------------ | :--------------------------------------------------------------- |
| **Install Env**     | `uv venv && uv pip install -r requirements.txt`                  |
| **Run Tests**       | `pytest tests/ -v` (Use `auto-claude/` as working dir if needed) |
| **Lint (Ruff)**     | `ruff check . --fix && ruff format .` (Run in `auto-claude/`)    |
| **Run Spec Runner** | `python auto-claude/spec_runner.py --interactive`                |
| **Run Build**       | `python auto-claude/run.py --spec <SPEC_ID>`                     |

#### Electron Frontend (`auto-claude-ui/`)

| Action         | Command           |
| :------------- | :---------------- |
| **Install**    | `pnpm install`    |
| **Dev Server** | `pnpm dev`        |
| **Build**      | `pnpm build`      |
| **Test**       | `pnpm test`       |
| **Lint/Fix**   | `pnpm lint --fix` |
| **Typecheck**  | `pnpm typecheck`  |

## Code Quality & Contribution Rules

### Style Guidelines

- **Python**: Follow PEP 8 (enforced by Ruff).
  - **Quote Style**: Double quotes.
  - **Ignored Rules**: E501 (line length), B008 (function call in default arg), etc. See `ruff.toml`.
- **TypeScript**: Strict mode, functional components, named exports.

### Git Conventions

- **Branches**: `feature/`, `fix/`, `docs/`, `refactor/`, `test/`, `chore/`.
- **Commits**: Semantic messages (`type: subject`).
  - Example: `feat: Add new agent capability`
  - Example: `fix: Resolve memory leak in coordinator`

### Pre-commit Hooks

The repo uses `pre-commit` to enforce quality. **Always ensure these pass before requesting review**:

1.  **Ruff**: `ruff check` + `ruff format` (Backend)
2.  **ESLint**: `pnpm lint` (Frontend)
3.  **Typecheck**: `pnpm typecheck` (Frontend)
4.  **Whitespace**: No trailing whitespace, file must end with newline.

## Architecture Highlights

### Core Pipeline

1.  **Spec Creation**: `spec_runner.py` dynamic pipeline (Discovery -> Spec -> Plan).
2.  **Implementation**: `run.py` -> `agent.py`.
    - **Planner**: Creates subtasks.
    - **Coder**: Implements subtasks (spawns subagents).
    - **QA**: Validates.
3.  **Security**:
    - **Sandbox**: Bash command isolation.
    - **Allowlist**: `security.py` determines allowed commands.

## Agent Instructions (Antigravity)

1.  **Workflows**: Check `.agent/workflows/` for automated command sequences.
2.  **Testing**:
    - **Backend**: Always run `pytest`.
    - **Frontend**: Always run `pnpm test`.
3.  **Validation**:
    - **Self-Correction**: Run linters (`ruff`, `pnpm lint`) proactively.
    - **Type Safety**: Run `pnpm typecheck` on frontend changes.
4.  **Task Management**: Use `task_boundary` to track complex implementations.
5.  **Docs**: Keep `ANTIGRAVITY.md` updated if workflows or commands change.

---

## Fork Documentation

> This section is specific to the `auto-claude-gemini` fork.

### Key Fork Files

| File                                                         | Purpose                                              |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| [FORK.md](./FORK.md)                                         | Fork maintenance strategy and upstream sync workflow |
| [CHANGELOG.fork.md](./CHANGELOG.fork.md)                     | Fork-specific changelog (separate from upstream)     |
| [fork-docs/ROADMAP.md](./fork-docs/ROADMAP.md)               | Development roadmap for fork features                |
| [fork-docs/EPIC_BREAKDOWN.md](./fork-docs/EPIC_BREAKDOWN.md) | Detailed epic/feature/task breakdown                 |

### Changelog System

This fork uses a **dual-changelog system**:

1. **`CHANGELOG.md`** — Upstream changes (preserved during syncs)
2. **`CHANGELOG.fork.md`** — Fork-specific changes (our additions)

#### When to Update Fork Changelog

**After completing any feature from EPIC_BREAKDOWN.md:**

1. Add entry to `CHANGELOG.fork.md` under `## [Unreleased]`
2. Mark the feature as complete `[x]` in `EPIC_BREAKDOWN.md`
3. Use workflow: `/update_changelog`

#### Entry Format

```markdown
### 🚀 Fork Features

- **Feature Name** — Description of what was implemented
  - Key files: `file1.py`, `file2.py`
  - Reference: (Epic 1, Feature 1.2)
```

### Epic Breakdown Usage

When working on fork features, always reference `fork-docs/EPIC_BREAKDOWN.md`:

1. **Read the epic/feature description** before starting
2. **Check dependencies** (some features depend on others)
3. **Use the specified model** for optimal results
4. **Mark progress** as you complete work

#### Feature Types

- **🔹 Atomic features**: Complete the entire feature in one session
- **🔸 Composite features**: Work through individual tasks

### Fork Workflows

| Workflow            | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `/sync_upstream`    | Sync fork with upstream Auto-Claude         |
| `/start_feature`    | Start a new feature branch                  |
| `/update_changelog` | Update fork changelog after completing work |

### Version Scheme

Fork versions follow: `X.X.X-fork.N`

- `X.X.X` = Current upstream version
- `N` = Fork release number (increments with each fork release)

Example: `2.7.1-fork.1`, `2.7.1-fork.2`, `2.8.0-fork.1`
