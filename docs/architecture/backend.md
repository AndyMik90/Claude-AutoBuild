# Backend Architecture

The Auto-Claude backend is a Python-based autonomous coding system built on the Claude Agent SDK. This document provides a comprehensive overview of its modular architecture, key components, and data flows.

## Architecture Overview

The backend is organized into focused modules with clear responsibilities:

```mermaid
flowchart TB
    subgraph Entry["Entry Points"]
        Agent[agent.py]
        CLI[cli/]
        API[core/]
    end

    subgraph Agents["Agent System"]
        Coder[Coder Agent]
        Planner[Planner Agent]
        Session[Session Manager]
        MemoryMgr[Memory Manager]
        Tools[Custom Tools]
    end

    subgraph Analysis["Analysis System"]
        PA[Project Analyzer]
        SA[Service Analyzer]
        FA[Framework Analyzer]
        Detectors[Context Detectors]
    end

    subgraph Context["Context & Memory"]
        Builder[Context Builder]
        Search[Context Search]
        Graphiti[Graphiti Integration]
        FileMem[File-based Memory]
    end

    subgraph Core["Core Infrastructure"]
        Client[Claude SDK Client]
        Auth[Auth Manager]
        Workspace[Workspace Manager]
        Recovery[Recovery Manager]
    end

    Entry --> Agents
    Agents --> Analysis
    Agents --> Context
    Context --> Core
    Core --> Client

    style Entry fill:#e8f5e9,stroke:#4caf50
    style Agents fill:#e3f2fd,stroke:#1976d2
    style Analysis fill:#fff3e0,stroke:#f57c00
    style Context fill:#fce4ec,stroke:#e91e63
    style Core fill:#f3e5f5,stroke:#9c27b0
```

## Agent System

The agent system is the heart of Auto-Claude, executing autonomous coding tasks through the Claude Agent SDK.

### Module Structure

```
apps/backend/agents/
├── __init__.py          # Public API exports (lazy loading)
├── base.py              # Shared constants and configuration
├── coder.py             # Main autonomous agent loop
├── planner.py           # Follow-up planner logic
├── session.py           # Session execution and tracking
├── memory_manager.py    # Dual-layer memory system
├── utils.py             # Git operations and plan management
└── tools_pkg/           # Custom MCP tools
    ├── models.py        # Tool definitions
    ├── permissions.py   # Tool access control
    ├── registry.py      # MCP server creation
    └── tools/           # Tool implementations
        ├── memory.py    # Memory tools
        ├── progress.py  # Build progress tools
        ├── qa.py        # QA tools
        └── subtask.py   # Subtask management
```

### Agent Class Relationships

```mermaid
classDiagram
    class CoderAgent {
        +run_autonomous_agent()
        -recovery_manager
        -status_manager
        -task_logger
    }

    class PlannerAgent {
        +run_followup_planner()
        -client
        -prompt_generator
    }

    class SessionManager {
        +run_agent_session()
        +post_session_processing()
        -tool_tracking
        -logging
    }

    class MemoryManager {
        +save_session_memory()
        +get_graphiti_context()
        +debug_memory_system_status()
        -graphiti_client
        -file_fallback
    }

    class RecoveryManager {
        +record_attempt()
        +get_recovery_hints()
        +mark_subtask_stuck()
        -attempt_history
        -good_commits
    }

    CoderAgent --> SessionManager : uses
    CoderAgent --> MemoryManager : uses
    CoderAgent --> RecoveryManager : uses
    PlannerAgent --> SessionManager : uses
    SessionManager --> MemoryManager : saves to
```

### Coder Agent Flow

The main autonomous agent loop handles the complete build lifecycle:

```mermaid
sequenceDiagram
    participant Run as run_autonomous_agent()
    participant Check as Pre-Session Checks
    participant Session as run_agent_session()
    participant Post as post_session_processing()
    participant Memory as MemoryManager

    Run->>Check: Check for PAUSE file
    Check->>Check: Get next subtask
    Check->>Session: Generate prompt
    Session->>Session: Create SDK client
    Session->>Session: Execute with Claude SDK
    Session-->>Run: (status, response)
    Run->>Post: Process results
    Post->>Post: Check subtask status
    Post->>Memory: Save session insights
    Post->>Post: Update Linear (if enabled)
    Post-->>Run: success/failure

    alt Subtask completed
        Run->>Run: Continue to next
    else Stuck after 3 attempts
        Run->>Run: Mark as stuck
    end
```

