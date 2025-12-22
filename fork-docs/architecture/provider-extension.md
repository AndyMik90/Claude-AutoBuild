# Auto-Claude Multi-Provider Extension Architecture

## Executive Summary

This document defines a **minimal-invasion architecture** for extending Auto-Claude with:

1. **Gemini CLI Provider** - Synchronous CLI execution with JSON output
2. **Jules API Provider** - Asynchronous background agent with REST polling
3. **Profile-Based Routing** - User-configurable provider selection per complexity tier

**Design Principle**: New files over modifications. Abstraction layers that existing code can adopt incrementally.

---

## 1. Current Architecture Analysis

### Repository Structure (Auto-Claude)

```
Auto-Claude/
├── auto-claude/                 # Python Backend
│   ├── run.py                   # Build entry point
│   ├── spec_runner.py           # Spec creation orchestrator
│   ├── prompts/                 # Agent prompt templates
│   ├── requirements.txt
│   └── ...
├── auto-claude-ui/              # Electron Desktop App (TypeScript)
│   ├── src/
│   │   ├── main/                # Electron main process
│   │   └── renderer/            # React frontend
│   └── ...
└── guides/
```

### Key Observations

Based on the documentation and structure:

1. **CLI Execution**: Auto-Claude uses the Claude Code CLI (`claude`) via subprocess
2. **No Provider Abstraction**: Currently hardcoded to Claude CLI
3. **Profile System**: Exists for agent configuration but not provider routing
4. **Python Backend**: Orchestrates all agent execution

### Critical Files to Understand (Need Verification)

| File                                 | Purpose               | Modification Risk |
| ------------------------------------ | --------------------- | ----------------- |
| `auto-claude/run.py`                 | Main entry point      | LOW - can wrap    |
| `auto-claude/spec_runner.py`         | Spec orchestration    | LOW - can wrap    |
| `auto-claude/config.py` (assumed)    | Configuration loading | MEDIUM            |
| `auto-claude-ui/src/.../profiles.ts` | Profile management    | MEDIUM            |

---

## 2. Architecture Design

### 2.1 Provider Abstraction Layer

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Auto-Claude Core                              │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────┐   │
│  │ spec_runner │   │   run.py    │   │    Profile Manager      │   │
│  └──────┬──────┘   └──────┬──────┘   └───────────┬─────────────┘   │
│         │                 │                       │                 │
│         └────────────────┬┴───────────────────────┘                 │
│                          ▼                                          │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │              Provider Router (NEW)                             │ │
│  │   - Reads profile config                                       │ │
│  │   - Routes by complexity tier (LOW/MEDIUM/HIGH)               │ │
│  │   - Handles provider-specific execution                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ Claude CLI      │    │ Gemini CLI      │    │ Jules API       │
│ Provider        │    │ Provider        │    │ Provider        │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ - claude -p     │    │ - gemini -p     │    │ - REST sessions │
│ - stream-json   │    │ - --output-json │    │ - Polling loop  │
│ - Synchronous   │    │ - Synchronous   │    │ - Async w/poll  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 2.2 Component Responsibilities

| Component           | Responsibility                                 | New/Modified                |
| ------------------- | ---------------------------------------------- | --------------------------- |
| `ProviderInterface` | Abstract base class defining provider contract | **NEW**                     |
| `ClaudeCliProvider` | Wraps existing Claude CLI logic                | **NEW** (extracts existing) |
| `GeminiCliProvider` | Implements Gemini CLI execution                | **NEW**                     |
| `JulesApiProvider`  | Implements Jules REST API client               | **NEW**                     |
| `ProviderRouter`    | Routes requests based on profile config        | **NEW**                     |
| `ProfileManager`    | Extended with provider configuration           | **MODIFIED** (minimal)      |

### 2.3 Provider Characteristics (December 2025)

