# Auto-Claude Docker Deployment

> **Enterprise-grade multi-user web deployment of Auto-Claude**
> Transform the single-user Electron desktop app into a containerized multi-tenant platform with JWT authentication, real-time collaboration, and advanced credential management.

[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black)](https://react.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)

---

## Table of Contents

- [What Is This?](#what-is-this)
- [Key Differences vs Desktop App](#key-differences-vs-desktop-app)
- [Architecture Overview](#architecture-overview)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Features](#features)
  - [Multi-User Authentication](#multi-user-authentication)
  - [Credential Hierarchy](#credential-hierarchy)
  - [Enterprise Features](#enterprise-features)
  - [Graphiti Memory System](#graphiti-memory-system)
- [Docker Services](#docker-services)
- [API Reference](#api-reference)
- [Deployment Scenarios](#deployment-scenarios)
- [Security Model](#security-model)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Migration from Desktop App](#migration-from-desktop-app)

---

## What Is This?

**Auto-Claude Docker** is a complete reimagining of the Auto-Claude desktop application as a **containerized web platform**. While the desktop app (`auto-claude-ui/`) is built with Electron for single-user local use, this Docker deployment provides:

- **Multi-user web access** with JWT authentication
- **PostgreSQL-backed persistence** for users, projects, and settings
- **3-tier credential hierarchy** (Global → User → Project)
- **Enterprise SSO/OIDC** integration
- **Real-time WebSocket** communication
- **Secure terminal sessions** via PTY
- **Multi-provider Graphiti** memory with FalkorDB
- **SMTP email delivery** for invitations
- **Admin management console** for users and settings

This is **not a wrapper** around the desktop app — it's a ground-up rebuild using FastAPI, React, and PostgreSQL, sharing only the core Auto-Claude CLI (`auto-claude/`) for task execution.

---

## Key Differences vs Desktop App

| Feature | Desktop App (Electron) | Docker Deployment (Web) |
|---------|------------------------|-------------------------|
| **Architecture** | Single-user desktop app | Multi-tenant web application |
| **UI Framework** | Electron + React | FastAPI + React (Vite) |
| **Authentication** | None (local only) | JWT with refresh tokens |
| **User Management** | Single user | Multi-user with roles (admin/user) |
| **Data Storage** | JSON files | PostgreSQL database |
| **Credential Storage** | Plain environment variables | Encrypted with Fernet (3-tier hierarchy) |
| **Deployment** | Download installer | Docker Compose |
| **Platform** | macOS, Windows, Linux (native) | Any Docker host |
| **Access** | Local machine only | Remote web access |
| **Terminal Sessions** | Electron shell | PTY via WebSocket (xterm.js) |
| **SSO/OIDC** | Not supported | Full OIDC support |
| **SMTP Email** | Not supported | Configurable SMTP server |
| **Credential Hierarchy** | Not available | Global → User → Project |
| **Admin Controls** | Not available | Invite system, user CRUD, locked credentials |
| **Real-time Updates** | IPC (inter-process) | WebSocket broadcasts |
| **Graphiti Memory** | LadybugDB (embedded) | FalkorDB (containerized graph DB) |
| **Setup Complexity** | Download & run | Configure environment + Docker |

**Use the Desktop App if:** You want a simple local-only tool for personal projects.

**Use the Docker Deployment if:** You need multi-user access, team collaboration, enterprise SSO, or remote access to Auto-Claude.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Docker Compose Stack                          │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │                 Web Service (Port 8080)                        ││
│  │  ┌──────────────────────────────────────────────────────────┐ ││
│  │  │  React 19 Frontend (Vite + Tailwind + shadcn/ui)         │ ││
│  │  │  - 342+ components from Electron app                     │ ││
│  │  │  - Zustand state management                              │ ││
│  │  │  - WebSocket real-time updates                           │ ││
│  │  │  - xterm.js terminal emulation                           │ ││
│  │  └──────────────────────────────────────────────────────────┘ ││
│  │  ┌──────────────────────────────────────────────────────────┐ ││
│  │  │  FastAPI Backend (Python 3.11)                           │ ││
│  │  │  - 17 route modules (9,500+ lines)                       │ ││
│  │  │  - Async SQLAlchemy ORM                                  │ ││
│  │  │  - JWT authentication service                            │ ││
│  │  │  - Build runner (subprocess management)                  │ ││
│  │  │  - Credential encryption (Fernet)                        │ ││
│  │  │  - WebSocket event broadcasting                          │ ││
│  │  └──────────────────────────────────────────────────────────┘ ││
│  │  ┌──────────────────────────────────────────────────────────┐ ││
│  │  │  Auto-Claude CLI (Shared Core)                           │ ││
│  │  │  - Mounted from /opt/auto-claude                         │ ││
│  │  │  - Spec creation & task execution                        │ ││
│  │  │  - Agent orchestration                                   │ ││
│  │  │  - Git worktree management                               │ ││
│  │  └──────────────────────────────────────────────────────────┘ ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │ PostgreSQL   │  │  FalkorDB    │  │ Graphiti MCP (Optional)  │ │
│  │  (Port 5432) │  │ (Port 6380)  │  │      (Port 8000)         │ │
│  │              │  │              │  │                          │ │
│  │ • users      │  │ • Graph DB   │  │ • Knowledge graph MCP    │ │
│  │ • projects   │  │ • Graphiti   │  │ • Semantic search        │ │
│  │ • credentials│  │   memory     │  │ • Entity extraction      │ │
│  │ • settings   │  │ • Multi-     │  │                          │ │
│  │ • tokens     │  │   provider   │  │ Profile: graphiti        │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
│                                                                     │
│  Persistent Volumes:                                                │
│  • repos/ ─────────→ Per-user cloned repositories                  │
│  • data/ ──────────→ Logs, state, runtime metadata                 │
│  • postgres_data/ ─→ User accounts, projects, encrypted creds      │
│  • falkordb_data/ ─→ Graphiti knowledge graph storage              │
└─────────────────────────────────────────────────────────────────────┘
```

**Component Breakdown:**

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Frontend** | React 19, Vite, Tailwind CSS, shadcn/ui | Single-page application with Kanban board, terminals, file explorer |
| **Backend** | FastAPI 0.115+, Python 3.11 | REST API, WebSocket, authentication, build orchestration |
| **Database** | PostgreSQL 16 | Users, projects, credentials, settings, tokens |
| **Graph DB** | FalkorDB (Redis-compatible) | Graphiti memory graph storage |
| **MCP Server** | Graphiti MCP (optional) | Enhanced memory with semantic search |
| **Build Runtime** | Auto-Claude CLI + Claude Code | Task execution in isolated workspaces |

---

## Quick Start

### Prerequisites

1. **Docker** and **Docker Compose** installed ([Get Docker](https://docs.docker.com/get-docker/))
2. **Claude Pro or Max** subscription ([Upgrade](https://claude.ai/upgrade))
3. **Claude Code CLI** installed: `npm install -g @anthropic-ai/claude-code`
4. **Claude OAuth token**: Run `claude setup-token` and copy the token

### Minimal Setup (5 minutes)

```bash
# 1. Navigate to the docker directory
cd docker/

# 2. Copy environment template
cp .env.example .env

# 3. Generate secrets
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)" >> .env
echo "JWT_SECRET_KEY=$(openssl rand -hex 32)" >> .env
echo "CREDENTIAL_ENCRYPTION_KEY=$(python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')" >> .env

# 4. Add your Claude OAuth token (from: claude setup-token)
echo "CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token-here" >> .env

# 5. Start the stack
docker compose up -d

# 6. Wait for services to be healthy (~30 seconds)
docker compose ps

# 7. Access the web UI
open http://localhost:8080
```

### First-Time Setup

1. **Open http://localhost:8080** in your browser
2. **Create admin account** (first user becomes admin)
3. **Add a project** via "Clone Repository"
4. **Create a task** and watch Auto-Claude build it!

**That's it!** You now have a multi-user Auto-Claude deployment.

---

## Environment Variables

### Core Configuration

#### Required Variables

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `POSTGRES_PASSWORD` | Database password | `openssl rand -base64 32` |
| `JWT_SECRET_KEY` | JWT token signing key | `openssl rand -hex 32` |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude OAuth token | `claude setup-token` |

#### Recommended Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CREDENTIAL_ENCRYPTION_KEY` | - | Fernet key for encrypting stored API keys |
| `GITHUB_TOKEN` | - | GitHub PAT for cloning private repos |
| `WEB_PORT` | `8080` | Port for web UI |

**Credential Encryption Key:**
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

### Authentication & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | Access token lifetime (minutes) |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | `30` | Refresh token lifetime (days) |
| `POSTGRES_PORT` | `5432` | PostgreSQL external port |

### Auto-Claude Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `DEFAULT_BRANCH` | `main` | Default git branch for operations |
| `DEBUG` | `false` | Enable debug endpoints |
| `AUTO_BUILD_MODEL` | `claude-opus-4-5-20251101` | Model override for agents |
| `CLONE_REPOS` | - | Comma-separated repo URLs to auto-clone on startup |

**Example:**
```bash
CLONE_REPOS=https://github.com/user/repo1,https://github.com/user/private-repo
```

### Graphiti Memory Integration

**Enable Graphiti:**
```bash
GRAPHITI_ENABLED=true
```

#### Provider Selection

| Variable | Default | Options |
|----------|---------|---------|
| `GRAPHITI_LLM_PROVIDER` | `openai` | `openai`, `anthropic`, `azure_openai`, `ollama`, `google` |
| `GRAPHITI_EMBEDDER_PROVIDER` | `openai` | `openai`, `voyage`, `azure_openai`, `ollama`, `google` |

#### OpenAI Provider (Default)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | OpenAI API key ([Get key](https://platform.openai.com/api-keys)) |
| `GRAPHITI_MODEL_NAME` | `gpt-4o-mini` | LLM model |
| `GRAPHITI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model (1536 dim) |

**Quick Setup:**
```bash
GRAPHITI_ENABLED=true
OPENAI_API_KEY=sk-proj-your-key-here
docker compose --profile graphiti up -d
```

#### Anthropic Provider (LLM only)

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | - | Same key as `CLAUDE_CODE_OAUTH_TOKEN` can be used |
| `GRAPHITI_ANTHROPIC_MODEL` | `claude-sonnet-4-5-latest` | Anthropic model |

**Pair with Voyage for embeddings:**
```bash
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=voyage
ANTHROPIC_API_KEY=sk-ant-your-key
VOYAGE_API_KEY=pa-your-key
docker compose --profile graphiti up -d
```

#### Voyage AI Provider (Embeddings only)

| Variable | Default | Description |
|----------|---------|-------------|
| `VOYAGE_API_KEY` | - | Voyage AI API key ([Get key](https://www.voyageai.com/)) |
| `VOYAGE_EMBEDDING_MODEL` | `voyage-3` | Embedding model (1024 dim) |

#### Google AI Provider (Gemini)

| Variable | Default | Description |
|----------|---------|-------------|
| `GOOGLE_API_KEY` | - | Google AI API key ([Get key](https://aistudio.google.com/apikey)) |
| `GOOGLE_LLM_MODEL` | `gemini-2.0-flash` | Gemini model |
| `GOOGLE_EMBEDDING_MODEL` | `text-embedding-004` | Embedding model |

**Setup:**
```bash
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google
GRAPHITI_EMBEDDER_PROVIDER=google
GOOGLE_API_KEY=AIzaSy-your-key
docker compose --profile graphiti up -d
```

#### Azure OpenAI Provider

| Variable | Description |
|----------|-------------|
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_BASE_URL` | Azure endpoint (e.g., `https://your-resource.openai.azure.com/...`) |
| `AZURE_OPENAI_LLM_DEPLOYMENT` | LLM deployment name |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | Embedding deployment name |

**Setup:**
```bash
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
GRAPHITI_EMBEDDER_PROVIDER=azure_openai
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_BASE_URL=https://your-resource.openai.azure.com/openai/deployments/your-deployment
AZURE_OPENAI_LLM_DEPLOYMENT=gpt-4
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-3-small
docker compose --profile graphiti up -d
```

#### Ollama Provider (Local/Offline)

**Prerequisites:**
1. Install Ollama: https://ollama.ai/
2. Pull models: `ollama pull deepseek-r1:7b && ollama pull nomic-embed-text`
3. Start Ollama server (usually auto-starts)

| Variable | Description |
|----------|-------------|
| `OLLAMA_BASE_URL` | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_LLM_MODEL` | LLM model (e.g., `deepseek-r1:7b`, `llama3.2:3b`) |
| `OLLAMA_EMBEDDING_MODEL` | Embedding model (e.g., `nomic-embed-text`) |
| `OLLAMA_EMBEDDING_DIM` | **Required:** Embedding dimension (e.g., `768` for nomic-embed-text) |

**Setup:**
```bash
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
OLLAMA_LLM_MODEL=deepseek-r1:7b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
OLLAMA_EMBEDDING_DIM=768
docker compose --profile graphiti up -d
```

#### Graphiti Database Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `FALKORDB_PORT` | `6380` | FalkorDB external port |
| `GRAPHITI_MCP_PORT` | `8000` | Graphiti MCP server port |
| `GRAPHITI_DATABASE` | `auto_claude_memory` | Graph database name |
| `GRAPHITI_TELEMETRY_ENABLED` | `false` | Disable Graphiti telemetry |

### Linear Integration

| Variable | Description |
|----------|-------------|
| `LINEAR_API_KEY` | Linear API key ([Get key](https://linear.app/settings/api)) |
| `LINEAR_TEAM_ID` | Pre-configured team ID (auto-detected if not set) |
| `LINEAR_PROJECT_ID` | Pre-configured project ID (auto-created if not set) |

**Setup:**
```bash
LINEAR_API_KEY=lin_api_your-key-here
docker compose up -d
```

### Complete Example Configuration

```bash
# Required
POSTGRES_PASSWORD=hG9X2kL4mQ7nP1sV8wA3zC6tY5bD0fJ
JWT_SECRET_KEY=a1b2c3d4e5f6789012345678901234567890abcdef
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-oauth-token
CREDENTIAL_ENCRYPTION_KEY=X9Y2Z3A4B5C6D7E8F9G0H1I2J3K4L5M6N7O8P9Q0R1S2T3U4V5W6==

# Recommended
GITHUB_TOKEN=ghp_your-github-token
WEB_PORT=8080

# Graphiti with Anthropic + Voyage
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=voyage
ANTHROPIC_API_KEY=sk-ant-your-key
VOYAGE_API_KEY=pa-your-key

# Linear integration
LINEAR_API_KEY=lin_api_your-key

# Auto-clone repos on startup
CLONE_REPOS=https://github.com/user/repo1,https://github.com/user/repo2
```

---

## Features

### Multi-User Authentication

**JWT-based authentication** with access and refresh tokens:

- **Access tokens**: Short-lived (30 minutes), used for API requests
- **Refresh tokens**: Long-lived (30 days), stored in database with revocation support
- **Password security**: Bcrypt hashing (work factor 12+)
- **Role-based access**: Admin vs regular users
- **Invitation-only registration**: Admins create invite codes for new users

**Authentication Flow:**

```
1. Admin creates invitation code
2. User registers with invite code
3. User logs in → receives access + refresh tokens
4. Access token expires → client uses refresh token
5. Logout → refresh token revoked in database
```

**Admin Features:**
- Create/delete users
- Generate invitation codes
- View all projects across users
- Configure global settings

### Credential Hierarchy

**3-tier credential system** with encryption and admin locking:

```
Global (SystemSettings)
  ↓  (if not locked by admin)
User (UserCredentials)
  ↓
Project (ProjectCredentials)
```

**How it works:**

1. **Global credentials** (Admin-only): Set once, apply to all users
2. **Admin locking**: Prevent users from overriding specific credentials
3. **User credentials**: User's default API keys (override global if not locked)
4. **Project credentials**: Per-project overrides (highest priority)

**Supported Credentials:**
- Claude OAuth Token (`CLAUDE_CODE_OAUTH_TOKEN`)
- Anthropic API Key (`ANTHROPIC_API_KEY`)
- OpenAI API Key (`OPENAI_API_KEY`)
- GitHub Token (`GITHUB_TOKEN`)
- Linear API Key (`LINEAR_API_KEY`)
- Voyage AI Key (`VOYAGE_API_KEY`)
- Google AI Key (`GOOGLE_API_KEY`)
- Azure OpenAI Key (`AZURE_OPENAI_API_KEY`)

**Security:**
- All credentials encrypted at rest with Fernet (symmetric encryption)
- Decrypted only when needed for builds
- Admin can view/set global credentials
- Users cannot see admin-locked credentials

**Example Use Cases:**

**Use Case 1: Company-wide Claude token**
```bash
# Admin sets global Claude token for all users
# Users cannot override (locked)
→ All builds use company Claude subscription
```

**Use Case 2: User brings their own API keys**
```bash
# Admin doesn't lock credentials
# Each user sets their own Claude token
→ Users billed individually
```

**Use Case 3: Per-project GitHub tokens**
```bash
# Global: Company GitHub token (locked)
# User: Personal GitHub token (overrides global)
# Project A: Uses user token
# Project B: Custom token for specific repo access
→ Fine-grained access control
```

### Enterprise Features

#### SSO/OIDC Integration

Full **OpenID Connect (OIDC)** support for enterprise identity providers:

**Supported Providers:**
- Okta
- Auth0
- Azure AD / Entra ID
- Google Workspace
- Keycloak
- Any OIDC-compliant provider

**Configuration:**
```bash
# Set these in Admin Settings → OIDC/SSO
OIDC_PROVIDER_URL=https://your-provider.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
OIDC_REDIRECT_URI=https://autoclaude.example.com/api/auth/oidc/callback
```

**Features:**
- Auto-provisioning: Users created on first SSO login
- Email verification: Uses email from OIDC claims
- Optional password auth: Disable local passwords entirely
- Role mapping: Extract roles from OIDC claims

**Login Flow:**
```
1. User clicks "Sign in with SSO"
2. Redirected to OIDC provider
3. User authenticates (e.g., with Okta)
4. OIDC provider redirects back with token
5. Backend creates/updates user account
6. User logged in with JWT tokens
```

#### SMTP Email Delivery

Send invitation emails automatically:

**Configuration:**
```bash
# Set in Admin Settings → SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@autoclaude.example.com
SMTP_FROM_NAME=Auto-Claude
SMTP_USE_TLS=true
```

**Use Cases:**
- Email invitation links to new users
- Password reset emails (future)
- Build completion notifications (future)

#### Debug Endpoints

**Credential flow verification** for troubleshooting:

```bash
# Test credential resolution
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/debug/credentials/PROJECT_ID

# Response shows effective credentials:
{
  "global": {"CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-..."},
  "user": {"GITHUB_TOKEN": "ghp_..."},
  "project": {},
  "effective": {
    "CLAUDE_CODE_OAUTH_TOKEN": "sk-ant-... (from global)",
    "GITHUB_TOKEN": "ghp_... (from user)"
  }
}
```

**Enable with:**
```bash
DEBUG=true
docker compose up -d
```

### Graphiti Memory System

**Multi-provider graph-based memory** for cross-session context retention.

**What is Graphiti?**
- **Knowledge graph** that stores facts, entities, and relationships from build sessions
- **Semantic search** to retrieve relevant context for future tasks
- **Cross-session memory** that persists beyond individual builds
- **Multi-provider support** for LLM and embeddings

**Architecture:**

```
Auto-Claude Build → Extracts facts → Graphiti Core → Stores in FalkorDB
                                      ↓
                             Retrieves context
                                      ↓
Next Build → Receives relevant past knowledge
```

**Benefits:**

1. **Context continuity**: Agents remember previous work
2. **Reduced discovery time**: Past insights available instantly
3. **Pattern learning**: Accumulates codebase knowledge
4. **Offline support**: Use Ollama for fully local operation

**Provider Comparison:**

| Provider | LLM | Embedder | Cost | Quality | Offline |
|----------|-----|----------|------|---------|---------|
| **OpenAI** | ✅ | ✅ | $$ | High | ❌ |
| **Anthropic + Voyage** | ✅ | ✅ | $$$ | Highest | ❌ |
| **Google AI** | ✅ | ✅ | $ | High | ❌ |
| **Azure OpenAI** | ✅ | ✅ | $$ | High | ❌ |
| **Ollama** | ✅ | ✅ | Free | Good | ✅ |

**Recommended Setups:**

**Best Quality:**
```bash
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=voyage
```

**Best Value:**
```bash
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_EMBEDDER_PROVIDER=openai
```

**Offline/Local:**
```bash
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
```

**Enable Graphiti:**
```bash
# Add --profile graphiti to start the optional MCP server
docker compose --profile graphiti up -d
```

### Per-Project Agent Profiles

**Customize agent behavior per project:**

**Configurable Settings:**
- **Model Selection**: Choose different models per agent phase (planner, coder, QA)
- **Thinking Level**: Standard vs extended thinking
- **Complexity**: Force simple/standard/complex pipeline
- **Memory Backend**: File-based, Graphiti, or both
- **Git Settings**: Default branch, auto-commit, auto-push
- **Parallel Subtasks**: Control concurrency (1-10)
- **QA Strict Mode**: Enforce stricter validation
- **Recovery Attempts**: Max retries for failed subtasks
- **Custom Prompts**: Override default agent prompts per phase

**Example:**
```json
{
  "default_model": "claude-opus-4-5-20251101",
  "planner_model": "claude-sonnet-4-5-latest",
  "coder_model": "claude-opus-4-5-20251101",
  "qa_model": "claude-sonnet-4-5-latest",
  "memory_backend": "graphiti",
  "max_parallel_subtasks": 3,
  "qa_strict_mode": true,
  "auto_commit": true,
  "auto_push": false
}
```

### Real-Time Features

**WebSocket-based live updates:**

1. **Build logs**: Stream output as builds run
2. **Task status**: Broadcast state changes (planning → coding → QA)
3. **Multi-client support**: All connected users see updates
4. **Terminal sessions**: Interactive PTY via WebSocket

**WebSocket Endpoints:**
- `WS /ws` - General event stream (task status, progress)
- `WS /ws/logs/{project_id}/{task_id}` - Build log streaming
- `WS /ws/terminals/{session_id}` - Terminal PTY

**Frontend Integration:**
```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8080/ws')

// Receive task updates
ws.onmessage = (event) => {
  const update = JSON.parse(event.data)
  // update.type: "task_status", "build_progress", "log_line"
}
```

---

## Docker Services

| Service | Image | Port | Purpose | Profile |
|---------|-------|------|---------|---------|
| **web** | Custom (built from Dockerfile) | 8080 | Main web application | Default |
| **postgres** | `postgres:16-alpine` | 5432 | PostgreSQL database | Default |
| **falkordb** | `falkordb/falkordb:latest` | 6380 | Graph database for Graphiti | Default |
| **graphiti-mcp** | `falkordb/graphiti-knowledge-graph-mcp` | 8000 | Graphiti MCP server | `graphiti` |

**Start all services:**
```bash
docker compose --profile graphiti up -d
```

**Start without Graphiti MCP:**
```bash
docker compose up -d
```

**Service Dependencies:**
- `web` requires `postgres` and `falkordb` to be healthy
- `graphiti-mcp` requires `falkordb` to be healthy

**Health Checks:**
- `web`: `curl http://localhost:8080/health`
- `postgres`: `pg_isready -U autoclaude`
- `falkordb`: `redis-cli ping`

---

## API Reference

### Authentication

**Register (Invite-based)**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "secure-password",
  "invite_code": "abc123def456"
}

Response: 201 Created
{
  "id": "uuid",
  "email": "user@example.com",
  "username": "johndoe",
  "role": "user"
}
```

**Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure-password"
}

Response: 200 OK
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "role": "user"
  }
}
```

**Refresh Token**
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "eyJhbGc..."
}

Response: 200 OK
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer"
}
```

**Logout**
```http
POST /api/auth/logout
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "refresh_token": "eyJhbGc..."
}

Response: 200 OK
{
  "message": "Successfully logged out"
}
```

### Projects

**List Projects**
```http
GET /api/projects
Authorization: Bearer <access_token>

Response: 200 OK
[
  {
    "id": "uuid",
    "name": "my-project",
    "repo_url": "https://github.com/user/repo",
    "path": "/repos/user-id/my-project",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

**Clone Repository**
```http
POST /api/projects
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "repo_url": "https://github.com/user/my-repo",
  "name": "my-repo"  // Optional, auto-extracted if not provided
}

Response: 201 Created
{
  "id": "uuid",
  "name": "my-repo",
  "repo_url": "https://github.com/user/my-repo",
  "path": "/repos/user-id/my-repo"
}
```

**Pull Latest Changes**
```http
POST /api/projects/{project_id}/pull
Authorization: Bearer <access_token>

Response: 200 OK
{
  "message": "Pulled latest changes",
  "commit": "abc123def456"
}
```

**Delete Project**
```http
DELETE /api/projects/{project_id}
Authorization: Bearer <access_token>

Response: 204 No Content
```

### Tasks

**List Tasks**
```http
GET /api/projects/{project_id}/tasks
Authorization: Bearer <access_token>

Response: 200 OK
[
  {
    "id": "001",
    "name": "Add user authentication",
    "status": "completed",
    "spec_path": "/repos/user-id/my-repo/.auto-claude/specs/001-add-user-auth"
  }
]
```

**Create Task**
```http
POST /api/projects/{project_id}/tasks
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "description": "Add user authentication with JWT"
}

Response: 201 Created
{
  "id": "002",
  "name": "Add user authentication",
  "status": "planning"
}
```

**Start Task**
```http
POST /api/projects/{project_id}/tasks/{task_id}/start
Authorization: Bearer <access_token>

Response: 200 OK
{
  "message": "Task started",
  "build_id": "uuid"
}
```

**Stop Task**
```http
POST /api/projects/{project_id}/tasks/{task_id}/stop
Authorization: Bearer <access_token>

Response: 200 OK
{
  "message": "Task stopped"
}
```

### Admin Endpoints

**List Users (Admin only)**
```http
GET /api/users
Authorization: Bearer <admin_access_token>

Response: 200 OK
[
  {
    "id": "uuid",
    "email": "admin@example.com",
    "username": "admin",
    "role": "admin",
    "created_at": "2025-01-01T00:00:00Z"
  }
]
```

**Create Invitation (Admin only)**
```http
POST /api/auth/invitations
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "email": "newuser@example.com",  // Optional
  "role": "user"
}

Response: 201 Created
{
  "code": "abc123def456",
  "email": "newuser@example.com",
  "used": false,
  "expires_at": "2025-01-08T00:00:00Z"
}
```

### WebSocket

**Event Stream**
```javascript
const ws = new WebSocket('ws://localhost:8080/ws?token=<access_token>')

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  // data.type: "task_status", "build_progress"
}
```

**Build Logs**
```javascript
const ws = new WebSocket('ws://localhost:8080/ws/logs/{project_id}/{task_id}?token=<access_token>')

ws.onmessage = (event) => {
  console.log(event.data)  // Raw log lines
}
```

---

## Deployment Scenarios

### Local Development

**Quickest setup for testing:**

```bash
cp .env.example .env
# Add minimal required vars
docker compose up -d
```

**Access:**
- Web UI: http://localhost:8080
- PostgreSQL: localhost:5432
- FalkorDB: localhost:6380

### Team Deployment (Internal Network)

**Setup for team use on local network:**

```bash
# .env
WEB_PORT=8080
POSTGRES_PASSWORD=strong-random-password
JWT_SECRET_KEY=strong-random-key
CREDENTIAL_ENCRYPTION_KEY=fernet-key

# Start with Graphiti
docker compose --profile graphiti up -d
```

**Access from other machines:**
```
http://<server-ip>:8080
```

**Recommendations:**
- Use static IP for server
- Configure firewall to allow port 8080
- Set up HTTPS with reverse proxy (see below)

### Production (Public Internet)

**Secure setup with HTTPS reverse proxy:**

#### Option 1: Nginx

```nginx
# /etc/nginx/sites-available/autoclaude.conf
upstream autoclaude {
    server localhost:8080;
}

server {
    listen 443 ssl http2;
    server_name autoclaude.example.com;

    ssl_certificate /etc/letsencrypt/live/autoclaude.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/autoclaude.example.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://autoclaude;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;  # 24 hours for long builds
    }
}

server {
    listen 80;
    server_name autoclaude.example.com;
    return 301 https://$server_name$request_uri;
}
```

**Enable:**
```bash
sudo ln -s /etc/nginx/sites-available/autoclaude.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Option 2: Traefik

```yaml
# docker-compose.yml
services:
  web:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.autoclaude.rule=Host(`autoclaude.example.com`)"
      - "traefik.http.routers.autoclaude.entrypoints=websecure"
      - "traefik.http.routers.autoclaude.tls=true"
      - "traefik.http.routers.autoclaude.tls.certresolver=letsencrypt"
      - "traefik.http.services.autoclaude.loadbalancer.server.port=8080"
    networks:
      - traefik
      - auto-claude-net

networks:
  traefik:
    external: true
```

#### Option 3: Caddy

```
# Caddyfile
autoclaude.example.com {
    reverse_proxy localhost:8080 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
```

**Start Caddy:**
```bash
caddy run --config Caddyfile
```

### Cloud Deployment

#### AWS EC2

**1. Launch EC2 instance:**
- Ubuntu 22.04 LTS
- t3.medium or larger (2 vCPU, 4 GB RAM minimum)
- 30 GB storage minimum
- Security group: Allow 80, 443, 22

**2. Install Docker:**
```bash
sudo apt update
sudo apt install -y docker.io docker-compose
sudo systemctl enable docker
sudo usermod -aG docker ubuntu
```

**3. Deploy:**
```bash
git clone https://github.com/yourusername/auto-claude
cd auto-claude/docker
cp .env.example .env
# Configure .env
docker compose --profile graphiti up -d
```

**4. Set up HTTPS:**
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo certbot --nginx -d autoclaude.example.com
```

#### Google Cloud Run (Not Recommended)

**Cloud Run has limitations:**
- ❌ No persistent filesystem (repos would be lost)
- ❌ Request timeout (max 60 min, builds can be hours)
- ❌ No WebSocket support

**Use GCE (Google Compute Engine) instead** with Docker Compose.

#### DigitalOcean Droplet

**1. Create Droplet:**
- Docker marketplace image
- 4 GB RAM / 2 vCPUs minimum
- $24/month tier recommended

**2. Deploy:**
```bash
git clone https://github.com/yourusername/auto-claude
cd auto-claude/docker
cp .env.example .env
# Configure .env
docker compose --profile graphiti up -d
```

**3. Set up DNS:**
```bash
# Point A record to droplet IP
autoclaude.example.com → 1.2.3.4
```

**4. Enable HTTPS:**
```bash
snap install --classic certbot
certbot --nginx -d autoclaude.example.com
```

---

## Security Model

### Multi-Layer Defense

**Layer 1: Container Isolation**
- Non-root user (`autoclaude`)
- Read-only base Auto-Claude code (`/opt/auto-claude`)
- Restricted capabilities (`SYS_ADMIN` only for bubblewrap)
- Seccomp/AppArmor profiles

**Layer 2: Application Security**
- JWT authentication with expiring tokens
- Bcrypt password hashing (work factor 12+)
- Fernet credential encryption at rest
- SQL injection prevention (SQLAlchemy ORM)
- Input validation (Pydantic models)

**Layer 3: Network Security**
- HTTPS enforced in production
- CORS headers configured
- WebSocket authentication
- Security headers (HSTS, X-Frame-Options, etc.)

**Layer 4: Terminal Sandboxing**
- Bubblewrap isolation for PTY sessions
- Filesystem restrictions to project directory
- Command allowlist (from base Auto-Claude)

### Best Practices

**1. Generate Strong Secrets**
```bash
# Never use default/example values
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET_KEY=$(openssl rand -hex 32)
CREDENTIAL_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
```

**2. Use HTTPS in Production**
```bash
# Always proxy through Nginx/Traefik/Caddy with TLS
# Never expose port 8080 directly to the internet
```

**3. Enable Credential Encryption**
```bash
# Required for storing API keys securely
CREDENTIAL_ENCRYPTION_KEY=<fernet-key>
```

**4. Restrict Database Access**
```bash
# Don't expose PostgreSQL port externally
# Use internal Docker network only
```

**5. Regular Updates**
```bash
# Keep base images updated
docker compose pull
docker compose up -d
```

**6. Backup Database**
```bash
# Regular PostgreSQL backups
docker compose exec postgres pg_dump -U autoclaude autoclaude > backup.sql
```

**7. Monitor Logs**
```bash
# Watch for suspicious activity
docker compose logs -f web
```

### Authentication Security

**OAuth-Only for Builds**
```bash
# IMPORTANT: Only CLAUDE_CODE_OAUTH_TOKEN is used for builds
# ANTHROPIC_API_KEY is NOT used to prevent silent API billing
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

**Token Lifecycle**
```
Access Token (30 min) → Expires → Refresh with refresh token
Refresh Token (30 days) → Expires → User must re-login
Logout → Refresh token revoked immediately
```

**Password Requirements**
- Minimum 8 characters (recommended 12+)
- Bcrypt work factor 12+ (adaptive)
- No password reuse (future)
- Optional: Enforce complexity rules (future)

---

## Development

### Local Development Setup

**1. Install dependencies:**
```bash
# Backend
cd docker/app
pip install -r ../requirements.txt

# Frontend
cd docker/frontend
npm install
```

**2. Run database:**
```bash
docker compose up -d postgres falkordb
```

**3. Run migrations:**
```bash
cd docker
alembic upgrade head
```

**4. Start backend:**
```bash
cd docker/app
uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

**5. Start frontend (dev mode):**
```bash
cd docker/frontend
npm run dev
# Access at http://localhost:5173 (proxies to backend at 8080)
```

### Building Docker Image

**Local build:**
```bash
docker compose build
```

**Multi-platform build (for distribution):**
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t autoclaude-web:latest .
```

### Database Migrations

**Create new migration:**
```bash
cd docker
alembic revision --autogenerate -m "Description of changes"
```

**Apply migrations:**
```bash
alembic upgrade head
```

**Rollback migration:**
```bash
alembic downgrade -1
```

**View migration history:**
```bash
alembic history
```

### Testing

**Backend tests:**
```bash
cd docker/app
pytest tests/
```

**Frontend tests:**
```bash
cd docker/frontend
npm test
```

**Integration tests:**
```bash
# Start test stack
docker compose -f docker-compose.test.yml up -d

# Run tests
pytest tests/integration/

# Cleanup
docker compose -f docker-compose.test.yml down -v
```

### Environment Setup

**Development `.env`:**
```bash
# Minimal for local dev
POSTGRES_PASSWORD=dev
JWT_SECRET_KEY=dev-secret-key-not-for-production
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-your-token
DEBUG=true
```

**Production `.env`:**
```bash
# Strong secrets
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET_KEY=$(openssl rand -hex 32)
CREDENTIAL_ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
DEBUG=false
```

---

## Troubleshooting

### Container Won't Start

**Check logs:**
```bash
docker compose logs web
docker compose logs postgres
docker compose logs falkordb
```

**Common issues:**

**1. Database connection failed**
```bash
# Wait for postgres to be healthy
docker compose ps
# Ensure DATABASE_URL is correct
docker compose exec web env | grep DATABASE_URL
```

**2. Alembic migration failed**
```bash
# View migration errors
docker compose logs web | grep alembic

# Manually run migrations
docker compose exec web alembic upgrade head
```

**3. Missing environment variables**
```bash
# Check required vars are set
docker compose config | grep -E "(POSTGRES_PASSWORD|JWT_SECRET_KEY|CLAUDE_CODE_OAUTH_TOKEN)"
```

### Build Fails with Authentication Error

**Check OAuth token:**
```bash
# Verify token is set
docker compose exec web env | grep CLAUDE_CODE_OAUTH_TOKEN

# Token should start with: sk-ant-oat01-
```

**Common causes:**
- Token expired (regenerate with `claude setup-token`)
- Token not set in `.env`
- Token has wrong format (should be OAuth, not API key)

**IMPORTANT:** `ANTHROPIC_API_KEY` is intentionally NOT used for builds.

### WebSocket Connection Fails

**Check browser console:**
```javascript
// Should see successful connection
WebSocket connection to 'ws://localhost:8080/ws' established
```

**If behind reverse proxy:**
```nginx
# Ensure WebSocket upgrade headers
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

### Can't Clone Private Repos

**Set GitHub token:**
```bash
GITHUB_TOKEN=ghp_your-personal-access-token
```

**Token scopes required:**
- `repo` (for private repos)
- `read:org` (for org repos)

**Test token:**
```bash
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```

### Database Locked or Corrupted

**Reset database (WARNING: deletes all data):**
```bash
docker compose down
docker volume rm docker_postgres_data
docker compose up -d
```

**Backup before reset:**
```bash
docker compose exec postgres pg_dump -U autoclaude autoclaude > backup.sql
```

### Out of Disk Space

**Check volume sizes:**
```bash
docker system df -v
```

**Clean up:**
```bash
# Remove unused volumes
docker volume prune

# Remove old images
docker image prune -a
```

**Monitor repo sizes:**
```bash
docker compose exec web du -sh /repos/*
```

### Graphiti Memory Not Working

**Check FalkorDB:**
```bash
docker compose exec falkordb redis-cli ping
# Should return: PONG
```

**Check Graphiti MCP:**
```bash
docker compose ps graphiti-mcp
# Should be running if using --profile graphiti
```

**Verify provider configuration:**
```bash
docker compose exec web env | grep GRAPHITI
```

**Common issues:**
- `GRAPHITI_ENABLED=true` but provider API key missing
- Ollama not running (for Ollama provider)
- Invalid model names

### Performance Issues

**Increase container resources:**
```yaml
# docker-compose.override.yml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '4'
          memory: 8G
```

**Check resource usage:**
```bash
docker stats
```

**Optimize PostgreSQL:**
```yaml
# docker-compose.override.yml
services:
  postgres:
    environment:
      - POSTGRES_SHARED_BUFFERS=256MB
      - POSTGRES_EFFECTIVE_CACHE_SIZE=1GB
```

---

## Migration from Desktop App

**Moving from Electron app to Docker deployment:**

### Data Migration

**1. Export projects from desktop app:**
```bash
# In desktop app directory
cp -r ~/.auto-claude ~/Desktop/autoclaude-backup
```

**2. Import to Docker:**
```bash
# Copy to Docker volume
docker cp ~/Desktop/autoclaude-backup/. auto-claude-web:/data/
```

**3. Clone repositories:**
```bash
# Use web UI to clone repos
# Or set CLONE_REPOS in .env
```

### Settings Migration

**Desktop app settings → Docker environment:**

| Desktop Setting | Docker Environment Variable |
|----------------|---------------------------|
| Claude OAuth Token | `CLAUDE_CODE_OAUTH_TOKEN` |
| Default Model | `AUTO_BUILD_MODEL` |
| GitHub Token | `GITHUB_TOKEN` (User/Project credentials) |
| Graphiti Enabled | `GRAPHITI_ENABLED=true` |
| OpenAI API Key | `OPENAI_API_KEY` |

### Workflow Changes

**Desktop App:**
```bash
1. Open desktop app
2. Add project
3. Create task
4. Monitor in Kanban board
```

**Docker Deployment:**
```bash
1. Open http://localhost:8080
2. Login with account
3. Clone repository (one-time)
4. Create task
5. Monitor in Kanban board (same UI!)
```

**Key differences:**
- **Login required**: Each user has account
- **Credentials**: Set per-user or per-project
- **Multi-user**: See all your projects, admins see all users
- **Remote access**: Access from any device

---

## License

This Docker deployment is part of the Auto-Claude project and licensed under **AGPL-3.0**.

**Key Points:**
- **Open Source Required**: If you modify and distribute this software, you must open-source your changes under AGPL-3.0
- **Network Copyleft**: Running this as a SaaS requires providing source code to users
- **Attribution Required**: Credit the Auto-Claude project
- **No Closed-Source Use**: Cannot use in proprietary products without separate commercial license

For commercial licensing inquiries, contact the maintainers.

---

## Contributing

We welcome contributions! See the main [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

**Docker-specific contributions:**
- FastAPI backend improvements
- React frontend components
- Database migrations
- Multi-provider support
- Security enhancements
- Performance optimizations

**Development setup:** See [Development](#development) section above.

---

## Support

- **Documentation**: This README + [Auto-Claude docs](../README.md)
- **Discord**: [Join community](https://discord.gg/KCXaPBr4Dj)
- **Issues**: [GitHub Issues](https://github.com/jlengelbrecht/Auto-Claude/issues)

---

**Built with ❤️ by the Auto-Claude community**