### Memory System

The backend uses a dual-layer memory system for session persistence:

```mermaid
flowchart LR
    subgraph Primary["Primary: Graphiti"]
        G1[Semantic Search]
        G2[Cross-Session Context]
        G3[Knowledge Graph]
    end

    subgraph Fallback["Fallback: File-based"]
        F1[JSON Files]
        F2[session_insights/]
        F3[Zero Dependencies]
    end

    Session[Session Complete] --> Check{Graphiti Enabled?}
    Check -->|Yes| Primary
    Check -->|No| Fallback
    Primary -->|Fails| Fallback

    style Primary fill:#e3f2fd,stroke:#1976d2
    style Fallback fill:#fff3e0,stroke:#f57c00
```

| Memory Type | Use Case | Features |
|-------------|----------|----------|
| **Graphiti** | Production | Semantic search, entity extraction, cross-session learning |
| **File-based** | Development | JSON files, no external dependencies, always available |

## Analysis System

The analysis system automatically detects project structure, frameworks, and services.

### Module Structure

```
apps/backend/analysis/
├── analyzer.py              # CLI facade
├── project_analyzer.py      # Full project analysis
├── analyzers/
│   ├── base.py              # BaseAnalyzer class
│   ├── service_analyzer.py  # Single service analysis
│   ├── project_analyzer_module.py  # Monorepo detection
│   ├── framework_analyzer.py       # Framework detection
│   ├── route_detector.py           # API route detection
│   ├── database_detector.py        # Database model detection
│   ├── context_analyzer.py         # Context extraction
│   └── context/                    # Specialized detectors
│       ├── api_docs_detector.py
│       ├── auth_detector.py
│       ├── env_detector.py
│       ├── jobs_detector.py
│       ├── migrations_detector.py
│       ├── monitoring_detector.py
│       └── services_detector.py
├── risk_classifier.py       # Change risk assessment
├── security_scanner.py      # Security vulnerability detection
└── insight_extractor.py     # Session insight extraction
```

### Analyzer Class Hierarchy

```mermaid
classDiagram
    class BaseAnalyzer {
        <<abstract>>
        +path: Path
        +analyze()
        #_find_files()
        #_read_file()
    }

    class ServiceAnalyzer {
        +name: str
        +analysis: dict
        +analyze()
        -_detect_language_and_framework()
        -_detect_service_type()
        -_find_entry_points()
    }

    class ProjectAnalyzer {
        +project_dir: Path
        +analyze()
        -_detect_if_monorepo()
        -_find_all_services()
        -_map_dependencies()
    }

    class FrameworkAnalyzer {
        +detect_language_and_framework()
        -_check_package_json()
        -_check_requirements()
        -_check_go_mod()
    }

    class ContextAnalyzer {
        +analyze_context()
        -_extract_env_vars()
        -_find_config_files()
    }

    BaseAnalyzer <|-- ServiceAnalyzer
    BaseAnalyzer <|-- ProjectAnalyzer
    ServiceAnalyzer --> FrameworkAnalyzer : uses
    ServiceAnalyzer --> ContextAnalyzer : uses
```

### Analysis Pipeline

```mermaid
flowchart LR
    subgraph Detection
        Lang[Language Detection]
        Frame[Framework Detection]
        Type[Service Type]
    end

    subgraph Extraction
        Routes[API Routes]
        Models[Database Models]
        Deps[Dependencies]
    end

    subgraph Context
        Env[Environment Vars]
        Auth[Auth Patterns]
        Jobs[Background Jobs]
    end

    Input[Project Dir] --> Detection
    Detection --> Extraction
    Extraction --> Context
    Context --> Output[project_index.json]
```

## Context System

The context system builds and searches contextual information for agent prompts.

### Module Structure

```
apps/backend/context/
├── builder.py               # Context builder
├── search.py                # Context search
├── categorizer.py           # File categorization
├── keyword_extractor.py     # Keyword extraction
├── pattern_discovery.py     # Pattern detection
├── service_matcher.py       # Service matching
├── graphiti_integration.py  # Memory integration
├── models.py                # Data models
├── serialization.py         # JSON serialization
└── constants.py             # Configuration
```

