# Frontend-Backend Integration

This document provides detailed documentation on how the Electron frontend and Python backend communicate through IPC (Inter-Process Communication) and process spawning mechanisms.

## Communication Architecture

Auto-Claude uses a layered communication architecture that separates concerns between the UI, orchestration, and AI execution layers.

```mermaid
flowchart TB
    subgraph Renderer["Renderer Process (React)"]
        UI[UI Components]
        Hooks[Custom Hooks]
        Stores[Zustand Stores]
        API[electronAPI]
    end

    subgraph Preload["Preload Scripts"]
        Bridge[Context Bridge]
        TaskAPI[Task API]
        AgentAPI[Agent API]
        TermAPI[Terminal API]
    end

    subgraph Main["Main Process (Electron)"]
        IPC[IPC Handlers]
        AM[AgentManager]
        PM[ProcessManager]
        TM[TerminalManager]
        EvtFwd[Event Forwarder]
    end

    subgraph Backend["Python Backend"]
        Agent[Agent Process]
        Stream[NDJSON Stream]
        Claude[Claude API]
    end

    UI --> API
    API --> Bridge
    Bridge --> IPC
    IPC --> AM
    AM --> PM
    PM --> Agent
    Agent --> Stream
    Stream --> EvtFwd
    EvtFwd --> Stores
    Stores --> UI

    style Renderer fill:#e3f2fd,stroke:#1976d2
    style Preload fill:#e8f5e9,stroke:#4caf50
    style Main fill:#fff3e0,stroke:#f57c00
    style Backend fill:#fce4ec,stroke:#e91e63
```

## IPC Channel Architecture

The system uses a comprehensive set of IPC channels organized by domain. Each channel follows a consistent naming convention: `domain:action`.

### Channel Categories

| Category | Prefix | Purpose |
|----------|--------|---------|
| **Tasks** | `task:` | Task CRUD, execution control, worktree management |
| **Projects** | `project:` | Project lifecycle, settings |
| **Terminal** | `terminal:` | PTY sessions, Claude Code integration |
| **Claude Profiles** | `claude:` | Multi-account management, rate limiting |
| **Roadmap** | `roadmap:` | Feature generation, AI planning |
| **GitHub** | `github:` | Issue integration, PR review, auto-fix |
| **Insights** | `insights:` | AI-powered codebase chat |

### Channel Flow Types

```mermaid
flowchart LR
    subgraph Request["Request Channels"]
        direction TB
        R1[ipcMain.handle]
        R2["Promise-based"]
        R3["Bidirectional"]
    end

    subgraph Fire["Fire-and-Forget"]
        direction TB
        F1[ipcMain.on]
        F2["No response"]
        F3["Start/Stop actions"]
    end

    subgraph Events["Event Channels"]
        direction TB
        E1[webContents.send]
        E2["Main → Renderer"]
        E3["Streaming updates"]
    end

    Renderer -->|"invoke()"| Request
    Renderer -->|"send()"| Fire
    Events -->|"on()"| Renderer

    style Request fill:#e8f5e9,stroke:#4caf50
    style Fire fill:#fff3e0,stroke:#f57c00
    style Events fill:#e3f2fd,stroke:#1976d2
```

## Task Execution Flow

The complete flow from user action to code generation involves multiple communication layers.

### Task Start Sequence

```mermaid
sequenceDiagram
    participant User
    participant UI as React UI
    participant Store as Zustand Store
    participant API as electronAPI
    participant IPC as IPC Handler
    participant AM as AgentManager
    participant PM as ProcessManager
    participant Py as Python Backend
    participant Claude as Claude API

    User->>UI: Click "Start Task"
    UI->>Store: updateTaskStatus('in_progress')
    UI->>API: task.start(taskId)
    API->>IPC: ipcRenderer.send('task:start')

    IPC->>IPC: Validate git repo
    IPC->>IPC: Check authentication
    IPC->>AM: startSpecCreation() or startTaskExecution()

    AM->>AM: Check auth profile
    AM->>AM: Build command args
    AM->>PM: spawnProcess(taskId, args, env)

    PM->>PM: Setup environment
    PM->>Py: spawn(python, [script, ...args])

    Note over PM,Py: NDJSON streaming begins

    Py->>Claude: Agent SDK call
    Claude-->>Py: Response stream
    Py-->>PM: stdout: {"phase": "planning", ...}
    PM-->>AM: emit('execution-progress')
    AM-->>IPC: Forward to renderer
    IPC-->>Store: Update task state
    Store-->>UI: Re-render with progress
```

