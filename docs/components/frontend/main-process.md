# Main Process Architecture

The Electron main process serves as the backend of the Auto-Claude desktop application, orchestrating agent processes, managing terminals, handling IPC communication with the renderer, and integrating with Python backend scripts. It provides the core infrastructure that bridges the user interface with the autonomous coding system.

## Module Overview

```mermaid
flowchart TB
    subgraph MainProcess["Main Process"]
        Entry[index.ts<br/>App Entry Point]
        AgentMgr[AgentManager<br/>Agent Orchestration]
        TermMgr[TerminalManager<br/>PTY Management]
        IpcSetup[IPC Setup<br/>Handler Registration]
        PythonEnv[PythonEnvManager<br/>Venv Management]
    end

    subgraph AgentSubsystem["Agent Subsystem"]
        AgentState[AgentState<br/>Process Tracking]
        AgentEvents[AgentEvents<br/>Event Parsing]
        AgentProcess[AgentProcessManager<br/>Process Spawning]
        AgentQueue[AgentQueueManager<br/>Task Queuing]
    end

    subgraph IpcHandlers["IPC Handlers"]
        Project[project-handlers]
        Task[task-handlers]
        Terminal[terminal-handlers]
        Settings[settings-handlers]
        GitHub[github-handlers]
        Linear[linear-handlers]
        Context[context-handlers]
    end

    subgraph TerminalSubsystem["Terminal Subsystem"]
        PtyMgr[PTY Manager]
        SessionHandler[Session Handler]
        ClaudeInteg[Claude Integration]
        EventHandler[Event Handler]
    end

    Entry --> AgentMgr
    Entry --> TermMgr
    Entry --> IpcSetup
    Entry --> PythonEnv

    AgentMgr --> AgentState
    AgentMgr --> AgentEvents
    AgentMgr --> AgentProcess
    AgentMgr --> AgentQueue

    IpcSetup --> IpcHandlers
    TermMgr --> TerminalSubsystem

    style MainProcess fill:#e3f2fd,stroke:#1976d2
    style AgentSubsystem fill:#e8f5e9,stroke:#4caf50
    style IpcHandlers fill:#fff3e0,stroke:#f57c00
    style TerminalSubsystem fill:#fce4ec,stroke:#e91e63
```

## Directory Structure

```
apps/frontend/src/main/
├── index.ts                    # Application entry point
├── ipc-setup.ts               # IPC handler setup facade
├── agent-manager.ts           # Legacy facade (re-exports)
├── terminal-manager.ts        # Legacy facade (re-exports)
├── python-env-manager.ts      # Python venv management
├── python-detector.ts         # Python path detection
├── agent/                     # Agent orchestration
│   ├── agent-manager.ts       # Main orchestrator
│   ├── agent-state.ts         # Process state tracking
│   ├── agent-events.ts        # Event parsing
│   ├── agent-process.ts       # Process spawning
│   ├── agent-queue.ts         # Task queue management
│   ├── phase-event-parser.ts  # Phase event parsing
│   └── types.ts               # Type definitions
├── terminal/                  # Terminal management
│   ├── terminal-manager.ts    # Main terminal orchestrator
│   ├── pty-manager.ts         # PTY process handling
│   ├── session-handler.ts     # Session persistence
│   ├── terminal-lifecycle.ts  # Create/destroy lifecycle
│   ├── claude-integration.ts  # Claude Code integration
│   └── types.ts               # Type definitions
├── ipc-handlers/              # IPC handler modules
│   ├── index.ts               # Handler registration
│   ├── project-handlers.ts    # Project CRUD
│   ├── task-handlers.ts       # Task execution
│   ├── terminal-handlers.ts   # Terminal operations
│   ├── settings-handlers.ts   # App settings
│   ├── github-handlers.ts     # GitHub integration
│   ├── linear-handlers.ts     # Linear integration
│   ├── context-handlers.ts    # Project context
│   └── ...                    # Other handlers
└── claude-profile/            # Claude profile management
    ├── profile-storage.ts     # Profile persistence
    ├── usage-monitor.ts       # Usage tracking
    └── rate-limit-manager.ts  # Rate limit handling
```

## Application Lifecycle

