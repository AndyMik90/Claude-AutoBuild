# IPC Handlers

The IPC (Inter-Process Communication) handlers module provides the communication layer between Electron's main process and renderer process. It organizes all IPC handlers by domain into separate modules for maintainability and clear separation of concerns.

## Module Overview

The IPC handlers are organized into domain-specific modules, each handling a specific area of functionality:

```mermaid
flowchart TB
    subgraph Setup["setupIpcHandlers()"]
        Init[Initialize Services]
    end

    subgraph Core["Core Handlers"]
        Project[Project Handlers]
        Task[Task Handlers]
        Terminal[Terminal Handlers]
        AgentEvents[Agent Events]
        Settings[Settings Handlers]
        File[File Handlers]
    end

    subgraph Features["Feature Handlers"]
        Roadmap[Roadmap Handlers]
        Context[Context Handlers]
        Env[Environment Handlers]
        Changelog[Changelog Handlers]
        Ideation[Ideation Handlers]
        Insights[Insights Handlers]
    end

    subgraph Integrations["Integration Handlers"]
        Linear[Linear Handlers]
        GitHub[GitHub Handlers]
        Memory[Memory Handlers]
    end

    subgraph System["System Handlers"]
        AutoBuild[Auto-Build Source]
        AppUpdate[App Update Handlers]
    end

    Setup --> Core
    Setup --> Features
    Setup --> Integrations
    Setup --> System

    style Setup fill:#e3f2fd,stroke:#1976d2
    style Core fill:#e8f5e9,stroke:#4caf50
    style Features fill:#fff3e0,stroke:#f57c00
    style Integrations fill:#fce4ec,stroke:#e91e63
    style System fill:#f3e5f5,stroke:#9c27b0
```

## Module Structure

```
apps/frontend/src/main/ipc-handlers/
├── index.ts                    # Main setup function, exports all handlers
├── project-handlers.ts         # Project CRUD, Git operations, Python env
├── task-handlers.ts            # Task entry point (delegates to task/)
├── task/                       # Task module subdirectory
│   ├── index.ts               # Task handler registration
│   ├── crud-handlers.ts       # Create, Read, Update, Delete
│   ├── execution-handlers.ts  # Start, Stop, Review, Status
│   ├── worktree-handlers.ts   # Git worktree operations
│   ├── logs-handlers.ts       # Task log management
│   └── shared.ts              # Shared utilities
├── terminal-handlers.ts        # Terminal/PTY management, Claude profiles
├── agent-events-handlers.ts    # Event forwarding to renderer
├── settings-handlers.ts        # App settings, dialogs
├── file-handlers.ts            # File explorer operations
├── roadmap-handlers.ts         # Roadmap generation/management
├── context-handlers.ts         # Context entry point (delegates to context/)
├── context/                    # Context module subdirectory
│   ├── index.ts               # Context handler registration
│   ├── memory-status-handlers.ts
│   ├── memory-data-handlers.ts
│   └── project-context-handlers.ts
├── env-handlers.ts             # Environment configuration
├── linear-handlers.ts          # Linear integration
├── github-handlers.ts          # GitHub entry point (delegates to github/)
├── github/                     # GitHub module subdirectory
│   ├── index.ts               # GitHub handler registration
│   ├── repository-handlers.ts
│   ├── issue-handlers.ts
│   ├── investigation-handlers.ts
│   ├── import-handlers.ts
│   ├── release-handlers.ts
│   ├── utils.ts
│   ├── spec-utils.ts
│   └── types.ts
├── ideation-handlers.ts        # Ideation entry point (delegates to ideation/)
├── ideation/                   # Ideation module subdirectory
├── changelog-handlers.ts       # Changelog generation
├── insights-handlers.ts        # AI insights/chat
├── memory-handlers.ts          # Memory infrastructure (Graphiti/LadybugDB)
├── autobuild-source-handlers.ts # Source updates
├── app-update-handlers.ts      # Electron auto-updates
└── utils.ts                    # Shared utility functions
```

## Communication Architecture

### IPC Communication Flow

```mermaid
sequenceDiagram
    participant R as Renderer Process
    participant P as Preload Script
    participant M as Main Process
    participant H as IPC Handlers
    participant S as Services

    R->>P: window.api.invoke(channel, data)
    P->>M: ipcRenderer.invoke(channel, data)
    M->>H: ipcMain.handle(channel, handler)
    H->>S: Call service methods
    S-->>H: Service result
    H-->>M: IPCResult<T>
    M-->>P: Response
    P-->>R: Resolved promise

    Note over R,S: Request/Response Pattern (ipcMain.handle)
```

### Event-Based Communication

```mermaid
sequenceDiagram
    participant S as Services/Managers
    participant H as IPC Handlers
    participant M as Main Process
    participant R as Renderer Process

    S->>H: Emit event (e.g., 'log', 'progress')
    H->>M: mainWindow.webContents.send(channel, data)
    M->>R: ipcRenderer.on(channel, callback)
    R->>R: Update UI state

    Note over S,R: Push Pattern (webContents.send)
```

## Handler Registration Flow

