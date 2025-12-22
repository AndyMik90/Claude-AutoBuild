# Auto-Claude-Gemini Epic Breakdown

> **Document Purpose**: Comprehensive goal-oriented breakdown of the fork roadmap into Epics, Features, and Tasks.
>
> **No Code** — This document defines _what_ needs to be done, not _how_.

---

## Model Selection Guide for Antigravity

| Model                     | Use Case               | When to Use                                                |
| ------------------------- | ---------------------- | ---------------------------------------------------------- |
| **Gemini 3 Flash**        | Fast, routine work     | Simple tasks, boilerplate, straightforward implementations |
| **Gemini 3 Pro Low**      | Moderate complexity    | Standard features, moderate design decisions               |
| **Gemini 3 Pro High**     | Complex reasoning      | Architecture decisions, complex integrations               |
| **Sonnet 4.5**            | Balanced quality/speed | Good default for most development work                     |
| **Sonnet 4.5 (thinking)** | Deep reasoning         | Complex problem solving, debugging                         |
| **Opus 4.5 (thinking)**   | Maximum quality        | Critical decisions, security review, complex architecture  |

---

## Feature Types

- **🔹 Atomic Feature**: Can be completed in one session. Assign entire feature to Antigravity.
- **🔸 Composite Feature**: Requires multiple distinct tasks. Assign tasks individually.

---

## Design Decisions (Resolved)

| Question                   | Decision                          | Rationale                                             |
| -------------------------- | --------------------------------- | ----------------------------------------------------- |
| **Profile Storage**        | A) Extend existing profile schema | New files, minimal conflict risk with upstream        |
| **Jules Session Tracking** | A) SQLite table                   | Most performant, leverages existing DB infrastructure |
| **Error Handling**         | A) Fail immediately               | Ensures predictable behavior, nothing breaks silently |
| **UI Integration**         | B) Full UI integration            | Include provider selection in first version           |

---

## Epic 1: Provider Abstraction Layer

- [ ] **Epic 1**: Provider Abstraction Layer

**Description**: Create the foundational abstraction layer that enables multiple AI providers (Claude, Gemini, Jules) to be used interchangeably. This is the critical foundation that all other features depend on.

**Complexity**: HIGH (8/10)  
**Priority**: 🔴 CRITICAL  
**Target Version**: v0.1.0

---

### 🔹 Feature 1.1: Provider Interface & Types (ATOMIC)

- [ ] **Feature 1.1**: Provider Interface & Types

**Description**: Define the complete provider abstraction including `ProviderInterface` ABC, `ExecutionRequest`/`ExecutionResult` dataclasses, and supporting enums (`ComplexityTier`, `ExecutionMode`). Create the `providers/` package structure with proper exports. This establishes the contract all providers must implement.

**Complexity**: MEDIUM (5/10)  
**Model**: Gemini 3 Pro High  
**Rationale**: Architecture definition requiring consistent design across multiple related types. Pro High handles the interconnected type system well.

**Acceptance Criteria**:

- [ ] `providers/__init__.py` exports all public classes
- [ ] `ComplexityTier` enum with LOW, MEDIUM, HIGH values
- [ ] `ExecutionMode` enum with SYNC, ASYNC values
- [ ] `ExecutionRequest` dataclass with prompt, working_dir, complexity, max_turns, allowed_tools, context_files
- [ ] `ExecutionResult` dataclass with success, response, error, metadata, session_id
- [ ] `ProviderInterface` ABC with execute(), stream_execute(), check_status(), is_available(), get_model_for_tier()
- [ ] Comprehensive type hints and docstrings throughout

---

### 🔸 Feature 1.2: Claude CLI Provider Extraction (COMPOSITE)

- [ ] **Feature 1.2**: Claude CLI Provider Extraction

**Description**: Extract the existing Claude CLI execution logic from the codebase into a standalone provider class. This requires analyzing existing code patterns first, then implementing the provider.

**Complexity**: MEDIUM (6/10)

#### Tasks

