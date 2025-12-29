# Core and Context Modules

The core and context modules provide the foundational infrastructure for Auto-Claude's autonomous coding system. The core module handles authentication, client creation, workspace management, and progress tracking, while the context module builds task-specific context by searching the codebase.

## Module Overview

```mermaid
flowchart TB
    subgraph Core["Core Module"]
        Agent[agent.py<br/>Agent Facade]
        Auth[auth.py<br/>Authentication]
        Client[client.py<br/>Claude SDK Client]
        Progress[progress.py<br/>Progress Tracking]
        Workspace[workspace.py<br/>Workspace Management]
        Worktree[worktree.py<br/>Git Worktrees]
    end

    subgraph Context["Context Module"]
        Builder[builder.py<br/>Context Builder]
        Search[search.py<br/>Code Search]
        Categorizer[categorizer.py<br/>File Categorization]
        Keywords[keyword_extractor.py<br/>Keyword Extraction]
        ServiceMatcher[service_matcher.py<br/>Service Matching]
        Models[models.py<br/>Data Models]
    end

    Agent --> Client
    Client --> Auth
    Workspace --> Worktree
    Builder --> Search
    Builder --> Categorizer
    Builder --> Keywords
    Builder --> ServiceMatcher

    style Core fill:#e3f2fd,stroke:#1976d2
    style Context fill:#e8f5e9,stroke:#4caf50
```

## Core Module Structure

```
apps/backend/core/
├── __init__.py          # Public API with lazy imports
├── agent.py             # Agent session facade (re-exports from agents/)
├── auth.py              # Authentication helpers
├── client.py            # Claude SDK client configuration
├── debug.py             # Debug utilities
├── phase_event.py       # Phase event definitions
├── progress.py          # Progress tracking utilities
├── workspace.py         # Workspace management
├── worktree.py          # Git worktree manager
└── workspace/           # Refactored workspace submodules
    ├── __init__.py      # Package exports
    ├── display.py       # UI display functions
    ├── finalization.py  # User interaction flows
    ├── git_utils.py     # Git operation utilities
    ├── models.py        # Data models and enums
    └── setup.py         # Workspace setup functions
```

## Context Module Structure

```
apps/backend/context/
├── __init__.py              # Public API exports
├── builder.py               # Main context builder class
├── categorizer.py           # File categorization logic
├── constants.py             # Shared constants
├── graphiti_integration.py  # Graphiti memory integration
├── keyword_extractor.py     # Keyword extraction from tasks
├── main.py                  # CLI entry point
├── models.py                # Data models (FileMatch, TaskContext)
├── pattern_discovery.py     # Pattern discovery in files
├── search.py                # Code search functionality
├── serialization.py         # Context serialization
└── service_matcher.py       # Service suggestion logic
```

## Core Class Diagram

```mermaid
classDiagram
    class CoreModule {
        <<module>>
        +run_autonomous_agent()
        +run_followup_planner()
        +WorkspaceManager
        +WorktreeManager
        +ProgressTracker
        +create_claude_client()
    }

    class AuthModule {
        <<functions>>
        +get_auth_token() str|None
        +get_auth_token_source() str|None
        +require_auth_token() str
        +get_sdk_env_vars() dict
        +get_token_from_keychain() str|None
        +ensure_claude_code_oauth_token() void
    }

    class ClaudeClientFactory {
        <<functions>>
        +create_client(project_dir, spec_dir, model, agent_type) ClaudeSDKClient
        +is_graphiti_mcp_enabled() bool
        +is_electron_mcp_enabled() bool
        +get_electron_debug_port() int
    }

    class WorkspaceManager {
        +project_dir: Path
        +worktrees_dir: Path
        +base_branch: str
        +merge_existing_build() bool
        +setup() void
        +get_worktree_path(spec_name) Path
        +get_branch_name(spec_name) str
    }

    class WorktreeManager {
        +project_dir: Path
        +base_branch: str
        +worktrees_dir: Path
        +create_worktree(spec_name) WorktreeInfo
        +get_or_create_worktree(spec_name) WorktreeInfo
        +remove_worktree(spec_name, delete_branch) void
        +merge_worktree(spec_name, delete_after, no_commit) bool
        +list_all_worktrees() list[WorktreeInfo]
    }

    class ProgressTracker {
        <<functions>>
        +count_subtasks(spec_dir) tuple[int,int]
        +is_build_complete(spec_dir) bool
        +get_progress_percentage(spec_dir) float
        +get_next_subtask(spec_dir) dict|None
        +get_plan_summary(spec_dir) dict
    }

    CoreModule --> AuthModule : uses
    CoreModule --> ClaudeClientFactory : uses
    CoreModule --> WorkspaceManager : exports
    CoreModule --> WorktreeManager : exports
    CoreModule --> ProgressTracker : exports
    ClaudeClientFactory --> AuthModule : authenticates
    WorkspaceManager --> WorktreeManager : delegates to
```