```mermaid
flowchart TB
    subgraph Main["Main Process Startup"]
        CreateWindow[Create BrowserWindow]
        GetManagers[Get AgentManager, TerminalManager]
        GetPythonEnv[Get PythonEnvManager]
    end

    subgraph Setup["setupIpcHandlers()"]
        InitNotify[Initialize Notification Service]
        RegProject[Register Project Handlers]
        RegTask[Register Task Handlers]
        RegTerminal[Register Terminal Handlers]
        RegAgent[Register Agent Events]
        RegSettings[Register Settings Handlers]
        RegFile[Register File Handlers]
        RegRoadmap[Register Roadmap Handlers]
        RegContext[Register Context Handlers]
        RegEnv[Register Env Handlers]
        RegLinear[Register Linear Handlers]
        RegGithub[Register GitHub Handlers]
        RegAutoBuild[Register AutoBuild Handlers]
        RegIdeation[Register Ideation Handlers]
        RegChangelog[Register Changelog Handlers]
        RegInsights[Register Insights Handlers]
        RegMemory[Register Memory Handlers]
        RegAppUpdate[Register App Update Handlers]
    end

    Main --> Setup
    CreateWindow --> InitNotify
    GetManagers --> RegProject
    RegProject --> RegTask
    RegTask --> RegTerminal
    RegTerminal --> RegAgent
    RegAgent --> RegSettings
    RegSettings --> RegFile
    RegFile --> RegRoadmap
    RegRoadmap --> RegContext
    RegContext --> RegEnv
    RegEnv --> RegLinear
    RegLinear --> RegGithub
    RegGithub --> RegAutoBuild
    RegAutoBuild --> RegIdeation
    RegIdeation --> RegChangelog
    RegChangelog --> RegInsights
    RegInsights --> RegMemory
    RegMemory --> RegAppUpdate

    style Main fill:#e3f2fd,stroke:#1976d2
    style Setup fill:#e8f5e9,stroke:#4caf50
```

## Core Handlers

### Project Handlers

Manages project lifecycle, Git operations, and Python environment initialization.

```mermaid
flowchart TB
    subgraph ProjectOps["Project Operations"]
        Add[PROJECT_ADD]
        Remove[PROJECT_REMOVE]
        List[PROJECT_LIST]
        UpdateSettings[PROJECT_UPDATE_SETTINGS]
        Initialize[PROJECT_INITIALIZE]
        CheckVersion[PROJECT_CHECK_VERSION]
        HasLocalSource[project:has-local-source]
    end

    subgraph TabState["Tab State"]
        TabGet[TAB_STATE_GET]
        TabSave[TAB_STATE_SAVE]
    end

    subgraph GitOps["Git Operations"]
        GetBranches[GIT_GET_BRANCHES]
        GetCurrentBranch[GIT_GET_CURRENT_BRANCH]
        DetectMain[GIT_DETECT_MAIN_BRANCH]
        CheckStatus[GIT_CHECK_STATUS]
        GitInit[GIT_INITIALIZE]
    end

    subgraph PythonEnv["Python Environment"]
        GetStatus[python-env:get-status]
        Reinit[python-env:reinitialize]
        StatusEvent[python-env:status]
        ErrorEvent[python-env:error]
        ReadyEvent[python-env:ready]
    end

    ProjectStore[(Project Store)]
    PythonManager[Python Env Manager]

    ProjectOps --> ProjectStore
    TabState --> ProjectStore
    GitOps --> Git[Git Commands]
    PythonEnv --> PythonManager

    style ProjectOps fill:#e3f2fd,stroke:#1976d2
    style TabState fill:#fff3e0,stroke:#f57c00
    style GitOps fill:#e8f5e9,stroke:#4caf50
    style PythonEnv fill:#fce4ec,stroke:#e91e63
```

#### Key IPC Channels

| Channel | Type | Description |
|---------|------|-------------|
| `PROJECT_ADD` | handle | Add a new project to the workspace |
| `PROJECT_REMOVE` | handle | Remove a project from the workspace |
| `PROJECT_LIST` | handle | Get all projects with validation |
| `PROJECT_UPDATE_SETTINGS` | handle | Update project-specific settings |
| `PROJECT_INITIALIZE` | handle | Initialize .auto-claude in project |
| `GIT_GET_BRANCHES` | handle | List all git branches |
| `GIT_DETECT_MAIN_BRANCH` | handle | Auto-detect main/master branch |
| `python-env:get-status` | handle | Get Python environment status |
| `python-env:reinitialize` | handle | Reinitialize Python venv |

### Task Handlers

Organized into focused submodules for task management, execution, and worktree operations.

```mermaid
flowchart TB
    subgraph Entry["task-handlers.ts"]
        Register[registerTaskHandlers]
    end

    subgraph CRUD["crud-handlers.ts"]
        TaskGet[TASK_GET]
        TaskGetAll[TASK_GET_ALL]
        TaskCreate[TASK_CREATE]
        TaskDelete[TASK_DELETE]
        TaskUpdateMeta[TASK_UPDATE_METADATA]
    end

    subgraph Execution["execution-handlers.ts"]
        TaskStart[TASK_START]
        TaskStop[TASK_STOP]
        TaskReview[TASK_REVIEW]
        TaskRestart[TASK_RESTART]
        TaskRecovery[TASK_RECOVERY_INFO]
    end

    subgraph Worktree["worktree-handlers.ts"]
        WorktreeStatus[WORKTREE_STATUS]
        WorktreeDiff[WORKTREE_DIFF]
        WorktreeMerge[WORKTREE_MERGE]
        WorktreeDiscard[WORKTREE_DISCARD]
        WorktreeList[WORKTREE_LIST]
    end

    subgraph Logs["logs-handlers.ts"]
        LogsGet[TASK_LOGS_GET]
        LogsWatch[TASK_LOGS_WATCH]
        LogsUnwatch[TASK_LOGS_UNWATCH]
    end

    Entry --> CRUD
    Entry --> Execution
    Entry --> Worktree
    Entry --> Logs

    style Entry fill:#e3f2fd,stroke:#1976d2
    style CRUD fill:#e8f5e9,stroke:#4caf50
    style Execution fill:#fff3e0,stroke:#f57c00
    style Worktree fill:#fce4ec,stroke:#e91e63
    style Logs fill:#f3e5f5,stroke:#9c27b0
```

