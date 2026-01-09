# Auto-Claude Docker - Implementation Status

> Last Updated: 2025-12-21

## Current Status: Enterprise Enhancements - Phase D Complete

All **enterprise features** are now complete including credential hierarchy, SMTP integration, SSO/OIDC support, and build verification.

### What's Working
- **Full React UI rendering** - All 342 components from Electron app
- **Kanban board** with 5 columns (Planning → In Progress → AI Review → Human Review → Done)
- **Full sidebar** with all navigation items
- **WebSocket endpoint** (`/ws`) for real-time events
- **Project API** - Full CRUD with user scoping
- **Task API** - Full task management (maps to specs)
- **Settings API** - Persistent app settings
- **Terminal API** - PTY terminals with WebSocket streaming
- **Files API** - File tree, read/write operations
- **Git API** - Repository status, branches, log, diff
- **PostgreSQL database** - Added to docker-compose
- **SQLAlchemy models** - User, Project, AgentProfile, Credentials, UserCredentials
- **Alembic migrations** - Database schema management
- **JWT Authentication** - Access & refresh tokens
- **Auth API** - Login, logout, refresh, setup
- **Project Service** - PostgreSQL with per-user project isolation
- **Agent Profile Service** - Per-project agent configuration
- **Credential Encryption** - Fernet encryption for stored API keys
- **Build Integration** - Per-project environment for builds
- **Frontend Auth** - Login, Register, Setup pages with Zustand
- **Auth Store** - Token persistence with automatic refresh
- **Dashboard** - Projects view with user menu
- **Admin UI** - User management, invitations, global credentials, SMTP settings, OIDC settings
- **Per-Project Config** - Agent profile settings, credential management
- **Credential Hierarchy** - Global → User → Project credential inheritance
- **SMTP Integration** - Email delivery for invitation codes
- **SSO/OIDC Support** - Enterprise single sign-on with auto-provisioning
- **Debug Endpoints** - Credential flow testing and verification (when DEBUG=true)

### In Progress
- **Phase 8**: Migration & Onboarding (JSON to PostgreSQL migration)

### Recently Completed
- **Phase D**: Build Verification (debug endpoints, documentation)
- **Phase C**: SSO/OIDC Support (enterprise single sign-on)
- **Phase B**: SMTP Integration for email delivery
- **Phase A**: Credential Hierarchy System (Global → User → Project)
- **Phase 6-7**: Admin UI & Per-Project Configuration

---

## Architecture (Multi-User)

```
┌─────────────────────────────────────────────────────────────┐
│                   Docker Compose Stack                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Web App     │  │  PostgreSQL  │  │  FalkorDB    │       │
│  │  (FastAPI)   │◄─┤  (Database)  │  │  (Graphiti)  │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                                                    │
│         ▼                                                    │
│  /repos/{user_id}/{project}/  ← Per-user project isolation  │
└─────────────────────────────────────────────────────────────┘
```