```mermaid
sequenceDiagram
    participant App as Electron App
    participant Main as Main Process
    participant Agent as AgentManager
    participant Terminal as TerminalManager
    participant IPC as IPC Handlers
    participant Window as BrowserWindow
    participant Python as PythonEnvManager

    App->>Main: app.whenReady()
    Main->>Main: setAppUserModelId()
    Main->>Agent: new AgentManager()
    Main->>Agent: configure(pythonPath, autoBuildPath)
    Main->>Terminal: new TerminalManager()
    Main->>IPC: setupIpcHandlers()
    Main->>Window: createWindow()
    Main->>Main: initializeUsageMonitor()
    Main->>Main: initializeAppUpdater()

    Note over App,Python: Runtime Operations

    App->>Main: window-all-closed
    Main->>Main: Check platform
    alt Not macOS
        Main->>App: app.quit()
    end

    App->>Main: before-quit
    Main->>Main: Stop usage monitor
    Main->>Agent: killAll()
    Main->>Terminal: killAll()
```

## AgentManager

The `AgentManager` is the central orchestrator for all agent-related operations, including spec creation, task execution, roadmap generation, and ideation.

### Class Diagram

```mermaid
classDiagram
    class AgentManager {
        -state: AgentState
        -events: AgentEvents
        -processManager: AgentProcessManager
        -queueManager: AgentQueueManager
        -taskExecutionContext: Map
        +configure(pythonPath, autoBuildPath)
        +startSpecCreation(taskId, projectPath, taskDescription, specDir, metadata)
        +startTaskExecution(taskId, projectPath, specId, options)
        +startQAProcess(taskId, projectPath, specId)
        +startRoadmapGeneration(projectId, projectPath, refresh, enableCompetitor)
        +startIdeationGeneration(projectId, projectPath, config, refresh)
        +killTask(taskId): boolean
        +killAll(): Promise
        +isRunning(taskId): boolean
        +getRunningTasks(): string[]
        +restartTask(taskId, newProfileId): boolean
    }

    class AgentState {
        -processes: Map~string, AgentProcessInfo~
        -killedSpawns: Set~number~
        +addProcess(taskId, info)
        +getProcess(taskId): AgentProcessInfo
        +deleteProcess(taskId)
        +hasProcess(taskId): boolean
        +getRunningTaskIds(): string[]
        +generateSpawnId(): number
        +markSpawnAsKilled(spawnId)
        +wasSpawnKilled(spawnId): boolean
    }

    class AgentEvents {
        +parseExecutionPhase(line, currentPhase, isSpecRunner): PhaseUpdate
        +calculateOverallProgress(phase, phaseProgress): number
    }

    class AgentProcessManager {
        -state: AgentState
        -events: AgentEvents
        -_pythonPath: string
        -autoBuildSourcePath: string
        +configure(pythonPath, autoBuildPath)
        +spawnProcess(taskId, cwd, args, env, processType)
        +killProcess(taskId): boolean
        +killAllProcesses(): Promise
        +getPythonPath(): string
        +getAutoBuildSourcePath(): string
        +getCombinedEnv(projectPath): Record
    }

    class AgentQueueManager {
        -state: AgentState
        -events: AgentEvents
        -processManager: AgentProcessManager
        +startRoadmapGeneration(...)
        +startIdeationGeneration(...)
        +stopRoadmap(projectId): boolean
        +stopIdeation(projectId): boolean
        +isRoadmapRunning(projectId): boolean
        +isIdeationRunning(projectId): boolean
    }

    AgentManager --> AgentState
    AgentManager --> AgentEvents
    AgentManager --> AgentProcessManager
    AgentManager --> AgentQueueManager
    AgentProcessManager --> AgentState
    AgentProcessManager --> AgentEvents
    AgentQueueManager --> AgentState
    AgentQueueManager --> AgentProcessManager
```

### Task Execution Flow