#### Task Execution Sequence

```mermaid
sequenceDiagram
    participant UI as Renderer
    participant IPC as Task Handlers
    participant AM as Agent Manager
    participant Py as Python Runner
    participant FS as File System

    UI->>IPC: TASK_START(taskId, projectId)
    IPC->>FS: Create worktree (if needed)
    IPC->>AM: startExecution(specId, projectPath)
    AM->>Py: spawn(spec_runner.py)
    AM-->>IPC: Process started
    IPC-->>UI: { success: true }

    loop Execution Loop
        Py->>FS: Update implementation_plan.json
        AM->>IPC: emit('log', taskId, log)
        IPC->>UI: TASK_LOG event
        AM->>IPC: emit('execution-progress', taskId, progress)
        IPC->>UI: TASK_EXECUTION_PROGRESS event
    end

    Py->>AM: Process exit (code)
    AM->>IPC: emit('exit', taskId, code)
    IPC->>UI: TASK_STATUS_CHANGE event
```

### Terminal Handlers

Manages PTY terminals and Claude profile multi-account support.

```mermaid
flowchart TB
    subgraph TerminalOps["Terminal Operations"]
        Create[TERMINAL_CREATE]
        Destroy[TERMINAL_DESTROY]
        Input[TERMINAL_INPUT]
        Resize[TERMINAL_RESIZE]
        InvokeClaude[TERMINAL_INVOKE_CLAUDE]
        ResumeClaude[TERMINAL_RESUME_CLAUDE]
        GenerateName[TERMINAL_GENERATE_NAME]
        CheckAlive[TERMINAL_CHECK_PTY_ALIVE]
    end

    subgraph ProfileOps["Claude Profile Management"]
        ProfilesGet[CLAUDE_PROFILES_GET]
        ProfileSave[CLAUDE_PROFILE_SAVE]
        ProfileDelete[CLAUDE_PROFILE_DELETE]
        ProfileRename[CLAUDE_PROFILE_RENAME]
        ProfileSetActive[CLAUDE_PROFILE_SET_ACTIVE]
        ProfileSwitch[CLAUDE_PROFILE_SWITCH]
        ProfileInit[CLAUDE_PROFILE_INITIALIZE]
        ProfileSetToken[CLAUDE_PROFILE_SET_TOKEN]
    end

    subgraph AutoSwitch["Auto-Switch Settings"]
        AutoSwitchGet[CLAUDE_PROFILE_AUTO_SWITCH_SETTINGS]
        AutoSwitchUpdate[CLAUDE_PROFILE_UPDATE_AUTO_SWITCH]
        FetchUsage[CLAUDE_PROFILE_FETCH_USAGE]
        GetBestProfile[CLAUDE_PROFILE_GET_BEST_PROFILE]
        RetryWithProfile[CLAUDE_RETRY_WITH_PROFILE]
    end

    subgraph Sessions["Session Management"]
        GetSessions[TERMINAL_GET_SESSIONS]
        RestoreSession[TERMINAL_RESTORE_SESSION]
        ClearSessions[TERMINAL_CLEAR_SESSIONS]
        GetDates[TERMINAL_GET_SESSION_DATES]
        GetForDate[TERMINAL_GET_SESSIONS_FOR_DATE]
        RestoreFromDate[TERMINAL_RESTORE_FROM_DATE]
    end

    subgraph Usage["Usage Monitoring"]
        UsageRequest[USAGE_REQUEST]
        UsageUpdated[USAGE_UPDATED]
        ProactiveSwap[PROACTIVE_SWAP_NOTIFICATION]
    end

    TerminalManager[Terminal Manager]
    ProfileManager[Claude Profile Manager]
    UsageMonitor[Usage Monitor]

    TerminalOps --> TerminalManager
    ProfileOps --> ProfileManager
    AutoSwitch --> ProfileManager
    Sessions --> TerminalManager
    Usage --> UsageMonitor

    style TerminalOps fill:#e3f2fd,stroke:#1976d2
    style ProfileOps fill:#e8f5e9,stroke:#4caf50
    style AutoSwitch fill:#fff3e0,stroke:#f57c00
    style Sessions fill:#fce4ec,stroke:#e91e63
    style Usage fill:#f3e5f5,stroke:#9c27b0
```

#### Claude Profile Switch Flow