### Process Spawning Details

The AgentProcessManager handles all Python process lifecycle management:

```mermaid
flowchart TB
    subgraph Setup["Process Setup"]
        Validate[Validate Paths]
        Env[Build Environment]
        Args[Construct Arguments]
    end

    subgraph Spawn["Spawning"]
        Python[Get Python Path]
        Parse[Parse Command]
        Create[Create Child Process]
    end

    subgraph Management["Lifecycle Management"]
        Track[Track in State]
        Buffer[Buffer Output]
        Parse2[Parse Phase Events]
        Emit[Emit Progress]
    end

    subgraph Cleanup["Cleanup"]
        Kill[Kill Process]
        RateLimit[Detect Rate Limit]
        Auth[Detect Auth Failure]
        Exit[Handle Exit]
    end

    Setup --> Spawn
    Spawn --> Management
    Management --> Cleanup

    style Setup fill:#e8f5e9,stroke:#4caf50
    style Spawn fill:#e3f2fd,stroke:#1976d2
    style Management fill:#fff3e0,stroke:#f57c00
    style Cleanup fill:#fce4ec,stroke:#e91e63
```

### Environment Configuration

Process environment is built from multiple sources:

```mermaid
flowchart LR
    subgraph Sources["Environment Sources"]
        System[process.env]
        AutoBuild[.env file]
        Profile[Claude Profile]
        Project[Project Settings]
    end

    subgraph Merge["Merge Process"]
        Combine[getCombinedEnv]
        Setup[setupProcessEnvironment]
    end

    subgraph Final["Final Environment"]
        Python[PYTHONUNBUFFERED=1]
        Encoding[PYTHONIOENCODING=utf-8]
        ProfileEnv[CLAUDE_* vars]
        GraphitiUrl[GRAPHITI_MCP_URL]
    end

    Sources --> Merge --> Final
```

| Variable | Source | Purpose |
|----------|--------|---------|
| `PYTHONUNBUFFERED` | Hardcoded | Real-time output streaming |
| `PYTHONIOENCODING` | Hardcoded | UTF-8 output encoding |
| `PYTHONUTF8` | Hardcoded | Force UTF-8 mode |
| `CLAUDE_*` | Profile Manager | API credentials, model config |
| `GRAPHITI_MCP_URL` | Project Settings | Memory integration |
| Custom vars | Auto-Claude .env | Provider keys, custom config |

## Agent Event System

The agent system uses EventEmitter patterns to propagate state changes through the application.

### Event Flow Architecture

```mermaid
sequenceDiagram
    participant Py as Python Process
    participant PM as ProcessManager
    participant AM as AgentManager
    participant Handler as Event Handler
    participant IPC as IPC Bridge
    participant Store as Zustand Store
    participant UI as React Component

    Py->>PM: stdout: __EXEC_PHASE__:coding:message
    PM->>PM: Parse phase event
    PM->>AM: emit('execution-progress', data)
    AM->>Handler: Forward event
    Handler->>Handler: Map phase to status
    Handler->>IPC: webContents.send('task:executionProgress')
    IPC->>Store: on('executionProgress', update)
    Store->>UI: Zustand selector trigger
    UI->>UI: Re-render with new state
```

### Supported Events

| Event | Source | Data | Purpose |
|-------|--------|------|---------|
| `log` | stdout/stderr | String | Raw process output |
| `execution-progress` | Phase parser | Phase, progress, subtask | UI progress tracking |
| `exit` | Process | Code, process type | Task completion/failure |
| `error` | Process/Runtime | Error message | Error display |
| `sdk-rate-limit` | Output parser | Rate limit info | Profile switching |
| `auth-failure` | Output parser | Auth details | Re-authentication prompt |
| `auto-swap-restart-task` | Rate limit handler | Task ID, new profile | Automatic retry |

### Phase Protocol

The Python backend emits structured phase events for UI synchronization:

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> planning: Start task
    planning --> coding: Plan complete
    coding --> qa_review: Code complete
    qa_review --> qa_fixing: Issues found
    qa_fixing --> qa_review: Fixes applied
    qa_review --> complete: QA approved
    coding --> failed: Error
    qa_review --> failed: Critical error
    complete --> [*]
    failed --> [*]