### Context Building Flow

```mermaid
flowchart TB
    subgraph Input
        Subtask[Subtask Definition]
        Plan[Implementation Plan]
        Project[Project Files]
    end

    subgraph Processing
        Keywords[Keyword Extraction]
        Category[File Categorization]
        Patterns[Pattern Discovery]
        Service[Service Matching]
    end

    subgraph Output
        Context[Context Object]
        Prompt[Enriched Prompt]
    end

    Subtask --> Keywords
    Plan --> Service
    Project --> Category
    Category --> Patterns
    Keywords --> Context
    Patterns --> Context
    Service --> Context
    Context --> Prompt

    style Processing fill:#e3f2fd,stroke:#1976d2
```

| Component | Purpose |
|-----------|---------|
| **ContextBuilder** | Orchestrates context creation from multiple sources |
| **ContextSearch** | Searches relevant files and patterns |
| **PatternDiscovery** | Identifies code patterns and conventions |
| **GraphitiIntegration** | Queries memory for historical context |

## Core Infrastructure

The core module provides fundamental services used across the backend.

### Module Structure

```
apps/backend/core/
├── agent.py                 # Agent execution utilities
├── client.py                # Claude SDK client factory
├── auth.py                  # Authentication management
├── workspace.py             # Workspace management
├── workspace/
│   ├── setup.py             # Workspace initialization
│   ├── finalization.py      # Cleanup and commit
│   ├── git_utils.py         # Git operations
│   ├── display.py           # Progress display
│   └── models.py            # Data structures
├── worktree.py              # Git worktree management
├── progress.py              # Build progress tracking
├── phase_event.py           # Execution phase events
└── debug.py                 # Debug utilities
```

### Client Creation Flow

```mermaid
sequenceDiagram
    participant Caller
    participant ClientFactory as create_client()
    participant Auth as AuthManager
    participant MCP as MCP Server
    participant SDK as Claude SDK

    Caller->>ClientFactory: create_client(project_dir, spec_dir, model)
    ClientFactory->>Auth: Get credentials
    Auth-->>ClientFactory: OAuth token
    ClientFactory->>MCP: Create auto-claude tools
    MCP-->>ClientFactory: MCP server instance
    ClientFactory->>SDK: ClaudeSDKClient(options)
    SDK-->>Caller: client instance
```

### Workspace Lifecycle

```mermaid
flowchart LR
    subgraph Setup
        Init[Initialize]
        Branch[Create Branch]
        Worktree[Setup Worktree]
    end

    subgraph Execution
        Agent[Run Agent]
        Commits[Create Commits]
        Track[Track Changes]
    end

    subgraph Finalization
        Merge[Merge Changes]
        Cleanup[Cleanup Worktree]
        Report[Generate Report]
    end

    Setup --> Execution
    Execution --> Finalization
```

## CLI System

The CLI provides command-line access to all backend functionality.

### Module Structure

```
apps/backend/cli/
├── main.py              # CLI entry point
├── build_commands.py    # Build-related commands
├── spec_commands.py     # Spec management
├── qa_commands.py       # QA operations
├── batch_commands.py    # Batch processing
├── followup_commands.py # Follow-up planning
├── workspace_commands.py # Workspace management
├── input_handlers.py    # Input validation
└── utils.py             # CLI utilities
```

### Command Categories

```mermaid
flowchart TB
    CLI[auto-claude CLI]

    subgraph BuildCmds["Build Commands"]
        Build[build]
        Plan[plan]
        Continue[continue]
    end

    subgraph SpecCmds["Spec Commands"]
        Create[create-spec]
        List[list-specs]
        Status[status]
    end

    subgraph QACmds["QA Commands"]
        QA[qa]
        Review[review]
        Approve[approve]
    end

    subgraph UtilityCmds["Utility Commands"]
        Analyze[analyze]
        Index[index]
        Clean[clean]
    end

    CLI --> BuildCmds
    CLI --> SpecCmds
    CLI --> QACmds
    CLI --> UtilityCmds
```

## Integration Patterns

### External Integrations