| Provider       | Mode         | Model Family                   | Output Format   |
| -------------- | ------------ | ------------------------------ | --------------- |
| **Claude CLI** | Sync         | Claude 4.5 (haiku/sonnet/opus) | stream-json     |
| **Gemini CLI** | Sync         | **Gemini 3** (Flash/Pro)       | JSON            |
| **Jules API**  | Async (poll) | Gemini 3 Pro (internal)        | REST activities |

**Current Model Identifiers**:

| Provider   | LOW Tier                                    | MEDIUM Tier                              | HIGH Tier                  |
| ---------- | ------------------------------------------- | ---------------------------------------- | -------------------------- |
| Claude CLI | `claude-3-5-haiku-20241022`                 | `claude-sonnet-4-20250514`               | `claude-opus-4-5-20251101` |
| Gemini CLI | `gemini-3-flash-preview` (MINIMAL thinking) | `gemini-3-flash-preview` (HIGH thinking) | `gemini-3-pro-preview`     |
| Jules API  | N/A (fixed model)                           | N/A (fixed model)                        | N/A (fixed model)          |

**Key Gemini 3 Features** (launched Dec 17, 2025):

- Gemini 3 Flash: 78% on SWE-bench (outperforms Pro on agentic coding!)
- Gemini 3 Pro: Best for complex reasoning
- `thinking_level` parameter: MINIMAL, LOW, MEDIUM, HIGH
- 1M token context window
- 3x faster than Gemini 2.5 Pro at ~25% cost

---

## 3. Provider Specifications

### 3.1 Provider Interface (Python)

```python
# auto-claude/providers/base.py
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator, Optional, Dict, Any
from enum import Enum

class ComplexityTier(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class ExecutionMode(Enum):
    SYNC = "sync"      # Blocks until complete (Claude CLI, Gemini CLI)
    ASYNC = "async"    # Returns immediately, needs polling (Jules)

@dataclass
class ExecutionResult:
    """Standardized result from any provider"""
    success: bool
    response: str
    error: Optional[str] = None
    metadata: Dict[str, Any] = None  # Provider-specific data
    session_id: Optional[str] = None  # For async providers

@dataclass
class ExecutionRequest:
    """Standardized request to any provider"""
    prompt: str
    working_dir: str
    complexity: ComplexityTier
    max_turns: int = 50
    allowed_tools: list = None
    context_files: list = None

class ProviderInterface(ABC):
    """Abstract base class for all execution providers"""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier"""
        pass

    @property
    @abstractmethod
    def execution_mode(self) -> ExecutionMode:
        """Whether provider is sync or async"""
        pass

    @abstractmethod
    async def execute(self, request: ExecutionRequest) -> ExecutionResult:
        """Execute a task. For async providers, starts the task."""
        pass

    @abstractmethod
    async def stream_execute(self, request: ExecutionRequest) -> AsyncIterator[str]:
        """Stream execution output. Falls back to execute() for async providers."""
        pass

    @abstractmethod
    async def check_status(self, session_id: str) -> ExecutionResult:
        """Check status of async execution. Raises for sync providers."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if provider is configured and available"""
        pass

    def get_model_for_tier(self, tier: ComplexityTier) -> str:
        """Map complexity tier to provider-specific model"""
        raise NotImplementedError
```

### 3.2 Gemini CLI Provider

**Command Format**:

```bash
gemini -p "prompt" --output-format json -y
```

**JSON Output Schema**:

```json
{
  "response": "string",
  "stats": {
    "models": { ... },
    "tools": { ... },
    "files": { ... }
  },
  "error": {
    "type": "string",
    "message": "string",
    "code": "number"
  }
}
```

**Model Mapping (Current as of December 2025)**:

The Gemini 3 family was launched in November-December 2025:

- **Gemini 3 Pro** (Nov 2025) - Most intelligent, best for complex reasoning
- **Gemini 3 Flash** (Dec 17, 2025) - Pro-grade reasoning at Flash speed/cost
- **Gemini 3 Deep Think** - Enhanced reasoning mode for Ultra subscribers

