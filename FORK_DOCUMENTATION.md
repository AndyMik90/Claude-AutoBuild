# Auto-Claude Fork Documentation
**Fork Owner**: joelfuller2016
**Upstream Owner**: AndyMik90
**Last Updated**: 2026-01-01
**Purpose**: Development fork with custom PR creation and debug features

---

## 📋 TABLE OF CONTENTS

1. [Repository Structure](#repository-structure)
2. [Fork History & Relationship](#fork-history--relationship)
3. [Custom Features](#custom-features)
4. [Branching Strategy](#branching-strategy)
5. [Sync Status](#sync-status)
6. [Development Workflow](#development-workflow)
7. [Contributing Upstream](#contributing-upstream)
8. [Custom Files Inventory](#custom-files-inventory)

---

## 🏗️ REPOSITORY STRUCTURE

### Repository URLs
```
Upstream (Original)
└─ https://github.com/AndyMik90/Auto-Claude
   └─ Default Branch: develop
   └─ Protected Branch: main

Fork (joelfuller2016)
└─ https://github.com/joelfuller2016/Auto-Claude
   └─ Default Branch: develop
   └─ Tracks: AndyMik90/Auto-Claude

Local Clone
└─ C:\Users\joelf\Auto-Claude
   └─ Branch: develop
   └─ Remotes:
      ├─ origin  → joelfuller2016/Auto-Claude (fork)
      └─ upstream → AndyMik90/Auto-Claude (original)
```

### Directory Structure
```
Auto-Claude/
├── apps/
│   ├── backend/               # Python backend/CLI
│   │   ├── core/              # Client, auth, security
│   │   ├── agents/            # Agent implementations
│   │   ├── spec_agents/       # Spec creation agents
│   │   ├── runners/
│   │   │   └── github/        # ⭐ CUSTOM: PR creation backend
│   │   │       ├── gh_client.py      # GitHub CLI wrapper
│   │   │       └── runner.py         # CLI commands
│   │   ├── integrations/      # Graphiti, Linear, GitHub
│   │   └── prompts/           # Agent system prompts
│   │
│   └── frontend/              # Electron desktop UI
│       ├── src/
│       │   ├── main/
│       │   │   └── ipc-handlers/
│       │   │       └── github/
│       │   │           └── pr-handlers.ts  # ⭐ CUSTOM: PR IPC handlers
│       │   │
│       │   ├── renderer/
│       │   │   └── components/
│       │   │       └── debug/  # ⭐ CUSTOM: Debug page
│       │   │           ├── DebugPage.tsx
│       │   │           ├── ConfigInspector.tsx
│       │   │           ├── IPCTester.tsx
│       │   │           ├── LogViewer.tsx
│       │   │           └── RunnerTester.tsx
│       │   │
│       │   └── shared/
│       │       ├── types/      # TypeScript types
│       │       └── i18n/       # Translations (en/fr)
│       │
│       └── scripts/           # Build scripts
│
├── guides/                    # Documentation
├── tests/                     # Test suite
├── scripts/                   # Utility scripts
│
├── DEEP_REVIEW_FINDINGS.md   # ⭐ CUSTOM: Code review results
├── FORK_DOCUMENTATION.md     # ⭐ CUSTOM: This file
└── CLAUDE.md                  # Project guidance for Claude Code
```

---

## 🌳 FORK HISTORY & RELATIONSHIP

### Origin Timeline
```
2024-XX-XX: AndyMik90 creates Auto-Claude repository
    │
    ├─ Develop branch becomes primary development branch
    ├─ Main branch for stable releases
    │
2025-12-XX: joelfuller2016 forks repository
    │
    ├─ Clone to local machine (C:\Users\joelf\Auto-Claude)
    ├─ Add upstream remote for sync
    │
2026-01-01: Current state
    ├─ Synced with upstream develop (commit 7210610)
    ├─ Custom PR creation feature added
    ├─ Custom debug page implementation
    └─ Deep review completed
```

### Fork Relationship
```
┌─────────────────────────────────────────────────────────┐
│ UPSTREAM: AndyMik90/Auto-Claude                         │
│ https://github.com/AndyMik90/Auto-Claude               │
│                                                         │
│ ┌─────────────┐        ┌─────────────┐                 │
│ │    main     │◄───────┤   develop   │                 │
│ └─────────────┘        └─────────────┘                 │
│       │                       │                         │
│       │                       │ PR #471 merged          │
│       │                       │ (Windows fixes)         │
└───────┼───────────────────────┼─────────────────────────┘
        │                       │
        │                       │ fork & track
        │                       ▼
┌───────┼───────────────────────────────────────────────────┐
│       │              FORK: joelfuller2016/Auto-Claude     │
│       │              https://github.com/joelfuller2016/   │
│       │                                  Auto-Claude      │
│       │                                                   │
│ ┌─────┴─────┐        ┌─────────────┐                     │
│ │   main    │        │   develop   │ ◄─ custom features  │
│ └───────────┘        └─────────────┘                     │
│                             │                             │
│                             │ git pull                    │
└─────────────────────────────┼─────────────────────────────┘
                              │
                              ▼
                     ┌─────────────────────┐
                     │ LOCAL CLONE         │
                     │ C:\Users\joelf\     │
                     │ Auto-Claude         │
                     │                     │
                     │ Branch: develop     │
                     └─────────────────────┘
```

### Sync Status (as of 2026-01-01)
```bash
# Check sync status
$ git fetch upstream
$ git status
On branch develop
Your branch is up to date with 'origin/develop'.

$ git log --oneline upstream/develop..HEAD
# (no output = fully synced)

# Last synced commit
$ git log --oneline -1
7210610 Fix/windows issues (#471)
```

**Status**: ✅ Fully synced with upstream/develop

---

## ⭐ CUSTOM FEATURES

### 1. PR Creation Feature
**Added**: 2025-12-XX
**Status**: Functional (needs polish)
**Purpose**: Create GitHub Pull Requests directly from Auto-Claude UI

#### Backend Components

**File**: `apps/backend/runners/github/gh_client.py`
- **Function**: `async def pr_create(base, head, title, body, draft=False)`
- **Lines**: 838-891
- **Purpose**: GitHub CLI wrapper for PR creation
- **Implementation**:
  ```python
  async def pr_create(self, base: str, head: str, title: str,
                      body: str, draft: bool = False) -> dict[str, Any]:
      """Create a new pull request."""
      args = ["pr", "create", "--base", base, "--head", head,
              "--title", title, "--body", body]
      if draft:
          args.append("--draft")
      args.extend(["--json", "number,url,title,state"])
      args = self._add_repo_flag(args)
      result = await self.run(args)
      return json.loads(result.stdout)
  ```
- **Dependencies**:
  - GitHub CLI (`gh`) must be installed
  - Repository must have remote configured
  - User must be authenticated with `gh auth login`

**File**: `apps/backend/runners/github/runner.py`
- **Function**: `async def cmd_pr_create(args)`
- **Lines**: 321-391
- **Purpose**: CLI command handler for PR creation
- **Implementation**:
  ```python
  async def cmd_pr_create(args) -> int:
      """Create a pull request."""
      config = get_config(args)
      gh_client = GHClient(...)
      draft = args.draft.lower() == 'true' if isinstance(args.draft, str) else bool(args.draft)
      result = await gh_client.pr_create(base=args.base, head=args.head,
                                         title=args.title, body=args.body, draft=draft)
      print(json.dumps(result))
      return 0
  ```
- **Integration**: Called by frontend IPC handler as subprocess

#### Frontend Components

**File**: `apps/frontend/src/main/ipc-handlers/github/pr-handlers.ts`
- **Handler**: `IPC_CHANNELS.GITHUB_PR_CREATE`
- **Lines**: 1550-1669
- **Purpose**: IPC handler for PR creation requests
- **Features**:
  - Input validation (non-empty strings)
  - Progress reporting via IPC channels
  - Error handling with user-friendly messages
  - Subprocess management with stdout/stderr parsing
- **IPC Channels**:
  - `GITHUB_PR_CREATE` - Main trigger channel
  - `GITHUB_PR_CREATE_PROGRESS` - Progress updates
  - `GITHUB_PR_CREATE_COMPLETE` - Success with PR details
  - `GITHUB_PR_CREATE_ERROR` - Error messages

#### Usage Flow
```
User clicks "Create PR" in UI
    │
    ├─ Frontend: Trigger IPC_CHANNELS.GITHUB_PR_CREATE
    │  └─ Args: projectId, base, head, title, body, draft
    │
    ├─ IPC Handler (pr-handlers.ts):
    │  ├─ Validate inputs
    │  ├─ Build subprocess args
    │  └─ Call: python runner.py pr-create [args]
    │
    ├─ Backend (runner.py):
    │  ├─ Parse arguments
    │  ├─ Call gh_client.pr_create()
    │  └─ Return JSON to stdout
    │
    ├─ GitHub CLI (gh_client.py):
    │  ├─ Build gh pr create command
    │  ├─ Execute with timeout/retry
    │  └─ Parse JSON response
    │
    └─ IPC Handler:
       ├─ Parse stdout JSON
       ├─ Send GITHUB_PR_CREATE_COMPLETE
       └─ UI displays PR number and URL
```

#### Known Issues
- ⚠️ Draft parsing fragile (`'True'` vs `'true'`)
- ⚠️ No error handling around gh_client.pr_create()
- ⚠️ Missing input validation (branch names, length limits)
- ⚠️ No timeout on subprocess
- ⚠️ No runtime type validation of response

See `DEEP_REVIEW_FINDINGS.md` for detailed issue list.

---

### 2. Debug Page Feature
**Added**: 2025-12-XX
**Status**: Partially functional (1/4 panels working)
**Purpose**: Diagnostic tools for debugging IPC, backend, and configuration

#### Components Overview

| Component | File | Status | Purpose |
|-----------|------|--------|---------|
| DebugPage | DebugPage.tsx | ✅ Working | Main container with tabs |
| ConfigInspector | ConfigInspector.tsx | ✅ Working | View project environment config |
| IPCTester | IPCTester.tsx | ❌ Simulated | Test IPC channels |
| LogViewer | LogViewer.tsx | ❌ Simulated | View backend/IPC/frontend logs |
| RunnerTester | RunnerTester.tsx | ❌ Simulated | Test backend runner commands |

#### 1. DebugPage (Main Container)
**File**: `apps/frontend/src/renderer/components/debug/DebugPage.tsx`
**Lines**: 82
**Features**:
- Tab-based UI with 4 panels
- Responsive grid layout
- ✅ Full i18n support (fixed in commits 76198b8, 7c49742)
- Uses shadcn/ui Card and Tabs components

**Implementation**:
```tsx
export function DebugPage() {
  const { t } = useTranslation(['debug']);
  const [activeTab, setActiveTab] = useState('config');

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="config">{t('tabs.config')}</TabsTrigger>
        <TabsTrigger value="ipc">{t('tabs.ipc')}</TabsTrigger>
        <TabsTrigger value="runner">{t('tabs.runner')}</TabsTrigger>
        <TabsTrigger value="logs">{t('tabs.logs')}</TabsTrigger>
      </TabsList>
      {/* Tab content panels */}
    </Tabs>
  );
}
```

#### 2. ConfigInspector (✅ Functional)
**File**: `apps/frontend/src/renderer/components/debug/ConfigInspector.tsx`
**Lines**: 124
**Purpose**: Display application settings, project config, and environment variables

**Features**:
- Loads real project environment via `window.electronAPI.getProjectEnv()`
- Displays app settings (autoBuildPath, theme, language)
- Displays project details (ID, name, path, timestamps)
- Displays environment variables from `.env` file
- Refresh button with loading state
- Scrollable sections with proper formatting

**Data Sources**:
1. **App Settings** - from `useSettingsStore()`
2. **Project Config** - from `useProjectStore()`
3. **Environment Variables** - from backend IPC call

**Known Issues**:
- ⚠️ Silent error handling (empty catch block)
- ⚠️ No user feedback if env config fails to load

#### 3. IPCTester (❌ Simulated)
**File**: `apps/frontend/src/renderer/components/debug/IPCTester.tsx`
**Lines**: 168
**Purpose**: Test IPC channel communication

**Simulated Features**:
- Dropdown with predefined IPC channels:
  - `github:pr:list`
  - `github:pr:create`
  - `github:issue:list`
  - `github:worktree:create`
  - `settings:get`
  - `project:get-env`
- JSON parameter input
- Success/error response display
- **Currently simulates calls** (line 52-53)

**Implementation Needed**:
```typescript
// Current (simulated):
await new Promise((resolve) => setTimeout(resolve, 500));

// Needed (real IPC):
const result = await window.electronAPI.invoke(selectedChannel, parsedParams);
```

#### 4. LogViewer (❌ Simulated)
**File**: `apps/frontend/src/renderer/components/debug/LogViewer.tsx`
**Lines**: 97
**Purpose**: Stream and display logs from backend, IPC, and frontend

**Simulated Features**:
- Source selector (backend/ipc/frontend)
- Color-coded log levels (error/warn/info/debug)
- Scrollable log display with monospace font
- Clear logs button
- **Currently has empty logs array** (no streaming)

**Implementation Needed**:
1. Add IPC channels for log streaming:
   - `logs:backend:stream`
   - `logs:ipc:stream`
   - `logs:frontend:stream`
2. Subscribe to log events in useEffect
3. Append incoming logs to state array
4. Add log filtering by level

#### 5. RunnerTester (❌ Simulated)
**File**: `apps/frontend/src/renderer/components/debug/RunnerTester.tsx`
**Lines**: 141
**Purpose**: Test backend runner commands directly from UI

**Simulated Features**:
- Command input field (default: `gh pr list`)
- JSON arguments input
- Tabbed output display:
  - stdout tab
  - stderr tab
  - exit code tab
- **Currently simulates execution** (line 32-39)

**Implementation Needed**:
```typescript
// Real implementation:
const result = await window.electronAPI.executeBackendCommand({
  command: command,
  args: parsedArgs,
});
setOutput({
  stdout: result.stdout,
  stderr: result.stderr,
  exitCode: result.exitCode,
});
```

#### i18n Structure
**Translation Files**:
- `apps/frontend/src/shared/i18n/locales/en/debug.json`
- `apps/frontend/src/shared/i18n/locales/fr/debug.json`

**Translation Keys**:
```json
{
  "tabs": {
    "config": "Configuration",
    "ipc": "IPC Tester",
    "runner": "Backend Runner",
    "logs": "Logs"
  },
  "config": {
    "title": "Configuration Inspector",
    "description": "View environment variables and application configuration",
    "refreshButton": "Refresh",
    // ... more keys
  },
  "ipc": {
    "title": "IPC Channel Tester",
    "channelLabel": "IPC Channel",
    // ... more keys
  }
}
```

**i18n Status**:
- ✅ DebugPage.tsx properly uses translation keys (fixed)
- ✅ All debug components properly use i18n

#### Navigation Integration
Debug page is accessible via:
1. Sidebar navigation (if configured)
2. Direct route: `#/debug`
3. Settings page link (if added)

---

## 🌿 BRANCHING STRATEGY

### Upstream Branches (AndyMik90/Auto-Claude)
```
main (protected)
├─ Stable releases only
├─ Triggered by: Merge from develop
└─ GitHub Actions: Build + Release

develop (default, protected)
├─ Active development
├─ PR target for all contributions
└─ Must pass CI checks
```

### Fork Branches (joelfuller2016/Auto-Claude)
```
main
└─ Mirrors upstream/main

develop
├─ Tracks upstream/develop
├─ Custom features added here
└─ Ready to PR upstream

feature/* (local only)
└─ Experimental work
```

### Working with Branches
```bash
# Create feature branch from upstream/develop
git fetch upstream
git checkout -b feature/my-feature upstream/develop

# Work on feature
git add .
git commit -s -m "feat: add cool feature"

# Push to fork
git push origin feature/my-feature

# Create PR to upstream
gh pr create --repo AndyMik90/Auto-Claude --base develop
```

---

## 🔄 SYNC STATUS

### Current Sync State (2026-01-01)
```
Local Branch: develop
├─ Tracking: origin/develop (joelfuller2016/Auto-Claude)
├─ Upstream: upstream/develop (AndyMik90/Auto-Claude)
│
├─ Last Commit: 7210610 (Fix/windows issues #471)
├─ Date: 2026-01-01 12:53:27
│
├─ Ahead of upstream: 0 commits
├─ Behind upstream: 0 commits
└─ Status: ✅ FULLY SYNCED
```

### Modified Files (Uncommitted)
```
apps/backend/runners/github/gh_client.py          # PR creation backend
apps/backend/runners/github/runner.py             # PR creation CLI
apps/frontend/src/main/ipc-handlers/github/pr-handlers.ts  # PR IPC
apps/frontend/src/renderer/components/debug/*.tsx          # Debug page (5 files)
apps/frontend/src/shared/i18n/locales/en/debug.json       # i18n English
apps/frontend/src/shared/i18n/locales/fr/debug.json       # i18n French
DEEP_REVIEW_FINDINGS.md                           # Code review results
FORK_DOCUMENTATION.md                              # This file
```

**Total**: ~50+ modified files (many unstaged)

### GitHub Actions Review (2026-01-01)

**Comprehensive review completed** of all 16 GitHub Actions workflows and templates.

**Findings Summary:**
- ✅ 5 GitHub issue templates - No issues found
- ✅ 1 Pull request template - No issues found
- ✅ 16 GitHub Actions workflows - 5 issues documented

**Created GitHub Issues:**
- **[Issue #6](https://github.com/joelfuller2016/Auto-Claude/issues/6)** - CI: Python version mismatch (HIGH)
  - CI tests Python 3.12/3.13, release builds Python 3.11
  - Recommendation: Align to Python 3.12 across all workflows

- **[Issue #7](https://github.com/joelfuller2016/Auto-Claude/issues/7)** - CI: Python bundle cache key mismatch (MEDIUM)
  - Cache key expects 3.12.8, but installs 3.11
  - Fix: Update cache key to match installed version

- **[Issue #8](https://github.com/joelfuller2016/Auto-Claude/issues/8)** - Security: Bandit scan incomplete coverage (MEDIUM)
  - Bandit only scans `apps/backend/`, missing `tests/`
  - Fix: Add `tests/` to scan path

- **[Issue #9](https://github.com/joelfuller2016/Auto-Claude/issues/9)** - CI: Add Python/uv dependency caching (LOW)
  - No Python dependency caching, slower builds
  - Fix: Add uv cache similar to npm cache

- **[Issue #10](https://github.com/joelfuller2016/Auto-Claude/issues/10)** - CI: Pin Rust toolchain version (LOW)
  - Uses `@stable` without version pin
  - Fix: Pin to specific version for reproducible builds

**Files Reviewed:**
- `.github/ISSUE_TEMPLATE/` (4 templates + config)
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/workflows/` (16 workflow files)

**Next Steps:**
1. Consider fixing issues #6-#8 (HIGH/MEDIUM priority)
2. Optional: Implement issues #9-#10 for improved build performance
3. Submit fixes as PR to upstream if beneficial to community

### Sync Commands
```bash
# Fetch upstream changes
git fetch upstream

# Check sync status
git status
git log --oneline upstream/develop..HEAD

# Sync develop branch
git checkout develop
git merge upstream/develop

# Push to fork
git push origin develop
```

---

## 🔧 DEVELOPMENT WORKFLOW

### Standard Workflow
```
1. Sync with Upstream
   ├─ git fetch upstream
   ├─ git checkout develop
   └─ git merge upstream/develop

2. Create Feature Branch
   ├─ git checkout -b feature/pr-creation
   └─ git push -u origin feature/pr-creation

3. Develop & Test
   ├─ npm run install:all
   ├─ npm run typecheck
   └─ npm run dev

4. Commit Changes
   ├─ git add <files>
   ├─ git commit -s -m "feat: add PR creation"
   └─ git push origin feature/pr-creation

5. Create Pull Request
   ├─ Target: AndyMik90/Auto-Claude (develop branch)
   ├─ gh pr create --repo AndyMik90/Auto-Claude --base develop
   └─ Ensure all CI checks pass

6. After Merge
   ├─ git checkout develop
   ├─ git pull upstream develop
   ├─ git push origin develop
   └─ git branch -d feature/pr-creation
```

### Local Testing
```bash
# Frontend development
cd apps/frontend
npm install
npm run dev  # Starts Electron app with hot reload

# Backend testing
cd apps/backend
uv venv
uv pip install -r requirements.txt
python run.py --spec 001

# Type checking
npm run typecheck

# Run all tests
npm run test:backend
```

---

## 🚀 CONTRIBUTING UPSTREAM

### CRITICAL: Always Target `develop` Branch
```bash
# ❌ WRONG - Don't target main
gh pr create --repo AndyMik90/Auto-Claude --base main

# ✅ CORRECT - Always target develop
gh pr create --repo AndyMik90/Auto-Claude --base develop
```

### PR Checklist
Before submitting PR to upstream:

- [ ] Synced with latest `upstream/develop`
- [ ] All tests pass (`npm run typecheck`)
- [ ] Commit messages follow convention:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation
  - `refactor:` for code restructuring
- [ ] Signed commits with `-s` flag
- [ ] i18n compliance (no hardcoded strings)
- [ ] No merge conflicts with `upstream/develop`
- [ ] PR targets `develop` branch (not `main`)
- [ ] Descriptive PR title and body
- [ ] Links to related issues (if any)

### Commit Message Format
```bash
# Good examples
git commit -s -m "feat: add GitHub PR creation feature"
git commit -s -m "fix: resolve i18n violation in DebugPage"
git commit -s -m "docs: update fork documentation"

# Bad examples
git commit -m "update code"  # ❌ No sign-off
git commit -s -m "changes"   # ❌ Vague message
```

### Verify Before PR
```bash
# Ensure only your commits are included
git log --oneline upstream/develop..HEAD

# Check for merge conflicts
git merge-tree $(git merge-base HEAD upstream/develop) HEAD upstream/develop
```

---

## 📦 CUSTOM FILES INVENTORY

### New Files Added (Custom Features)
```
apps/backend/runners/github/gh_client.py          # PR creation backend
apps/backend/runners/github/runner.py             # PR creation CLI
apps/frontend/src/main/ipc-handlers/github/pr-handlers.ts
apps/frontend/src/renderer/components/debug/DebugPage.tsx
apps/frontend/src/renderer/components/debug/ConfigInspector.tsx
apps/frontend/src/renderer/components/debug/IPCTester.tsx
apps/frontend/src/renderer/components/debug/LogViewer.tsx
apps/frontend/src/renderer/components/debug/RunnerTester.tsx
apps/frontend/src/shared/i18n/locales/en/debug.json
apps/frontend/src/shared/i18n/locales/fr/debug.json
DEEP_REVIEW_FINDINGS.md
FORK_DOCUMENTATION.md
```

### Modified Upstream Files
```
# These files may need reconciliation when contributing upstream:
apps/frontend/src/shared/types/project.ts        # Used ProjectEnvConfig type
apps/frontend/src/main/ipc-handlers/index.ts     # May need PR handler registration
apps/frontend/src/renderer/App.tsx               # May need debug route
```

### Files to Exclude from Upstream PR
```
DEEP_REVIEW_FINDINGS.md   # Internal review document
FORK_DOCUMENTATION.md      # Fork-specific documentation
.git/                      # Git metadata
node_modules/              # Dependencies
.auto-claude/              # Project data
*.log                      # Log files
```

---

## 📊 STATISTICS

### Codebase Size
```
Total Lines Reviewed: 4,251 lines across 8 files
├─ Backend: 2,001 lines (2 files)
├─ Frontend IPC: 1,673 lines (1 file)
└─ Debug Components: 577 lines (5 files)
```

### Custom Features Impact
```
New Files: 12 files
├─ Backend: 2 files
├─ Frontend: 8 files
└─ Documentation: 2 files

Modified Files: ~50 files (unstaged)
├─ TypeScript fixes: 2 files
└─ Other changes: ~48 files
```

### Language Breakdown
```
Python:     2,001 lines  (Backend)
TypeScript: 2,250 lines  (Frontend + IPC)
Markdown:   ~3,000 lines (Documentation)
JSON:       ~200 lines   (i18n translations)
```

---

## 🔗 USEFUL LINKS

### Repositories
- **Upstream**: https://github.com/AndyMik90/Auto-Claude
- **Fork**: https://github.com/joelfuller2016/Auto-Claude
- **Issues** (upstream): https://github.com/AndyMik90/Auto-Claude/issues
- **PRs** (upstream): https://github.com/AndyMik90/Auto-Claude/pulls

### Documentation
- **Upstream CLAUDE.md**: https://github.com/AndyMik90/Auto-Claude/blob/develop/CLAUDE.md
- **Release Process**: https://github.com/AndyMik90/Auto-Claude/blob/develop/RELEASE.md
- **Contributing Guide**: (if exists)

### Tools
- **GitHub CLI**: https://cli.github.com/
- **Claude Code**: https://claude.com/code

---

## ⚠️ IMPORTANT NOTES

### For AI Assistants Reading This
1. **Always target `develop` branch** when creating PRs to upstream
2. **Sync before starting work** to avoid merge conflicts
3. **Follow commit message conventions** (feat:, fix:, docs:, etc.)
4. **Sign all commits** with `-s` flag
5. **Test thoroughly** before submitting PR
6. **Use i18n** for all user-facing strings (no hardcoded text)
7. **Document custom changes** in this file

### For Human Developers
1. This fork is for development purposes
2. Custom features should eventually be PR'd to upstream
3. Keep fork synced with upstream/develop regularly
4. Document all custom features in this file
5. Run `npm run typecheck` before committing
6. Test E2E before creating upstream PR

---

## 📝 MAINTENANCE CHECKLIST

### Weekly
- [ ] Sync fork with upstream/develop
- [ ] Review upstream PRs for potential conflicts
- [ ] Update this documentation if features change

### Before PR to Upstream
- [ ] Sync with latest upstream/develop
- [ ] Resolve all merge conflicts
- [ ] Pass all CI checks locally
- [ ] Update CLAUDE.md if needed
- [ ] Sign all commits
- [ ] Test E2E in development mode

### After Upstream Merge
- [ ] Update fork from upstream
- [ ] Update this documentation
- [ ] Archive feature branch
- [ ] Clean up stale branches

---

## 📋 CHANGELOG

### 2026-01-01 - Comprehensive Review, Fixes & Documentation
- ✅ Completed deep review of all GitHub templates and workflows
- ✅ Created 5 GitHub issues documenting CI/security improvements (#6-#10)
- ✅ **FIXED all 5 workflow issues:**
  - Issue #6: Python version alignment (commit 590a6d8)
  - Issue #7: Cache key stability (commit 87008b0)
  - Issue #8: Bandit security coverage (commit 47e28ec)
  - Issue #9: Python/uv caching (commit b68e2ea)
  - Issue #10: Rust toolchain pinning (commit a50948c)
- ✅ **FIXED debug page i18n violation:**
  - DebugPage.tsx translation keys (commit 76198b8)
  - French translations added (commit 7c49742)
- ✅ Verified perfect sync with upstream at commit 7210610
- ✅ Enhanced fork documentation with GitHub Actions findings
- ✅ Documented 16 workflows review (11 excellent, 5 issues found)

### [Previous Work] - Custom Feature Development
- ✅ Implemented PR creation functionality (52 files modified)
- ✅ Created debug page components (IPCTester, ConfigInspector)
- ✅ Added debug page translations (EN/FR)
- ✅ Added test coverage for custom components
- ✅ Code review documented in DEEP_REVIEW_FINDINGS.md

---

*Last Updated*: 2026-01-01 (Comprehensive GitHub Actions Review Completed)
*Maintained By*: joelfuller2016
*Documentation Version*: 2.0 (includes GitHub Actions review findings)
*For Questions*: Check DEEP_REVIEW_FINDINGS.md or upstream documentation