| Status | ID    | Description                                                                                                                                                                                                                    | Model             |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| [ ]    | 1.2.1 | **Analyze existing Claude usage** — Map all Claude CLI invocations in run.py, spec_runner.py, and related files. Document current subprocess patterns, arguments, and output handling. Create a findings report.               | Sonnet 4.5        |
| [ ]    | 1.2.2 | **Implement ClaudeCliProvider** — Create complete provider class with execute(), stream_execute(), is_available(), model mapping (Haiku→LOW, Sonnet→MEDIUM, Opus→HIGH), and OAuth token handling. Base on analysis from 1.2.1. | Gemini 3 Pro High |

---

### 🔸 Feature 1.3: Provider Registry & Router (COMPOSITE)

- [ ] **Feature 1.3**: Provider Registry & Router

**Description**: Create the routing infrastructure that selects the appropriate provider based on profile configuration and task complexity. This is the brain of the multi-provider system.

**Complexity**: HIGH (7/10)

#### Tasks

| Status | ID    | Description                                                                                                                                                                                                                   | Model               |
| ------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| [ ]    | 1.3.1 | **Create ProviderRegistry** — Implement registry pattern with register(), get(), list_available() methods. Include auto-discovery of provider classes in the providers/ package on initialization.                            | Sonnet 4.5          |
| [ ]    | 1.3.2 | **Create ProviderRouter** — Implement routing logic that reads profile config's provider_routing section, maps complexity tiers to providers, handles default provider, and fails immediately if provider unavailable.        | Gemini 3 Pro High   |
| [ ]    | 1.3.3 | **Integrate with run.py** — Add minimal integration code to existing orchestrator. Instantiate router, delegate execution while preserving full backward compatibility. Feature flag with AUTO_CLAUDE_MULTI_PROVIDER env var. | Opus 4.5 (thinking) |

---

### 🔹 Feature 1.4: Configuration System (ATOMIC)

- [ ] **Feature 1.4**: Configuration System

**Description**: Create the configuration infrastructure for provider settings. Implement `config/providers.json` template with environment variable expansion (e.g., `${JULES_API_KEY}`), validation against expected structure, and a typed config loader function.

