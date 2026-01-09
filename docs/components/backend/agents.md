# Agents Module

The agents module is the core of Auto-Claude's autonomous coding system. It provides a modular architecture for running AI-powered coding agents that implement tasks defined in implementation plans.

## Module Overview

The agents module is organized into focused submodules with clear responsibilities:

```mermaid
flowchart TB
    subgraph Public["Public API (__init__.py)"]
        RunAgent[run_autonomous_agent]
        RunPlanner[run_followup_planner]
        MemAPI[Memory Functions]
        SessionAPI[Session Functions]
        UtilsAPI[Utility Functions]
    end

    subgraph Internal["Internal Modules"]
        Base[base.py]
        Coder[coder.py]
        Planner[planner.py]
        Session[session.py]
        MemMgr[memory_manager.py]
        Utils[utils.py]
    end

    Public --> Internal

    style Public fill:#e3f2fd,stroke:#1976d2
    style Internal fill:#fff3e0,stroke:#f57c00
```

## Module Structure

```
apps/backend/agents/
├── __init__.py          # Public API with lazy imports
├── base.py              # Shared constants and configuration
├── coder.py             # Main autonomous agent loop
├── planner.py           # Follow-up planner for completed specs
├── session.py           # Session execution and post-processing
├── memory_manager.py    # Dual-layer memory system
└── utils.py             # Git and plan management utilities
```

## Class Diagram

```mermaid
classDiagram
    class AgentsModule {
        <<module>>
        +run_autonomous_agent()
        +run_followup_planner()
        +save_session_memory()
        +get_graphiti_context()
        +post_session_processing()
        +run_agent_session()
    }

    class BaseModule {
        <<constants>>
        +AUTO_CONTINUE_DELAY_SECONDS: int
        +HUMAN_INTERVENTION_FILE: str
        +logger: Logger
    }

    class CoderAgent {
        +run_autonomous_agent(project_dir, spec_dir, model, max_iterations, verbose, source_spec_dir)
        -recovery_manager: RecoveryManager
        -status_manager: StatusManager
        -task_logger: TaskLogger
        -_handle_session_result()
        -_process_planning_phase()
        -_process_coding_phase()
    }

    class PlannerAgent {
        +run_followup_planner(project_dir, spec_dir, model, verbose) bool
        -status_manager: StatusManager
        -task_logger: TaskLogger
        -_validate_plan_update()
    }

    class SessionManager {
        +run_agent_session(client, message, spec_dir, verbose, phase) tuple
        +post_session_processing(spec_dir, project_dir, subtask_id, session_num, ...) bool
        -_stream_response()
        -_handle_tool_use()
        -_log_tool_result()
    }

    class MemoryManager {
        +debug_memory_system_status() void
        +get_graphiti_context(spec_dir, project_dir, subtask) str
        +save_session_memory(spec_dir, project_dir, subtask_id, session_num, success, subtasks_completed, discoveries) tuple
        +save_session_to_graphiti() bool
        -_build_insights_structure()
        -_try_graphiti_save()
        -_fallback_to_file()
    }

    class UtilsModule {
        +get_latest_commit(project_dir) str
        +get_commit_count(project_dir) int
        +load_implementation_plan(spec_dir) dict
        +find_subtask_in_plan(plan, subtask_id) dict
        +find_phase_for_subtask(plan, subtask_id) dict
        +sync_plan_to_source(spec_dir, source_spec_dir) bool
    }

    AgentsModule --> BaseModule : uses constants
    AgentsModule --> CoderAgent : exposes
    AgentsModule --> PlannerAgent : exposes
    AgentsModule --> SessionManager : exposes
    AgentsModule --> MemoryManager : exposes
    AgentsModule --> UtilsModule : exposes
    CoderAgent --> SessionManager : uses
    CoderAgent --> MemoryManager : uses
    CoderAgent --> UtilsModule : uses
    PlannerAgent --> SessionManager : uses
    SessionManager --> MemoryManager : saves to
    SessionManager --> UtilsModule : uses
```

## Base Module

The `base.py` module provides shared constants and configuration used across all agent modules.

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `AUTO_CONTINUE_DELAY_SECONDS` | `3` | Delay between automatic session continuations |
| `HUMAN_INTERVENTION_FILE` | `"PAUSE"` | Filename that triggers agent pause |

### Usage Pattern

