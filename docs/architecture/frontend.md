# Frontend Architecture

The Auto-Claude frontend is an Electron-based desktop application built with React and TypeScript. This document provides a comprehensive overview of the main/renderer process architecture, component organization, and state management patterns.

## Architecture Overview

The frontend follows Electron's multi-process architecture with strict separation between the main process (Node.js) and renderer process (Chromium):

```mermaid
flowchart TB
    subgraph Main["Main Process (Node.js)"]
        direction TB
        Entry[index.ts<br/>App Initialization]
        AM[AgentManager<br/>Process Orchestration]
        TM[TerminalManager<br/>PTY Management]
        IPC[IPC Handlers<br/>Message Bridge]
        Services[Main Services<br/>File Watcher, Insights, Changelog]
    end

    subgraph Preload["Preload Scripts"]
        API[electronAPI<br/>Context Bridge]
    end

    subgraph Renderer["Renderer Process (Chromium)"]
        direction TB
        App[App.tsx<br/>Root Component]
        Stores[Zustand Stores<br/>State Management]
        Components[React Components<br/>UI Layer]
        Hooks[Custom Hooks<br/>IPC Listeners]
    end

    Entry --> AM
    Entry --> TM
    Entry --> IPC
    Entry --> Services

    Main <-->|IPC| Preload
    Preload -->|contextBridge| Renderer

    App --> Stores
    App --> Components
    Components --> Hooks

    style Main fill:#e3f2fd,stroke:#1976d2
    style Preload fill:#fff3e0,stroke:#f57c00
    style Renderer fill:#e8f5e9,stroke:#4caf50
```

## Core Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Process Isolation** | Main process handles system operations; renderer handles UI only |
| **Context Isolation** | Renderer cannot access Node.js APIs directly; uses contextBridge |
| **Type Safety** | Shared TypeScript types between processes |
| **Reactive State** | Zustand stores with IPC event listeners for real-time updates |
| **Modular IPC** | Domain-specific handler modules for maintainability |

## Main Process

The main process handles all Node.js operations including file system access, process spawning, and system integration.

### Entry Point Structure

```
apps/frontend/src/main/
├── index.ts                 # App initialization and window creation
├── ipc-setup.ts             # IPC handler registration facade
├── ipc-handlers/            # Domain-specific IPC handlers
│   ├── project-handlers.ts  # Project CRUD
│   ├── task-handlers.ts     # Task execution
│   ├── terminal-handlers.ts # Terminal operations
│   ├── settings-handlers.ts # App settings
│   ├── github/              # GitHub integration
│   └── context/             # Project context
├── agent/                   # Agent process management
│   ├── agent-manager.ts     # Main orchestrator
│   ├── agent-process.ts     # Process spawning
│   ├── agent-queue.ts       # Task queuing
│   ├── agent-state.ts       # State tracking
│   └── parsers/             # Output parsing
├── terminal/                # Terminal management
│   ├── terminal-manager.ts  # Main orchestrator
│   ├── pty-manager.ts       # PTY process handling
│   └── session-handler.ts   # Session persistence
└── services/                # Background services
    ├── file-watcher.ts      # File change detection
    ├── insights-service.ts  # AI insights
    └── changelog-service.ts # Changelog generation
```

### AgentManager

The AgentManager orchestrates Python agent processes for task execution, roadmap generation, and ideation:

```mermaid
classDiagram
    class AgentManager {
        -state: AgentState
        -events: AgentEvents
        -processManager: AgentProcessManager
        -queueManager: AgentQueueManager
        +configure(pythonPath, autoBuildPath)
        +startSpecCreation(taskId, projectPath, ...)
        +startTaskExecution(taskId, projectPath, ...)
        +startRoadmapGeneration(projectId, ...)
        +killTask(taskId)
        +isRunning(taskId)
    }

    class AgentState {
        -processes: Map
        +hasProcess(taskId)
        +getRunningTaskIds()
    }

    class AgentProcessManager {
        +spawnProcess(taskId, args, env, type)
        +killProcess(taskId)
        +getCombinedEnv(projectPath)
    }

    class AgentQueueManager {
        +startRoadmapGeneration()
        +startIdeationGeneration()
        +stopRoadmap(projectId)
    }

    AgentManager --> AgentState : uses
    AgentManager --> AgentProcessManager : uses
    AgentManager --> AgentQueueManager : uses
```

### TerminalManager

The TerminalManager provides PTY-based terminal emulation for interactive Claude Code sessions:

```mermaid
flowchart LR
    subgraph TerminalManager
        TM[TerminalManager<br/>Facade]
        PTY[PTYManager<br/>Process Control]
        Session[SessionHandler<br/>Persistence]
        Parser[OutputParser<br/>Pattern Detection]
    end

    subgraph Features
        Interactive[Interactive PTY]
        RateLimit[Rate Limit Detection]
        History[Command History]
        Restore[Session Restore]
    end

    TM --> PTY
    TM --> Session
    PTY --> Parser

    PTY --> Interactive
    Parser --> RateLimit
    Session --> History
    Session --> Restore
```

| Component | Purpose |
|-----------|---------|
| **PTYManager** | Spawns and manages pseudo-terminal processes |
| **SessionHandler** | Persists terminal sessions across app restarts |
| **OutputParser** | Detects rate limits and special patterns in output |

### IPC Handler Organization

IPC handlers are organized by domain for maintainability:

```mermaid
flowchart TB
    subgraph IPC["IPC Handler Modules"]
        Project[project-handlers.ts<br/>Project CRUD, Init]
        Task[task-handlers.ts<br/>Task Execution]
        Terminal[terminal-handlers.ts<br/>Terminal Ops]
        Settings[settings-handlers.ts<br/>App Settings]
        GitHub[github/<br/>OAuth, PRs, Issues]
        Context[context/<br/>Memory, Index]
        Roadmap[roadmap-handlers.ts<br/>Generation]
    end

    Main[Main Process] --> IPC
    IPC <-->|invoke/handle| Renderer[Renderer]

    style IPC fill:#e3f2fd,stroke:#1976d2
```

## Preload Bridge

The preload script creates a secure bridge between main and renderer processes using Electron's contextBridge:

```mermaid
sequenceDiagram
    participant R as Renderer
    participant P as Preload
    participant M as Main Process

    R->>P: window.electronAPI.getProjects()
    P->>M: ipcRenderer.invoke('get-projects')
    M->>M: Handle request
    M-->>P: IPC response
    P-->>R: Promise<Result>

    Note over P: contextBridge.exposeInMainWorld<br/>creates window.electronAPI
```

### API Surface

The preload exposes a unified `electronAPI` object:

```typescript
// Available in renderer as window.electronAPI
interface ElectronAPI {
  // Projects
  getProjects(): Promise<Result<Project[]>>
  addProject(path: string): Promise<Result<Project>>
  removeProject(id: string): Promise<Result<void>>

  // Tasks
  startTask(taskId: string, options: TaskOptions): Promise<Result<void>>
  stopTask(taskId: string): Promise<Result<void>>

  // Terminals
  createTerminal(options: TerminalOptions): Promise<Result<string>>
  writeTerminal(id: string, data: string): Promise<void>

  // Events (returns cleanup function)
  onTaskProgress(callback: (taskId, plan) => void): () => void
  onTerminalData(callback: (id, data) => void): () => void
}
```

## Renderer Process

The renderer process runs in a Chromium browser context, handling all UI rendering with React.

### Application Structure

```
apps/frontend/src/renderer/
├── App.tsx                  # Root component with routing
├── main.tsx                 # React entry point
├── stores/                  # Zustand state stores
│   ├── project-store.ts     # Project state
│   ├── task-store.ts        # Task state
│   ├── terminal-store.ts    # Terminal state
│   ├── settings-store.ts    # App settings
│   ├── roadmap-store.ts     # Roadmap state
│   └── ideation-store.ts    # Ideation state
├── hooks/                   # Custom React hooks
│   ├── useIpc.ts            # IPC event listeners
│   └── useTerminal.ts       # Terminal utilities
├── components/              # UI components
│   ├── ui/                  # Base UI primitives (Radix)
│   ├── settings/            # Settings dialogs
│   ├── task-detail/         # Task detail views
│   ├── github-issues/       # GitHub integration
│   └── changelog/           # Changelog components
└── i18n/                    # Internationalization
```

### Component Hierarchy

```mermaid
flowchart TB
    App[App.tsx]

    subgraph Layout
        TabBar[ProjectTabBar]
        Sidebar[Sidebar]
        Content[Main Content Area]
    end

    subgraph Views
        Kanban[KanbanBoard]
        Terminal[TerminalGrid]
        Roadmap[Roadmap]
        Insights[Insights]
        Context[Context]
        GitHub[GitHubIssues/PRs]
    end

    subgraph Modals
        TaskWizard[TaskCreationWizard]
        TaskDetail[TaskDetailModal]
        Settings[AppSettingsDialog]
        RateLimit[RateLimitModal]
    end

    App --> Layout
    Content --> Views
    App --> Modals

    style App fill:#e3f2fd,stroke:#1976d2
    style Views fill:#e8f5e9,stroke:#4caf50
```

