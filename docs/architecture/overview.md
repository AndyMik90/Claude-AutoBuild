# Architecture Overview

This document provides a high-level view of Auto-Claude's architecture, explaining how the Electron frontend and Python backend work together to deliver an autonomous coding experience.

## System Architecture

Auto-Claude follows a **desktop-first, multi-process architecture** combining Electron for the user interface with Python for AI agent execution.

```mermaid
flowchart TB
    subgraph Frontend["Frontend (Electron)"]
        direction TB
        Main["Main Process<br/>TypeScript"]
        Renderer["Renderer Process<br/>React + Zustand"]
        Preload["Preload Scripts<br/>IPC Bridge"]
    end

    subgraph Backend["Backend (Python)"]
        direction TB
        Agent["Agent System<br/>Claude Agent SDK"]
        Analysis["Project Analysis"]
        Context["Context Builder"]
        Memory["Graphiti Memory"]
    end

    Main <--> |IPC| Renderer
    Preload --> Main
    Preload --> Renderer
    Main <--> |"Process Spawn<br/>NDJSON Streaming"| Agent
    Agent --> Analysis
    Agent --> Context
    Agent --> Memory

    style Frontend fill:#e3f2fd,stroke:#1976d2
    style Backend fill:#fff3e0,stroke:#f57c00
```

## Core Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Process Isolation** | Electron main/renderer separation; Python runs as child process |
| **Security First** | Context isolation, sandboxed tools, dynamic command allowlisting |
| **Real-time Streaming** | NDJSON protocol for live agent output |
| **Memory Persistence** | Graphiti integration for cross-session learning |
| **Modular Architecture** | Clear boundaries between UI, orchestration, and AI logic |

## Process Communication Flow

The system uses a layered communication approach:

```mermaid
sequenceDiagram
    participant User
    participant Renderer as Renderer<br/>(React)
    participant Main as Main Process<br/>(Electron)
    participant Python as Python Backend<br/>(Agent)
    participant Claude as Claude API

    User->>Renderer: Create Task
    Renderer->>Main: IPC: start-task
    Main->>Python: Spawn process with args
    Python->>Claude: Agent SDK call
    Claude-->>Python: Response stream
    Python-->>Main: NDJSON output
    Main-->>Renderer: IPC: task-update
    Renderer-->>User: Live UI updates
```

## Component Overview

### Frontend Components

The Electron frontend is organized into three main areas:

```mermaid
flowchart LR
    subgraph Main["Main Process"]
        AM[AgentManager]
        TM[TerminalManager]
        IPC[IPC Handlers]
        PM[ProfileManager]
    end

    subgraph Renderer["Renderer Process"]
        App[App.tsx]
        Stores[Zustand Stores]
        Components[UI Components]
        Hooks[Custom Hooks]
    end

    subgraph Services["Main Services"]
        FileWatcher[File Watcher]
        Insights[Insights Service]
        Changelog[Changelog Service]
        GitHub[GitHub Integration]
    end

    Main <--> Renderer
    Main --> Services
```

| Component | Purpose |
|-----------|---------|
| **AgentManager** | Spawns and manages Python agent processes |
| **TerminalManager** | PTY management for interactive terminals |
| **IPC Handlers** | Bridge between renderer and main process |
| **Zustand Stores** | Application state management |
| **UI Components** | React components (dialogs, panels, cards) |

### Backend Components

The Python backend handles AI agent execution and project analysis:

```mermaid
flowchart TB
    subgraph Agents["Agent System"]
        Base[BaseAgent]
        Session[SessionManager]
        Memory[MemoryManager]
        Planner[Planner Agent]
        Coder[Coder Agent]
    end

    subgraph Analysis["Analysis System"]
        PA[ProjectAnalyzer]
        FA[FrameworkAnalyzer]
        RC[RiskClassifier]
        SS[SecurityScanner]
    end

    subgraph Context["Context System"]
        CB[ContextBuilder]
        CS[ContextSearch]
        GI[Graphiti Integration]
    end

    subgraph Core["Core Services"]
        Client[Claude SDK Client]
        Auth[Auth Manager]
        Workspace[Workspace Manager]
    end

    Base --> Session
    Base --> Memory
    Planner --> Base
    Coder --> Base

    PA --> FA
    PA --> RC
    PA --> SS

    CB --> CS
    CB --> GI

    Core --> Agents
    Agents --> Analysis
    Agents --> Context
```

| Module | Purpose |
|--------|---------|
| **agents/** | Agent implementations (planner, coder, QA) |
| **analysis/** | Project analysis and risk classification |
| **context/** | Context building, search, and memory |
| **core/** | Claude SDK client, auth, workspace setup |
| **cli/** | Command-line interface modules |

## Data Flow

### Task Execution Pipeline

```mermaid
flowchart LR
    subgraph Input
        Task[Task Definition]
        Spec[Spec File]
        Plan[Implementation Plan]
    end

    subgraph Execution
        Planner[Planner Agent]
        Coder[Coder Agent]
        QA[QA Agent]
    end

    subgraph Output
        Code[Code Changes]
        Commits[Git Commits]
        Report[QA Report]
    end

    Task --> Spec
    Spec --> Planner
    Planner --> Plan
    Plan --> Coder
    Coder --> Code
    Code --> QA
    QA --> Commits
    QA --> Report
```

### Agent Lifecycle

1. **Initialization**: Main process spawns Python with spec arguments
2. **Planning**: Planner agent analyzes spec and creates implementation plan
3. **Execution**: Coder agent implements subtasks with Claude SDK
4. **Validation**: QA agent reviews and validates changes
5. **Finalization**: Commits created, workspace cleaned up

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 39.x | Desktop application framework |
| React | 19.x | UI component library |
| TypeScript | 5.x | Type-safe JavaScript |
| Zustand | 5.x | State management |
| Tailwind CSS | 4.x | Utility-first styling |
| Radix UI | - | Accessible UI primitives |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.12+ | Runtime environment |
| Claude Agent SDK | - | AI agent execution |
| Graphiti | - | Memory and context persistence |
| python-dotenv | - | Environment configuration |

## Security Model

Auto-Claude implements multiple security layers:

```mermaid
flowchart TB
    subgraph Security["Security Layers"]
        CI[Context Isolation]
        SB[Sandboxed Tools]
        DA[Dynamic Allowlisting]
        WT[Worktree Isolation]
    end

    subgraph Enforcement
        Main[Main Process]
        Core[Core Security]
        Workspace[Workspace Manager]
    end

    CI --> Main
    SB --> Core
    DA --> Core
    WT --> Workspace
```

| Layer | Description |
|-------|-------------|
| **Context Isolation** | Electron renderer cannot access Node.js APIs directly |
| **Sandboxed Tools** | Agent tools have restricted filesystem and command access |
| **Dynamic Allowlisting** | Commands allowed based on detected project stack |
| **Worktree Isolation** | Git worktrees isolate feature development |

## Next Steps

- [Backend Architecture](./backend.md) - Deep dive into Python agent system
- [Frontend Architecture](./frontend.md) - Electron main/renderer organization
- [Integration Guide](./integration.md) - Frontend-backend communication details