```python
from .base import AUTO_CONTINUE_DELAY_SECONDS, HUMAN_INTERVENTION_FILE

# Check for human intervention
pause_file = spec_dir / HUMAN_INTERVENTION_FILE
if pause_file.exists():
    # Handle pause request
    pass

# Auto-continue delay
await asyncio.sleep(AUTO_CONTINUE_DELAY_SECONDS)
```

## Coder Agent

The coder agent (`coder.py`) implements the main autonomous coding loop that processes implementation plans and executes subtasks.

### Architecture

```mermaid
flowchart TB
    subgraph Init["Initialization"]
        Recovery[Create RecoveryManager]
        Status[Create StatusManager]
        Logger[Create TaskLogger]
        Memory[Debug Memory Status]
    end

    subgraph CheckPhase["Phase Detection"]
        FirstRun{First Run?}
        Planning[Planning Phase]
        Coding[Coding Phase]
    end

    subgraph MainLoop["Main Loop"]
        CheckPause[Check PAUSE File]
        CheckIter[Check Max Iterations]
        GetSubtask[Get Next Subtask]
        GenPrompt[Generate Prompt]
        RunSession[Run Agent Session]
        PostProcess[Post-Session Processing]
    end

    subgraph HandleResult["Result Handling"]
        Complete[Build Complete]
        Continue[Continue to Next]
        Error[Handle Error]
        Stuck[Mark as Stuck]
    end

    Init --> CheckPhase
    FirstRun -->|Yes| Planning
    FirstRun -->|No| Coding
    Planning --> MainLoop
    Coding --> MainLoop
    CheckPause --> CheckIter
    CheckIter --> GetSubtask
    GetSubtask --> GenPrompt
    GenPrompt --> RunSession
    RunSession --> PostProcess
    PostProcess --> HandleResult
    Continue --> CheckPause
    Error --> CheckPause

    style Init fill:#e8f5e9,stroke:#4caf50
    style MainLoop fill:#e3f2fd,stroke:#1976d2
    style HandleResult fill:#fff3e0,stroke:#f57c00
```

### Function Signature

```python
async def run_autonomous_agent(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    max_iterations: int | None = None,
    verbose: bool = False,
    source_spec_dir: Path | None = None,
) -> None
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_dir` | `Path` | Root directory for the project |
| `spec_dir` | `Path` | Directory containing the spec (`.auto-claude/specs/001-name/`) |
| `model` | `str` | Claude model to use (e.g., `"claude-sonnet-4-20250514"`) |
| `max_iterations` | `int \| None` | Maximum session iterations (None for unlimited) |
| `verbose` | `bool` | Whether to show detailed tool output |
| `source_spec_dir` | `Path \| None` | Original spec directory for worktree sync |

### Key Features

1. **Planning Phase Detection**: Automatically detects first run and initiates planning
2. **Recovery Management**: Tracks attempts and provides recovery hints
3. **Status Updates**: Maintains real-time status for UI display
4. **Linear Integration**: Updates Linear tasks when enabled
5. **Graphiti Context**: Retrieves relevant memory context for each subtask

### Session Flow Sequence

```mermaid
sequenceDiagram
    participant Main as run_autonomous_agent
    participant Check as Pre-Checks
    participant Prompt as Prompt Generator
    participant Client as Claude SDK
    participant Session as run_agent_session
    participant Post as post_session_processing
    participant Memory as MemoryManager

    Main->>Check: Check PAUSE file
    Check->>Check: Get next subtask
    Check->>Prompt: Generate subtask prompt
    Prompt->>Prompt: Load file context
    Prompt->>Memory: Get Graphiti context
    Memory-->>Prompt: Memory context (if available)
    Prompt-->>Main: Complete prompt
    Main->>Client: Create client
    Main->>Session: Run session
    Session->>Client: Execute with SDK
    Client-->>Session: Response stream
    Session-->>Main: (status, response)
    Main->>Post: Process session results
    Post->>Memory: Save session insights
    Post-->>Main: success/failure

    alt status == "complete"
        Main->>Main: Print banner, exit
    else status == "continue"
        Main->>Main: Sleep, continue loop
    else status == "error"
        Main->>Main: Log error, retry
    end
```

## Planner Agent

The planner agent (`planner.py`) handles follow-up planning sessions for adding new subtasks to completed specs.

### Architecture