```

Phase events are emitted as structured markers:

```
__EXEC_PHASE__:planning:Creating implementation plan...
__EXEC_PHASE__:coding:subtask-1-1:Implementing feature X
__EXEC_PHASE__:qa_review:Running QA review...
__EXEC_PHASE__:complete:Build completed successfully
```

## IPC Handler Architecture

IPC handlers are organized into domain-specific modules for maintainability.

### Handler Registration Flow

```mermaid
flowchart TB
    subgraph Setup["App Initialization"]
        Main[main.ts]
        Create[Create Managers]
        Init[Initialize Services]
    end

    subgraph Register["Handler Registration"]
        SetupIPC[setupIpcHandlers]
        Project[registerProjectHandlers]
        Task[registerTaskHandlers]
        Terminal[registerTerminalHandlers]
        Agent[registerAgentEventsHandlers]
        Settings[registerSettingsHandlers]
        More[... 12 more modules]
    end

    subgraph Managers["Shared Managers"]
        AM[AgentManager]
        TM[TerminalManager]
        PM[PythonEnvManager]
        Window[getMainWindow]
    end

    Setup --> Register
    Managers --> Register

    style Setup fill:#e8f5e9,stroke:#4caf50
    style Register fill:#e3f2fd,stroke:#1976d2
    style Managers fill:#fff3e0,stroke:#f57c00
```

### Handler Module Structure

Each handler module follows a consistent pattern:

```typescript
export function registerDomainHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // Request handlers (Promise-based)
  ipcMain.handle(IPC_CHANNELS.DOMAIN_ACTION, async (_, ...args) => {
    return { success: true, data: result };
  });

  // Fire-and-forget handlers
  ipcMain.on(IPC_CHANNELS.DOMAIN_START, (_, ...args) => {
    agentManager.startProcess(...args);
  });

  // Event forwarding
  agentManager.on('event', (data) => {
    const mainWindow = getMainWindow();
    mainWindow?.webContents.send(IPC_CHANNELS.DOMAIN_EVENT, data);
  });
}
```

## Preload API Layer

The preload scripts create a secure bridge between renderer and main processes.

### API Structure

```mermaid
flowchart TB
    subgraph Preload["Preload Layer"]
        Index[index.ts]
        Create[createElectronAPI]
        Expose[contextBridge.exposeInMainWorld]
    end

    subgraph APIs["Domain APIs"]
        TaskAPI[task-api.ts]
        ProjectAPI[project-api.ts]
        TerminalAPI[terminal-api.ts]
        AgentAPI[agent-api.ts]
        ModuleAPIs[modules/]
    end

    subgraph Modules["Module APIs"]
        GitHub[github-api.ts]
        Roadmap[roadmap-api.ts]
        Insights[insights-api.ts]
        Changelog[changelog-api.ts]
        Ideation[ideation-api.ts]
    end

    Index --> Create
    Create --> APIs
    APIs --> Modules
    Create --> Expose

    style Preload fill:#e8f5e9,stroke:#4caf50
    style APIs fill:#e3f2fd,stroke:#1976d2
    style Modules fill:#fff3e0,stroke:#f57c00
```

### API Pattern

```typescript
// preload/api/task-api.ts
export function createTaskAPI() {
  return {
    // Request methods (invoke)
    list: (projectId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.TASK_LIST, projectId),

    // Fire-and-forget methods (send)
    start: (taskId: string, options?: TaskStartOptions) =>
      ipcRenderer.send(IPC_CHANNELS.TASK_START, taskId, options),

    // Event subscriptions (on)
    onProgress: (callback: (taskId: string, plan: Plan) => void) => {
      const handler = (_: unknown, taskId: string, plan: Plan) =>
        callback(taskId, plan);
      ipcRenderer.on(IPC_CHANNELS.TASK_PROGRESS, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_PROGRESS, handler);
    },
  };
}
```

## Process Communication Protocol

Communication between Electron main process and Python backend uses NDJSON (Newline-Delimited JSON) streaming over stdout/stderr.

### Stream Processing

```mermaid
sequenceDiagram
    participant Py as Python Process
    participant Buffer as Output Buffer
    participant Parser as Line Parser
    participant Phase as Phase Parser
    participant Emit as Event Emitter

    loop Continuous Stream
        Py->>Buffer: data chunk
        Buffer->>Buffer: Append to buffer
        Buffer->>Parser: Split by newlines

        loop Each complete line
            Parser->>Parser: Trim whitespace
            Parser->>Phase: Check for phase marker
            alt Has __EXEC_PHASE__
                Phase->>Emit: emit('execution-progress')
            end
            Parser->>Emit: emit('log', line)
        end

        Note over Buffer: Keep incomplete line in buffer
    end