```mermaid
sequenceDiagram
    participant UI as Renderer
    participant IPC as Terminal Handlers
    participant PM as Profile Manager
    participant TM as Terminal Manager
    participant PTY as PTY Process

    UI->>IPC: CLAUDE_PROFILE_SET_ACTIVE(profileId)
    IPC->>PM: getActiveProfile()
    PM-->>IPC: Previous profile
    IPC->>PM: setActiveProfile(profileId)
    PM-->>IPC: Success

    IPC->>TM: getActiveTerminalIds()
    TM-->>IPC: [terminalId1, terminalId2, ...]

    loop For each terminal in Claude mode
        IPC->>TM: isClaudeMode(terminalId)
        TM-->>IPC: true
        IPC->>TM: switchClaudeProfile(terminalId, profileId)
        TM->>PTY: Send SIGINT / restart Claude
        TM-->>IPC: Switch complete
    end

    IPC-->>UI: { success: true }
```

### Agent Events Handlers

Forwards events from the Agent Manager to the renderer process.

```mermaid
flowchart TB
    subgraph Sources["Event Sources"]
        AM[Agent Manager]
        TG[Title Generator]
        FW[File Watcher]
    end

    subgraph Events["Forwarded Events"]
        Log[TASK_LOG]
        Error[TASK_ERROR]
        RateLimit[CLAUDE_SDK_RATE_LIMIT]
        Exit[Task Exit]
        Progress[TASK_EXECUTION_PROGRESS]
        StatusChange[TASK_STATUS_CHANGE]
        FileProgress[TASK_PROGRESS]
    end

    subgraph Renderer["Renderer Process"]
        UI[React UI]
        Store[State Store]
    end

    AM -->|log| Log
    AM -->|error| Error
    AM -->|sdk-rate-limit| RateLimit
    AM -->|exit| Exit
    AM -->|execution-progress| Progress
    TG -->|sdk-rate-limit| RateLimit
    FW -->|progress| FileProgress
    FW -->|error| Error

    Log --> UI
    Error --> UI
    RateLimit --> UI
    Exit --> StatusChange
    Progress --> StatusChange
    StatusChange --> Store
    FileProgress --> UI

    style Sources fill:#e3f2fd,stroke:#1976d2
    style Events fill:#fff3e0,stroke:#f57c00
    style Renderer fill:#e8f5e9,stroke:#4caf50
```

#### Event Flow for Task Execution

```mermaid
sequenceDiagram
    participant AM as Agent Manager
    participant AE as Agent Events Handler
    participant MW as Main Window
    participant R as Renderer

    AM->>AE: emit('log', taskId, log)
    AE->>MW: webContents.send(TASK_LOG, taskId, log)
    MW->>R: IPC message

    AM->>AE: emit('execution-progress', taskId, progress)
    AE->>AE: Map phase to TaskStatus
    AE->>MW: webContents.send(TASK_EXECUTION_PROGRESS)
    AE->>MW: webContents.send(TASK_STATUS_CHANGE)
    MW->>R: IPC messages

    AM->>AE: emit('exit', taskId, code, processType)
    AE->>AE: Find task in project store
    alt Exit code 0
        AE->>AE: notificationService.notifyReviewNeeded()
    else Non-zero exit
        AE->>AE: notificationService.notifyTaskFailed()
        AE->>MW: webContents.send(TASK_STATUS_CHANGE, 'human_review')
    end
```

### Settings Handlers

Manages application settings, dialog operations, and shell commands.

```mermaid
flowchart TB
    subgraph SettingsOps["Settings Operations"]
        Get[SETTINGS_GET]
        Save[SETTINGS_SAVE]
        GetCLITools[SETTINGS_GET_CLI_TOOLS_INFO]
    end

    subgraph Dialogs["Dialog Operations"]
        SelectDir[DIALOG_SELECT_DIRECTORY]
        CreateProject[DIALOG_CREATE_PROJECT_FOLDER]
        GetDefaultLoc[DIALOG_GET_DEFAULT_PROJECT_LOCATION]
    end

    subgraph AppInfo["App Information"]
        Version[APP_VERSION]
    end

    subgraph Shell["Shell Operations"]
        OpenExternal[SHELL_OPEN_EXTERNAL]
        OpenTerminal[SHELL_OPEN_TERMINAL]
    end

    SettingsFile[(settings.json)]
    ConfigureTools[Configure CLI Tools]

    SettingsOps --> SettingsFile
    Get --> ConfigureTools
    Save --> ConfigureTools
    Dialogs --> Electron[Electron Dialog API]
    Shell --> ShellAPI[Electron Shell API]

    style SettingsOps fill:#e3f2fd,stroke:#1976d2
    style Dialogs fill:#e8f5e9,stroke:#4caf50
    style AppInfo fill:#fff3e0,stroke:#f57c00
    style Shell fill:#fce4ec,stroke:#e91e63
```

### File Handlers

Provides file explorer functionality with smart filtering.

```mermaid
flowchart LR
    subgraph Request
        List[FILE_EXPLORER_LIST]
        DirPath[Directory Path]
    end

    subgraph Processing
        ReadDir[readdir with types]
        Filter[Filter Ignored]
        Sort[Sort Results]
    end

    subgraph Ignored["Ignored Directories"]
        NodeModules[node_modules]
        Git[.git]
        PyCache[__pycache__]
        Dist[dist/build]
        VEnv[.venv/venv]
        Worktrees[.worktrees]
    end

    subgraph Output
        FileNodes[FileNode[]]
    end

    List --> DirPath
    DirPath --> ReadDir
    ReadDir --> Filter
    Filter -.->|Skip| Ignored
    Filter --> Sort
    Sort --> FileNodes

    style Request fill:#e3f2fd,stroke:#1976d2
    style Processing fill:#e8f5e9,stroke:#4caf50
    style Ignored fill:#ffebee,stroke:#f44336
    style Output fill:#fff3e0,stroke:#f57c00
```