**Complexity**: LOW (4/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Standard configuration pattern, no complex logic. Pro Low handles this well.

**Acceptance Criteria**:

- [ ] `config/providers.json` template with claude-cli, gemini-cli, jules-api sections
- [ ] Environment variable expansion for `${VAR_NAME}` patterns
- [ ] Clear error messages for missing required env vars
- [ ] Typed return object from loader function
- [ ] Brief inline documentation in template

---

## Epic 2: Gemini CLI Provider

- [ ] **Epic 2**: Gemini CLI Provider

**Description**: Implement full support for Google's Gemini 3 models via the Gemini CLI. This provider executes synchronously like Claude but with Gemini's model family and thinking levels.

**Complexity**: HIGH (7/10)  
**Priority**: 🔴 HIGH  
**Target Version**: v0.2.0  
**Dependencies**: Epic 1

---

### 🔹 Feature 2.1: Gemini CLI Provider Core (ATOMIC)

- [ ] **Feature 2.1**: Gemini CLI Provider Core

**Description**: Create complete `GeminiCliProvider` implementing `ProviderInterface`. Handle subprocess execution with `gemini -p` command, `--output-format json` flag, working directory, and version checking (≥0.21.1 required for Gemini 3).

**Complexity**: MEDIUM (5/10)  
**Model**: Sonnet 4.5  
**Rationale**: Solid implementation work following established patterns from ClaudeCliProvider.

**Acceptance Criteria**:

- [ ] Class implements full ProviderInterface
- [ ] Subprocess execution with proper shell escaping
- [ ] is_available() checks CLI version ≥0.21.1
- [ ] Working directory properly set for subprocess
- [ ] Error handling for missing CLI or wrong version

---

### 🔹 Feature 2.2: Gemini 3 Model Mapping (ATOMIC)

- [ ] **Feature 2.2**: Gemini 3 Model Mapping

**Description**: Configure model and thinking level mappings: LOW → Flash (MINIMAL thinking), MEDIUM → Flash (HIGH thinking), HIGH → Pro. Implement `--thinking-level` CLI argument support. Add model_override capability from profile config.

**Complexity**: LOW (3/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Straightforward mapping logic with clear specifications.

**Acceptance Criteria**:

- [ ] MODEL_MAP dictionary with tier→model mappings
- [ ] THINKING_LEVEL_MAP with tier→thinking level mappings
- [ ] get_model_for_tier() returns correct model/thinking combo
- [ ] model_override from profile config takes precedence

---

### 🔹 Feature 2.3: Gemini Output Parsing (ATOMIC)

- [ ] **Feature 2.3**: Gemini Output Parsing

**Description**: Parse Gemini CLI JSON output and normalize to `ExecutionResult`. Handle response content extraction, stats metadata (models/tools/files), error responses, and streaming output parsing for stream_execute().

**Complexity**: MEDIUM (5/10)  
**Model**: Sonnet 4.5  
**Rationale**: Requires careful error handling and edge case consideration.

**Acceptance Criteria**:

- [ ] Parse valid JSON response to ExecutionResult
- [ ] Graceful handling of malformed JSON
- [ ] Extract stats to metadata dict
- [ ] Map error field to ExecutionResult.error with success=False
- [ ] Stream parsing yields response fragments line-by-line

---

## Epic 3: Jules API Provider

- [ ] **Epic 3**: Jules API Provider

**Description**: Implement support for Google's Jules API, an asynchronous background agent that creates PRs. Unlike CLI providers, Jules runs asynchronously and requires session management and polling.

**Complexity**: HIGH (8/10)  
**Priority**: 🟡 MEDIUM  
**Target Version**: v0.3.0  
**Dependencies**: Epic 1

---

### 🔹 Feature 3.1: Jules API Client (ATOMIC)

- [ ] **Feature 3.1**: Jules API Client

**Description**: Create HTTP client for Jules REST API. Implement `JulesApiProvider` with API key authentication, async HTTP client (httpx) with retry logic, and endpoints: POST /sessions, GET /sessions/{id}, GET /sessions/{id}/activities.

**Complexity**: MEDIUM (5/10)  
**Model**: Sonnet 4.5  
**Rationale**: Standard HTTP client work but needs proper async handling.

**Acceptance Criteria**:

- [ ] JulesApiProvider implements ProviderInterface with execution_mode=ASYNC
- [ ] Bearer token authentication in headers
- [ ] Exponential backoff retry on 5xx errors
- [ ] Session creation, status, and activities endpoints implemented
- [ ] Proper timeout handling

---

### 🔸 Feature 3.2: Session Lifecycle Management (COMPOSITE)

- [ ] **Feature 3.2**: Session Lifecycle Management

**Description**: Manage Jules sessions through their complete lifecycle including creation, polling, state transitions, and completion detection.

**Complexity**: HIGH (7/10)

#### Tasks

| Status | ID    | Description                                                                                                                                                                                                                                            | Model                 |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| [ ]    | 3.2.1 | **Design and implement session storage** — Create SQLite schema (sessions table with id, task_ref, status, created_at, result_json). Implement SessionStore class with CRUD operations.                                                                | Gemini 3 Pro High     |
| [ ]    | 3.2.2 | **Implement polling and state machine** — Build async polling loop with configurable interval. Track state transitions (Plan→Approved→Progress→Complete). Implement check_status() and wait_for_completion(). Handle timeouts and failures gracefully. | Sonnet 4.5 (thinking) |

---

### 🔹 Feature 3.3: GitHub PR Integration (ATOMIC)

- [ ] **Feature 3.3**: GitHub PR Integration

**Description**: Handle Jules' GitHub integration. Extract PR URL, number, branch name, and commit SHA from session completion response. Include in ExecutionResult.metadata. Handle GitHub permission errors with actionable messages.

**Complexity**: LOW (3/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Straightforward data extraction with basic error handling.

**Acceptance Criteria**:

- [ ] PR URL extracted to metadata["pull_request_url"]
- [ ] PR number, branch, SHA in metadata
- [ ] GitHub auth errors detected and surfaced clearly

---

### 🔹 Feature 3.4: Session Recovery (ATOMIC)

- [ ] **Feature 3.4**: Session Recovery

**Description**: On startup, query SQLite for sessions with status='running'. Resume polling for each active session. Update UI with current state. Implement cleanup for sessions older than 7 days or in terminal state.

**Complexity**: MEDIUM (4/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Standard database query and cleanup logic.

**Acceptance Criteria**:

- [ ] Active sessions resumed on startup
- [ ] Polling resumes for each recovered session
- [ ] Cleanup removes old/terminal sessions
- [ ] Configurable retention period

---

## Epic 4: Profile-Based Routing

- [ ] **Epic 4**: Profile-Based Routing

**Description**: Extend the existing profile system to support provider routing configuration, allowing users to define which providers handle different complexity tiers.

**Complexity**: MEDIUM (6/10)  
**Priority**: 🟡 MEDIUM  
**Target Version**: v0.4.0  
**Dependencies**: Epic 1, Epic 2 or Epic 3

---

### 🔹 Feature 4.1: Extended Profile Schema (ATOMIC)

- [ ] **Feature 4.1**: Extended Profile Schema

**Description**: Extend profile JSON schema with `provider_routing` section. Support `default` provider, tier-specific overrides (low/medium/high), and model_override for fine control. Create complete JSON Schema draft-07 document for validation.

**Complexity**: MEDIUM (4/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Schema definition following established patterns.

**Acceptance Criteria**:

- [ ] provider_routing object with default, low, medium, high fields
- [ ] Both string ("gemini-cli") and object ({provider, model_override}) formats
- [ ] JSON Schema draft-07 file with descriptions
- [ ] Schema validates all example profiles

---

### 🔹 Feature 4.2: Example Profile Templates (ATOMIC)

- [ ] **Feature 4.2**: Example Profile Templates

**Description**: Create ready-to-use profile JSON files: "Fast & Cheap" (all→Gemini Flash), "Background Worker" (all→Jules), "Quality First" (all→Claude Opus), "Hybrid Optimal" (LOW/MED→Gemini, HIGH→Claude), "Async Hybrid" (sync→Gemini, async→Jules).

**Complexity**: LOW (2/10)  
**Model**: Gemini 3 Flash  
**Rationale**: Simple JSON file creation with known structure. Flash is perfect.

**Acceptance Criteria**:

- [ ] 5 profile JSON files created in profiles/ directory
- [ ] Each validates against schema
- [ ] Clear descriptions in each profile

---

### 🔹 Feature 4.3: Profile Validation (ATOMIC)

- [ ] **Feature 4.3**: Profile Validation

**Description**: Implement profile validation using jsonschema library. Validate provider_routing references against ProviderRegistry. Validate model_override values against provider capabilities. Provide helpful error messages with file location and suggested fixes.

**Complexity**: MEDIUM (4/10)  
**Model**: Sonnet 4.5  
**Rationale**: Validation logic with good error messaging requires attention to UX.

**Acceptance Criteria**:

- [ ] JSON Schema validation with all errors collected
- [ ] Provider name validation against registry
- [ ] Model name validation against provider
- [ ] Actionable error messages

---

## Epic 5: Antigravity Integration

- [ ] **Epic 5**: Antigravity Integration

**Description**: Ensure the multi-provider architecture works seamlessly with Antigravity agent workflows, including documentation, profiles, and workflow compatibility.

**Complexity**: MEDIUM (5/10)  
**Priority**: 🔴 HIGH  
**Target Version**: v0.5.0  
**Dependencies**: Epic 1, Epic 4

---

### 🔹 Feature 5.1: Antigravity Documentation (ATOMIC)

- [ ] **Feature 5.1**: Antigravity Documentation

**Description**: Update ANTIGRAVITY.md and CLAUDE.md with multi-provider context. Create provider usage guide for Antigravity users covering profile selection, provider switching, and troubleshooting. Document best practices for when to use each provider.

**Complexity**: LOW (3/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Documentation updates following established patterns.

**Acceptance Criteria**:

- [ ] ANTIGRAVITY.md updated with provider section
- [ ] CLAUDE.md updated with multi-provider context
- [ ] Provider usage guide created
- [ ] Best practices documented

---

### 🔹 Feature 5.2: Antigravity-Specific Profiles (ATOMIC)

- [ ] **Feature 5.2**: Antigravity-Specific Profiles

**Description**: Analyze typical Antigravity workflow patterns (planning, execution, verification). Create "Antigravity Planning" (quality models), "Antigravity Execution" (fast models), and "Antigravity Verification" (balanced) profiles.

**Complexity**: LOW (3/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Profile creation with some analysis of existing workflows.

**Acceptance Criteria**:

- [ ] Workflow analysis documented
- [ ] 3 Antigravity-specific profiles created
- [ ] Profiles optimized for each mode

---

### 🔸 Feature 5.3: Workflow Integration Testing (COMPOSITE)

- [ ] **Feature 5.3**: Workflow Integration Testing

**Description**: Test all existing Antigravity workflows with the new provider system.

**Complexity**: MEDIUM (5/10)

#### Tasks

| Status | ID    | Description                                                                                                                                                                                                               | Model            |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| [ ]    | 5.3.1 | **Test all workflows with each provider** — Run /run_backend_tests, /run_frontend_tests, /start_feature, /sync_upstream with each provider. Document any failures or required modifications. Create compatibility matrix. | Sonnet 4.5       |
| [ ]    | 5.3.2 | **Document and fix workflow issues** — Based on testing, update workflow files with any needed modifications. Document any provider-specific considerations in workflow files.                                            | Gemini 3 Pro Low |

---

## Epic 6: Testing & Documentation

- [ ] **Epic 6**: Testing & Documentation

**Description**: Comprehensive testing and documentation for the multi-provider system. Ensures reliability and makes the system accessible to users and contributors.

**Complexity**: MEDIUM (6/10)  
**Priority**: 🟡 MEDIUM  
**Target Version**: v0.6.0  
**Dependencies**: Epics 1-5

---

### 🔹 Feature 6.1: Unit Tests (ATOMIC)

- [ ] **Feature 6.1**: Unit Tests

**Description**: Create comprehensive unit tests for all provider components: ProviderInterface contract compliance, ClaudeCliProvider model mapping, GeminiCliProvider model/thinking mapping, JulesApiProvider session lifecycle, ProviderRegistry operations, ProviderRouter routing logic.

**Complexity**: MEDIUM (5/10)  
**Model**: Sonnet 4.5  
**Rationale**: Testing requires understanding of all components and proper assertions.

**Acceptance Criteria**:

- [ ] Tests for ProviderInterface contract
- [ ] Tests for each provider's model mapping
- [ ] Tests for registry operations
- [ ] Tests for router logic
- [ ] > 80% code coverage on providers/

---

### 🔹 Feature 6.2: Integration Tests (ATOMIC)

- [ ] **Feature 6.2**: Integration Tests

**Description**: Test providers working together: routing by complexity tier, profile-based provider selection, immediate failure on unavailable provider, async/sync provider mixing in same workflow.

**Complexity**: HIGH (6/10)  
**Model**: Sonnet 4.5 (thinking)  
**Rationale**: Complex test scenarios with multiple interacting components.

**Acceptance Criteria**:

- [ ] Tier routing tests pass
- [ ] Profile selection tests pass
- [ ] Failure behavior tests pass
- [ ] Mixed async/sync tests pass

---

### 🔹 Feature 6.3: Mock Infrastructure (ATOMIC)

- [ ] **Feature 6.3**: Mock Infrastructure

**Description**: Create mock infrastructure for testing without real API calls: mock Claude CLI subprocess, mock Gemini CLI subprocess, mock Jules API server (pytest-httpserver). Create pytest fixtures with @pytest.mark.mock_providers marker.

**Complexity**: MEDIUM (5/10)  
**Model**: Sonnet 4.5  
**Rationale**: Mock setup requires understanding of each provider's interface.

**Acceptance Criteria**:

- [ ] Mock Claude CLI with realistic responses
- [ ] Mock Gemini CLI with configurable responses
- [ ] Mock Jules API server with session lifecycle
- [ ] Pytest fixtures for easy mock injection

---

### 🔸 Feature 6.4: End-to-End Tests (COMPOSITE)

- [ ] **Feature 6.4**: End-to-End Tests

**Description**: Full workflow tests validating complete execution paths with real providers (gated by env vars).

**Complexity**: HIGH (7/10)

#### Tasks

| Status | ID    | Description                                                                                                                                                                        | Model                 |
| ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| [ ]    | 6.4.1 | **E2E tests for sync providers** — Test simple task via Gemini Flash, complex task via Claude Opus. Verify routing, execution, and result parsing. Skip if provider not available. | Sonnet 4.5            |
| [ ]    | 6.4.2 | **E2E tests for async provider** — Test PR-creation task via Jules API. Verify session creation, polling, and completion detection. Skip if API key not configured.                | Sonnet 4.5 (thinking) |
| [ ]    | 6.4.3 | **E2E profile switching test** — Execute task sequence while switching profiles mid-workflow. Verify provider changes take effect immediately. This is the most complex test.      | Opus 4.5 (thinking)   |

---

### 🔹 Feature 6.5: User Documentation (ATOMIC)

- [ ] **Feature 6.5**: User Documentation

**Description**: Create comprehensive documentation: provider usage guide (end-user), profile configuration reference, troubleshooting section (auth failures, CLI not found, rate limits), migration guide from single-provider setup.

**Complexity**: MEDIUM (4/10)  
**Model**: Gemini 3 Pro Low  
**Rationale**: Documentation following established patterns and structure.

**Acceptance Criteria**:

- [ ] Provider usage guide in docs/
- [ ] Profile reference document
- [ ] Troubleshooting section
- [ ] Migration guide

---

### 🔹 Feature 6.6: Contributor Documentation (ATOMIC)

- [ ] **Feature 6.6**: Contributor Documentation

**Description**: Update CONTRIBUTING.md with section on developing new providers. Document ProviderInterface requirements, testing expectations, and PR process for new providers.

**Complexity**: LOW (3/10)  
**Model**: Gemini 3 Flash  
**Rationale**: Simple documentation update with known content.

**Acceptance Criteria**:

- [ ] CONTRIBUTING.md updated
- [ ] Provider development section added
- [ ] Testing requirements documented

---

## Summary Statistics

| Metric                 | Count                                    |
| ---------------------- | ---------------------------------------- |
| **Total Epics**        | 6                                        |
| **Total Features**     | 20                                       |
| **Atomic Features**    | 15 (assign whole feature to Antigravity) |
| **Composite Features** | 5 (assign individual tasks)              |
| **Total Tasks**        | 14 (within composite features)           |

### Model Distribution (Feature Level)

| Model                     | Feature Count | Use Case                                           |
| ------------------------- | ------------- | -------------------------------------------------- |
| **Gemini 3 Flash**        | 2             | Simple boilerplate (profiles, docs)                |
| **Gemini 3 Pro Low**      | 6             | Standard features (config, schema, docs)           |
| **Gemini 3 Pro High**     | 3             | Architecture (types, providers, storage)           |
| **Sonnet 4.5**            | 6             | Core implementation (parsing, validation, tests)   |
| **Sonnet 4.5 (thinking)** | 2             | Complex integration (lifecycle, integration tests) |
| **Opus 4.5 (thinking)**   | 1             | Critical integration (run.py modification)         |

### Model Distribution (Task Level - Composite Features Only)

| Model                     | Task Count | Use Case                            |
| ------------------------- | ---------- | ----------------------------------- |
| **Gemini 3 Pro Low**      | 2          | Follow-up tasks, documentation      |
| **Gemini 3 Pro High**     | 3          | Core implementations after analysis |
| **Sonnet 4.5**            | 5          | Analysis, testing tasks             |
| **Sonnet 4.5 (thinking)** | 3          | Complex debugging, lifecycle mgmt   |
| **Opus 4.5 (thinking)**   | 1          | Critical run.py integration         |

---

## Execution Guide

### For Atomic Features (🔹)

Assign the entire feature to Antigravity with the specified model. The acceptance criteria serve as the completion checklist.

### For Composite Features (🔸)

Assign tasks individually in order. Each task may have a different model based on complexity.

### Recommended Order

1. **Epic 1** (all features) — Foundation, no dependencies
2. **Epic 2** — Gemini provider (needs Epic 1)
3. **Epic 3** — Jules provider (needs Epic 1)
4. **Epic 4** — Routing (needs Epic 1 + at least one provider)
5. **Epic 5** — Antigravity (needs Epic 1 + Epic 4)
6. **Epic 6** — Testing (needs all above)

---

## Version History

| Version | Date       | Description                                                                                                     |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 2025-12-22 | Initial epic breakdown created                                                                                  |
| 1.1.0   | 2025-12-22 | Added checkboxes, improved descriptions, resolved design decisions                                              |
| 2.0.0   | 2025-12-22 | Restructured to Atomic/Composite features, consolidated tasks, added Gemini 3 Pro High, smarter model selection |
