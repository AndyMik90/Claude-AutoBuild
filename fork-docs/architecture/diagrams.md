# Architecture Diagrams

This document contains all the visual diagrams for the Auto-Claude-Gemini fork architecture.

---

## System Overview

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#4A90D9', 'primaryTextColor': '#fff', 'primaryBorderColor': '#2563EB', 'lineColor': '#6B7280', 'secondaryColor': '#10B981', 'tertiaryColor': '#F59E0B'}}}%%

flowchart TB
    subgraph UI["Auto-Claude UI (Electron)"]
        PM[Profile Manager]
        TM[Task Manager]
        TERM[Agent Terminals]
    end

    subgraph Core["Auto-Claude Core (Python)"]
        SR[spec_runner.py]
        RUN[run.py]

        subgraph NewLayer["NEW: Provider Layer"]
            direction TB
            PR[Provider Router]
            REG[Provider Registry]
        end
    end

    subgraph Providers["Execution Providers"]
        direction LR

        subgraph Sync["Synchronous"]
            CLAUDE["Claude CLI Provider<br/>Claude 4.5 Family"]
            GEMINI["Gemini CLI Provider<br/>Gemini 3 Flash/Pro"]
        end

        subgraph Async["Asynchronous"]
            JULES["Jules API Provider<br/>Gemini 3 Pro internal"]
        end
    end

    subgraph External["External Services"]
        CLAUDE_CLI[("claude CLI<br/>(Anthropic)")]
        GEMINI_CLI[("gemini CLI<br/>(Google)<br/>v0.21.1+")]
        JULES_API[("Jules REST API<br/>(Google)")]
    end

    %% UI to Core
    PM -->|profile config| PR
    TM -->|task specs| SR
    TERM -->|direct commands| RUN

    %% Core orchestration
    SR --> RUN
    RUN --> PR
    PR --> REG

    %% Router to Providers
    REG -->|"LOW/MED: gemini-3-flash-preview"| GEMINI
    REG -->|"HIGH: gemini-3-pro-preview"| GEMINI
    REG -->|"Quality: claude-opus-4-5"| CLAUDE
    REG -->|async tasks| JULES

    %% Providers to External
    CLAUDE -->|subprocess| CLAUDE_CLI
    GEMINI -->|subprocess| GEMINI_CLI
    JULES -->|REST API| JULES_API

    %% Styling
    classDef newComponent fill:#10B981,stroke:#059669,color:#fff
    classDef provider fill:#4A90D9,stroke:#2563EB,color:#fff
    classDef external fill:#6B7280,stroke:#4B5563,color:#fff

    class PR,REG newComponent
    class CLAUDE,GEMINI,JULES provider
    class CLAUDE_CLI,GEMINI_CLI,JULES_API external
```

---

## Profile-Based Routing Flow

```mermaid
flowchart LR
    subgraph Input
        TASK[Task Request]
        COMP[Complexity Tier]
    end

    subgraph Profile["Profile Config (Dec 2025)"]
        direction TB
        P1["Fast & Cheap<br/>→ all: gemini-3-flash-preview"]
        P2["Background<br/>→ all: jules-api"]
        P3["Quality First<br/>→ all: claude-cli"]
        P4["Hybrid<br/>→ LOW: gemini-3-flash MINIMAL<br/>→ MED: gemini-3-flash HIGH<br/>→ HIGH: gemini-3-pro"]
    end

    subgraph Router["Provider Router"]
        ROUTE{Route by<br/>Complexity}
    end

    subgraph Exec["Execution (Current Models)"]
        E1["Gemini 3 Flash<br/>gemini-3-flash-preview"]
        E2["Jules API<br/>(Gemini 3 Pro internal)"]
        E3["Gemini 3 Pro<br/>gemini-3-pro-preview"]
        E4["Claude 4.5<br/>claude-opus-4-5-20251101"]
    end

    TASK --> ROUTE
    COMP --> ROUTE
    Profile -.->|selected| ROUTE

    ROUTE -->|LOW| E1
    ROUTE -->|MEDIUM| E1
    ROUTE -->|HIGH| E3
    ROUTE -->|Quality| E4
    ROUTE -->|async| E2
```

---

## Jules API Session Lifecycle

```mermaid
sequenceDiagram
    participant AC as Auto-Claude
    participant JP as Jules Provider
    participant JA as Jules API
    participant GH as GitHub

    AC->>JP: execute(request)
    JP->>JA: POST /sessions
    JA-->>JP: {session_id, url}
    JP-->>AC: ExecutionResult(session_id)

    Note over AC: Continue with other tasks

    loop Poll for status
        AC->>JP: check_status(session_id)
        JP->>JA: GET /sessions/{id}/activities
        JA-->>JP: {activities: [...]}
        JP-->>AC: ExecutionResult(progress)
    end

    JA->>GH: Create PR
    JA-->>JP: sessionCompleted
    JP-->>AC: ExecutionResult(success, pr_url)