## Feature Handlers

### Roadmap Handlers

Manages AI-powered roadmap generation and feature management.

```mermaid
flowchart TB
    subgraph RoadmapOps["Roadmap Operations"]
        Get[ROADMAP_GET]
        GetStatus[ROADMAP_GET_STATUS]
        Generate[ROADMAP_GENERATE]
        Refresh[ROADMAP_REFRESH]
        Stop[ROADMAP_STOP]
        Save[ROADMAP_SAVE]
        UpdateFeature[ROADMAP_UPDATE_FEATURE]
        ConvertToSpec[ROADMAP_CONVERT_TO_SPEC]
    end

    subgraph Events["Roadmap Events"]
        Progress[ROADMAP_PROGRESS]
        Complete[ROADMAP_COMPLETE]
        Error[ROADMAP_ERROR]
        Stopped[ROADMAP_STOPPED]
    end

    subgraph AgentManager["Agent Manager"]
        StartGen[startRoadmapGeneration]
        StopGen[stopRoadmap]
        IsRunning[isRoadmapRunning]
    end

    RoadmapOps -->|Generate| StartGen
    RoadmapOps -->|Stop| StopGen
    RoadmapOps -->|Status| IsRunning
    AgentManager -->|Emit| Events

    style RoadmapOps fill:#e3f2fd,stroke:#1976d2
    style Events fill:#e8f5e9,stroke:#4caf50
    style AgentManager fill:#fff3e0,stroke:#f57c00
```

#### Roadmap Generation Sequence

```mermaid
sequenceDiagram
    participant UI as Renderer
    participant IPC as Roadmap Handlers
    participant AM as Agent Manager
    participant Py as Python Runner

    UI->>IPC: ROADMAP_GENERATE(projectId, enableCompetitor)
    IPC->>IPC: Get feature settings (model, thinking)
    IPC->>AM: startRoadmapGeneration(...)
    IPC->>UI: ROADMAP_PROGRESS (analyzing)

    AM->>Py: spawn(roadmap_runner.py)
    loop Generation Loop
        Py->>AM: emit progress
        AM->>IPC: emit('roadmap-progress')
        IPC->>UI: ROADMAP_PROGRESS
    end

    alt Success
        Py->>AM: Write roadmap.json
        AM->>IPC: emit('roadmap-complete', roadmap)
        IPC->>UI: ROADMAP_COMPLETE
    else Error
        AM->>IPC: emit('roadmap-error', error)
        IPC->>UI: ROADMAP_ERROR
    end
```

### Changelog Handlers

Generates changelogs from completed tasks or git history.

```mermaid
flowchart TB
    subgraph TaskSource["Task-Based Source"]
        GetDoneTasks[CHANGELOG_GET_DONE_TASKS]
        LoadSpecs[CHANGELOG_LOAD_TASK_SPECS]
        SuggestVersion[CHANGELOG_SUGGEST_VERSION]
    end

    subgraph GitSource["Git-Based Source"]
        GetBranches[CHANGELOG_GET_BRANCHES]
        GetTags[CHANGELOG_GET_TAGS]
        GetCommits[CHANGELOG_GET_COMMITS_PREVIEW]
        SuggestFromCommits[CHANGELOG_SUGGEST_VERSION_FROM_COMMITS]
    end

    subgraph Generation["Generation"]
        Generate[CHANGELOG_GENERATE]
        Progress[CHANGELOG_GENERATION_PROGRESS]
        Complete[CHANGELOG_GENERATION_COMPLETE]
        Error[CHANGELOG_GENERATION_ERROR]
    end

    subgraph Output["Output Operations"]
        Save[CHANGELOG_SAVE]
        ReadExisting[CHANGELOG_READ_EXISTING]
        SaveImage[CHANGELOG_SAVE_IMAGE]
        ReadImage[CHANGELOG_READ_LOCAL_IMAGE]
    end

    ChangelogService[Changelog Service]

    TaskSource --> ChangelogService
    GitSource --> ChangelogService
    Generation --> ChangelogService
    Output --> ChangelogService

    style TaskSource fill:#e3f2fd,stroke:#1976d2
    style GitSource fill:#e8f5e9,stroke:#4caf50
    style Generation fill:#fff3e0,stroke:#f57c00
    style Output fill:#fce4ec,stroke:#e91e63
```

### Ideation Handlers

Manages AI-powered idea generation sessions.