```

### Phase Event Parsing

```mermaid
flowchart TB
    subgraph Input["Input Processing"]
        Log[Log Line]
        Check[Check for Marker]
    end

    subgraph Structured["Structured Events"]
        Parse[parsePhaseEvent]
        Extract[Extract phase, message, subtask]
    end

    subgraph Fallback["Fallback Detection"]
        Lower[Lowercase match]
        Keywords[Keyword patterns]
    end

    subgraph Validation["Validation"]
        Regress[Check regression]
        Terminal[Check terminal state]
    end

    subgraph Output["Output"]
        Return[Return phase update]
        Null[Return null]
    end

    Log --> Check
    Check -->|Has marker| Structured
    Check -->|No marker| Fallback
    Structured --> Validation
    Fallback --> Validation
    Validation -->|Valid| Return
    Validation -->|Invalid| Null

    style Input fill:#e8f5e9,stroke:#4caf50
    style Structured fill:#e3f2fd,stroke:#1976d2
    style Fallback fill:#fff3e0,stroke:#f57c00
    style Validation fill:#fce4ec,stroke:#e91e63
    style Output fill:#f3e5f5,stroke:#9c27b0
```

## Rate Limit Handling

The system includes sophisticated rate limit detection and automatic profile switching.

### Rate Limit Flow

```mermaid
sequenceDiagram
    participant Py as Python Process
    participant PM as ProcessManager
    participant Detect as Rate Limit Detector
    participant Profile as Profile Manager
    participant AM as AgentManager
    participant UI as React UI

    Py->>PM: Process exits (code != 0)
    PM->>Detect: detectRateLimit(output)

    alt Rate Limit Detected
        Detect->>Profile: Check auto-switch settings

        alt Auto-switch enabled
            Profile->>Profile: getBestAvailableProfile()

            alt Alternative available
                Profile->>Profile: setActiveProfile(newId)
                Profile->>AM: emit('auto-swap-restart-task')
                AM->>AM: restartTask(taskId, newProfileId)
                AM->>UI: Notify swap occurred
            else No alternative
                Profile->>UI: Show rate limit modal
            end
        else Auto-switch disabled
            Detect->>UI: Show rate limit modal
        end
    else No rate limit
        PM->>Detect: detectAuthFailure(output)

        alt Auth failure
            Detect->>UI: Show auth failure modal
        else Other error
            PM->>UI: Show error message
        end
    end
```

### Profile Switching State

```mermaid
stateDiagram-v2
    [*] --> Running: Task started
    Running --> RateLimited: Rate limit hit

    RateLimited --> CheckSettings: Detect rate limit
    CheckSettings --> AutoSwap: Auto-switch enabled
    CheckSettings --> ManualModal: Auto-switch disabled

    AutoSwap --> FindProfile: Check alternatives
    FindProfile --> SwapAndRestart: Profile found
    FindProfile --> ManualModal: No alternatives

    SwapAndRestart --> Running: Task restarted
    ManualModal --> UserAction: User selects profile
    UserAction --> Running: Retry with new profile
    UserAction --> [*]: User cancels

    Running --> Complete: Task finishes
    Complete --> [*]
```

## Terminal Integration

The terminal system provides PTY-based interactive sessions with Claude Code integration.

### Terminal Session Flow

```mermaid
sequenceDiagram
    participant UI as Terminal UI
    participant API as electronAPI
    participant TM as TerminalManager
    participant PTY as node-pty
    participant Shell as System Shell
    participant Claude as Claude Code

    UI->>API: terminal.create(options)
    API->>TM: Create PTY
    TM->>PTY: spawn(shell, args, options)
    PTY->>Shell: Start shell process

    UI->>API: terminal.invokeClaude(sessionId)
    API->>TM: Inject Claude command
    TM->>PTY: write('claude\\r')
    PTY->>Shell: Execute command
    Shell->>Claude: Start Claude Code

    loop Interactive Session
        Claude->>PTY: Output
        PTY->>TM: onData callback
        TM->>UI: webContents.send('terminal:output')

        UI->>API: terminal.input(data)
        API->>TM: Forward to PTY
        TM->>PTY: write(data)
        PTY->>Claude: User input
    end