| Tier   | Gemini Model                      | API String               | Notes                                            |
| ------ | --------------------------------- | ------------------------ | ------------------------------------------------ |
| LOW    | Gemini 3 Flash (minimal thinking) | `gemini-3-flash-preview` | Fastest, cheapest. Use `thinking_level: MINIMAL` |
| MEDIUM | Gemini 3 Flash (high thinking)    | `gemini-3-flash-preview` | Best balance. Use `thinking_level: HIGH`         |
| HIGH   | Gemini 3 Pro                      | `gemini-3-pro-preview`   | Maximum intelligence for complex tasks           |

**Thinking Levels** (Gemini 3 specific):

- `MINIMAL` - Fastest response, basic reasoning
- `LOW` - Quick with light reasoning
- `MEDIUM` - Balanced (default)
- `HIGH` - Deep reasoning, slower but more accurate

**Pricing** (Dec 2025):

- Gemini 3 Flash: $0.50/1M input, $3.00/1M output
- Gemini 3 Pro: ~4x cost of Flash

**CLI Requirements**:

- Gemini CLI version 0.21.1+ required for Gemini 3 models
- Must enable "Preview features" via `/settings`

### 3.3 Jules API Provider

**API Endpoints**:

- `POST /v1alpha/sessions` - Create session
- `GET /v1alpha/sessions/{id}` - Get session status
- `GET /v1alpha/sessions/{id}/activities` - List activities
- `POST /v1alpha/sessions/{id}:sendMessage` - Send message

**Session Lifecycle**:

```
Create Session → Plan Generated → Plan Approved → Progress Updates → Session Completed
```

**Model**: Jules uses Gemini 3 Pro internally (not configurable via API).

- As of December 2025, Jules is powered by Gemini 3 Pro for maximum reasoning capability
- Best suited for complex, long-running background tasks

---

## 4. Provider Router & Profile Integration

### 4.1 Extended Profile Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Auto-Claude Agent Profile",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Profile display name"
    },
    "description": {
      "type": "string",
      "description": "Profile description"
    },
    "provider_routing": {
      "type": "object",
      "description": "Provider selection by complexity tier",
      "properties": {
        "default": {
          "type": "string",
          "enum": ["claude-cli", "gemini-cli", "jules-api"],
          "default": "claude-cli"
        },
        "low": {
          "oneOf": [
            {
              "type": "string",
              "enum": ["claude-cli", "gemini-cli", "jules-api"]
            },
            {
              "type": "object",
              "properties": {
                "provider": { "type": "string" },
                "model_override": { "type": "string" }
              }
            }
          ]
        },
        "medium": {
          "oneOf": [
            {
              "type": "string",
              "enum": ["claude-cli", "gemini-cli", "jules-api"]
            },
            {
              "type": "object",
              "properties": {
                "provider": { "type": "string" },
                "model_override": { "type": "string" }
              }
            }
          ]
        },
        "high": {
          "oneOf": [
            {
              "type": "string",
              "enum": ["claude-cli", "gemini-cli", "jules-api"]
            },
            {
              "type": "object",
              "properties": {
                "provider": { "type": "string" },
                "model_override": { "type": "string" }
              }
            }
          ]
        }
      }
    },
    "agent_settings": {
      "type": "object",
      "description": "Original Auto-Claude agent settings",
      "properties": {
        "max_iterations": { "type": "integer" },
        "allowed_tools": { "type": "array", "items": { "type": "string" } },
        "auto_approve_plan": { "type": "boolean" }
      }
    }
  }
}
```

### 4.2 Example Profile Configurations

```json
// profiles/fast-and-cheap.json
{
  "name": "Fast & Cheap",
  "description": "Use Gemini CLI for all tasks - faster and lower cost",
  "provider_routing": {
    "default": "gemini-cli"
  }
}
```

```json
// profiles/background-worker.json
{
  "name": "Background Worker",
  "description": "Use Jules API for async background processing",
  "provider_routing": {
    "default": "jules-api"
  }
}
```

```json
// profiles/quality-first.json
{
  "name": "Quality First",
  "description": "Use Claude CLI for all tasks - highest quality",
  "provider_routing": {
    "default": "claude-cli"
  }
}
```

```json
// profiles/hybrid-optimal.json
{
  "name": "Hybrid Optimal",
  "description": "Route by complexity: cheap for simple, quality for complex",
  "provider_routing": {
    "default": "claude-cli",
    "low": "gemini-cli",
    "medium": "gemini-cli",
    "high": "claude-cli"
  }
}
```

---

## 5. File Structure (New Files to Create)

```
auto-claude/
├── providers/                    # NEW DIRECTORY
│   ├── __init__.py              # Export all providers
│   ├── base.py                  # ProviderInterface, types
│   ├── claude_cli.py            # Claude CLI provider
│   ├── gemini_cli.py            # Gemini CLI provider
│   ├── jules_api.py             # Jules API provider
│   └── router.py                # ProviderRouter, Registry
├── profiles/                     # NEW OR EXTEND
│   ├── schema.json              # Profile JSON schema
│   ├── fast-and-cheap.json      # Example profile
│   ├── background-worker.json   # Example profile
│   ├── quality-first.json       # Example profile
│   ├── hybrid-optimal.json      # Example profile
│   └── async-hybrid.json        # Example profile
├── config/
│   └── providers.json           # Provider global config (API keys)
└── ...existing files...
```

---

## 6. Existing Files to Modify (Minimal Diffs)

### 6.1 Integration Point: `run.py` or equivalent orchestrator

**Strategy**: Wrap existing execution with provider router, don't replace.

```python
# MINIMAL MODIFICATION to existing orchestrator
# Add at top of file:
from providers.router import ProviderRouter
from providers.base import ExecutionRequest, ComplexityTier