```mermaid
flowchart TB
    subgraph SessionMgmt["Session Management"]
        Get[IDEATION_GET]
    end

    subgraph IdeaOps["Idea Operations"]
        UpdateIdea[IDEATION_UPDATE_IDEA]
        Dismiss[IDEATION_DISMISS]
        DismissAll[IDEATION_DISMISS_ALL]
        Archive[IDEATION_ARCHIVE]
        Delete[IDEATION_DELETE]
        DeleteMultiple[IDEATION_DELETE_MULTIPLE]
    end

    subgraph Generation["Generation"]
        Generate[IDEATION_GENERATE]
        Refresh[IDEATION_REFRESH]
        Stop[IDEATION_STOP]
    end

    subgraph Conversion["Task Conversion"]
        ConvertToTask[IDEATION_CONVERT_TO_TASK]
    end

    subgraph Events["Ideation Events"]
        Progress[IDEATION_PROGRESS]
        Log[IDEATION_LOG]
        TypeComplete[IDEATION_TYPE_COMPLETE]
        TypeFailed[IDEATION_TYPE_FAILED]
        Complete[IDEATION_COMPLETE]
        Error[IDEATION_ERROR]
        Stopped[IDEATION_STOPPED]
    end

    IdeationModule[./ideation/ Module]
    AgentManager[Agent Manager]

    SessionMgmt --> IdeationModule
    IdeaOps --> IdeationModule
    Generation --> AgentManager
    Conversion --> IdeationModule
    AgentManager --> Events

    style SessionMgmt fill:#e3f2fd,stroke:#1976d2
    style IdeaOps fill:#e8f5e9,stroke:#4caf50
    style Generation fill:#fff3e0,stroke:#f57c00
    style Conversion fill:#fce4ec,stroke:#e91e63
    style Events fill:#f3e5f5,stroke:#9c27b0
```

### Insights Handlers

Provides AI-powered codebase chat/analysis.

```mermaid
flowchart TB
    subgraph Session["Session Management"]
        GetSession[INSIGHTS_GET_SESSION]
        ListSessions[INSIGHTS_LIST_SESSIONS]
        NewSession[INSIGHTS_NEW_SESSION]
        SwitchSession[INSIGHTS_SWITCH_SESSION]
        DeleteSession[INSIGHTS_DELETE_SESSION]
        RenameSession[INSIGHTS_RENAME_SESSION]
        UpdateModel[INSIGHTS_UPDATE_MODEL_CONFIG]
    end

    subgraph Chat["Chat Operations"]
        SendMessage[INSIGHTS_SEND_MESSAGE]
        ClearSession[INSIGHTS_CLEAR_SESSION]
        CreateTask[INSIGHTS_CREATE_TASK]
    end

    subgraph Events["Stream Events"]
        StreamChunk[INSIGHTS_STREAM_CHUNK]
        Status[INSIGHTS_STATUS]
        Error[INSIGHTS_ERROR]
        RateLimit[CLAUDE_SDK_RATE_LIMIT]
    end

    InsightsService[Insights Service]

    Session --> InsightsService
    Chat --> InsightsService
    InsightsService --> Events

    style Session fill:#e3f2fd,stroke:#1976d2
    style Chat fill:#e8f5e9,stroke:#4caf50
    style Events fill:#fff3e0,stroke:#f57c00
```

### Context Handlers

Manages project context and memory operations.

```mermaid
flowchart TB
    subgraph Entry["context-handlers.ts"]
        Register[registerContextHandlers]
    end

    subgraph Modules["Submodules"]
        MemStatus[memory-status-handlers.ts]
        MemData[memory-data-handlers.ts]
        ProjContext[project-context-handlers.ts]
    end

    subgraph Operations["Context Operations"]
        CheckGraphiti[Check Graphiti Status]
        GetMemories[Get Memories]
        SearchMemories[Search Memories]
        BuildContext[Build Project Context]
        UpdateIndex[Update Context Index]
    end

    Entry --> Modules
    Modules --> Operations

    style Entry fill:#e3f2fd,stroke:#1976d2
    style Modules fill:#e8f5e9,stroke:#4caf50
    style Operations fill:#fff3e0,stroke:#f57c00
```

### Environment Handlers

Manages project-specific .env configuration.

```mermaid
flowchart TB
    subgraph EnvOps["Environment Operations"]
        Get[ENV_GET]
        Update[ENV_UPDATE]
    end

    subgraph ClaudeAuth["Claude Authentication"]
        CheckAuth[ENV_CHECK_CLAUDE_AUTH]
        InvokeSetup[ENV_INVOKE_CLAUDE_SETUP]
    end

    subgraph EnvVars["Managed Variables"]
        Token[CLAUDE_CODE_OAUTH_TOKEN]
        Model[AUTO_BUILD_MODEL]
        Linear[LINEAR_API_KEY / LINEAR_*]
        GitHub[GITHUB_TOKEN / GITHUB_*]
        Branch[DEFAULT_BRANCH]
        Graphiti[GRAPHITI_* / Embedding Config]
        UI[ENABLE_FANCY_UI]
    end

    EnvFile[.auto-claude/.env]
    GlobalSettings[Global Settings]

    EnvOps --> EnvFile
    EnvOps --> GlobalSettings
    ClaudeAuth --> ClaudeCLI[Claude CLI]

    style EnvOps fill:#e3f2fd,stroke:#1976d2
    style ClaudeAuth fill:#e8f5e9,stroke:#4caf50
    style EnvVars fill:#fff3e0,stroke:#f57c00
```

## Integration Handlers

### Linear Handlers

Integrates with Linear issue tracking.

