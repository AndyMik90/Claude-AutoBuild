# Auto Claude

A production-ready framework for autonomous multi-session AI coding. Build complete applications or add features to existing projects through coordinated AI agent sessions.

![Auto Claude Kanban Board](.github/assets/Auto-Claude-Kanban.png)

## What It Does

Auto Claude uses a **multi-agent pattern** to build software autonomously:

### Spec Creation Pipeline (3-8 phases based on complexity)
1. **Discovery** - Analyzes project structure
2. **Requirements Gatherer** - Collects user requirements interactively
3. **Research Agent** - Validates external integrations against documentation
4. **Context Discovery** - Finds relevant files in codebase
5. **Spec Writer** - Creates comprehensive spec.md
6. **Spec Critic** - Uses ultrathink to find and fix issues before implementation
7. **Planner** - Creates subtask-based implementation plan
8. **Validation** - Ensures all outputs are valid

### Implementation Pipeline
1. **Planner Agent** (Session 1) - Analyzes spec, creates subtask-based implementation plan
2. **Coder Agent** (Sessions 2+) - Implements subtasks one-by-one with verification
3. **QA Reviewer Agent** - Validates all acceptance criteria before sign-off
4. **QA Fixer Agent** - Fixes issues found by QA in a self-validating loop

Each session runs with a fresh context window. Progress is tracked via `implementation_plan.json` and Git commits.

## Quick Start (Desktop UI)

The Desktop UI is the recommended way to use Auto Claude. It provides visual task management, real-time progress tracking, and a Kanban board interface.

### Prerequisites