# In the main execution function, add routing:
def execute_task(spec, profile_config):
    # NEW: Initialize router with profile
    router = ProviderRouter(
        profile_config=profile_config,
        global_config=load_provider_config()
    )

    # NEW: Create standardized request
    request = ExecutionRequest(
        prompt=spec.prompt,
        working_dir=spec.working_dir,
        complexity=ComplexityTier(spec.complexity),
        context_files=spec.context_files
    )

    # NEW: Route to appropriate provider
    provider = router.get_provider_for_tier(request.complexity)

    if provider.execution_mode == ExecutionMode.ASYNC:
        # Handle async providers (Jules)
        result = asyncio.run(provider.execute(request))
        # Store session_id for polling
        store_jules_session(spec.id, result.session_id)
        return result
    else:
        # Sync providers (Claude, Gemini)
        result = asyncio.run(provider.execute(request))
        return result
```

### 6.2 Configuration Loading

```python
# config/providers.json - NEW FILE
{
  "claude-cli": {
    "claude_path": "claude",
    "oauth_token": "${CLAUDE_CODE_OAUTH_TOKEN}"
  },
  "gemini-cli": {
    "gemini_path": "gemini"
  },
  "jules-api": {
    "jules_api_key": "${JULES_API_KEY}"
  }
}
```

```python
# Add to existing config loading (minimal change)
def load_provider_config():
    """Load provider configuration with env var expansion"""
    config_path = Path(__file__).parent / "config" / "providers.json"
    with open(config_path) as f:
        config = json.load(f)

    # Expand environment variables
    def expand_env(obj):
        if isinstance(obj, str) and obj.startswith("${") and obj.endswith("}"):
            var_name = obj[2:-1]
            return os.environ.get(var_name, "")
        elif isinstance(obj, dict):
            return {k: expand_env(v) for k, v in obj.items()}
        return obj

    return expand_env(config)
```

---

## 7. Upstream Sync Guide

### 7.1 Fork Strategy

```bash
# Initial setup
git clone https://github.com/AndyMik90/Auto-Claude.git
cd Auto-Claude
git remote add upstream https://github.com/AndyMik90/Auto-Claude.git
git checkout -b feature/multi-provider-support

