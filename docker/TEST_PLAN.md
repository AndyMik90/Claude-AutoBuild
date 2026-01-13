# Auto-Claude Docker - Test Plan

> Goal: Verify the containerized app behaves identically to the original Electron app

---

## Prerequisites

### Required Configuration

Before testing, you need to configure these in `docker/.env`:

```bash
# Copy template
cp .env.example .env
```

| Variable | Required For | How to Get |
|----------|--------------|------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Spec creation, builds | Run `claude setup-token` in terminal |
| `GITHUB_TOKEN` | Private repos | [GitHub Settings → Tokens](https://github.com/settings/tokens) |

### Test Repository

You'll need a test repository. Options:
1. **Use a public repo** (no GITHUB_TOKEN needed): `https://github.com/jlengelbrecht/Auto-Claude`
2. **Create a test repo** with some simple code to modify
3. **Use an existing project** you want to test with

---

## Test Phases

### Phase 1: Infrastructure (No Auth Required)

These tests verify the container is working without needing Claude authentication.

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 1.1 | Container Health | `curl http://localhost:8080/api/settings/health` | JSON with `status: "healthy"` |
| 1.2 | Web UI Loads | Open http://localhost:8080 | Dashboard renders, no JS errors |
| 1.3 | Settings Page | Click Settings | Shows System Status with config indicators |
| 1.4 | API Config | `curl http://localhost:8080/api/settings/config` | Returns paths and settings |

### Phase 2: Project Management (GITHUB_TOKEN for private repos)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 2.1 | Clone Public Repo | Add Project → `https://github.com/octocat/Hello-World` | Project appears in dashboard |
| 2.2 | Clone Private Repo | Add Project → your private repo URL | Project cloned (requires GITHUB_TOKEN) |
| 2.3 | View Project | Click project card | Shows project page with specs list |
| 2.4 | Pull Latest | Click Pull button on project | Success message, git pull executed |
| 2.5 | Delete Project | Click delete on project | Project removed from dashboard |

### Phase 3: Spec Management (CLAUDE_CODE_OAUTH_TOKEN Required)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 3.1 | List Specs | View project page | Shows existing specs (or empty state) |
| 3.2 | Create Spec | Click "Create Spec" → Enter task | Spec created via `spec_runner.py` |
| 3.3 | View Spec Content | Click on a spec | Shows spec.md, implementation plan |
| 3.4 | Spec Files | Check spec directory | Has spec.md, requirements.json, etc. |

### Phase 4: Build Execution (CLAUDE_CODE_OAUTH_TOKEN Required)

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 4.1 | Start Build | Click "Start Build" on spec | Build starts, status changes |
| 4.2 | View Logs | Check log viewer | Real-time output via WebSocket |
| 4.3 | Build Progress | Monitor during build | Shows planner → coder → QA phases |
| 4.4 | Stop Build | Click "Stop Build" | Build terminates gracefully |
| 4.5 | Build Completion | Wait for build to finish | Status shows completed/failed |

### Phase 5: Workspace Operations

| # | Test | Steps | Expected Result |
|---|------|-------|-----------------|
| 5.1 | Review Changes | After build, check worktree | Changes in `.worktrees/{spec-name}/` |
| 5.2 | Merge | Click "Merge" on completed spec | Changes merged to main branch |
| 5.3 | Discard | On another spec, click "Discard" | Worktree deleted, branch removed |

### Phase 6: Parity Tests (Compare with Original App)

These tests specifically verify the Docker version matches the Electron app behavior.

| # | Test | Docker Container | Original Electron App |
|---|------|------------------|----------------------|
| 6.1 | Spec directory structure | Check `/projects/{name}/.auto-claude/specs/` | Check `{project}/.auto-claude/specs/` |
| 6.2 | Build output format | View build logs | Compare with terminal output |
| 6.3 | Implementation plan | View `implementation_plan.json` | Same structure and phases |
| 6.4 | QA report format | View `qa_report.md` | Same format |
| 6.5 | Git branching | Check `git branch -a` in project | Same branch naming convention |

---

## Test Execution Commands

### Quick Health Check
```bash
# From docker/ directory
curl -s http://localhost:8080/api/settings/health | jq
```

### API Testing
```bash
# List projects
curl -s http://localhost:8080/api/projects | jq

# Clone a repo
curl -X POST http://localhost:8080/api/projects \
  -H "Content-Type: application/json" \
  -d '{"repo_url": "https://github.com/octocat/Hello-World"}' | jq

# Get project specs
curl -s http://localhost:8080/api/projects/{project_id}/specs | jq

# Start a build
curl -X POST http://localhost:8080/api/builds/{project_id}/specs/{spec_id}/build | jq

# Check build status
curl -s http://localhost:8080/api/builds/{project_id}/specs/{spec_id}/build/status | jq
```

### Container Inspection
```bash
# View container logs
docker compose logs -f web

# Enter container shell
docker compose exec web /bin/bash

# Check Auto-Claude is accessible
docker compose exec web python /opt/auto-claude/run.py --help

# Check project files
docker compose exec web ls -la /projects/
```

---

## Test Checklist

### Before Testing
- [ ] `.env` file created with required tokens
- [ ] Container rebuilt after .env changes: `docker compose up -d --build`
- [ ] Container is healthy: `docker compose ps`

### Phase 1: Infrastructure
- [ ] 1.1 Health endpoint returns healthy
- [ ] 1.2 Web UI loads without errors
- [ ] 1.3 Settings page shows correct status
- [ ] 1.4 Config endpoint returns expected paths

### Phase 2: Project Management
- [ ] 2.1 Can clone public repository
- [ ] 2.2 Can clone private repository (if GITHUB_TOKEN set)
- [ ] 2.3 Project page displays correctly
- [ ] 2.4 Git pull works
- [ ] 2.5 Project deletion works

### Phase 3: Spec Management
- [ ] 3.1 Spec list displays (empty or with specs)
- [ ] 3.2 Can create new spec
- [ ] 3.3 Spec content viewer works
- [ ] 3.4 All spec files generated correctly

### Phase 4: Build Execution
- [ ] 4.1 Build starts successfully
- [ ] 4.2 Real-time logs stream
- [ ] 4.3 Build phases execute correctly
- [ ] 4.4 Can stop build mid-execution
- [ ] 4.5 Build completes successfully

### Phase 5: Workspace Operations
- [ ] 5.1 Worktree created correctly
- [ ] 5.2 Merge integrates changes
- [ ] 5.3 Discard cleans up properly

### Phase 6: Parity
- [ ] 6.1 Spec directory structure matches
- [ ] 6.2 Build output format matches
- [ ] 6.3 Implementation plan format matches
- [ ] 6.4 QA report format matches
- [ ] 6.5 Git branching convention matches

---

## Troubleshooting

### Common Issues

**Build fails with "Claude not authenticated"**
```bash
# Verify token is set in container
docker compose exec web env | grep CLAUDE
# Should show CLAUDE_CODE_OAUTH_TOKEN=...
```

**Can't clone private repos**
```bash
# Verify GitHub token
docker compose exec web env | grep GITHUB
# Should show GITHUB_TOKEN=ghp_...
```

**WebSocket logs not streaming**
```bash
# Check browser console for WS errors
# Ensure reverse proxy (if any) supports WebSocket upgrade
```

**Container unhealthy**
```bash
docker compose logs web
# Check for Python errors or missing dependencies
```

---

## Sign-off

| Tester | Date | Phase Completed | Notes |
|--------|------|-----------------|-------|
| | | | |

---

## Notes

- The Docker container wraps the **unmodified** Auto-Claude CLI
- All operations (`run.py`, `spec_runner.py`) execute inside the container
- Project data persists in Docker volumes (`projects`, `data`)
- The web UI is a **thin wrapper** - the core logic is identical to the Electron app
