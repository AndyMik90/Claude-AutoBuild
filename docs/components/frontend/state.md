# State Management

The Auto-Claude frontend uses [Zustand](https://github.com/pmndrs/zustand) for state management, providing a lightweight, performant alternative to Redux. Stores are organized by domain and follow consistent patterns for actions, selectors, and IPC integration.

## State Management Architecture

```mermaid
flowchart TB
    subgraph ZustandStores["Zustand Store Layer"]
        direction TB
        ProjectStore[projectStore<br/>Projects & Tabs]
        TaskStore[taskStore<br/>Tasks & Subtasks]
        SettingsStore[settingsStore<br/>App Settings]
        TerminalStore[terminalStore<br/>Terminal Sessions]
        ContextStore[contextStore<br/>Project Context]
        IdeationStore[ideationStore<br/>AI Ideas]
        RoadmapStore[roadmapStore<br/>Feature Roadmap]
        RateLimitStore[rateLimitStore<br/>Rate Limits]
        ChangelogStore[changelogStore<br/>Changelogs]
        InsightsStore[insightsStore<br/>AI Chat]

        subgraph GitHubStores["GitHub Store Module"]
            IssuesStore[issuesStore]
            PRReviewStore[prReviewStore]
            InvestigationStore[investigationStore]
            SyncStatusStore[syncStatusStore]
        end
    end

    subgraph ReactLayer["React Component Layer"]
        Components[React Components]
        Hooks[Custom Hooks]
    end

    subgraph ElectronLayer["Electron IPC Layer"]
        ElectronAPI[window.electronAPI]
        MainProcess[Main Process]
    end

    Components -->|useStore hooks| ZustandStores
    Hooks -->|useStore hooks| ZustandStores
    ZustandStores -->|IPC calls| ElectronAPI
    ElectronAPI -->|ipcRenderer| MainProcess
    MainProcess -->|IPC events| ElectronAPI
    ElectronAPI -->|event listeners| Hooks

    style ZustandStores fill:#e3f2fd,stroke:#1976d2
    style GitHubStores fill:#e8f5e9,stroke:#4caf50
    style ReactLayer fill:#fff3e0,stroke:#f57c00
    style ElectronLayer fill:#f3e5f5,stroke:#9c27b0
```

## Store Inventory

| Store | Purpose | Key State | Key Actions |
|-------|---------|-----------|-------------|
| `projectStore` | Project and tab management | `projects`, `openProjectIds`, `activeProjectId` | `openProjectTab`, `closeProjectTab`, `setActiveProject` |
| `taskStore` | Task lifecycle management | `tasks`, `selectedTaskId`, `isLoading` | `addTask`, `updateTask`, `updateTaskStatus` |
| `settingsStore` | Application settings | `settings`, `isLoading` | `setSettings`, `updateSettings` |
| `terminalStore` | Terminal session management | `terminals`, `activeTerminalId` | `addTerminal`, `removeTerminal`, `setClaudeMode` |
| `contextStore` | Project context and memory | `projectIndex`, `memoryStatus`, `searchResults` | `setProjectIndex`, `setSearchResults` |
| `ideationStore` | AI-powered ideation | `session`, `generationStatus`, `typeStates` | `setSession`, `addIdeasForType`, `dismissIdea` |
| `roadmapStore` | Feature roadmap | `roadmap`, `generationStatus` | `setRoadmap`, `updateFeatureStatus`, `reorderFeatures` |
| `rateLimitStore` | Rate limit modals | `isModalOpen`, `rateLimitInfo` | `showRateLimitModal`, `hideRateLimitModal` |
| `changelogStore` | Release changelogs | `changelog`, `generationStatus` | `setChangelog`, `setGenerationStatus` |
| `insightsStore` | AI chat sessions | `messages`, `isLoading` | `addMessage`, `clearMessages` |
| `fileExplorerStore` | File tree browser | `files`, `expandedFolders` | `loadDirectory`, `toggleFolder` |
| `claudeProfileStore` | Claude API profile | `profile`, `rateLimit` | `setProfile`, `setRateLimit` |

### GitHub Store Module

The GitHub integration uses a modular store architecture:

```mermaid
flowchart LR
    subgraph GitHubModule["github/ Store Module"]
        Index[index.ts<br/>Module Export]
        Issues[issues-store<br/>Issue Data & Filters]
        PRReview[pr-review-store<br/>PR Review State]
        Investigation[investigation-store<br/>Issue Investigation]
        SyncStatus[sync-status-store<br/>Connection Status]
    end

    subgraph Exports["Module Exports"]
        useIssuesStore[useIssuesStore]
        usePRReviewStore[usePRReviewStore]
        useInvestigationStore[useInvestigationStore]
        useSyncStatusStore[useSyncStatusStore]
        initializeGitHubListeners[initializeGitHubListeners]
    end

    Index --> Issues
    Index --> PRReview
    Index --> Investigation
    Index --> SyncStatus

    Issues --> useIssuesStore
    PRReview --> usePRReviewStore
    Investigation --> useInvestigationStore
    SyncStatus --> useSyncStatusStore
    Index --> initializeGitHubListeners

    style GitHubModule fill:#e8f5e9,stroke:#4caf50
    style Exports fill:#fff3e0,stroke:#f57c00
```

## Core Data Flow Patterns

### Component-Store-IPC Data Flow

```mermaid
sequenceDiagram
    participant C as React Component
    participant S as Zustand Store
    participant API as window.electronAPI
    participant M as Main Process
    participant FS as File System

    Note over C,FS: Read Operation
    C->>S: dispatch loadTasks(projectId)
    S->>S: setLoading(true)
    S->>API: getTasks(projectId)
    API->>M: ipcMain.handle('get-tasks')
    M->>FS: Read spec files
    FS-->>M: Task data
    M-->>API: IPCResult<Task[]>
    API-->>S: result
    S->>S: setTasks(tasks)
    S->>S: setLoading(false)
    S-->>C: Re-render with tasks

    Note over C,FS: Write Operation
    C->>S: dispatch createTask(...)
    S->>API: createTask(projectId, title, desc)
    API->>M: ipcMain.handle('create-task')
    M->>FS: Write spec file
    FS-->>M: success
    M-->>API: IPCResult<Task>
    API-->>S: result
    S->>S: addTask(task)
    S-->>C: Re-render with new task
```

### Real-Time Event Updates

```mermaid
sequenceDiagram
    participant M as Main Process
    participant API as window.electronAPI
    participant H as useIpcListeners Hook
    participant S as Zustand Store
    participant C as React Component

    Note over M,C: Event-Driven Updates
    M->>API: webContents.send('task-progress', taskId, plan)
    API->>H: onTaskProgress callback
    H->>S: updateTaskFromPlan(taskId, plan)
    S->>S: Update state immutably
    S-->>C: Re-render with updates

    M->>API: webContents.send('task-status-change', taskId, status)
    API->>H: onTaskStatusChange callback
    H->>S: updateTaskStatus(taskId, status)
    S->>S: Update state immutably
    S-->>C: Re-render with new status
```

## Store Patterns

### Standard Store Structure

All stores follow a consistent pattern:

```mermaid
classDiagram
    class ZustandStore {
        +State data fields
        +isLoading: boolean
        +error: string | null
        +setData(data) void
        +updateData(updates) void
        +setLoading(loading) void
        +setError(error) void
        +clearAll() void
    }

    class AsyncAction {
        +loadData(id) Promise~void~
        +saveData(data) Promise~boolean~
        +deleteData(id) Promise~boolean~
    }

    class Selector {
        +getById(id) T | undefined
        +getFiltered(predicate) T[]
        +getStats() Stats
    }

    ZustandStore <|-- AsyncAction : exports
    ZustandStore <|-- Selector : exports
```

### State Immutability Pattern

```typescript
// Store definition with immutable updates
export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],

  // Immutable array update
  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...updates } : t
      )
    })),

  // Selector using get()
  getSelectedTask: () => {
    const state = get();
    return state.tasks.find((t) => t.id === state.selectedTaskId);
  }
}));
```

## Task Store Deep Dive

The task store manages the complete task lifecycle:

```mermaid
stateDiagram-v2
    [*] --> backlog: createTask()

    backlog --> in_progress: startTask()
    in_progress --> backlog: stopTask()

    in_progress --> ai_review: All subtasks complete
    in_progress --> human_review: Subtask failed

    ai_review --> done: QA passes
    ai_review --> human_review: QA fails

    human_review --> done: User approves
    human_review --> in_progress: User requests changes

    done --> [*]: archiveTasks()

    state in_progress {
        [*] --> planning
        planning --> coding
        coding --> qa_review
        qa_review --> qa_fixing
        qa_fixing --> qa_review
        qa_review --> [*]
    }
```

### Task Store State

```mermaid
flowchart TB
    subgraph TaskState["Task Store State"]
        Tasks[tasks: Task[]]
        SelectedId[selectedTaskId: string | null]
        Loading[isLoading: boolean]
        Error[error: string | null]
    end

    subgraph TaskActions["Actions"]
        SetTasks[setTasks]
        AddTask[addTask]
        UpdateTask[updateTask]
        UpdateStatus[updateTaskStatus]
        UpdateFromPlan[updateTaskFromPlan]
        UpdateProgress[updateExecutionProgress]
        AppendLog[appendLog]
        SelectTask[selectTask]
        ClearTasks[clearTasks]
    end

    subgraph Selectors["Selectors"]
        GetSelected[getSelectedTask]
        GetByStatus[getTasksByStatus]
    end

    subgraph AsyncActions["Async Actions (exported)"]
        LoadTasks[loadTasks]
        CreateTask[createTask]
        StartTask[startTask]
        StopTask[stopTask]
        SubmitReview[submitReview]
        PersistStatus[persistTaskStatus]
        DeleteTask[deleteTask]
        ArchiveTasks[archiveTasks]
        RecoverStuck[recoverStuckTask]
    end

    TaskActions --> TaskState
    Selectors --> TaskState
    AsyncActions --> TaskActions
    AsyncActions --> ElectronAPI[window.electronAPI]

    style TaskState fill:#e3f2fd,stroke:#1976d2
    style TaskActions fill:#e8f5e9,stroke:#4caf50
    style Selectors fill:#fff3e0,stroke:#f57c00
    style AsyncActions fill:#f3e5f5,stroke:#9c27b0
```

## Project Store Deep Dive

The project store manages multi-project tabs:

```mermaid
flowchart TB
    subgraph ProjectState["Project Store State"]
        Projects[projects: Project[]]
        SelectedId[selectedProjectId: string | null]

        subgraph TabState["Tab State"]
            OpenIds[openProjectIds: string[]]
            ActiveId[activeProjectId: string | null]
            TabOrder[tabOrder: string[]]
        end
    end

    subgraph TabActions["Tab Management"]
        OpenTab[openProjectTab]
        CloseTab[closeProjectTab]
        SetActive[setActiveProject]
        Reorder[reorderTabs]
        Restore[restoreTabState]
    end

    subgraph Persistence["Persistence"]
        SaveToMain[saveTabStateToMain<br/>Debounced IPC]
        LoadFromMain[getTabState IPC]
    end

    TabActions --> TabState
    TabActions --> Persistence
    Persistence --> MainProcess[Main Process Storage]

    style ProjectState fill:#e3f2fd,stroke:#1976d2
    style TabState fill:#fff3e0,stroke:#f57c00
    style Persistence fill:#f3e5f5,stroke:#9c27b0
```

### Tab State Persistence Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Component
    participant S as projectStore
    participant D as Debounce Timer
    participant API as electronAPI
    participant M as Main Process

    U->>C: Click project tab
    C->>S: openProjectTab(id)
    S->>S: Update openProjectIds, tabOrder
    S->>D: saveTabStateToMain()
    Note over D: 100ms debounce
    D->>API: saveTabState(state)
    API->>M: ipcMain.handle('save-tab-state')
    M->>M: Write to storage file

    Note over U,M: App Restart
    M->>API: getTabState()
    API->>S: Restore tab state
    S->>S: setState(openProjectIds, tabOrder, activeProjectId)
    S-->>C: Re-render with tabs
```

## Terminal Store Deep Dive

The terminal store manages PTY terminal sessions:

```mermaid
flowchart TB
    subgraph TerminalState["Terminal Store State"]
        Terminals[terminals: Terminal[]]
        ActiveId[activeTerminalId: string | null]
        MaxTerminals[maxTerminals: 12]
        HasRestored[hasRestoredSessions: boolean]
    end

    subgraph TerminalFields["Terminal Object"]
        Id[id: string]
        Title[title: string]
        Status[status: TerminalStatus]
        CWD[cwd: string]
        ClaudeMode[isClaudeMode: boolean]
        ClaudeSession[claudeSessionId: string]
        TaskId[associatedTaskId: string]
        ProjectPath[projectPath: string]
    end

    subgraph Actions["Actions"]
        Add[addTerminal]
        AddRestored[addRestoredTerminal]
        Remove[removeTerminal]
        SetStatus[setTerminalStatus]
        SetClaude[setClaudeMode]
        Clear[clearAllTerminals]
    end

    subgraph BufferMgr["Buffer Manager"]
        BufferMgr_Singleton[terminalBufferManager<br/>Singleton]
        Get[get(id)]
        Set[set(id, data)]
        Dispose[dispose(id)]
    end

    TerminalFields --> Terminals
    Actions --> TerminalState
    Add --> BufferMgr_Singleton
    Remove --> BufferMgr_Singleton

    style TerminalState fill:#e3f2fd,stroke:#1976d2
    style TerminalFields fill:#f5f5f5,stroke:#9e9e9e
    style BufferMgr fill:#e8f5e9,stroke:#4caf50
```

### Terminal Status State Machine

```mermaid
stateDiagram-v2
    [*] --> idle: addTerminal()
    idle --> running: PTY spawned
    running --> claude_active: setClaudeMode(true)
    claude_active --> running: setClaudeMode(false)
    running --> exited: PTY exit
    claude_active --> exited: PTY exit
    exited --> [*]: removeTerminal()
```

## Ideation Store Deep Dive

The ideation store manages AI-powered feature suggestions:

```mermaid
flowchart TB
    subgraph IdeationState["Ideation Store State"]
        Session[session: IdeationSession | null]
        Status[generationStatus: IdeationGenerationStatus]
        Config[config: IdeationConfig]
        TypeStates[typeStates: Record&lt;IdeationType, IdeationTypeState&gt;]
        IsGenerating[isGenerating: boolean]
        Logs[logs: string[]]
        Selected[selectedIds: Set&lt;string&gt;]
    end

    subgraph IdeationTypes["Ideation Types"]
        CodeImp[code_improvements]
        UIUX[ui_ux_improvements]
        Docs[documentation_gaps]
        Security[security_hardening]
        Perf[performance_optimizations]
        Quality[code_quality]
    end

    subgraph TypeStateFlow["Type State Machine"]
        Pending[pending]
        Generating[generating]
        Completed[completed]
        Failed[failed]
    end

    Pending --> Generating: initializeTypeStates
    Generating --> Completed: addIdeasForType
    Generating --> Failed: onIdeationTypeFailed

    IdeationTypes --> TypeStates

    style IdeationState fill:#e3f2fd,stroke:#1976d2
    style IdeationTypes fill:#e8f5e9,stroke:#4caf50
    style TypeStateFlow fill:#fff3e0,stroke:#f57c00
```

### Parallel Ideation Generation

```mermaid
sequenceDiagram
    participant U as User
    participant S as ideationStore
    participant API as electronAPI
    participant B as Backend Agent

    U->>S: generateIdeation(projectId)
    S->>S: clearSession, initializeTypeStates
    S->>API: generateIdeation(projectId, config)
    API->>B: Start parallel generation

    par Parallel Type Generation
        B->>API: onIdeationTypeComplete('code_improvements', ideas)
        API->>S: addIdeasForType('code_improvements', ideas)
    and
        B->>API: onIdeationTypeComplete('ui_ux_improvements', ideas)
        API->>S: addIdeasForType('ui_ux_improvements', ideas)
    and
        B->>API: onIdeationTypeComplete('security_hardening', ideas)
        API->>S: addIdeasForType('security_hardening', ideas)
    end

    B->>API: onIdeationComplete(session)
    API->>S: setSession(session), setIsGenerating(false)
```

## Roadmap Store Deep Dive

The roadmap store manages feature planning:

```mermaid
flowchart TB
    subgraph RoadmapState["Roadmap Store State"]
        Roadmap[roadmap: Roadmap | null]
        CompetitorAnalysis[competitorAnalysis: CompetitorAnalysis | null]
        GenStatus[generationStatus: RoadmapGenerationStatus]
        CurrentProject[currentProjectId: string | null]
    end

    subgraph Features["Feature Management"]
        FeatureList[features: RoadmapFeature[]]
        Phases[phases: RoadmapPhase[]]
    end

    subgraph DragDrop["Drag & Drop Actions"]
        ReorderFeatures[reorderFeatures<br/>Within Phase]
        UpdatePhase[updateFeaturePhase<br/>Between Phases]
        AddFeature[addFeature<br/>New Feature]
    end

    subgraph StatusFlow["Feature Status Flow"]
        UnderReview[under_review]
        Planned[planned]
        InProgress[in_progress]
        Done[done]
    end

    Features --> Roadmap
    DragDrop --> FeatureList
    UnderReview --> Planned --> InProgress --> Done

    style RoadmapState fill:#e3f2fd,stroke:#1976d2
    style DragDrop fill:#e8f5e9,stroke:#4caf50
    style StatusFlow fill:#fff3e0,stroke:#f57c00
```

## React Hooks

### useIpcListeners Hook

The primary hook for setting up IPC event listeners:

```mermaid
flowchart TB
    subgraph useIpcListeners["useIpcListeners Hook"]
        SetupEffect[useEffect Setup]

        subgraph TaskListeners["Task Listeners"]
            OnProgress[onTaskProgress]
            OnError[onTaskError]
            OnLog[onTaskLog]
            OnStatus[onTaskStatusChange]
            OnExecProgress[onTaskExecutionProgress]
        end

        subgraph RoadmapListeners["Roadmap Listeners"]
            OnRoadmapProgress[onRoadmapProgress]
            OnRoadmapComplete[onRoadmapComplete]
            OnRoadmapError[onRoadmapError]
            OnRoadmapStopped[onRoadmapStopped]
        end

        subgraph RateLimitListeners["Rate Limit Listeners"]
            OnTerminalRateLimit[onTerminalRateLimit]
            OnSDKRateLimit[onSDKRateLimit]
        end

        CleanupFn[Cleanup Function]
    end

    subgraph Stores["Target Stores"]
        TaskStore[taskStore]
        RoadmapStore[roadmapStore]
        RateLimitStore[rateLimitStore]
    end

    SetupEffect --> TaskListeners
    SetupEffect --> RoadmapListeners
    SetupEffect --> RateLimitListeners

    TaskListeners --> TaskStore
    RoadmapListeners --> RoadmapStore
    RateLimitListeners --> RateLimitStore

    SetupEffect --> CleanupFn

    style useIpcListeners fill:#e3f2fd,stroke:#1976d2
    style TaskListeners fill:#e8f5e9,stroke:#4caf50
    style RoadmapListeners fill:#fff3e0,stroke:#f57c00
    style RateLimitListeners fill:#fce4ec,stroke:#e91e63
```

### useVirtualizedTree Hook

Hook for virtualized file tree rendering:

```mermaid
flowchart TB
    subgraph useVirtualizedTree["useVirtualizedTree Hook"]
        Input[rootPath: string]

        subgraph StoreAccess["Store Access"]
            ExpandedFolders[expandedFolders: Set]
            Files[files: Map]
            IsLoading[isLoading: Map]
            ToggleFolder[toggleFolder action]
            LoadDirectory[loadDirectory action]
        end

        subgraph Computation["Memoized Computation"]
            FlattenTree[flattenTree function]
            FlattenedNodes[flattenedNodes: FlattenedNode[]]
        end

        subgraph Output["Return Value"]
            Nodes[flattenedNodes array]
            Count[count: number]
            HandleToggle[handleToggle function]
            IsRootLoading[isRootLoading: boolean]
            HasRootFiles[hasRootFiles: boolean]
        end
    end

    subgraph FlattenedNode["FlattenedNode Type"]
        Node[node: FileNode]
        Depth[depth: number]
        IsExpanded[isExpanded: boolean]
        NodeIsLoading[isLoading: boolean]
        Key[key: string]
    end

    Input --> StoreAccess
    StoreAccess --> Computation
    Computation --> Output
    FlattenedNodes --> FlattenedNode

    style useVirtualizedTree fill:#e3f2fd,stroke:#1976d2
    style Computation fill:#e8f5e9,stroke:#4caf50
    style Output fill:#fff3e0,stroke:#f57c00
```

### Hook Index Exports

```mermaid
flowchart LR
    subgraph HooksModule["hooks/index.ts"]
        Index[index.ts]
    end

    subgraph Hooks["Exported Hooks"]
        useIpcListeners[useIpcListeners<br/>IPC event listeners]
        useVirtualizedTree[useVirtualizedTree<br/>File tree virtualization]
    end

    subgraph useIpcHooks["useIpc.ts Additional Exports"]
        useAppSettings[useAppSettings<br/>Settings management]
        useAppVersion[useAppVersion<br/>App version]
    end

    Index --> Hooks
    useIpcListeners --> useIpcHooks

    style HooksModule fill:#e3f2fd,stroke:#1976d2
    style Hooks fill:#e8f5e9,stroke:#4caf50
    style useIpcHooks fill:#fff3e0,stroke:#f57c00
```

## Store Relationships

```mermaid
flowchart TB
    subgraph CoreStores["Core Stores"]
        ProjectStore[projectStore<br/>Project Selection]
        TaskStore[taskStore<br/>Task Management]
        SettingsStore[settingsStore<br/>App Config]
    end

    subgraph FeatureStores["Feature Stores"]
        ContextStore[contextStore]
        IdeationStore[ideationStore]
        RoadmapStore[roadmapStore]
        ChangelogStore[changelogStore]
        InsightsStore[insightsStore]
    end

    subgraph UIStores["UI State Stores"]
        TerminalStore[terminalStore]
        RateLimitStore[rateLimitStore]
        FileExplorerStore[fileExplorerStore]
    end

    subgraph IntegrationStores["Integration Stores"]
        GitHubStores[GitHub Stores]
        ClaudeProfileStore[claudeProfileStore]
    end

    ProjectStore -->|selectedProjectId| TaskStore
    ProjectStore -->|selectedProjectId| ContextStore
    ProjectStore -->|selectedProjectId| IdeationStore
    ProjectStore -->|selectedProjectId| RoadmapStore
    ProjectStore -->|selectedProjectId| TerminalStore

    TaskStore -->|task execution| TerminalStore
    IdeationStore -->|create task| TaskStore
    RoadmapStore -->|linkedSpecId| TaskStore

    SettingsStore -->|globalClaudeOAuthToken| ClaudeProfileStore
    SettingsStore -->|theme| UIStores

    style CoreStores fill:#e3f2fd,stroke:#1976d2
    style FeatureStores fill:#e8f5e9,stroke:#4caf50
    style UIStores fill:#fff3e0,stroke:#f57c00
    style IntegrationStores fill:#f3e5f5,stroke:#9c27b0
```

## IPC Integration Pattern

### Store-IPC Contract

```mermaid
classDiagram
    class StoreAsyncAction {
        <<pattern>>
        +getState() StoreState
        +setState(partial) void
        +subscribe(listener) Unsubscribe
    }

    class IPCResult~T~ {
        +success: boolean
        +data?: T
        +error?: string
    }

    class ElectronAPI {
        +getProjects() Promise~IPCResult~Project[]~~
        +getTasks(projectId) Promise~IPCResult~Task[]~~
        +createTask(args) Promise~IPCResult~Task~~
        +onTaskProgress(callback) Cleanup
        +onTaskStatusChange(callback) Cleanup
    }

    class AsyncActionPattern {
        <<pattern>>
        +store.setLoading(true)
        +result = await electronAPI.method()
        +if result.success then store.setData()
        +else store.setError()
        +store.setLoading(false)
    }

    StoreAsyncAction --> IPCResult : returns
    StoreAsyncAction --> ElectronAPI : calls
    AsyncActionPattern --> StoreAsyncAction : implements
```

### Event Listener Setup Pattern

```mermaid
sequenceDiagram
    participant App as App.tsx
    participant Hook as useIpcListeners
    participant API as electronAPI
    participant Store as Zustand Store

    App->>Hook: Call hook on mount
    Hook->>API: onTaskProgress(callback)
    API-->>Hook: cleanup function
    Hook->>API: onTaskError(callback)
    API-->>Hook: cleanup function
    Hook->>API: onTaskStatusChange(callback)
    API-->>Hook: cleanup function

    Note over Hook: Store cleanup functions

    loop Event Reception
        API->>Hook: Invoke callback with data
        Hook->>Store: dispatch action
        Store-->>App: Re-render
    end

    App->>Hook: Component unmount
    Hook->>API: Call all cleanup functions
```

## Performance Considerations

### Selector Optimization

```mermaid
flowchart TB
    subgraph BadPattern["Anti-Pattern: Inline Selector"]
        Component1[Component]
        Store1[Store]
        FullState[Full State Object]
        Rerender1[Re-render on ANY change]

        Component1 -->|useStore state => state| Store1
        Store1 --> FullState
        FullState --> Rerender1
    end

    subgraph GoodPattern["Best Practice: Specific Selector"]
        Component2[Component]
        Store2[Store]
        SpecificField[Specific Field Only]
        Rerender2[Re-render only when field changes]

        Component2 -->|useStore state => state.tasks| Store2
        Store2 --> SpecificField
        SpecificField --> Rerender2
    end

    style BadPattern fill:#ffebee,stroke:#c62828
    style GoodPattern fill:#e8f5e9,stroke:#2e7d32
```

### Debounced Persistence

```mermaid
sequenceDiagram
    participant U as User Action
    participant S as Store
    participant D as Debounce Timer
    participant API as IPC

    U->>S: Tab change 1
    S->>D: Schedule save (100ms)
    U->>S: Tab change 2 (within 100ms)
    D->>D: Reset timer
    U->>S: Tab change 3 (within 100ms)
    D->>D: Reset timer
    Note over D: 100ms elapsed
    D->>API: saveTabState(finalState)
```

## Related Documentation

- [Renderer Components](./renderer.md) - React component architecture
- [IPC Handlers](./ipc-handlers.md) - Main process IPC handlers
- [Main Process](./main-process.md) - Electron main process
- [Frontend Architecture](../architecture/frontend.md) - Overall frontend design