## Context Class Diagram

```mermaid
classDiagram
    class ContextModule {
        <<module>>
        +ContextBuilder
        +CodeSearcher
        +ServiceMatcher
        +KeywordExtractor
        +FileCategorizer
        +PatternDiscoverer
    }

    class ContextBuilder {
        +project_dir: Path
        +project_index: dict
        +searcher: CodeSearcher
        +service_matcher: ServiceMatcher
        +keyword_extractor: KeywordExtractor
        +categorizer: FileCategorizer
        +pattern_discoverer: PatternDiscoverer
        +build_context(task, services, keywords) TaskContext
        +build_context_async(task, services, keywords) TaskContext
    }

    class TaskContext {
        +task_description: str
        +scoped_services: list[str]
        +files_to_modify: list[dict]
        +files_to_reference: list[dict]
        +patterns_discovered: dict[str,str]
        +service_contexts: dict[str,dict]
        +graph_hints: list[dict]
    }

    class FileMatch {
        +path: str
        +service: str
        +reason: str
        +relevance_score: float
        +matching_lines: list[tuple]
    }

    class CodeSearcher {
        +project_dir: Path
        +search_service(service_path, service_name, keywords) list[FileMatch]
        -_iter_code_files(directory) Iterator[Path]
    }

    class ServiceMatcher {
        +project_index: dict
        +suggest_services(task) list[str]
    }

    class KeywordExtractor {
        +STOPWORDS: set[str]
        +extract_keywords(task, max_keywords) list[str]
    }

    class FileCategorizer {
        +MODIFY_KEYWORDS: list[str]
        +categorize_matches(matches, task) tuple[list,list]
    }

    ContextBuilder --> TaskContext : creates
    ContextBuilder --> FileMatch : produces
    ContextBuilder --> CodeSearcher : uses
    ContextBuilder --> ServiceMatcher : uses
    ContextBuilder --> KeywordExtractor : uses
    ContextBuilder --> FileCategorizer : uses
```

## Authentication System

The `auth.py` module provides centralized authentication token resolution with fallback support.

### Token Resolution Priority

```mermaid
flowchart TB
    Start[Get Auth Token]

    subgraph EnvVars["Environment Variables"]
        Check1{CLAUDE_CODE_OAUTH_TOKEN?}
        Check2{ANTHROPIC_AUTH_TOKEN?}
    end

    subgraph Keychain["macOS Keychain"]
        CheckOS{macOS?}
        QueryKeychain[Query Keychain]
        ParseJSON[Parse Credentials]
        ExtractToken[Extract OAuth Token]
    end

    Start --> Check1
    Check1 -->|Yes| ReturnToken[Return Token]
    Check1 -->|No| Check2
    Check2 -->|Yes| ReturnToken
    Check2 -->|No| CheckOS
    CheckOS -->|Yes| QueryKeychain
    CheckOS -->|No| ReturnNone[Return None]
    QueryKeychain --> ParseJSON
    ParseJSON --> ExtractToken
    ExtractToken --> ReturnToken

    style EnvVars fill:#e3f2fd,stroke:#1976d2
    style Keychain fill:#fff3e0,stroke:#f57c00
```