```mermaid
flowchart TB
    subgraph Connection["Connection"]
        CheckConnection[LINEAR_CHECK_CONNECTION]
    end

    subgraph Queries["Queries"]
        GetTeams[LINEAR_GET_TEAMS]
        GetProjects[LINEAR_GET_PROJECTS]
        GetIssues[LINEAR_GET_ISSUES]
    end

    subgraph Import["Import"]
        ImportIssues[LINEAR_IMPORT_ISSUES]
    end

    subgraph Flow["Import Flow"]
        SelectIssues[Select Issues]
        FetchDetails[Fetch Issue Details]
        CreateSpec[Create Spec Directory]
        StartAgent[Start Spec Creation]
    end

    LinearAPI[Linear GraphQL API]
    ProjectStore[Project Store]
    AgentManager[Agent Manager]

    Connection --> LinearAPI
    Queries --> LinearAPI
    Import --> LinearAPI
    Import --> ProjectStore
    Import --> AgentManager

    style Connection fill:#e3f2fd,stroke:#1976d2
    style Queries fill:#e8f5e9,stroke:#4caf50
    style Import fill:#fff3e0,stroke:#f57c00
    style Flow fill:#fce4ec,stroke:#e91e63
```

#### Linear Import Sequence

```mermaid
sequenceDiagram
    participant UI as Renderer
    participant IPC as Linear Handlers
    participant API as Linear GraphQL
    participant FS as File System
    participant AM as Agent Manager

    UI->>IPC: LINEAR_IMPORT_ISSUES(projectId, issueIds)
    IPC->>API: Fetch issue details (GraphQL)
    API-->>IPC: Issue data

    loop For each issue
        IPC->>FS: Create spec directory
        IPC->>FS: Write implementation_plan.json
        IPC->>FS: Write requirements.json
        IPC->>FS: Write task_metadata.json
        IPC->>AM: startSpecCreation(specId, ...)
    end

    IPC-->>UI: { imported: N, failed: M }
```

### GitHub Handlers

Organized into modular subhandlers for GitHub integration.

```mermaid
flowchart TB
    subgraph Entry["github-handlers.ts"]
        Register[registerGithubHandlers]
    end

    subgraph Modules["Submodules"]
        Repo[repository-handlers.ts]
        Issues[issue-handlers.ts]
        Investigation[investigation-handlers.ts]
        Import[import-handlers.ts]
        Release[release-handlers.ts]
    end

    subgraph Operations["Operations"]
        CheckConnection[Check GitHub Connection]
        GetIssues[Get Issues]
        InvestigateIssue[AI Investigation]
        ImportIssues[Import to Tasks]
        CreateRelease[Create Release]
    end

    subgraph Utils["Utilities"]
        GitHubUtils[utils.ts]
        SpecUtils[spec-utils.ts]
        Types[types.ts]
    end

    Entry --> Modules
    Modules --> Operations
    Modules --> Utils

    style Entry fill:#e3f2fd,stroke:#1976d2
    style Modules fill:#e8f5e9,stroke:#4caf50
    style Operations fill:#fff3e0,stroke:#f57c00
    style Utils fill:#fce4ec,stroke:#e91e63
```

### Memory Handlers

Manages memory infrastructure (Graphiti/LadybugDB) and Ollama integration.

```mermaid
flowchart TB
    subgraph MemoryInfra["Memory Infrastructure"]
        Status[MEMORY_STATUS]
        ListDB[MEMORY_LIST_DATABASES]
        TestConnection[MEMORY_TEST_CONNECTION]
    end

    subgraph Validation["Graphiti Validation"]
        ValidateLLM[GRAPHITI_VALIDATE_LLM]
        TestGraphiti[GRAPHITI_TEST_CONNECTION]
    end

    subgraph Ollama["Ollama Operations"]
        CheckStatus[OLLAMA_CHECK_STATUS]
        ListModels[OLLAMA_LIST_MODELS]
        ListEmbedding[OLLAMA_LIST_EMBEDDING_MODELS]
        PullModel[OLLAMA_PULL_MODEL]
        PullProgress[OLLAMA_PULL_PROGRESS]
    end

    subgraph Services["Services"]
        MemService[Memory Service]
        OllamaDetector[ollama_model_detector.py]
        APIValidation[API Validation Service]
    end

    MemoryInfra --> MemService
    Validation --> APIValidation
    Ollama --> OllamaDetector

    style MemoryInfra fill:#e3f2fd,stroke:#1976d2
    style Validation fill:#e8f5e9,stroke:#4caf50
    style Ollama fill:#fff3e0,stroke:#f57c00
    style Services fill:#fce4ec,stroke:#e91e63
```

#### Ollama Model Pull Sequence

```mermaid
sequenceDiagram
    participant UI as Renderer
    participant IPC as Memory Handlers
    participant Py as ollama_model_detector.py
    participant Ollama as Ollama Service

    UI->>IPC: OLLAMA_PULL_MODEL(modelName)
    IPC->>Py: spawn(['pull-model', modelName])
    Py->>Ollama: ollama pull modelName

    loop Download Progress
        Ollama->>Py: NDJSON progress
        Py->>IPC: stderr with progress JSON
        IPC->>IPC: Parse NDJSON
        IPC->>UI: OLLAMA_PULL_PROGRESS event
    end

    Py->>IPC: Exit code + final status
    IPC-->>UI: { model, status: completed }
```

## System Handlers

### Auto-Build Source Handlers

Manages Auto-Claude source code updates.