# Create feature branch
git checkout -b providers/abstraction-layer
```

### 7.2 File Isolation

**Files that NEVER conflict with upstream**:

- `auto-claude/providers/*` (new directory)
- `auto-claude/profiles/*.json` (new profiles)
- `auto-claude/config/providers.json` (new config)

**Files that MAY conflict**:

- `auto-claude/run.py` (integration point)
- Profile loading code (wherever profiles are loaded)

### 7.3 Merge Strategy

```bash
# Regular upstream sync
git fetch upstream
git checkout main
git merge upstream/main

# Merge into feature branch
git checkout feature/multi-provider-support
git rebase main

# Resolve conflicts in integration points only
# Provider code should not conflict
```

### 7.4 PR-Friendly Changes

When submitting back to upstream:

1. **Split into multiple PRs**:

   - PR 1: Provider abstraction layer (`providers/base.py`, `providers/router.py`)
   - PR 2: Claude CLI extraction (`providers/claude_cli.py`)
   - PR 3: Gemini CLI support (`providers/gemini_cli.py`)
   - PR 4: Jules API support (`providers/jules_api.py`)
   - PR 5: Profile routing extension

2. **Each PR should be self-contained** and backwards compatible

3. **Add feature flags** for new providers:

```python
ENABLE_GEMINI_PROVIDER = os.environ.get("AUTO_CLAUDE_GEMINI", "false").lower() == "true"
ENABLE_JULES_PROVIDER = os.environ.get("AUTO_CLAUDE_JULES", "false").lower() == "true"
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```python
# tests/providers/test_gemini_cli.py
import pytest
from providers.gemini_cli import GeminiCliProvider
from providers.base import ExecutionRequest, ComplexityTier

class TestGeminiCliProvider:
    def test_model_mapping(self):
        provider = GeminiCliProvider()
        assert provider.get_model_for_tier(ComplexityTier.LOW) == "gemini-3-flash-preview"
        assert provider.get_model_for_tier(ComplexityTier.HIGH) == "gemini-3-pro-preview"

    @pytest.mark.skipif(not GeminiCliProvider().is_available(), reason="Gemini CLI not installed")
    async def test_simple_execution(self):
        provider = GeminiCliProvider()
        request = ExecutionRequest(
            prompt="Say hello",
            working_dir="/tmp",
            complexity=ComplexityTier.LOW
        )
        result = await provider.execute(request)
        assert result.success
```

### 8.2 Integration Tests

```python
# tests/providers/test_router.py
async def test_routing_by_complexity():
    profile = {
        "provider_routing": {
            "default": "claude-cli",
            "low": "gemini-cli",
            "high": "claude-cli"
        }
    }
    router = ProviderRouter(profile)

    low_provider = router.get_provider_for_tier(ComplexityTier.LOW)
    assert low_provider.name == "gemini-cli"

    high_provider = router.get_provider_for_tier(ComplexityTier.HIGH)
    assert high_provider.name == "claude-cli"
```

---

## 9. Open Questions for Discussion

Before implementation, let's align on these decisions:

### Q1: Profile Storage Location

Where should extended profiles be stored?

- A) Same location as existing profiles (extend schema)
- B) Separate `provider-profiles/` directory
- C) Single config file with all profiles

### Q2: Jules Session Tracking

How should we persist Jules session IDs for status tracking?

- A) SQLite table (existing DB)
- B) JSON file in `.auto-claude/`
- C) In-memory only (require manual tracking)

### Q3: Error Handling Strategy

When a provider fails, should we:

- A) Fail immediately
- B) Fallback to default provider (Claude CLI)
- C) User-configurable fallback chain

### Q4: UI Integration Scope

Should the first version include:

- A) Backend only (CLI/Python)
- B) Full UI integration with provider selection
- C) UI integration in follow-up phase

---

## Next Steps

1. **Review this architecture** - Any concerns or modifications?
2. **Answer open questions** - Align on design decisions
3. **Start implementation** - Begin with provider base classes
4. **Incremental testing** - Test each provider independently