### Authentication Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `get_auth_token()` | Get token from env vars or Keychain | `str \| None` |
| `get_auth_token_source()` | Get name of token source | `str \| None` |
| `require_auth_token()` | Get token or raise ValueError | `str` |
| `get_sdk_env_vars()` | Get env vars to pass to SDK | `dict[str, str]` |
| `ensure_claude_code_oauth_token()` | Ensure token is set in env | `None` |

### Security Note

```mermaid
flowchart LR
    subgraph Supported["✓ Supported"]
        OAuth[CLAUDE_CODE_OAUTH_TOKEN]
        CCR[ANTHROPIC_AUTH_TOKEN]
        Keychain[macOS Keychain]
    end

    subgraph NotSupported["✗ Not Supported"]
        API[ANTHROPIC_API_KEY]
    end

    style Supported fill:#e8f5e9,stroke:#4caf50
    style NotSupported fill:#ffebee,stroke:#f44336
```

> **Important**: `ANTHROPIC_API_KEY` is intentionally NOT supported to prevent silent billing to user's API credits when OAuth is misconfigured.

## Claude SDK Client Creation

The `client.py` module creates configured Claude Agent SDK clients with multi-layered security.

### Client Creation Flow

```mermaid
sequenceDiagram
    participant Caller
    participant ClientFactory as create_client()
    participant Auth as AuthModule
    participant SDK as ClaudeSDKClient
    participant MCP as MCP Servers

    Caller->>ClientFactory: project_dir, spec_dir, model, agent_type
    ClientFactory->>Auth: require_auth_token()
    Auth-->>ClientFactory: OAuth token
    ClientFactory->>ClientFactory: Get SDK env vars
    ClientFactory->>ClientFactory: Detect project capabilities
    ClientFactory->>ClientFactory: Build allowed tools list
    ClientFactory->>ClientFactory: Configure MCP servers
    ClientFactory->>ClientFactory: Write security settings
    ClientFactory->>SDK: Create client with options
    SDK->>MCP: Initialize MCP connections
    SDK-->>ClientFactory: Configured client
    ClientFactory-->>Caller: ClaudeSDKClient
```

### Security Layers

```mermaid
flowchart TB
    subgraph Layer1["Layer 1: Sandbox"]
        Sandbox[OS-level bash isolation]
    end

    subgraph Layer2["Layer 2: Permissions"]
        Perms[File operations restricted to project_dir]
    end

    subgraph Layer3["Layer 3: Security Hooks"]
        Hooks[Bash commands validated against allowlist]
    end

    subgraph Layer4["Layer 4: Tool Filtering"]
        Tools[Agent type determines available tools]
    end

    Command[User Command] --> Layer1
    Layer1 --> Layer2
    Layer2 --> Layer3
    Layer3 --> Layer4
    Layer4 --> Execution[Execute]

    style Layer1 fill:#ffebee,stroke:#f44336
    style Layer2 fill:#fff3e0,stroke:#f57c00
    style Layer3 fill:#fff9c4,stroke:#fbc02d
    style Layer4 fill:#e8f5e9,stroke:#4caf50
```

### MCP Server Configuration

```mermaid
flowchart LR
    subgraph Always["Always Enabled"]
        Context7[context7<br/>Documentation]
    end

    subgraph Conditional["Conditional"]
        Linear[linear<br/>Project Management]
        Graphiti[graphiti-memory<br/>Knowledge Graph]
        AutoClaude[auto-claude<br/>Custom Tools]
    end

    subgraph QAOnly["QA Agents Only"]
        Electron[electron<br/>Desktop Automation]
        Puppeteer[puppeteer<br/>Browser Automation]
    end

    style Always fill:#e8f5e9,stroke:#4caf50
    style Conditional fill:#e3f2fd,stroke:#1976d2
    style QAOnly fill:#fff3e0,stroke:#f57c00
```

### Agent Types and Tools

| Agent Type | Base Tools | Custom Tools | MCP Tools |
|------------|------------|--------------|-----------|
| `planner` | Read, Glob, Grep | Plan-specific | Context7 |
| `coder` | All built-in | Coder-specific | Context7, Linear |
| `qa_reviewer` | All built-in | QA-specific | + Electron/Puppeteer |
| `qa_fixer` | All built-in | QA-specific | + Electron/Puppeteer |