```mermaid
flowchart TB
    Start[Start Task]
    AuthCheck{Auth Valid?}
    PathCheck{Path Found?}
    ScriptCheck{Script Exists?}
    GetEnv[Get Combined Env]
    StoreContext[Store Task Context]
    SpawnProcess[Spawn Python Process]

    subgraph ProcessLifecycle["Process Lifecycle"]
        Running[Running]
        ParseOutput[Parse Output]
        EmitProgress[Emit Progress Events]
        HandleExit[Handle Exit]
    end

    subgraph ErrorHandling["Error Handling"]
        CheckRateLimit{Rate Limited?}
        CheckAuth{Auth Failed?}
        AutoSwap{Auto-Swap?}
        ManualModal[Show Manual Modal]
        SwapProfile[Swap Profile]
        RestartTask[Restart Task]
    end

    Start --> AuthCheck
    AuthCheck -->|No| EmitError[Emit Error]
    AuthCheck -->|Yes| PathCheck
    PathCheck -->|No| EmitError
    PathCheck -->|Yes| ScriptCheck
    ScriptCheck -->|No| EmitError
    ScriptCheck -->|Yes| GetEnv
    GetEnv --> StoreContext
    StoreContext --> SpawnProcess
    SpawnProcess --> Running
    Running --> ParseOutput
    ParseOutput --> EmitProgress
    EmitProgress --> Running
    Running -->|Exit| HandleExit

    HandleExit -->|Code != 0| CheckRateLimit
    CheckRateLimit -->|Yes| AutoSwap
    CheckRateLimit -->|No| CheckAuth
    AutoSwap -->|Yes| SwapProfile
    AutoSwap -->|No| ManualModal
    SwapProfile --> RestartTask
    CheckAuth -->|Yes| EmitAuthFailure[Emit Auth Failure]
    CheckAuth -->|No| EmitExit[Emit Exit]

    style ProcessLifecycle fill:#e8f5e9,stroke:#4caf50
    style ErrorHandling fill:#ffebee,stroke:#f44336
```

### Event Emissions

| Event | Description | Payload |
|-------|-------------|---------|
| `execution-progress` | Phase progress update | `{ phase, phaseProgress, overallProgress, message }` |
| `log` | Process output line | `taskId, line` |
| `exit` | Process exited | `taskId, code, processType` |
| `error` | Error occurred | `taskId, message` |
| `sdk-rate-limit` | Rate limit detected | `{ source, resetTime, profileId, ... }` |
| `auth-failure` | Authentication failed | `taskId, { profileId, failureType, message }` |
| `auto-swap-restart-task` | Auto-swap triggered restart | `taskId, newProfileId` |

### Execution Phases

```mermaid
stateDiagram-v2
    [*] --> planning: Start
    planning --> coding: Plan approved
    coding --> qa: Code complete
    qa --> complete: QA passed
    qa --> coding: QA failed
    coding --> failed: Error
    planning --> failed: Error
    complete --> [*]
    failed --> [*]
```

## IPC Handler System

The IPC system bridges the renderer process (UI) with the main process, organized into domain-specific handler modules.

### Handler Registration Flow

```mermaid
flowchart LR
    subgraph Setup["setupIpcHandlers()"]
        Init[Initialize Services]
        RegisterAll[Register All Handlers]
    end

    subgraph Handlers["Handler Modules"]
        Project[Project<br/>CRUD, init]
        Task[Task<br/>Execution]
        Terminal[Terminal<br/>PTY, Claude]
        Settings[Settings<br/>Config, dialogs]
        GitHub[GitHub<br/>PRs, issues]
        Linear[Linear<br/>Integration]
        Context[Context<br/>Memory]
        File[File<br/>Explorer]
        Roadmap[Roadmap<br/>Generation]
        Ideation[Ideation<br/>Ideas]
        Changelog[Changelog<br/>Generation]
        Insights[Insights<br/>AI chat]
        Memory[Memory<br/>Graphiti]
        AppUpdate[Updates<br/>Auto-update]
    end

    Init --> RegisterAll
    RegisterAll --> Handlers

    style Setup fill:#e3f2fd,stroke:#1976d2
```

### IPC Communication Pattern

```mermaid
sequenceDiagram
    participant Renderer
    participant Preload
    participant Main
    participant Handler

    Renderer->>Preload: window.api.invoke('channel', args)
    Preload->>Main: ipcMain.handle('channel')
    Main->>Handler: handleFunction(args)
    Handler-->>Main: result
    Main-->>Preload: result
    Preload-->>Renderer: Promise resolution

    Note over Main,Handler: Event Forwarding

    Handler->>Main: mainWindow.webContents.send('event')
    Main->>Preload: ipcRenderer.on('event')
    Preload->>Renderer: callback(data)
```

### Key IPC Channels

| Domain | Invoke Channels | Send Channels |
|--------|----------------|---------------|
| Project | `project:list`, `project:create`, `project:delete` | `project:updated` |
| Task | `task:start`, `task:stop`, `task:status` | `task:progress`, `task:complete` |
| Terminal | `terminal:create`, `terminal:write`, `terminal:resize` | `terminal:data`, `terminal:exit` |
| Agent | `agent:start-spec`, `agent:start-task`, `agent:kill` | `agent:log`, `agent:progress`, `agent:exit` |
| Settings | `settings:get`, `settings:save`, `dialog:open-folder` | `settings:changed` |
| GitHub | `github:get-prs`, `github:create-pr`, `github:import-repo` | `github:oauth-success` |