```mermaid
flowchart LR
    subgraph Input
        Request[FOLLOWUP_REQUEST.md]
        ExistingPlan[Existing Plan]
    end

    subgraph Processing
        StatusMgr[Initialize StatusManager]
        Client[Create Claude Client]
        Prompt[Generate Planner Prompt]
        Session[Run Planning Session]
    end

    subgraph Validation
        CheckPlan{Plan Updated?}
        CheckPending{Has Pending?}
        ResetStatus[Reset Plan Status]
    end

    subgraph Output
        Success[Return True]
        Failure[Return False]
    end

    Input --> Processing
    Processing --> Validation
    CheckPlan -->|Yes| CheckPending
    CheckPlan -->|No| Failure
    CheckPending -->|Yes| ResetStatus
    CheckPending -->|No| Failure
    ResetStatus --> Success

    style Processing fill:#e3f2fd,stroke:#1976d2
    style Validation fill:#fff3e0,stroke:#f57c00
```

### Function Signature

```python
async def run_followup_planner(
    project_dir: Path,
    spec_dir: Path,
    model: str,
    verbose: bool = False,
) -> bool
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_dir` | `Path` | Root directory for the project |
| `spec_dir` | `Path` | Directory containing the completed spec |
| `model` | `str` | Claude model to use |
| `verbose` | `bool` | Whether to show detailed output |

### Key Behaviors