```

---

## File Structure

```mermaid
graph TD
    subgraph NewFiles["New Files (No Conflicts)"]
        P1[providers/__init__.py]
        P2[providers/base.py]
        P3[providers/claude_cli.py]
        P4[providers/gemini_cli.py]
        P5[providers/jules_api.py]
        P6[providers/router.py]

        C1[config/providers.json]

        PR1[profiles/fast-and-cheap.json]
        PR2[profiles/hybrid-optimal.json]
        PR3[profiles/background-worker.json]
    end

    subgraph Modified["Modified (Minimal)"]
        M1[run.py - add router call]
        M2[config.py - load providers]
    end

    subgraph Unchanged["Unchanged"]
        U1[spec_runner.py]
        U2[prompts/]
        U3[auto-claude-ui/]
    end
```

---

## Provider Class Hierarchy

```mermaid
classDiagram
    class ProviderInterface {
        <<abstract>>
        +name: str
        +execution_mode: ExecutionMode
        +execute(request) ExecutionResult
        +stream_execute(request) AsyncIterator
        +check_status(session_id) ExecutionResult
        +is_available() bool
        +get_model_for_tier(tier) str
    }

    class ClaudeCliProvider {
        -claude_path: str
        -oauth_token: str
        +MODEL_MAP: dict
        +execute(request) ExecutionResult
        +stream_execute(request) AsyncIterator
    }

    class GeminiCliProvider {
        -gemini_path: str
        +MODEL_MAP: dict
        +THINKING_LEVEL_MAP: dict
        +execute(request) ExecutionResult
        +stream_execute(request) AsyncIterator
    }

    class JulesApiProvider {
        -api_key: str
        -sessions: dict
        +BASE_URL: str
        +execute(request) ExecutionResult
        +check_status(session_id) ExecutionResult
        +wait_for_completion(session_id) ExecutionResult
    }

    class ProviderRouter {
        -profile_config: dict
        -global_config: dict
        -provider_instances: dict
        +get_provider_for_tier(tier) ProviderInterface
        +execute(request) ExecutionResult
    }

    class ProviderRegistry {
        +providers: dict
        +get(name) Type
        +register(name, provider)
        +list_available(config) list
    }

    ProviderInterface <|-- ClaudeCliProvider
    ProviderInterface <|-- GeminiCliProvider
    ProviderInterface <|-- JulesApiProvider
    ProviderRouter --> ProviderRegistry
    ProviderRouter --> ProviderInterface
```

---

## Data Flow

```mermaid
flowchart TB
    subgraph Request["Execution Request"]
        REQ[ExecutionRequest]
        REQ --> |prompt| PROMPT[Task Prompt]
        REQ --> |complexity| TIER[ComplexityTier]
        REQ --> |working_dir| DIR[Working Directory]
    end

    subgraph Routing["Provider Routing"]
        ROUTER[ProviderRouter]
        PROFILE[Profile Config]
        GLOBAL[Global Config]

        PROFILE --> ROUTER
        GLOBAL --> ROUTER
        REQ --> ROUTER
    end

    subgraph Execution["Provider Execution"]
        ROUTER --> |LOW/MED| GEMINI[GeminiCliProvider]
        ROUTER --> |HIGH| CLAUDE[ClaudeCliProvider]
        ROUTER --> |async| JULES[JulesApiProvider]
    end

    subgraph Result["Execution Result"]
        GEMINI --> RES[ExecutionResult]
        CLAUDE --> RES
        JULES --> RES

        RES --> |success| SUCCESS[bool]
        RES --> |response| RESP[str]
        RES --> |session_id| SID[Optional str]
        RES --> |metadata| META[dict]
    end
```

---

## Model Selection Matrix

```mermaid
graph LR
    subgraph Complexity["Task Complexity"]
        LOW[LOW]
        MED[MEDIUM]
        HIGH[HIGH]
    end

    subgraph Claude["Claude Models"]
        HAIKU["claude-3-5-haiku<br/>Fast, cheap"]
        SONNET["claude-sonnet-4<br/>Balanced"]
        OPUS["claude-opus-4-5<br/>Most capable"]
    end

    subgraph Gemini["Gemini 3 Models"]
        FLASH_MIN["gemini-3-flash<br/>MINIMAL thinking"]
        FLASH_HIGH["gemini-3-flash<br/>HIGH thinking"]
        PRO["gemini-3-pro<br/>Full reasoning"]
    end

    LOW --> |Claude| HAIKU
    MED --> |Claude| SONNET
    HIGH --> |Claude| OPUS

    LOW --> |Gemini| FLASH_MIN
    MED --> |Gemini| FLASH_HIGH
    HIGH --> |Gemini| PRO
```

---

## Profile Examples

```mermaid
graph TB
    subgraph Profiles
        FC["Fast & Cheap"]
        BW["Background Worker"]
        QF["Quality First"]
        HO["Hybrid Optimal"]
    end

    subgraph Routing
        FC --> |all tiers| GEM["gemini-cli"]
        BW --> |all tiers| JUL["jules-api"]
        QF --> |all tiers| CLA["claude-cli"]
        HO --> |LOW/MED| GEM2["gemini-cli"]
        HO --> |HIGH| CLA2["claude-cli"]
    end
```