## Terminal Management

The `TerminalManager` handles PTY (pseudo-terminal) processes, integrating with Claude Code for AI-powered terminal sessions.

### Architecture

```mermaid
flowchart TB
    subgraph TerminalManager["TerminalManager"]
        Main[Main Orchestrator]
        Terminals[terminals: Map]
    end

    subgraph Modules["Modular Components"]
        PtyMgr[pty-manager.ts<br/>PTY Operations]
        Session[session-handler.ts<br/>Persistence]
        Lifecycle[terminal-lifecycle.ts<br/>Create/Destroy]
        Events[terminal-event-handler.ts<br/>Output Parsing]
        Claude[claude-integration.ts<br/>Claude Code]
    end

    subgraph External["External"]
        NodePty[node-pty<br/>PTY Library]
        ClaudeCode[Claude Code CLI]
        SessionStore[Session Store<br/>File System]
    end

    Main --> PtyMgr
    Main --> Session
    Main --> Lifecycle
    Main --> Events
    Main --> Claude

    PtyMgr --> NodePty
    Claude --> ClaudeCode
    Session --> SessionStore

    style TerminalManager fill:#e3f2fd,stroke:#1976d2
    style Modules fill:#e8f5e9,stroke:#4caf50
    style External fill:#fff3e0,stroke:#f57c00
```

### Terminal Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: create()
    Created --> Active: PTY spawned
    Active --> ClaudeMode: invokeClaude()
    ClaudeMode --> Active: Claude exits
    Active --> Active: write(), resize()
    Active --> Destroyed: destroy()
    ClaudeMode --> Destroyed: destroy()

    state ClaudeMode {
        [*] --> Running
        Running --> RateLimited: Rate limit detected
        RateLimited --> ProfileSwitch: Auto-swap
        ProfileSwitch --> Running: New profile
        Running --> Exited: Session ends
    }

    Destroyed --> [*]
```

### TerminalProcess Interface

```mermaid
classDiagram
    class TerminalProcess {
        +id: string
        +pty: IPty
        +shell: string
        +cwd: string
        +title: string
        +isClaudeMode: boolean
        +claudeSessionId?: string
        +claudeProfileId?: string
        +projectPath?: string
        +createdAt: Date
        +scrollbackBuffer: string
    }

    class TerminalManager {
        -terminals: Map~string, TerminalProcess~
        -getWindow: WindowGetter
        +create(options): Promise~Result~
        +restore(session): Promise~Result~
        +destroy(id): Promise~Result~
        +killAll(): Promise
        +write(id, data): void
        +resize(id, cols, rows): void
        +invokeClaude(id, cwd, profileId): void
        +switchClaudeProfile(id, profileId): Promise~Result~
        +resumeClaude(id, sessionId): void
        +getSavedSessions(projectPath): Session[]
        +isClaudeMode(id): boolean
    }

    TerminalManager --> TerminalProcess
```

### Session Persistence

```mermaid
flowchart LR
    subgraph Runtime["Active Sessions"]
        T1[Terminal 1]
        T2[Terminal 2]
        T3[Terminal 3]
    end

    subgraph Persistence["Session Storage"]
        Timer[30s Timer]
        Store[SessionStore]
        Files[JSON Files]
    end

    subgraph Restore["Session Restore"]
        Load[Load Sessions]
        Recreate[Recreate PTYs]
        Resume[Resume Claude]
    end

    Runtime -->|Periodic Save| Timer
    Timer --> Store
    Store --> Files

    Files -->|App Restart| Load
    Load --> Recreate
    Recreate --> Resume
    Resume --> Runtime

    style Runtime fill:#e8f5e9,stroke:#4caf50
    style Persistence fill:#e3f2fd,stroke:#1976d2
    style Restore fill:#fff3e0,stroke:#f57c00