1. **Single Session**: Runs one planning session (doesn't enter coding loop)
2. **Plan Validation**: Verifies new subtasks were added
3. **Status Reset**: Automatically resets plan status to `in_progress`
4. **Error Handling**: Provides clear feedback on planning failures

## Session Manager

The session module (`session.py`) handles running agent sessions and post-session processing.

### Class Diagram

```mermaid
classDiagram
    class SessionManager {
        <<functions>>
        +run_agent_session(client, message, spec_dir, verbose, phase) tuple~str,str~
        +post_session_processing(spec_dir, project_dir, subtask_id, ...) bool
    }

    class ClaudeSDKClient {
        +query(message)
        +receive_response() AsyncIterator
    }

    class RecoveryManager {
        +record_attempt(subtask_id, session, success, approach, error)
        +record_good_commit(commit_hash, subtask_id)
        +get_attempt_count(subtask_id) int
    }

    class TaskLogger {
        +log(text, type, phase)
        +tool_start(name, input, phase)
        +tool_end(name, success, result, detail, phase)
        +log_error(error, phase)
    }

    class StatusManager {
        +update_subtasks(completed, total, in_progress)
    }

    SessionManager --> ClaudeSDKClient : executes with
    SessionManager --> RecoveryManager : records attempts
    SessionManager --> TaskLogger : logs activity
    SessionManager --> StatusManager : updates status
```

### run_agent_session

Runs a single agent session using the Claude Agent SDK.

```python
async def run_agent_session(
    client: ClaudeSDKClient,
    message: str,
    spec_dir: Path,
    verbose: bool = False,
    phase: LogPhase = LogPhase.CODING,
) -> tuple[str, str]
```

#### Response Stream Handling

```mermaid
flowchart TB
    subgraph Input
        Query[Send Query]
    end

    subgraph Stream["Response Stream"]
        Receive[Receive Message]
        CheckType{Message Type?}
    end

    subgraph AssistantMsg["AssistantMessage"]
        TextBlock[TextBlock - Print text]
        ToolBlock[ToolUseBlock - Log tool]
    end

    subgraph UserMsg["UserMessage"]
        ToolResult[ToolResultBlock]
        CheckBlocked{Blocked?}
        CheckError{Error?}
        LogSuccess[Log Success]
        LogError[Log Error]
        LogBlocked[Log Blocked]
    end

    subgraph Output
        CheckComplete{Build Complete?}
        ReturnComplete[Return "complete"]
        ReturnContinue[Return "continue"]
        ReturnError[Return "error"]
    end

    Query --> Receive
    Receive --> CheckType
    CheckType -->|AssistantMessage| TextBlock
    CheckType -->|AssistantMessage| ToolBlock
    CheckType -->|UserMessage| ToolResult
    ToolResult --> CheckBlocked
    CheckBlocked -->|Yes| LogBlocked
    CheckBlocked -->|No| CheckError
    CheckError -->|Yes| LogError
    CheckError -->|No| LogSuccess

    TextBlock --> Receive
    ToolBlock --> Receive
    LogSuccess --> Receive
    LogError --> Receive
    LogBlocked --> Receive

    Receive -->|Stream End| CheckComplete
    CheckComplete -->|Yes| ReturnComplete
    CheckComplete -->|No| ReturnContinue

    style Stream fill:#e3f2fd,stroke:#1976d2
    style AssistantMsg fill:#e8f5e9,stroke:#4caf50
    style UserMsg fill:#fff3e0,stroke:#f57c00
```

### post_session_processing

Processes session results and updates memory automatically.

```python
async def post_session_processing(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    session_num: int,
    commit_before: str | None,
    commit_count_before: int,
    recovery_manager: RecoveryManager,
    linear_enabled: bool = False,
    status_manager: StatusManager | None = None,
    source_spec_dir: Path | None = None,
) -> bool
```

#### Post-Processing Flow

```mermaid
flowchart TB
    Start[Post-Session Start]
    Sync[Sync Plan to Source]
    LoadPlan[Load Implementation Plan]
    FindSubtask[Find Subtask in Plan]
    CheckCommits[Check for New Commits]

    CheckStatus{Subtask Status?}

    subgraph Completed["Status: completed"]
        RecordSuccess[Record Successful Attempt]
        RecordCommit[Record Good Commit]
        NotifyLinear[Update Linear]
        ExtractInsights[Extract Session Insights]
        SaveMemory[Save to Memory]
    end

    subgraph InProgress["Status: in_progress"]
        RecordPartial[Record Partial Attempt]
        SavePartialCommit[Save Partial Commit]
        NotifyLinearFail[Notify Linear of Failure]
        ExtractPartialInsights[Extract Insights]
    end

    subgraph Failed["Status: pending/failed"]
        RecordFailed[Record Failed Attempt]
        NotifyLinearError[Notify Linear of Error]
    end

    Start --> Sync
    Sync --> LoadPlan
    LoadPlan --> FindSubtask
    FindSubtask --> CheckCommits
    CheckCommits --> CheckStatus
    CheckStatus -->|completed| Completed
    CheckStatus -->|in_progress| InProgress
    CheckStatus -->|other| Failed

    Completed --> ReturnTrue[Return True]
    InProgress --> ReturnFalse[Return False]
    Failed --> ReturnFalse

    style Completed fill:#e8f5e9,stroke:#4caf50
    style InProgress fill:#fff3e0,stroke:#f57c00
    style Failed fill:#ffebee,stroke:#f44336
```

## Memory Manager

The memory manager (`memory_manager.py`) implements a dual-layer memory system for session persistence.

### Memory Architecture

```mermaid
flowchart TB
    subgraph Primary["PRIMARY: Graphiti"]
        G1[Semantic Search]
        G2[Knowledge Graph]
        G3[Cross-Session Context]
        G4[Entity Extraction]
    end

    subgraph Fallback["FALLBACK: File-based"]
        F1[JSON Files]
        F2[session_insights/]
        F3[Zero Dependencies]
        F4[Always Available]
    end

    Session[Session Complete] --> Check{Graphiti Enabled?}
    Check -->|Yes| TryGraphiti[Try Graphiti Save]
    TryGraphiti --> Success{Success?}
    Success -->|Yes| Done[Done - graphiti]
    Success -->|No| UseFallback[Use Fallback]
    Check -->|No| UseFallback
    UseFallback --> Fallback
    Fallback --> DoneFallback[Done - file]

    style Primary fill:#e3f2fd,stroke:#1976d2
    style Fallback fill:#fff3e0,stroke:#f57c00
```

### Function: debug_memory_system_status

Prints memory system status for debugging (when `DEBUG=true`).

```python
def debug_memory_system_status() -> None
```

### Function: get_graphiti_context

Retrieves relevant context from Graphiti for the current subtask.

```python
async def get_graphiti_context(
    spec_dir: Path,
    project_dir: Path,
    subtask: dict,
) -> str | None
```

#### Context Retrieval Flow

```mermaid
sequenceDiagram
    participant Caller
    participant GetContext as get_graphiti_context
    participant GraphitiMem as GraphitiMemory
    participant Format as Formatter

    Caller->>GetContext: subtask data
    GetContext->>GetContext: Check Graphiti enabled
    alt Not Enabled
        GetContext-->>Caller: None
    end
    GetContext->>GraphitiMem: Create instance
    GetContext->>GetContext: Build search query
    GetContext->>GraphitiMem: get_relevant_context(query)
    GraphitiMem-->>GetContext: context_items
    GetContext->>GraphitiMem: get_session_history(limit=3)
    GraphitiMem-->>GetContext: session_history
    GetContext->>GraphitiMem: close()
    GetContext->>Format: Format sections
    Format-->>GetContext: Markdown string
    GetContext-->>Caller: Formatted context
```

### Function: save_session_memory

Saves session insights using the dual-layer approach.

```python
async def save_session_memory(
    spec_dir: Path,
    project_dir: Path,
    subtask_id: str,
    session_num: int,
    success: bool,
    subtasks_completed: list[str],
    discoveries: dict | None = None,
) -> tuple[bool, str]
```

#### Return Values

| Storage Type | Description |
|--------------|-------------|
| `("graphiti", True)` | Successfully saved to Graphiti |
| `("file", True)` | Successfully saved to file-based storage |
| `("none", False)` | Both storage methods failed |

### Insights Structure

```mermaid
classDiagram
    class SessionInsights {
        +subtasks_completed: List~str~
        +discoveries: Discoveries
        +what_worked: List~str~
        +what_failed: List~str~
        +recommendations_for_next_session: List~str~
    }

    class Discoveries {
        +files_understood: Dict~str,str~
        +patterns_found: List~str~
        +gotchas_encountered: List~str~
        +file_insights: List~FileInsight~
    }

    class FileInsight {
        +file_path: str
        +description: str
        +category: str
    }

    SessionInsights --> Discoveries
    Discoveries --> FileInsight
```

## Utils Module

The utils module (`utils.py`) provides helper functions for git operations and plan management.

### Function Overview

```mermaid
flowchart LR
    subgraph Git["Git Operations"]
        GetCommit[get_latest_commit]
        GetCount[get_commit_count]
    end

    subgraph Plan["Plan Management"]
        LoadPlan[load_implementation_plan]
        FindSubtask[find_subtask_in_plan]
        FindPhase[find_phase_for_subtask]
    end

    subgraph Sync["Sync Operations"]
        SyncPlan[sync_plan_to_source]
    end

    Git --> Project[Project Directory]
    Plan --> SpecDir[Spec Directory]
    Sync --> Both[Both Directories]

    style Git fill:#e3f2fd,stroke:#1976d2
    style Plan fill:#e8f5e9,stroke:#4caf50
    style Sync fill:#fff3e0,stroke:#f57c00
```

### Git Operations

#### get_latest_commit

```python
def get_latest_commit(project_dir: Path) -> str | None
```

Returns the hash of the latest git commit, or `None` if unavailable.

#### get_commit_count

```python
def get_commit_count(project_dir: Path) -> int
```

Returns the total number of commits in the repository.

### Plan Management

#### load_implementation_plan

```python
def load_implementation_plan(spec_dir: Path) -> dict | None
```

Loads and parses the `implementation_plan.json` file.

#### find_subtask_in_plan

```python
def find_subtask_in_plan(plan: dict, subtask_id: str) -> dict | None
```

Finds a subtask by ID in the plan, searching all phases.

#### find_phase_for_subtask

```python
def find_phase_for_subtask(plan: dict, subtask_id: str) -> dict | None
```

Returns the phase containing the specified subtask.

### Sync Operations

#### sync_plan_to_source

```python
def sync_plan_to_source(spec_dir: Path, source_spec_dir: Path | None) -> bool
```

Syncs `implementation_plan.json` from worktree back to main project.

```mermaid
flowchart LR
    Check{Source Specified?}
    Check -->|No| ReturnFalse[Return False]
    Check -->|Yes| ComparePaths{Same Path?}
    ComparePaths -->|Yes| ReturnFalse
    ComparePaths -->|No| CheckExists{Plan Exists?}
    CheckExists -->|No| ReturnFalse
    CheckExists -->|Yes| CopyFile[Copy to Source]
    CopyFile --> ReturnTrue[Return True]

    style ReturnTrue fill:#e8f5e9,stroke:#4caf50
    style ReturnFalse fill:#ffebee,stroke:#f44336
```

## Lazy Import Pattern

The `__init__.py` uses Python's `__getattr__` for lazy imports to avoid circular dependencies:

```mermaid
flowchart TB
    Import[Import agents.function]
    GetAttr["__getattr__(name)"]

    subgraph Checks["Name Routing"]
        CheckConstants{Constants?}
        CheckCoder{Coder?}
        CheckMemory{Memory?}
        CheckPlanner{Planner?}
        CheckSession{Session?}
        CheckUtils{Utils?}
    end

    subgraph Imports["Lazy Imports"]
        ImportBase[from .base import ...]
        ImportCoder[from .coder import ...]
        ImportMemory[from .memory_manager import ...]
        ImportPlanner[from .planner import ...]
        ImportSession[from .session import ...]
        ImportUtils[from .utils import ...]
    end

    Import --> GetAttr
    GetAttr --> Checks
    CheckConstants -->|Yes| ImportBase
    CheckCoder -->|Yes| ImportCoder
    CheckMemory -->|Yes| ImportMemory
    CheckPlanner -->|Yes| ImportPlanner
    CheckSession -->|Yes| ImportSession
    CheckUtils -->|Yes| ImportUtils

    style Checks fill:#e3f2fd,stroke:#1976d2
    style Imports fill:#e8f5e9,stroke:#4caf50
```

### Exported API

| Category | Functions |
|----------|-----------|
| **Main API** | `run_autonomous_agent`, `run_followup_planner` |
| **Memory** | `debug_memory_system_status`, `get_graphiti_context`, `save_session_memory`, `save_session_to_graphiti` |
| **Session** | `run_agent_session`, `post_session_processing` |
| **Utils** | `get_latest_commit`, `get_commit_count`, `load_implementation_plan`, `find_subtask_in_plan`, `find_phase_for_subtask`, `sync_plan_to_source` |
| **Constants** | `AUTO_CONTINUE_DELAY_SECONDS`, `HUMAN_INTERVENTION_FILE` |

## Integration Points

### External Dependencies

```mermaid
flowchart LR
    Agents[Agents Module]

    subgraph External["External Services"]
        Claude[Claude Agent SDK]
        Linear[Linear API]
        Graphiti[Graphiti Memory]
    end

    subgraph Internal["Internal Modules"]
        Core[core/client]
        Recovery[recovery]
        Progress[progress]
        Prompts[prompts]
        UI[ui]
    end

    Agents <-->|Execute| Claude
    Agents <-->|Track| Linear
    Agents <-->|Remember| Graphiti
    Agents --> Core
    Agents --> Recovery
    Agents --> Progress
    Agents --> Prompts
    Agents --> UI

    style External fill:#fce4ec,stroke:#e91e63
    style Internal fill:#e8f5e9,stroke:#4caf50
```

### Key Dependencies

| Module | Purpose |
|--------|---------|
| `claude_agent_sdk` | AI agent execution |
| `linear_updater` | Task progress tracking |
| `graphiti_memory` | Cross-session memory |
| `recovery` | Attempt tracking and rollback |
| `progress` | Build status tracking |
| `prompt_generator` | Dynamic prompt creation |
| `ui` | Status display and formatting |

## Error Handling

### Recovery Strategy

```mermaid
flowchart TB
    Attempt[Session Attempt]
    CheckSuccess{Success?}

    subgraph Success["On Success"]
        RecordGood[Record Good Commit]
        SaveInsights[Save Session Insights]
        UpdateLinear[Update Linear Progress]
    end

    subgraph Failure["On Failure"]
        RecordFailed[Record Failed Attempt]
        CheckAttempts{Attempts >= 3?}
        GetHints[Get Recovery Hints]
        MarkStuck[Mark as Stuck]
        NotifyStuck[Notify Linear - Stuck]
    end

    Attempt --> CheckSuccess
    CheckSuccess -->|Yes| Success
    CheckSuccess -->|No| Failure
    RecordFailed --> CheckAttempts
    CheckAttempts -->|No| GetHints
    GetHints --> Retry[Retry with Context]
    Retry --> Attempt
    CheckAttempts -->|Yes| MarkStuck
    MarkStuck --> NotifyStuck
    NotifyStuck --> Manual[Require Manual Intervention]

    style Success fill:#e8f5e9,stroke:#4caf50
    style Failure fill:#ffebee,stroke:#f44336
```

### Error States

| State | Trigger | Action |
|-------|---------|--------|
| **continue** | Session completed normally | Auto-continue to next subtask |
| **complete** | All subtasks done | Print banner, exit loop |
| **error** | Exception during session | Log error, retry with fresh session |
| **stuck** | 3+ failed attempts | Mark subtask as stuck, notify user |

## Performance Considerations

| Aspect | Implementation |
|--------|----------------|
| **Lazy Imports** | `__getattr__` pattern avoids loading unused modules |
| **Streaming Output** | Real-time display of agent responses |
| **Memory Fallback** | File-based storage when Graphiti unavailable |
| **Worktree Sync** | Efficient plan synchronization for isolated builds |

## Next Steps

- [Session Module](./session.md) - Detailed session management documentation
- [Memory System](./memory.md) - Memory architecture deep dive
- [Recovery Module](./recovery.md) - Error recovery and rollback
- [Custom Tools](./tools.md) - MCP tools for agent operations