## Workspace Management

The workspace module provides Git worktree isolation for each spec.

### Worktree Architecture

```mermaid
flowchart TB
    subgraph MainRepo["Main Repository"]
        Main[main branch]
        Feature[feature branches]
    end

    subgraph Worktrees[".worktrees/"]
        WT1[001-feature/<br/>auto-claude/001-feature]
        WT2[002-bugfix/<br/>auto-claude/002-bugfix]
        WT3[003-refactor/<br/>auto-claude/003-refactor]
    end

    Main -->|fork| WT1
    Main -->|fork| WT2
    Main -->|fork| WT3

    WT1 -.->|merge| Main
    WT2 -.->|merge| Main
    WT3 -.->|merge| Main

    style MainRepo fill:#e3f2fd,stroke:#1976d2
    style Worktrees fill:#e8f5e9,stroke:#4caf50
```

### WorktreeManager Class

```python
class WorktreeManager:
    """
    Manages per-spec Git worktrees.

    Each spec gets its own worktree in .worktrees/{spec-name}/ with
    a corresponding branch auto-claude/{spec-name}.
    """

    def __init__(self, project_dir: Path, base_branch: str | None = None):
        self.project_dir = project_dir
        self.base_branch = base_branch or self._detect_base_branch()
        self.worktrees_dir = project_dir / ".worktrees"
```

### WorktreeInfo Data Class

```mermaid
classDiagram
    class WorktreeInfo {
        +path: Path
        +branch: str
        +spec_name: str
        +base_branch: str
        +is_active: bool
        +commit_count: int
        +files_changed: int
        +additions: int
        +deletions: int
    }
```

### Worktree Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: create_worktree()
    Created --> Active: Start coding
    Active --> Active: commit_in_worktree()
    Active --> Merged: merge_worktree()
    Active --> Removed: remove_worktree()
    Merged --> [*]
    Removed --> [*]
```

### Key Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `create_worktree(spec_name)` | Create new worktree for spec | `WorktreeInfo` |
| `get_or_create_worktree(spec_name)` | Get existing or create new | `WorktreeInfo` |
| `merge_worktree(spec_name, ...)` | Merge worktree back to base | `bool` |
| `remove_worktree(spec_name, delete_branch)` | Remove worktree | `None` |
| `list_all_worktrees()` | List all spec worktrees | `list[WorktreeInfo]` |
| `get_changed_files(spec_name)` | Get changed files in worktree | `list[tuple]` |

## AI-Powered Merge System

The workspace module includes an AI-powered merge system for resolving conflicts.

### Merge Flow

```mermaid
flowchart TB
    Start[merge_existing_build]
    CheckWorktree{Worktree exists?}
    SmartMerge[Try Smart Merge]

    subgraph Analysis["Conflict Analysis"]
        GitConflicts{Git conflicts?}
        SemanticAnalysis[Semantic Analysis]
        AIResolve[AI Conflict Resolution]
    end

    subgraph Resolution["Resolution"]
        Simple3Way[Simple 3-way merge]
        AIPrompt[Build AI prompt]
        CallClaude[Call Claude Haiku]
        ValidateSyntax[Validate syntax]
    end

    GitMerge[Standard Git Merge]
    Success[Merge Complete]
    Failure[Manual Resolution]

    Start --> CheckWorktree
    CheckWorktree -->|No| Failure
    CheckWorktree -->|Yes| SmartMerge
    SmartMerge --> GitConflicts
    GitConflicts -->|Yes| AIResolve
    GitConflicts -->|No| SemanticAnalysis
    AIResolve --> Simple3Way
    Simple3Way -->|Success| Success
    Simple3Way -->|Fail| AIPrompt
    AIPrompt --> CallClaude
    CallClaude --> ValidateSyntax
    ValidateSyntax -->|Valid| Success
    ValidateSyntax -->|Invalid| Failure
    SemanticAnalysis --> GitMerge
    GitMerge --> Success

    style Analysis fill:#e3f2fd,stroke:#1976d2
    style Resolution fill:#e8f5e9,stroke:#4caf50