```

## Python Integration

The `PythonEnvManager` manages the Python virtual environment required for running Auto-Claude backend scripts.

### Environment Setup Flow

```mermaid
flowchart TB
    Start[initialize]
    CheckProgress{Already initializing?}
    WaitExisting[Wait for existing]
    CheckReady{Already ready?}
    ReturnCached[Return cached status]
    CheckVenv{Venv exists?}
    CreateVenv[Create venv]
    CheckDeps{Deps installed?}
    InstallDeps[Install requirements.txt]
    Ready[Ready]
    Error[Error]

    Start --> CheckProgress
    CheckProgress -->|Yes| WaitExisting
    CheckProgress -->|No| CheckReady
    CheckReady -->|Yes| ReturnCached
    CheckReady -->|No| CheckVenv
    CheckVenv -->|No| CreateVenv
    CheckVenv -->|Yes| CheckDeps
    CreateVenv -->|Success| CheckDeps
    CreateVenv -->|Fail| Error
    CheckDeps -->|No| InstallDeps
    CheckDeps -->|Yes| Ready
    InstallDeps -->|Success| Ready
    InstallDeps -->|Fail| Error
```

### Python Path Resolution

```mermaid
flowchart TB
    VenvReady{Venv ready?}
    VenvPath[Return venv Python]
    FindPython[findPythonCommand]
    BundledExists{Bundled Python?}
    BundledPath[Return bundled]
    SystemPython[Find system Python]
    ValidVersion{Python 3.10+?}
    ReturnSystem[Return system Python]
    Fallback[Return python]

    VenvReady -->|Yes| VenvPath
    VenvReady -->|No| FindPython
    FindPython --> BundledExists
    BundledExists -->|Yes| BundledPath
    BundledExists -->|No| SystemPython
    SystemPython --> ValidVersion
    ValidVersion -->|Yes| ReturnSystem
    ValidVersion -->|No| Fallback
```

### Venv Location Strategy

| Environment | Venv Path | Reason |
|-------------|-----------|--------|
| Development | `{source}/.venv` | Standard location in source |
| Packaged (Windows/Mac) | `{source}/.venv` | Writable app resources |
| Packaged (Linux AppImage) | `{userData}/python-venv` | AppImage resources are read-only |

### PythonEnvManager Class

```mermaid
classDiagram
    class PythonEnvManager {
        -autoBuildSourcePath: string
        -pythonPath: string
        -isInitializing: boolean
        -isReady: boolean
        -initializationPromise: Promise
        +initialize(autoBuildSourcePath): Promise~Status~
        +getPythonPath(): string
        +isEnvReady(): boolean
        +getStatus(): Promise~Status~
        -getVenvBasePath(): string
        -getVenvPythonPath(): string
        -venvExists(): boolean
        -checkDepsInstalled(): Promise~boolean~
        -createVenv(): Promise~boolean~
        -bootstrapPip(): Promise~boolean~
        -installDeps(): Promise~boolean~
        -findSystemPython(): string
    }

    class PythonEnvStatus {
        +ready: boolean
        +pythonPath: string
        +venvExists: boolean
        +depsInstalled: boolean
        +error?: string
    }

    PythonEnvManager --> PythonEnvStatus : returns
```

## Rate Limit Handling

The main process includes sophisticated rate limit detection and automatic profile switching.

### Rate Limit Detection Flow

```mermaid
flowchart TB
    Output[Process Output]
    Detect[detectRateLimit()]

    subgraph Detection["Pattern Detection"]
        SDKPattern[SDK Rate Limit Pattern]
        APIPattern[API Rate Limit Pattern]
        ParseReset[Parse Reset Time]
        ParseProfile[Parse Profile ID]
    end

    subgraph Response["Response Handling"]
        AutoSwapEnabled{Auto-swap?}
        FindProfile[Find best profile]
        ProfileAvailable{Profile OK?}
        SwapProfile[Swap to new profile]
        RestartTask[Restart task]
        ShowModal[Show manual modal]
    end

    Output --> Detect
    Detect --> Detection
    Detection --> AutoSwapEnabled

    AutoSwapEnabled -->|Yes| FindProfile
    AutoSwapEnabled -->|No| ShowModal
    FindProfile --> ProfileAvailable
    ProfileAvailable -->|Yes| SwapProfile
    ProfileAvailable -->|No| ShowModal
    SwapProfile --> RestartTask

    style Detection fill:#e3f2fd,stroke:#1976d2
    style Response fill:#e8f5e9,stroke:#4caf50
