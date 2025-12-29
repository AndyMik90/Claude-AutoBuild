# Getting Started

**Quick start guide for new developers working with the Auto-Claude codebase.**

---

## Prerequisites

Before getting started, ensure you have the following installed:

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Python** | 3.12+ | Backend runtime |
| **Node.js** | 24+ | Frontend development |
| **npm** | 10+ | Package management |
| **Git** | Latest | Version control |
| **CMake** | Latest | Native dependency builds |

### Installing Python 3.12

**Windows:**
```bash
winget install Python.Python.3.12
```

**macOS:**
```bash
brew install python@3.12
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt install python3.12 python3.12-venv
```

### Installing Node.js

**Windows:**
```bash
winget install OpenJS.NodeJS
```

**macOS:**
```bash
brew install node
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## Quick Start

The fastest way to get the development environment running:

```bash
# Clone the repository
git clone https://github.com/AndyMik90/Auto-Claude.git
cd Auto-Claude

# Install all dependencies (both frontend and backend)
npm run install:all

# Run in development mode
npm run dev

# Or build and run production
npm start
```

That's it! The Electron application should launch with hot-reload enabled for development.

---

## Project Layout

Understanding the project structure is essential for effective development:

```
Auto-Claude/
├── apps/
│   ├── backend/              # Python agent system
│   │   ├── agents/           # Agent implementations (base, session, memory)
│   │   ├── analysis/         # Project analyzers
│   │   ├── cli/              # Command-line interface
│   │   ├── context/          # Context building and search
│   │   ├── core/             # Core services (auth, workspace)
│   │   ├── ideation/         # Feature ideation
│   │   ├── implementation_plan/  # Plan structures
│   │   └── integrations/     # External integrations (Graphiti, Linear)
│   └── frontend/             # Electron application
│       └── src/
│           ├── main/         # Electron main process
│           │   ├── agent/    # Agent management
│           │   ├── terminal/ # PTY management
│           │   └── ipc-handlers/  # IPC communication
│           └── renderer/     # React renderer
│               ├── components/  # UI components
│               ├── stores/      # Zustand stores
│               └── hooks/       # Custom React hooks
├── docs/                     # Technical documentation (you are here)
├── guides/                   # User guides
├── scripts/                  # Build and automation scripts
└── tests/                    # Test suite
```

---

## Development Setup

### Backend Setup

The Python backend can be set up manually or via npm scripts:

**Using npm (Recommended):**
```bash
npm run install:backend
```

**Manual Setup:**
```bash
cd apps/backend

# Create virtual environment
# Windows:
py -3.12 -m venv .venv
.venv\Scripts\activate

# macOS/Linux:
python3.12 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment
cp .env.example .env
# Edit .env and add your CLAUDE_CODE_OAUTH_TOKEN
```

### Frontend Setup

```bash
cd apps/frontend

# Install dependencies
npm install

# Start development server (hot-reload enabled)
npm run dev

# Build for production
npm run build

# Package for distribution
npm run package
```

---

## Environment Configuration

Create a `.env` file in `apps/backend/` with the following:

```bash
# Required: Claude API authentication
CLAUDE_CODE_OAUTH_TOKEN=your_token_here

# Optional: Enable Graphiti memory integration
GRAPHITI_ENABLED=false
```

> **Tip:** Get your OAuth token by running `claude setup-token` in your terminal.

---

## Running the Application

### Development Mode

Development mode enables hot-reload for both frontend and backend:

```bash
# From repository root
npm run dev
```

This starts:
- Electron main process with hot-reload
- React renderer with Vite dev server
- Backend Python environment

### Production Mode

```bash
# Build and run
npm start

# Or build first, then run
npm run build
npm run start:prod
```

---

## Backend CLI

The backend provides CLI commands for running agent tasks:

```bash
cd apps/backend

# Activate virtual environment
source .venv/bin/activate  # or .venv\Scripts\activate on Windows

# Create a spec interactively
python spec_runner.py --interactive

# Run autonomous build for a spec
python run.py --spec 001

# Run QA validation
python run.py --spec 001 --qa
```

---

## Running Tests

### Backend Tests

```bash
# From repository root
npm run test:backend

# Or using pytest directly
cd apps/backend
.venv/Scripts/pytest.exe ../tests -v          # Windows
.venv/bin/pytest ../tests -v                   # macOS/Linux

# Run specific tests
npm run test:backend -- tests/test_security.py -v
```

### Frontend Tests

```bash
cd apps/frontend

# Run unit tests
npm test

# Run with watch mode
npm run test:watch

# Run E2E tests (requires built app)
npm run build
npm run test:e2e

# Linting and type checking
npm run lint
npm run typecheck
```

---

## Pre-commit Hooks

The project uses pre-commit hooks to maintain code quality:

```bash
# Install pre-commit (if not already installed)
pip install pre-commit

# Install the git hooks
pre-commit install
```

### What Runs on Commit

| Hook | Scope | Description |
|------|-------|-------------|
| **ruff** | `apps/backend/` | Python linter with auto-fix |
| **ruff-format** | `apps/backend/` | Python code formatter |
| **eslint** | `apps/frontend/` | TypeScript/React linter |
| **typecheck** | `apps/frontend/` | TypeScript type checking |
| **trailing-whitespace** | All files | Removes trailing whitespace |
| **end-of-file-fixer** | All files | Ensures files end with newline |

---

## Next Steps

Now that your environment is set up:

1. **[Architecture Overview](architecture/overview.md)** - Understand the system design
2. **[Backend Architecture](architecture/backend.md)** - Deep dive into the Python agent system
3. **[Frontend Architecture](architecture/frontend.md)** - Learn about the Electron/React application
4. **[Integration](architecture/integration.md)** - See how frontend and backend communicate

### Useful Resources

- **[CONTRIBUTING.md](https://github.com/AndyMik90/Auto-Claude/blob/main/CONTRIBUTING.md)** - Contribution guidelines
- **[CLAUDE.md](https://github.com/AndyMik90/Auto-Claude/blob/main/CLAUDE.md)** - Project context and codebase overview
- **[Discord Community](https://discord.gg/KCXaPBr4Dj)** - Get help and connect with contributors

---

## Troubleshooting

### Windows: node-gyp Errors

If npm install fails with node-gyp errors:

1. Download [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Select "Desktop development with C++" workload
3. In "Individual Components", add "MSVC v143 - VS 2022 C++ x64/x86 Spectre-mitigated libs"
4. Restart your terminal and run `npm install` again

### Python Version Issues

Ensure you're using Python 3.12+:

```bash
python --version  # Should show 3.12.x or higher
```

If you have multiple Python versions, use explicit paths:

```bash
# Windows
py -3.12 -m venv .venv

# macOS/Linux
python3.12 -m venv .venv
```

### Environment Variable Not Found

If you see errors about missing environment variables:

1. Ensure `.env` file exists in `apps/backend/`
2. Copy from example: `cp apps/backend/.env.example apps/backend/.env`
3. Add your `CLAUDE_CODE_OAUTH_TOKEN`

---

## Summary

| Task | Command |
|------|---------|
| Install all dependencies | `npm run install:all` |
| Run development mode | `npm run dev` |
| Run production | `npm start` |
| Run backend tests | `npm run test:backend` |
| Run frontend tests | `cd apps/frontend && npm test` |
| Build for distribution | `npm run build` |

You're now ready to start developing with Auto-Claude!