```

### Parallel Merge Processing

```mermaid
flowchart LR
    subgraph Input["Conflicting Files"]
        F1[file1.py]
        F2[file2.ts]
        F3[file3.tsx]
        F4[file4.py]
    end

    subgraph Parallel["Parallel AI Merges"]
        Sem[Semaphore<br/>max=5]
        AI1[Claude Haiku]
        AI2[Claude Haiku]
        AI3[Claude Haiku]
    end

    subgraph Output["Merged Results"]
        R1[✓ file1.py]
        R2[✓ file2.ts]
        R3[✓ file3.tsx]
        R4[✓ file4.py]
    end

    F1 --> Sem
    F2 --> Sem
    F3 --> Sem
    F4 --> Sem
    Sem --> AI1
    Sem --> AI2
    Sem --> AI3
    AI1 --> R1
    AI2 --> R2
    AI3 --> R3
    AI1 --> R4

    style Parallel fill:#fff3e0,stroke:#f57c00
```

## Progress Tracking

The `progress.py` module tracks implementation plan progress.

### Progress Functions

| Function | Description | Returns |
|----------|-------------|---------|
| `count_subtasks(spec_dir)` | Count completed/total subtasks | `tuple[int, int]` |
| `is_build_complete(spec_dir)` | Check if all subtasks done | `bool` |
| `get_progress_percentage(spec_dir)` | Get progress as percentage | `float` |
| `get_next_subtask(spec_dir)` | Find next subtask to work on | `dict \| None` |
| `get_plan_summary(spec_dir)` | Get detailed plan summary | `dict` |
| `get_current_phase(spec_dir)` | Get current phase info | `dict \| None` |

### Progress Display

```mermaid
flowchart TB
    subgraph Display["Progress Display"]
        Header[print_session_header]
        Summary[print_progress_summary]
        Banner[print_build_complete_banner]
        Paused[print_paused_banner]
    end

    subgraph Data["Progress Data"]
        Count[count_subtasks]
        Detailed[count_subtasks_detailed]
        Phase[get_current_phase]
        Next[get_next_subtask]
    end

    Data --> Display

    style Display fill:#e3f2fd,stroke:#1976d2
    style Data fill:#e8f5e9,stroke:#4caf50
```

## Context Building

The context module builds task-specific context by searching the codebase.

### Context Building Flow

```mermaid
sequenceDiagram
    participant Caller
    participant Builder as ContextBuilder
    participant Matcher as ServiceMatcher
    participant Keywords as KeywordExtractor
    participant Searcher as CodeSearcher
    participant Categorizer as FileCategorizer
    participant Patterns as PatternDiscoverer
    participant Graphiti

    Caller->>Builder: build_context(task)
    Builder->>Matcher: suggest_services(task)
    Matcher-->>Builder: [service1, service2]
    Builder->>Keywords: extract_keywords(task)
    Keywords-->>Builder: [kw1, kw2, kw3]

    loop For each service
        Builder->>Searcher: search_service(path, name, keywords)
        Searcher-->>Builder: FileMatch[]
    end

    Builder->>Categorizer: categorize_matches(matches, task)
    Categorizer-->>Builder: (to_modify, to_reference)
    Builder->>Patterns: discover_patterns(references, keywords)
    Patterns-->>Builder: patterns{}
    Builder->>Graphiti: fetch_graph_hints(task)
    Graphiti-->>Builder: hints[]
    Builder-->>Caller: TaskContext
```

### ContextBuilder Class

```python
class ContextBuilder:
    """Builds task-specific context by searching the codebase."""

    def __init__(self, project_dir: Path, project_index: dict | None = None):
        self.project_dir = project_dir.resolve()
        self.project_index = project_index or self._load_project_index()

        # Initialize components
        self.searcher = CodeSearcher(self.project_dir)
        self.service_matcher = ServiceMatcher(self.project_index)
        self.keyword_extractor = KeywordExtractor()
        self.categorizer = FileCategorizer()
        self.pattern_discoverer = PatternDiscoverer(self.project_dir)