1. **Node.js 18+** - [Download Node.js](https://nodejs.org/)
2. **Python 3.9+** - [Download Python](https://www.python.org/downloads/)
3. **Docker Desktop** - Required for the Auto Claude Memory Layer (see [Installing Docker Desktop](#installing-docker-desktop) below)
4. **Claude Code CLI** - `npm install -g @anthropic-ai/claude-code`

---

### Installing Docker Desktop

> **What is Docker?** Docker is like a "container" that runs the memory database Auto Claude needs. You don't need to understand how it works - just install it and keep it running in the background.

#### Step 1: Download Docker Desktop

| Operating System | Download Link |
|------------------|---------------|
| **Mac (Apple Silicon M1/M2/M3)** | [Download for Mac - Apple Chip](https://desktop.docker.com/mac/main/arm64/Docker.dmg) |
| **Mac (Intel)** | [Download for Mac - Intel Chip](https://desktop.docker.com/mac/main/amd64/Docker.dmg) |
| **Windows** | [Download for Windows](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe) |
| **Linux** | [Installation Guide](https://docs.docker.com/desktop/install/linux-install/) |

> **Not sure which Mac you have?** Click the Apple logo () in the top-left corner → "About This Mac". If it says "Apple M1/M2/M3", use the Apple Chip version. If it says "Intel", use the Intel version.

#### Step 2: Install Docker Desktop

**On Mac:**
1. Open the downloaded `.dmg` file
2. Drag the Docker icon to your Applications folder
3. Open Docker from your Applications folder
4. Click "Open" if you see a security warning
5. Wait for Docker to start (you'll see a whale icon in your menu bar)

**On Windows:**
1. Run the downloaded installer
2. Follow the installation wizard (keep default settings)
3. Restart your computer if prompted
4. Open Docker Desktop from the Start menu
5. Wait for Docker to start (you'll see a whale icon in your system tray)

#### Step 3: Verify Docker is Running

Open your terminal (Terminal on Mac, Command Prompt or PowerShell on Windows) and run:

```bash
docker --version
```

You should see something like: `Docker version 24.0.0, build abc123`

If you see an error, make sure Docker Desktop is open and running (look for the whale icon).

#### Troubleshooting Docker

| Problem | Solution |
|---------|----------|
| "Docker command not found" | Make sure Docker Desktop is installed and running |
| "Cannot connect to Docker daemon" | Open Docker Desktop and wait for it to fully start |
| Docker Desktop won't start | Restart your computer and try again |
| Mac: "Docker Desktop requires macOS 12 or later" | Update your macOS in System Preferences → Software Update |
| Windows: "WSL 2 installation incomplete" | Follow the [WSL 2 setup guide](https://docs.microsoft.com/en-us/windows/wsl/install) |

---

### Step 1: Install the Desktop UI

```bash
cd auto-claude-ui

# Install dependencies (pnpm recommended, npm works too)
pnpm install
# or: npm install

# Build and start the application
pnpm run build && pnpm run start
# or: npm run build && npm run start
```

### Step 2: Set Up the Python Backend

The Desktop UI runs Python scripts behind the scenes. Set up the Python environment:

```bash
cd auto-claude

# Using uv (recommended)
uv venv && uv pip install -r requirements.txt

# Or using standard Python
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

### Step 3: Configure Claude Authentication

```bash
# Get your OAuth token
claude setup-token

# Create your .env file
cp auto-claude/.env.example auto-claude/.env

# Add your token to auto-claude/.env
# CLAUDE_CODE_OAUTH_TOKEN=your-token-here
```

### Step 4: Start the Memory Layer

The Auto Claude Memory Layer provides cross-session context retention using a graph database:

```bash
# Make sure Docker Desktop is running, then:
docker-compose up -d falkordb
```

### Step 5: Configure Memory Provider

Add your LLM provider credentials to `auto-claude/.env`:

```bash
# Enable memory integration
GRAPHITI_ENABLED=true

# Option A: OpenAI (simplest setup)
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-key

# Option B: Anthropic + Voyage (high quality)
# GRAPHITI_LLM_PROVIDER=anthropic
# GRAPHITI_EMBEDDER_PROVIDER=voyage
# ANTHROPIC_API_KEY=sk-ant-xxx
# VOYAGE_API_KEY=pa-xxx

# Option C: Ollama (fully offline, no API keys)
# GRAPHITI_LLM_PROVIDER=ollama
# GRAPHITI_EMBEDDER_PROVIDER=ollama
# OLLAMA_LLM_MODEL=deepseek-r1:7b
# OLLAMA_EMBEDDING_MODEL=nomic-embed-text
# OLLAMA_EMBEDDING_DIM=768
```

### Step 6: Launch and Use

```bash
cd auto-claude-ui
pnpm run start  # or: npm run start
```

1. Add your project in the UI
2. Create a new task describing what you want to build
3. Watch as Auto Claude creates a spec, plans, and implements your feature
4. Review changes and merge when satisfied

## CLI Usage (Terminal-Only)

For terminal-based workflows, headless servers, or CI/CD integration, see **[auto-claude/CLI-USAGE.md](auto-claude/CLI-USAGE.md)**.

## Auto Claude Memory Layer

The Memory Layer enables context retention across coding sessions using a graph database. Agents remember insights from previous sessions, discovered codebase patterns persist and are reusable, and historical context helps agents make better decisions.

### Architecture

- **Backend**: FalkorDB (graph database) via Docker
- **Library**: Graphiti for knowledge graph operations
- **Providers**: OpenAI, Anthropic, Azure OpenAI, or Ollama (local/offline)

### Provider Combinations

| Setup | LLM | Embeddings | Notes |
|-------|-----|------------|-------|
| **OpenAI** | OpenAI | OpenAI | Simplest - single API key |
| **Anthropic + Voyage** | Anthropic | Voyage AI | High quality |
| **Ollama** | Ollama | Ollama | Fully offline |
| **Azure** | Azure OpenAI | Azure OpenAI | Enterprise |

See `auto-claude/.env.example` for complete configuration options.

### Verifying Memory Layer

```bash
cd auto-claude
source .venv/bin/activate
python test_graphiti_memory.py
```

## Key Features

- **Domain Agnostic**: Works for any software project (web apps, APIs, CLIs, etc.)
- **Multi-Session**: Unlimited sessions, each with fresh context
- **Research-First Specs**: External integrations validated against documentation before implementation
- **Self-Critique**: Specs are critiqued using ultrathink to find issues before coding begins
- **Isolated Worktrees**: Build in a separate workspace - your current work is never touched
- **Self-Verifying**: Agents test their work with browser automation before marking complete
- **QA Validation Loop**: Automated QA agent validates all acceptance criteria before sign-off
- **Self-Healing**: QA finds issues → Fixer agent resolves → QA re-validates (up to 50 iterations)
- **Adaptive Spec Pipeline**: 3-8 phases based on task complexity
- **Fix Bugs Immediately**: Agents fix discovered bugs in the same session, not later
- **Defense-in-Depth Security**: OS sandbox, filesystem restrictions, command allowlist
- **Secret Scanning**: Automatic pre-commit scanning blocks secrets with actionable fix instructions
- **Human Intervention**: Pause, add instructions, or stop at any time
- **Multiple Specs**: Track and run multiple specifications independently
- **Memory Layer**: Persistent knowledge graph for cross-session context retention

## Project Structure

```
your-project/
├── .worktrees/               # Created during build (git-ignored)
│   └── auto-claude/          # Isolated workspace for AI coding
├── .auto-claude/             # Per-project data (specs, plans, QA reports)
│   ├── specs/                # Task specifications
│   ├── roadmap/              # Project roadmap
│   └── ideation/             # Ideas and planning
├── auto-claude/              # Python backend (framework code)
│   ├── run.py                # Build entry point
│   ├── spec_runner.py        # Spec creation orchestrator
│   ├── prompts/              # Agent prompt templates
│   └── ...
├── auto-claude-ui/           # Electron desktop application
│   └── ...
└── docker-compose.yml        # FalkorDB for Memory Layer
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes | OAuth token from `claude setup-token` |
| `AUTO_BUILD_MODEL` | No | Model override (default: claude-opus-4-5-20251101) |
| `GRAPHITI_ENABLED` | Recommended | Set to `true` to enable Memory Layer |
| `GRAPHITI_LLM_PROVIDER` | For Memory | LLM provider: openai, anthropic, azure_openai, ollama |
| `GRAPHITI_EMBEDDER_PROVIDER` | For Memory | Embedder: openai, voyage, azure_openai, ollama |
| `OPENAI_API_KEY` | For OpenAI | Required for OpenAI provider |
| `ANTHROPIC_API_KEY` | For Anthropic | Required for Anthropic LLM |
| `VOYAGE_API_KEY` | For Voyage | Required for Voyage embeddings |

See `auto-claude/.env.example` for complete configuration options.

## Acknowledgments

This framework was inspired by Anthropic's [Autonomous Coding Agent](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding). Thank you to the Anthropic team for their innovative work on autonomous coding systems.

## License

**AGPL-3.0** - GNU Affero General Public License v3.0

This software is licensed under AGPL-3.0, which means:

- **Attribution Required**: You must give appropriate credit, provide a link to the license, and indicate if changes were made. When using Auto Claude, please credit the project.
- **Open Source Required**: If you modify this software and distribute it or run it as a service, you must release your source code under AGPL-3.0.
- **Network Use (Copyleft)**: If you run this software as a network service (e.g., SaaS), users interacting with it over a network must be able to receive the source code.
- **No Closed-Source Usage**: You cannot use this software in proprietary/closed-source projects without open-sourcing your entire project under AGPL-3.0.

**In simple terms**: You can use Auto Claude freely, but if you build on it, your code must also be open source under AGPL-3.0 and attribute this project. Closed-source commercial use requires a separate license.

For commercial licensing inquiries (closed-source usage), please contact the maintainers.