```

### Auto-Swap Mechanism

```mermaid
sequenceDiagram
    participant Process as Agent Process
    participant Detector as Rate Limit Detector
    participant ProfileMgr as Profile Manager
    participant AgentMgr as Agent Manager

    Process->>Detector: Output with rate limit
    Detector->>Detector: Parse rate limit info
    Detector->>ProfileMgr: getAutoSwitchSettings()

    alt Auto-switch enabled
        Detector->>ProfileMgr: getBestAvailableProfile()
        ProfileMgr-->>Detector: Best profile

        alt Profile available
            Detector->>ProfileMgr: setActiveProfile(newProfile)
            Detector->>AgentMgr: emit('auto-swap-restart-task')
            AgentMgr->>AgentMgr: restartTask()
        else No profile
            Detector->>Process: emit('sdk-rate-limit') [manual]
        end
    else Auto-switch disabled
        Detector->>Process: emit('sdk-rate-limit') [manual]
    end
```

## Window Management

### BrowserWindow Configuration

```mermaid
flowchart LR
    subgraph Config["Window Configuration"]
        Size[1400x900<br/>min: 1000x700]
        TitleBar[Hidden Title Bar<br/>macOS inset]
        WebPrefs[Web Preferences]
    end

    subgraph WebPreferences["Security Settings"]
        Preload[Preload Script]
        Sandbox[sandbox: false]
        Context[contextIsolation: true]
        NodeInt[nodeIntegration: false]
        Background[backgroundThrottling: false]
    end

    subgraph DevMode["Development Mode"]
        DevTools[Open DevTools]
        HMR[Hot Module Reload]
        RendererURL[Load from URL]
    end

    subgraph ProdMode["Production Mode"]
        LoadFile[Load index.html]
        AutoUpdate[Auto-updater]
    end

    Config --> WebPreferences
    WebPreferences --> DevMode
    WebPreferences --> ProdMode

    style Config fill:#e3f2fd,stroke:#1976d2
    style WebPreferences fill:#ffebee,stroke:#f44336
```

### Platform-Specific Behavior

| Platform | Behavior |
|----------|----------|
| macOS | Hidden title bar with traffic lights, dock icon, re-create window on activate |
| Windows | App user model ID for taskbar grouping, auto-hide menu bar |
| Linux | AppImage-compatible venv path, standard window controls |

## Error Handling

### Global Error Handlers

```typescript
// Uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// Unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
```

### Cleanup on Quit

```mermaid
flowchart LR
    BeforeQuit[before-quit event]
    StopMonitor[Stop usage monitor]
    KillAgents[Kill all agent processes]
    KillTerminals[Kill all terminal processes]
    Exit[App exits]

    BeforeQuit --> StopMonitor
    StopMonitor --> KillAgents
    KillAgents --> KillTerminals
    KillTerminals --> Exit
```

## Integration Points

### External Dependencies

```mermaid
flowchart TB
    subgraph Main["Main Process"]
        AgentMgr[AgentManager]
        TermMgr[TerminalManager]
        PythonMgr[PythonEnvManager]
    end

    subgraph Backend["Python Backend"]
        SpecRunner[spec_runner.py]
        RunPy[run.py]
        Roadmap[roadmap_runner.py]
        Ideation[ideation_runner.py]
    end

    subgraph External["External Services"]
        ClaudeSDK[Claude Agent SDK]
        NodePty[node-pty]
        Git[Git CLI]
    end

    subgraph Renderer["Renderer Process"]
        UI[React UI]
        Store[Zustand Store]
    end

    AgentMgr -->|Spawn| Backend
    Backend -->|via| ClaudeSDK
    TermMgr -->|via| NodePty
    PythonMgr -->|Detect| Python[Python 3.10+]
    Main <-->|IPC| Renderer

    style Main fill:#e3f2fd,stroke:#1976d2
    style Backend fill:#e8f5e9,stroke:#4caf50
    style External fill:#fff3e0,stroke:#f57c00
```

### Key Dependencies

| Module | Dependency | Purpose |
|--------|------------|---------|
| AgentManager | `child_process` | Spawn Python processes |
| AgentManager | `claude-profile-manager` | Profile authentication |
| TerminalManager | `node-pty` | PTY process management |
| TerminalManager | Claude Code CLI | AI-powered terminals |
| PythonEnvManager | `child_process` | Venv creation, pip install |
| IPC Handlers | `electron.ipcMain` | Process communication |

## Next Steps

- [Renderer Process](./renderer-process.md) - React UI architecture
- [Preload Bridge](./preload-bridge.md) - IPC bridge and API exposure
- [State Management](./state-management.md) - Zustand stores
- [Backend Integration](../architecture/integration.md) - Python backend connection