```

### TaskContext Structure

```mermaid
classDiagram
    class TaskContext {
        +task_description: str
        +scoped_services: list[str]
        +files_to_modify: list[dict]
        +files_to_reference: list[dict]
        +patterns_discovered: dict[str,str]
        +service_contexts: dict[str,dict]
        +graph_hints: list[dict]
    }

    class FileMatch {
        +path: str
        +service: str
        +reason: str
        +relevance_score: float
        +matching_lines: list[tuple[int,str]]
    }

    TaskContext --> FileMatch : contains
```

## Code Search

The `search.py` module searches code files for relevant matches.

### Search Algorithm

```mermaid
flowchart TB
    subgraph Input
        Keywords[Keywords List]
        ServicePath[Service Path]
    end

    subgraph Search["Search Process"]
        IterFiles[Iterate Code Files]
        SkipDirs[Skip node_modules, .git, etc.]
        ReadContent[Read File Content]
        ScoreFile[Score by Keyword Matches]
        FindLines[Find Matching Lines]
    end

    subgraph Output
        Matches[FileMatch Objects]
        Sort[Sort by Relevance]
        Limit[Top 20 per Service]
    end

    Input --> IterFiles
    IterFiles --> SkipDirs
    SkipDirs --> ReadContent
    ReadContent --> ScoreFile
    ScoreFile --> FindLines
    FindLines --> Matches
    Matches --> Sort
    Sort --> Limit

    style Search fill:#e3f2fd,stroke:#1976d2
```

### Scoring System

| Factor | Score Impact |
|--------|--------------|
| Keyword occurrence | +1-10 per keyword (capped) |
| Multiple keywords | Additive |
| Line matches | Stored for context |

## File Categorization

The `categorizer.py` module categorizes files into modification vs reference targets.

### Categorization Logic

```mermaid
flowchart TB
    Input[FileMatch]

    subgraph Checks["File Type Checks"]
        IsTest{Test file?}
        IsExample{Example file?}
        IsConfig{Low-score config?}
        HighScore{Score >= 5?}
        IsModTask{Modification task?}
    end

    subgraph Output["Categories"]
        ToModify[Files to Modify]
        ToReference[Files to Reference]
    end

    Input --> IsTest
    IsTest -->|Yes| ToReference
    IsTest -->|No| IsExample
    IsExample -->|Yes| ToReference
    IsExample -->|No| IsConfig
    IsConfig -->|Yes| ToReference
    IsConfig -->|No| HighScore
    HighScore -->|Yes| IsModTask
    HighScore -->|No| ToReference
    IsModTask -->|Yes| ToModify
    IsModTask -->|No| ToReference

    style ToModify fill:#e8f5e9,stroke:#4caf50
    style ToReference fill:#e3f2fd,stroke:#1976d2
```

### Modification Keywords

The categorizer uses these keywords to detect modification tasks:

| Keyword | Action Type |
|---------|-------------|
| `add`, `create`, `new` | Creation |
| `implement`, `build` | Implementation |
| `fix`, `update`, `change`, `modify` | Modification |

## Service Matching

The `service_matcher.py` module suggests relevant services based on task description.

### Service Scoring

```mermaid
flowchart LR
    subgraph Input
        Task[Task Description]
        Index[Project Index]
    end

    subgraph Scoring["Score Calculation"]
        NameMatch[Service Name in Task: +10]
        TypeMatch[Service Type Match: +5]
        FrameworkMatch[Framework in Task: +3]
    end

    subgraph Output
        Top3[Top 3 Services]
        Default[Default: 1 backend + 1 frontend]
    end

    Task --> NameMatch
    Task --> TypeMatch
    Task --> FrameworkMatch
    NameMatch --> Top3
    TypeMatch --> Top3
    FrameworkMatch --> Top3

    style Scoring fill:#e3f2fd,stroke:#1976d2