### Credential Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│  GLOBAL (Admin-set)     →  All users automatically         │
│  └── Admin can LOCK credentials (users can't override)     │
├─────────────────────────────────────────────────────────────┤
│  USER-LEVEL             →  All user's projects             │
│  └── Inherits from global if not set                       │
├─────────────────────────────────────────────────────────────┤
│  PROJECT-LEVEL          →  Override for specific project   │
│  └── Inherits from user if not set                         │
└─────────────────────────────────────────────────────────────┘
```

### Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts with roles (admin/user) |
| `user_credentials` | Per-user default API keys (encrypted) |
| `invitations` | Invite codes for registration |
| `refresh_tokens` | JWT refresh tokens (revocable) |
| `projects` | User-owned projects |
| `project_agent_profiles` | Per-project agent config |
| `project_credentials` | Per-project API keys (encrypted) |
| `system_settings` | Global settings + global credentials |

---

## Implementation Phases

### Phase 1: Database & Infrastructure ✅ COMPLETE
- [x] Add PostgreSQL to docker-compose.yaml
- [x] Add SQLAlchemy, asyncpg, alembic to requirements.txt
- [x] Create database.py with async SQLAlchemy setup
- [x] Create SQLAlchemy models (User, Project, AgentProfile, etc.)
- [x] Set up Alembic migrations structure
- [x] Create initial migration for all tables

### Phase 2: Authentication System ✅ COMPLETE
- [x] Create password hashing service (bcrypt)
- [x] Create JWT token service
- [x] Create auth service (login, refresh, logout)
- [x] Create auth dependencies (get_current_user, require_admin)
- [x] Create auth routes (/api/auth/*)
- [x] Create registration routes (/api/register/*)
- [x] Create user management routes (/api/users/*)

### Phase 3: Project Management Refactor ✅ COMPLETE
- [x] Update ProjectService to use PostgreSQL
- [x] Add user scoping to all project operations
- [x] Create per-user directory structure (/repos/{user_id}/)
- [x] Update project routes with auth protection
- [x] Add agent profile and credentials endpoints

### Phase 4: Agent Profile System ✅ COMPLETE
- [x] Create agent profile service
- [x] Create credential encryption service (Fernet)
- [x] Update build runner to use profile from DB
- [x] Add credential update routes

### Phase 5: Frontend Auth ✅ COMPLETE
- [x] Create LoginPage.tsx
- [x] Create RegisterPage.tsx
- [x] Create SetupPage.tsx
- [x] Create auth-store.ts
- [x] Create Dashboard.tsx
- [x] Update App.tsx with auth routing
- [x] Update web-api.ts with auth headers

### Phase 6: Admin UI ✅ COMPLETE
- [x] Create UserManagement.tsx
- [x] Create InvitationManager.tsx
- [x] Create GlobalCredentials.tsx (Enterprise Enhancement)

### Phase 7: Per-Project Config UI ✅ COMPLETE
- [x] Create AgentProfileSettings.tsx
- [x] Create CredentialSettings.tsx with hierarchy indicators

### Phase 8: Migration & Onboarding ⏳ PENDING
- [ ] Create JSON to PostgreSQL migration script
- [ ] Update onboarding flow for container

---

## Enterprise Enhancements

### Phase A: Credential Hierarchy ✅ COMPLETE
- [x] Create UserCredentials model (`db/models/user_credentials.py`)
- [x] Extend SystemSettings with global credential fields
- [x] Create Alembic migration (`20251221_0002_add_credential_hierarchy.py`)
- [x] Create user_credential_service.py with hierarchy resolution
- [x] Create user credentials API routes (`/api/users/me/credentials`)
- [x] Create admin settings API routes (`/api/admin/settings/credentials`)
- [x] Update agent_profile_service.py with `get_effective_credentials()`
- [x] Create UserCredentialSettings.tsx for user defaults
- [x] Create GlobalCredentials.tsx for admin control
- [x] Update CredentialSettings.tsx to show inheritance source

### Phase B: SMTP Integration ✅ COMPLETE
- [x] Extend SystemSettings with SMTP configuration fields
- [x] Create Alembic migration for SMTP fields (`20251221_0003_add_smtp_settings.py`)
- [x] Add aiosmtplib to requirements.txt
- [x] Create email_service.py for sending emails
- [x] Create admin SMTP routes (`/api/admin/settings/smtp`)
- [x] Create SMTPSettings.tsx admin component
- [x] Update InvitationManager.tsx for email delivery option

### Phase C: SSO/OIDC Support ✅ COMPLETE
- [x] Extend SystemSettings with OIDC configuration fields
- [x] Extend User model with OIDC fields (oidc_subject, oidc_provider, auth_method)
- [x] Create Alembic migration for OIDC fields (`20251221_0004_add_oidc_support.py`)
- [x] Add authlib to requirements.txt
- [x] Create oidc_service.py for OIDC flow
- [x] Create OIDC auth routes (`/api/auth/oidc/*`)
- [x] Create admin OIDC routes (`/api/admin/settings/oidc`)
- [x] Create OIDCSettings.tsx admin component
- [x] Update LoginPage.tsx with SSO button (conditional based on OIDC status)

### Phase D: Build Verification ✅ COMPLETE
- [x] Create debug endpoint for credential flow testing (`/api/debug/*`)
- [x] Create credential hierarchy status endpoint
- [x] Create project credential flow endpoint with build env preview
- [x] Create admin test-flow endpoint for verification
- [x] Document credential configuration (`docs/CREDENTIAL_CONFIGURATION.md`)

---

## API Implementation Status

| API Module | Status | Endpoint |
|------------|--------|----------|
| Auth API | ✅ Complete | `/api/auth` |
| Register API | ✅ Complete | `/api/register` |
| Users API | ✅ Complete | `/api/users` |
| User Credentials API | ✅ Complete | `/api/users/me/credentials` |
| Admin Settings API | ✅ Complete | `/api/admin/settings` |
| Admin SMTP API | ✅ Complete | `/api/admin/settings/smtp` |
| Admin OIDC API | ✅ Complete | `/api/admin/settings/oidc` |
| OIDC Auth API | ✅ Complete | `/api/auth/oidc` |
| Debug API | ✅ Complete | `/api/debug` (requires DEBUG=true) |
| WebSocket | ✅ Complete | `/ws` |
| Project API | ✅ Complete | `/api/projects` |
| Task API | ✅ Complete | `/api/projects/{id}/tasks` |
| Spec API | ✅ Complete | `/api/projects/{id}/specs` |
| Build API | ✅ Complete | `/api/projects/{id}/specs/{id}/build` |
| Terminal API | ✅ Complete | `/api/terminals` |
| Files API | ✅ Complete | `/api/files` |
| Git API | ✅ Complete | `/api/git` |
| Settings API | ✅ Complete | `/api/settings` |

---

## API Endpoints Reference

### Authentication
```
GET    /api/auth/status     - Check if setup is required
POST   /api/auth/setup      - Initial admin setup
POST   /api/auth/login      - Login with email/username + password
POST   /api/auth/refresh    - Refresh access token
POST   /api/auth/logout     - Logout (revoke refresh token)
GET    /api/auth/me         - Get current user info
```

### Registration
```
POST   /api/register/validate - Validate invitation code
POST   /api/register          - Register with invitation code
```

### User Management (Admin)
```
GET    /api/users                   - List all users
GET    /api/users/{id}              - Get user details
PATCH  /api/users/{id}              - Update user (role, active)
GET    /api/users/invitations       - List invitations
POST   /api/users/invitations       - Create invitation
DELETE /api/users/invitations/{id}  - Revoke invitation
```

### User Credentials
```
GET    /api/users/me/credentials           - Get credential status
PUT    /api/users/me/credentials           - Update user credentials
GET    /api/users/me/credentials/hierarchy - Get effective credentials
```

### Admin Settings
```
GET    /api/admin/settings/credentials          - Get global credential status
PUT    /api/admin/settings/credentials          - Update global credentials
PUT    /api/admin/settings/credentials/controls - Update lock/allow flags
```

### SMTP Settings (Admin)
```
GET    /api/admin/settings/smtp           - Get SMTP configuration
PUT    /api/admin/settings/smtp           - Update SMTP settings
POST   /api/admin/settings/smtp/test      - Test SMTP connection
POST   /api/admin/settings/smtp/test-email - Send test email
GET    /api/admin/settings/smtp/status    - Check if SMTP is configured
```

### Projects
```
GET    /api/projects              - List all projects
POST   /api/projects              - Clone a repository
GET    /api/projects/{id}         - Get project details
DELETE /api/projects/{id}         - Delete project
POST   /api/projects/{id}/pull    - Pull latest changes
```

### Tasks
```
GET    /api/projects/{id}/tasks           - List tasks
POST   /api/projects/{id}/tasks           - Create task
GET    /api/projects/{id}/tasks/{tid}     - Get task
PATCH  /api/projects/{id}/tasks/{tid}     - Update task
DELETE /api/projects/{id}/tasks/{tid}     - Delete task
POST   /api/projects/{id}/tasks/{tid}/start   - Start task
POST   /api/projects/{id}/tasks/{tid}/stop    - Stop task
POST   /api/projects/{id}/tasks/{tid}/approve - Approve task
```

### Terminals
```
GET    /api/terminals              - List terminals
POST   /api/terminals              - Create terminal
DELETE /api/terminals/{id}         - Close terminal
POST   /api/terminals/{id}/write   - Write to terminal
POST   /api/terminals/{id}/resize  - Resize terminal
```

### Files
```
GET    /api/files/read?path=...    - Read file
POST   /api/files/write            - Write file
GET    /api/files/list?path=...    - List directory
GET    /api/files/tree?path=...    - Get file tree
GET    /api/files/exists?path=...  - Check if exists
```

### Git
```
GET    /api/git/status?path=...        - Git status
GET    /api/git/branches?path=...      - List branches
GET    /api/git/current-branch?path=...- Current branch
GET    /api/git/log?path=...           - Recent commits
GET    /api/git/diff?path=...          - Git diff
POST   /api/git/pull?path=...          - Pull changes
```

---

## Container Status

```
NAME                   STATUS    PORTS
auto-claude-web        Healthy   0.0.0.0:8080->8080/tcp
auto-claude-postgres   Healthy   0.0.0.0:5432->5432/tcp
auto-claude-falkordb   Healthy   0.0.0.0:6380->6379/tcp
```

**Web UI**: http://localhost:8080

---

## Environment Variables

```bash
# Required
POSTGRES_PASSWORD=your-secure-password
JWT_SECRET_KEY=your-jwt-secret-key

# Claude Authentication (at least one required)
CLAUDE_CODE_OAUTH_TOKEN=your-token
ANTHROPIC_API_KEY=your-api-key

# Optional
GITHUB_TOKEN=your-github-token
CREDENTIAL_ENCRYPTION_KEY=your-fernet-key
GRAPHITI_ENABLED=false
DEBUG=false
```

---

## Build Commands

```bash
# Start the stack
docker compose up -d

# Run database migrations
docker compose exec web alembic upgrade head

# Rebuild after code changes
docker compose up -d --build web

# View logs
docker logs auto-claude-web --tail 50
docker logs auto-claude-postgres --tail 20

# Test auth API
curl http://localhost:8080/api/auth/status | jq

# Connect to database
docker compose exec postgres psql -U autoclaude -d autoclaude
```

---

## Security Features

1. **Passwords**: bcrypt with work factor 12+
2. **JWT**: 30-min access tokens, 30-day refresh tokens (revocable)
3. **Credentials**: Fernet encryption for stored API keys
4. **Credential Hierarchy**: Global → User → Project with admin lock control
5. **Admin-only registration**: Users can only register with invitation codes

---

## Next Steps

1. **Phase 8**: Migration & Onboarding (JSON to PostgreSQL migration)
2. **Production Hardening**: Rate limiting, logging, monitoring
3. **Agent Integration**: Connect credential hierarchy to actual builds

## Debug Endpoints

When `DEBUG=true` is set:

```
GET  /api/debug/status                      - Check if debug mode is enabled
GET  /api/debug/credentials/hierarchy       - View credential sources (auth required)
GET  /api/debug/credentials/project/{id}    - View project credential flow (auth required)
GET  /api/debug/credentials/test-flow       - Run credential tests (admin only)
```

See `docs/CREDENTIAL_CONFIGURATION.md` for full documentation.