```mermaid
flowchart LR
    Backend[Backend]

    subgraph External
        Claude[Claude API]
        Linear[Linear API]
        Graphiti[Graphiti]
        GitHub[GitHub API]
    end

    Backend <-->|Agent SDK| Claude
    Backend <-->|Task Tracking| Linear
    Backend <-->|Memory| Graphiti
    Backend <-->|PR/Issues| GitHub
```

| Integration | Purpose | Module |
|-------------|---------|--------|
| **Claude API** | AI agent execution | `core/client.py` |
| **Linear** | Task progress tracking | `integrations/linear/` |
| **Graphiti** | Memory and context | `integrations/graphiti/` |
| **GitHub** | Repository operations | `core/workspace/` |

### Custom MCP Tools

The backend provides custom MCP tools for reliable agent operations:

```mermaid
flowchart TB
    subgraph Tools["Custom MCP Tools"]
        UpdateStatus[update_subtask_status]
        GetProgress[get_build_progress]
        RecordDiscovery[record_discovery]
        RecordGotcha[record_gotcha]
        GetContext[get_session_context]
        UpdateQA[update_qa_status]
    end

    subgraph Benefits
        Reliable[100% Reliable JSON]
        TypeSafe[Type-safe Operations]
        Reduced[Reduced Context Usage]
    end

    Tools --> Benefits
```

## Data Structures

### Implementation Plan

```mermaid
classDiagram
    class ImplementationPlan {
        +feature: str
        +workflow_type: str
        +phases: List~Phase~
        +summary: PlanSummary
        +status: PlanStatus
    }

    class Phase {
        +id: str
        +name: str
        +type: PhaseType
        +subtasks: List~Subtask~
        +depends_on: List~str~
    }

    class Subtask {
        +id: str
        +description: str
        +service: str
        +files_to_modify: List~str~
        +files_to_create: List~str~
        +verification: Verification
        +status: SubtaskStatus
    }

    class Verification {
        +type: str
        +command: str
        +expected: str
    }

    ImplementationPlan "1" --> "*" Phase
    Phase "1" --> "*" Subtask
    Subtask "1" --> "1" Verification
```

### Session Insights

```mermaid
classDiagram
    class SessionInsights {
        +session_number: int
        +subtasks_completed: List~str~
        +discoveries: Discoveries
        +what_worked: List~str~
        +what_failed: List~str~
        +recommendations: List~str~
    }

    class Discoveries {
        +files_understood: Dict
        +patterns_found: List~str~
        +gotchas_encountered: List~str~
    }

    SessionInsights --> Discoveries
```

## Error Handling and Recovery

### Recovery Strategy

```mermaid
flowchart TB
    Attempt[Subtask Attempt]

    Attempt --> Success{Success?}
    Success -->|Yes| RecordGood[Record Good Commit]
    Success -->|No| CheckCount{Attempts >= 3?}

    CheckCount -->|No| GetHints[Get Recovery Hints]
    GetHints --> Retry[Retry with Context]
    Retry --> Attempt

    CheckCount -->|Yes| MarkStuck[Mark as Stuck]
    MarkStuck --> NotifyLinear[Notify Linear]
    NotifyLinear --> Manual[Require Manual Intervention]

    style Success fill:#e8f5e9,stroke:#4caf50
    style MarkStuck fill:#ffebee,stroke:#f44336
```

| Recovery Feature | Description |
|------------------|-------------|
| **Attempt Tracking** | Records each attempt with approach and errors |
| **Good Commits** | Stores successful commits for rollback safety |
| **Recovery Hints** | Provides context from failed attempts |
| **Stuck Detection** | Marks subtasks as stuck after max retries |

## Performance Considerations

| Aspect | Implementation |
|--------|----------------|
| **Lazy Imports** | `__getattr__` pattern avoids circular dependencies |
| **Streaming Output** | NDJSON for real-time progress updates |
| **Concurrent Analysis** | Service analyzers can run in parallel |
| **Memory Caching** | Graphiti caches for repeated queries |

## Next Steps

- [Analysis Module](../components/backend/analysis.md) - Detailed analyzer documentation
- [Agents Module](../components/backend/agents.md) - Agent implementation details
- [CLI Module](../components/backend/cli.md) - Command-line interface reference
- [Core Module](../components/backend/core.md) - Core services documentation