```

### Service Type Mapping

| Service Type | Trigger Keywords |
|--------------|------------------|
| `backend` | api, endpoint, route, database, model |
| `frontend` | ui, component, page, button, form |
| `worker` | job, task, queue, background, async |
| `scraper` | scrape, crawl, fetch, parse |

## Keyword Extraction

The `keyword_extractor.py` module extracts meaningful keywords from task descriptions.

### Extraction Process

```mermaid
flowchart LR
    subgraph Input
        Task[Task Description]
    end

    subgraph Process["Extraction"]
        Tokenize[Tokenize with Regex]
        Filter[Filter Stopwords]
        LenCheck[Remove short words]
        Dedupe[Deduplicate]
        Limit[Limit to max]
    end

    subgraph Output
        Keywords[Keyword List]
    end

    Task --> Tokenize
    Tokenize --> Filter
    Filter --> LenCheck
    LenCheck --> Dedupe
    Dedupe --> Limit
    Limit --> Keywords

    style Process fill:#e3f2fd,stroke:#1976d2
```

### Stopwords

Common words filtered out include:
- Articles: a, an, the
- Prepositions: to, for, of, in, on, at, by, with
- Verbs: is, are, was, were, be, have, has, do, does
- Action words: add, create, make, implement, build, fix, update

## Lazy Import Pattern

Both modules use Python's `__getattr__` for lazy imports:

```mermaid
flowchart TB
    Import[Import core.function]
    GetAttr["__getattr__(name)"]

    subgraph Routes["Name Routing"]
        CheckAgent{Agent functions?}
        CheckWorkspace{Workspace?}
        CheckWorktree{Worktree?}
        CheckProgress{Progress?}
        CheckClient{Client?}
    end

    subgraph Imports["Lazy Imports"]
        ImportAgent[from .agent import ...]
        ImportWorkspace[from .workspace import ...]
        ImportWorktree[from .worktree import ...]
        ImportProgress[from .progress import ...]
        ImportClient[from .client import ...]
    end

    Import --> GetAttr
    GetAttr --> Routes
    CheckAgent -->|Yes| ImportAgent
    CheckWorkspace -->|Yes| ImportWorkspace
    CheckWorktree -->|Yes| ImportWorktree
    CheckProgress -->|Yes| ImportProgress
    CheckClient -->|Yes| ImportClient

    style Routes fill:#e3f2fd,stroke:#1976d2
    style Imports fill:#e8f5e9,stroke:#4caf50
```

## Integration Points

### External Dependencies

```mermaid
flowchart LR
    Core[Core Module]
    Context[Context Module]

    subgraph External["External Services"]
        Claude[Claude Agent SDK]
        Git[Git]
        Graphiti[Graphiti Memory]
    end

    subgraph Internal["Internal Modules"]
        Agents[agents/]
        Analysis[analysis/]
        UI[ui/]
        Security[security/]
    end

    Core <-->|Execute| Claude
    Core <-->|Manage| Git
    Context <-->|Hints| Graphiti
    Core --> Agents
    Context --> Analysis
    Core --> UI
    Core --> Security

    style External fill:#fce4ec,stroke:#e91e63
    style Internal fill:#e8f5e9,stroke:#4caf50
```

### Key Dependencies

| Module | Dependency | Purpose |
|--------|------------|---------|
| `core.client` | `claude_agent_sdk` | AI agent execution |
| `core.auth` | `subprocess`, `json` | Keychain access |
| `core.workspace` | `subprocess`, `git` | Git operations |
| `context.builder` | `analysis` | Project index loading |
| `context.graphiti_integration` | `graphiti_memory` | Cross-session memory |

## Error Handling

### Authentication Errors

```mermaid
flowchart TB
    Check{Token found?}
    Check -->|No| BuildError[Build Error Message]
    BuildError --> CheckOS{macOS?}
    CheckOS -->|Yes| MacHelp[Keychain + .env instructions]
    CheckOS -->|No| WinHelp[.env instructions only]
    MacHelp --> Raise[Raise ValueError]
    WinHelp --> Raise
```

### Worktree Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `WorktreeError` | Branch namespace conflict | Rename conflicting branch |
| Merge conflict | Diverged branches | AI resolution or manual |
| Missing worktree | Deleted or corrupted | Recreate from spec |

## Next Steps

- [Agents Module](./agents.md) - Agent execution system
- [Analysis Module](./analysis.md) - Project analysis system
- [CLI Module](./cli.md) - Command-line interface
- [Integration Points](../architecture/integration.md) - System integration