### Key Components

| Component | Purpose |
|-----------|---------|
| **App.tsx** | Root component, view routing, global state initialization |
| **Sidebar** | Navigation between views (Kanban, Roadmap, Insights, etc.) |
| **ProjectTabBar** | Browser-like tabs for multiple open projects |
| **KanbanBoard** | Task management with drag-and-drop columns |
| **TerminalGrid** | Grid of interactive terminal sessions |
| **TaskDetailModal** | Detailed task view with logs and progress |

## State Management

### Zustand Store Architecture

State is managed through domain-specific Zustand stores with IPC synchronization:

```mermaid
flowchart LR
    subgraph Stores["Zustand Stores"]
        Project[useProjectStore<br/>Projects, Tabs]
        Task[useTaskStore<br/>Tasks, Progress]
        Terminal[useTerminalStore<br/>Sessions]
        Settings[useSettingsStore<br/>App Settings]
        Roadmap[useRoadmapStore<br/>Roadmap Data]
    end

    subgraph IPC["IPC Events"]
        Progress[task-progress]
        Status[task-status]
        TermData[terminal-data]
        RoadmapEvt[roadmap-complete]
    end

    IPC --> Stores
    Stores --> Components[React Components]

    style Stores fill:#e3f2fd,stroke:#1976d2
```

### Store Pattern Example

```typescript
// Zustand store with actions and selectors
interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  openProjectIds: string[];

  // Actions
  setProjects: (projects: Project[]) => void;
  openProjectTab: (projectId: string) => void;
  closeProjectTab: (projectId: string) => void;

  // Selectors
  getActiveProject: () => Project | undefined;
  getProjectTabs: () => Project[];
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  activeProjectId: null,
  openProjectIds: [],

  openProjectTab: (projectId) => {
    const state = get();
    if (!state.openProjectIds.includes(projectId)) {
      set({
        openProjectIds: [...state.openProjectIds, projectId],
        activeProjectId: projectId
      });
      // Persist to main process
      window.electronAPI.saveTabState({...});
    }
  },
  // ...
}));
```

### IPC Event Listeners

The `useIpcListeners` hook sets up event subscriptions for real-time updates:

```mermaid
sequenceDiagram
    participant Main as Main Process
    participant Hook as useIpcListeners
    participant Store as Zustand Store
    participant UI as React Component

    Main->>Hook: onTaskProgress(taskId, plan)
    Hook->>Store: updateTaskFromPlan(taskId, plan)
    Store->>UI: State change triggers re-render
    UI->>UI: Display updated progress
```

## Terminal Integration

### Terminal Architecture

The terminal system uses xterm.js in the renderer with node-pty in the main process:

```mermaid
flowchart TB
    subgraph Renderer["Renderer Process"]
        XTerm[xterm.js<br/>Terminal Emulator]
        Component[Terminal.tsx<br/>React Component]
    end

    subgraph Main["Main Process"]
        PTY[node-pty<br/>PTY Process]
        Manager[TerminalManager]
        Store[Session Store]
    end

    Component --> XTerm
    XTerm <-->|IPC: write/data| PTY
    Manager --> PTY
    Manager --> Store

    style Renderer fill:#e8f5e9,stroke:#4caf50
    style Main fill:#e3f2fd,stroke:#1976d2
```

### Terminal Session Flow

```mermaid
sequenceDiagram
    participant User
    participant Component as Terminal.tsx
    participant Store as TerminalStore
    participant IPC as IPC Bridge
    participant PTY as TerminalManager

    User->>Component: Open terminal view
    Component->>Store: Get sessions
    Store->>IPC: createTerminal()
    IPC->>PTY: Spawn PTY process
    PTY-->>IPC: Terminal ID
    IPC-->>Store: Session created
    Store-->>Component: Render terminal

    User->>Component: Type command
    Component->>IPC: writeTerminal(id, data)
    IPC->>PTY: Write to PTY
    PTY-->>IPC: onTerminalData(id, output)
    IPC-->>Component: Render output
```

## Window Management

### Browser Window Configuration

The main window is configured for optimal desktop app experience:

```typescript
mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  minWidth: 1000,
  minHeight: 700,
  titleBarStyle: 'hiddenInset',  // macOS native look
  trafficLightPosition: { x: 15, y: 10 },
  webPreferences: {
    preload: join(__dirname, '../preload/index.mjs'),
    sandbox: false,
    contextIsolation: true,      // Security: isolate contexts
    nodeIntegration: false,      // Security: no Node in renderer
    backgroundThrottling: false  // Keep terminals responsive
  }
});
```

### Dev vs Production Loading

```mermaid
flowchart TB
    Init[Window Created]
    Check{is.dev?}

    Init --> Check
    Check -->|Yes| DevURL[loadURL<br/>localhost:5173]
    Check -->|No| ProdFile[loadFile<br/>renderer/index.html]

    DevURL --> DevTools[Open DevTools]
```

## Event System

### Main Process Events

```mermaid
flowchart LR
    subgraph Emitters
        Agent[AgentManager]
        Terminal[TerminalManager]
        FileWatch[FileWatcher]
    end

    subgraph Events
        TaskProg[task-progress]
        TaskErr[task-error]
        TermData[terminal-data]
        RateLimit[rate-limit]
        FileChange[file-changed]
    end

    subgraph Handlers
        IPC[IPC Forwarder]
        Renderer[Renderer Process]
    end

    Agent --> TaskProg
    Agent --> TaskErr
    Terminal --> TermData
    Terminal --> RateLimit
    FileWatch --> FileChange

    Events --> IPC
    IPC --> Renderer
```

### Rate Limit Handling

```mermaid
sequenceDiagram
    participant PTY as Terminal PTY
    participant Parser as OutputParser
    participant TM as TerminalManager
    participant IPC as IPC Bridge
    participant Modal as RateLimitModal

    PTY->>Parser: Terminal output
    Parser->>Parser: Detect rate limit pattern
    Parser->>TM: Rate limit detected
    TM->>IPC: Emit rate-limit event
    IPC->>Modal: Show modal with reset time
    Modal->>Modal: Countdown timer
```

## Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 39.x | Desktop application framework |
| React | 19.x | UI component library |
| TypeScript | 5.x | Type-safe JavaScript |
| Zustand | 5.x | Lightweight state management |
| Tailwind CSS | 4.x | Utility-first CSS framework |
| Radix UI | - | Accessible UI primitives |
| xterm.js | - | Terminal emulator |
| node-pty | - | PTY process management |
| Vite | 6.x | Build tool and dev server |

## Security Model

### Context Isolation

The renderer process is fully isolated from Node.js:

```mermaid
flowchart TB
    subgraph Blocked["Blocked in Renderer"]
        FS[fs module]
        Child[child_process]
        OS[os module]
    end

    subgraph Allowed["Allowed via contextBridge"]
        API[window.electronAPI]
        Safe[Curated, typed methods]
    end

    Renderer[Renderer Process] --> Allowed
    Renderer -.->|X| Blocked

    style Blocked fill:#ffebee,stroke:#f44336
    style Allowed fill:#e8f5e9,stroke:#4caf50
```

### Security Layers

| Layer | Implementation |
|-------|----------------|
| **contextIsolation** | Renderer cannot access preload scope |
| **nodeIntegration: false** | No Node.js APIs in renderer |
| **sandbox: false** | Required for node-pty (controlled risk) |
| **Typed IPC** | All IPC methods are typed and validated |

## Performance Optimizations

| Optimization | Implementation |
|--------------|----------------|
| **backgroundThrottling: false** | Terminals stay responsive when unfocused |
| **Debounced Tab State** | Tab state saves are debounced to reduce IPC |
| **Lazy Store Loading** | Stores load data on demand |
| **Virtualized Lists** | Long lists use windowing for performance |
| **Memoized Selectors** | Zustand selectors prevent unnecessary re-renders |

## Build Configuration

### Development

```bash
# Start renderer dev server (Vite)
pnpm dev:frontend

# Watches for changes and hot-reloads
# Main process: Uses electron-vite for HMR
# Renderer: Uses Vite's fast refresh
```

### Production

```mermaid
flowchart LR
    Build[pnpm build:frontend]

    subgraph Output
        Main[out/main/<br/>Bundled main process]
        Preload[out/preload/<br/>Preload scripts]
        Renderer[out/renderer/<br/>React app bundle]
    end

    Build --> Output
    Output --> Pack[electron-builder<br/>Package for OS]
```

## Next Steps

- [Overview Architecture](./overview.md) - High-level system overview
- [Backend Architecture](./backend.md) - Python agent system details
- [Integration Guide](./integration.md) - Frontend-backend communication
