# Auto-Claude Technical Documentation

**Comprehensive technical documentation for developers working with the Auto-Claude codebase.**

> Last updated: 2025-12-30

---

## Overview

Auto-Claude is an autonomous multi-agent coding framework that plans, builds, and validates software. This documentation provides technical onboarding materials for developers who want to understand, contribute to, or extend the project.

### What is Auto-Claude?

Auto-Claude combines a **Python backend** (agent system, project analysis, context management) with a **TypeScript/React frontend** (Electron desktop application) to provide:

- **Autonomous task execution** - Describe your goal; agents handle planning, implementation, and validation
- **Parallel agent management** - Run multiple builds simultaneously with up to 12 agent terminals
- **Isolated workspaces** - All changes happen in git worktrees, keeping your main branch safe
- **Self-validating QA** - Built-in quality assurance loop catches issues before you review
- **Cross-session memory** - Agents retain insights across sessions for smarter builds

---

## Documentation Structure

This documentation is organized in progressive complexity, from high-level overviews to detailed component specifications.

### Getting Started

- **[Getting Started](getting-started.md)** - Quick start guide for new developers

### Architecture

- **[Architecture Overview](architecture/overview.md)** - High-level system architecture
- **[Backend Architecture](architecture/backend.md)** - Python agent system architecture
- **[Frontend Architecture](architecture/frontend.md)** - Electron/React application architecture
- **[Integration](architecture/integration.md)** - Frontend-backend communication

### Component Documentation

- **[Backend Components](components/backend/)** - Python module documentation
- **[Frontend Components](components/frontend/)** - TypeScript/React component documentation

### Diagrams

- **[Use Cases](diagrams/use-cases.md)** - Use case diagrams
- **[Sequence Diagrams](diagrams/sequences.md)** - Interaction flow diagrams
- **[Class Diagrams](diagrams/classes.md)** - Type and class structure diagrams

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Desktop App** | Electron 39.x | Cross-platform desktop container |
| **UI Framework** | React 19.x | Component-based user interface |
| **Build Tool** | Vite + electron-vite | Fast development and bundling |
| **Styling** | Tailwind CSS 4.x | Utility-first styling |
| **State Management** | Zustand 5.x | Lightweight state management |
| **Backend Runtime** | Python 3.12+ | Agent system runtime |
| **Agent Framework** | Claude Agent SDK | AI agent capabilities |
| **Memory System** | Graphiti | Cross-session context retention |

---

## Project Structure

```
Auto-Claude/
├── apps/
│   ├── backend/           # Python agent system
│   │   ├── agents/        # Agent implementations
│   │   ├── analysis/      # Project analyzers
│   │   ├── cli/           # Command-line interface
│   │   ├── context/       # Context management
│   │   ├── core/          # Core services
│   │   ├── ideation/      # Feature ideation
│   │   ├── implementation_plan/  # Plan structures
│   │   └── integrations/  # External integrations
│   └── frontend/          # Electron application
│       └── src/
│           ├── main/      # Electron main process
│           └── renderer/  # React renderer process
├── docs/                  # This documentation
├── guides/                # User guides
├── scripts/               # Build utilities
└── tests/                 # Test suite
```

---

## Quick Reference

### Running the Application

```bash
# Development mode
npm run dev

# Build and run
npm start
```

### Backend CLI

```bash
cd apps/backend

# Create a spec interactively
python spec_runner.py --interactive

# Run autonomous build
python run.py --spec 001
```

### Useful Links

- **Repository**: [github.com/AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)
- **Discord Community**: [Join](https://discord.gg/KCXaPBr4Dj)
- **Contributing Guide**: [CONTRIBUTING.md](https://github.com/AndyMik90/Auto-Claude/blob/main/CONTRIBUTING.md)

---

## How to Use This Documentation

1. **New to the project?** Start with [Getting Started](getting-started.md)
2. **Understanding the architecture?** Read [Architecture Overview](architecture/overview.md)
3. **Working on a specific area?** Navigate to the relevant component documentation
4. **Looking for diagrams?** Check the [Diagrams](diagrams/use-cases.md) section

Use the sidebar navigation to explore topics, or use the search feature to find specific content.