```

### Terminal Event Handling

```mermaid
flowchart TB
    subgraph Events["Terminal Events"]
        Output[terminal:output]
        Exit[terminal:exit]
        Title[terminal:titleChange]
        Session[terminal:claudeSession]
        RateLimit[terminal:rateLimit]
        OAuth[terminal:oauthToken]
    end

    subgraph Handlers["Event Handlers"]
        Display[Update display]
        Cleanup[Cleanup session]
        Tab[Update tab title]
        Store[Store session ID]
        Modal[Show rate limit modal]
        Auth[Store OAuth token]
    end

    Output --> Display
    Exit --> Cleanup
    Title --> Tab
    Session --> Store
    RateLimit --> Modal
    OAuth --> Auth

    style Events fill:#e3f2fd,stroke:#1976d2
    style Handlers fill:#fff3e0,stroke:#f57c00
```

## File Watcher Integration

The file watcher monitors spec directories for implementation plan changes.

### Watcher Flow

```mermaid
sequenceDiagram
    participant Task as Task Start
    participant FW as FileWatcher
    participant FS as File System
    participant Handler as Change Handler
    participant IPC as IPC Bridge
    participant Store as Zustand Store

    Task->>FW: watch(taskId, specDir)
    FW->>FS: chokidar.watch(planPath)

    loop File Changes
        FS->>FW: 'change' event
        FW->>Handler: Read and parse JSON
        Handler->>Handler: Validate plan structure
        Handler->>FW: emit('progress', plan)
        FW->>IPC: webContents.send('task:progress')
        IPC->>Store: Update task subtasks
    end

    Task->>FW: unwatch(taskId)
    FW->>FS: Stop watching
```

## Error Handling Patterns

### Error Propagation

```mermaid
flowchart TB
    subgraph Sources["Error Sources"]
        Process[Process Error]
        Parse[Parse Error]
        IPC[IPC Error]
        Auth[Auth Error]
        RateLimit[Rate Limit]
    end

    subgraph Handling["Error Handling"]
        Detect[Error Detection]
        Classify[Error Classification]
        Format[Format Error]
    end

    subgraph Response["Response Actions"]
        Emit[Emit to UI]
        Retry[Automatic Retry]
        Modal[Show Modal]
        Log[Console Log]
    end

    Sources --> Handling
    Handling --> Response

    style Sources fill:#fce4ec,stroke:#e91e63
    style Handling fill:#fff3e0,stroke:#f57c00
    style Response fill:#e3f2fd,stroke:#1976d2
```

### Error Response Patterns

| Error Type | Detection | Response |
|------------|-----------|----------|
| **Rate Limit** | Output pattern matching | Auto-swap or modal |
| **Auth Failure** | Output pattern matching | Auth modal |
| **Process Crash** | Exit code != 0 | Error notification |
| **IPC Timeout** | Promise rejection | Error toast |
| **Parse Error** | JSON.parse failure | Fallback handling |

## Security Considerations

### Context Isolation

```mermaid
flowchart TB
    subgraph Renderer["Renderer Process"]
        React[React App]
        API[window.electronAPI]
    end

    subgraph Preload["Preload Script"]
        Bridge[contextBridge]
        Sanitize[Input Sanitization]
    end

    subgraph Main["Main Process"]
        Validate[Validation Layer]
        Handlers[IPC Handlers]
        Core[Core Logic]
    end

    React -->|"Limited API"| API
    API -->|"Secure Bridge"| Bridge
    Bridge -->|"Validated Input"| Validate
    Validate --> Handlers
    Handlers --> Core

    style Renderer fill:#fce4ec,stroke:#e91e63
    style Preload fill:#fff3e0,stroke:#f57c00
    style Main fill:#e8f5e9,stroke:#4caf50
```

### Security Layers

| Layer | Protection |
|-------|------------|
| **Context Isolation** | Renderer cannot access Node.js APIs |
| **Preload Bridge** | Only exposed APIs available to renderer |
| **Input Validation** | All IPC inputs validated before processing |
| **Path Sanitization** | Python paths validated before spawning |
| **Credential Isolation** | OAuth tokens stored securely by profile |

## Performance Optimizations

### Streaming Efficiency

- **Buffered Output**: Lines buffered until complete before processing
- **Sequence Numbers**: Events ordered by sequence for consistent UI updates
- **Debounced Updates**: File watcher debounces rapid changes
- **Lazy Parsing**: Phase events parsed only when markers detected

### Resource Management

- **Process Tracking**: All spawned processes tracked for cleanup
- **Event Cleanup**: IPC listeners removed on component unmount
- **Watcher Cleanup**: File watchers stopped when tasks complete
- **Memory Limits**: Output buffers limited to prevent memory leaks

## Next Steps

- [Architecture Overview](./overview.md) - High-level system architecture
- [Backend Architecture](./backend.md) - Python agent system details
- [Frontend Architecture](./frontend.md) - Electron application structure