```mermaid
flowchart TB
    subgraph Updates["Update Operations"]
        Check[AUTOBUILD_SOURCE_CHECK]
        Download[AUTOBUILD_SOURCE_DOWNLOAD]
        Version[AUTOBUILD_SOURCE_VERSION]
    end

    subgraph Progress["Update Progress Events"]
        Checking[Stage: checking]
        Downloading[Stage: downloading]
        Extracting[Stage: extracting]
        Complete[Stage: complete]
        Error[Stage: error]
    end

    subgraph Env["Source Environment"]
        EnvGet[AUTOBUILD_SOURCE_ENV_GET]
        EnvUpdate[AUTOBUILD_SOURCE_ENV_UPDATE]
        EnvCheckToken[AUTOBUILD_SOURCE_ENV_CHECK_TOKEN]
    end

    Updater[auto-claude-updater]

    Updates --> Updater
    Download --> Progress
    Env --> SourcePath[Effective Source Path]

    style Updates fill:#e3f2fd,stroke:#1976d2
    style Progress fill:#fff3e0,stroke:#f57c00
    style Env fill:#e8f5e9,stroke:#4caf50
```

### App Update Handlers

Handles Electron app auto-updates.

```mermaid
flowchart LR
    subgraph Handlers["App Update Handlers"]
        Check[APP_UPDATE_CHECK]
        Download[APP_UPDATE_DOWNLOAD]
        Install[APP_UPDATE_INSTALL]
        GetVersion[APP_UPDATE_GET_VERSION]
    end

    subgraph Updater["App Updater"]
        CheckFn[checkForUpdates]
        DownloadFn[downloadUpdate]
        InstallFn[quitAndInstall]
        VersionFn[getCurrentVersion]
    end

    Check --> CheckFn
    Download --> DownloadFn
    Install --> InstallFn
    GetVersion --> VersionFn

    style Handlers fill:#e3f2fd,stroke:#1976d2
    style Updater fill:#e8f5e9,stroke:#4caf50
```

## IPCResult Pattern

All IPC handlers return a consistent `IPCResult<T>` type:

```mermaid
classDiagram
    class IPCResult~T~ {
        +success: boolean
        +data?: T
        +error?: string
    }

    class SuccessResult~T~ {
        +success: true
        +data: T
    }

    class ErrorResult {
        +success: false
        +error: string
    }

    IPCResult <|-- SuccessResult
    IPCResult <|-- ErrorResult
```

### Usage Pattern

```typescript
// Handler implementation
ipcMain.handle(
  IPC_CHANNELS.EXAMPLE_CHANNEL,
  async (_, param: string): Promise<IPCResult<Data>> => {
    try {
      const result = await someOperation(param);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
);

// Renderer usage
const result = await window.api.invoke('example:channel', param);
if (result.success) {
  console.log(result.data);
} else {
  console.error(result.error);
}
```

## Handler Types

### ipcMain.handle vs ipcMain.on

```mermaid
flowchart TB
    subgraph Handle["ipcMain.handle (Request/Response)"]
        HandleReq[Renderer invokes]
        HandleProc[Handler processes]
        HandleRes[Returns Promise<IPCResult>]
        HandleReq --> HandleProc --> HandleRes
    end

    subgraph On["ipcMain.on (Fire-and-Forget)"]
        OnReq[Renderer sends]
        OnProc[Handler processes]
        OnEvent[Sends events back via webContents.send]
        OnReq --> OnProc --> OnEvent
    end

    style Handle fill:#e3f2fd,stroke:#1976d2
    style On fill:#fff3e0,stroke:#f57c00
```

| Method | Use Case | Return |
|--------|----------|--------|
| `ipcMain.handle` | Request/response pattern | `Promise<IPCResult<T>>` |
| `ipcMain.on` | Long-running operations, streaming | Events via `webContents.send` |

## Error Handling Strategy

```mermaid
flowchart TB
    Handler[IPC Handler]
    TryCatch{Try/Catch Block}

    subgraph Success["Success Path"]
        Process[Process Request]
        Return[Return { success: true, data }]
    end

    subgraph Error["Error Path"]
        Catch[Catch Exception]
        Format[Format Error Message]
        ReturnError[Return { success: false, error }]
    end

    Handler --> TryCatch
    TryCatch -->|try| Process
    Process --> Return
    TryCatch -->|catch| Catch
    Catch --> Format
    Format --> ReturnError

    style Success fill:#e8f5e9,stroke:#4caf50
    style Error fill:#ffebee,stroke:#f44336
```

## Security Considerations

### Input Validation

All handlers validate inputs before processing:

```mermaid
flowchart LR
    Input[User Input]
    Validate{Validate}
    Process[Process Request]
    Error[Return Error]

    Input --> Validate
    Validate -->|Valid| Process
    Validate -->|Invalid| Error

    style Validate fill:#fff3e0,stroke:#f57c00
    style Process fill:#e8f5e9,stroke:#4caf50
    style Error fill:#ffebee,stroke:#f44336
```

### Path Security

- Project paths validated for existence
- File operations restricted to project directories
- Shell commands use `execFileSync` with argument arrays (no shell injection)

## Performance Considerations

| Aspect | Implementation |
|--------|----------------|
| **Lazy Loading** | Handler modules loaded on demand |
| **Event Batching** | Progress events throttled where appropriate |
| **Streaming** | Long-running operations stream updates |
| **Connection Pooling** | Linear/GitHub API connections reused |
| **Caching** | Settings and environment configs cached |

## Next Steps

- [Preload API](./preload-api.md) - Preload script documentation
- [Agent Manager](./agent-manager.md) - Agent Manager documentation
- [Terminal Manager](./terminal-manager.md) - Terminal Manager documentation
- [Services](./services.md) - Backend services documentation
