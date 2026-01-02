import type { Guide } from './types';

export const GUIDES: Guide[] = [
  {
    id: 'cli-usage',
    title: 'CLI Usage Guide',
    description: 'Terminal-only usage for power users, headless servers, and CI/CD integration',
    category: 'usage',
    icon: 'terminal',
    content: `# Auto Claude CLI Usage

This document covers terminal-only usage of Auto Claude. **For most users, we recommend using the Desktop UI instead** - it provides a better experience with visual task management, progress tracking, and automatic Python environment setup.

## When to Use CLI

- You prefer terminal workflows
- You're running on a headless server
- You're integrating Auto Claude into scripts or CI/CD

## Prerequisites

- Python 3.9+
- Claude Code CLI (\`npm install -g @anthropic-ai/claude-code\`)

## Setup

**Step 1:** Navigate to the auto-claude directory

\`\`\`bash
cd auto-claude
\`\`\`

**Step 2:** Set up Python environment

\`\`\`bash
# Using uv (recommended)
uv venv && uv pip install -r requirements.txt

# Or using standard Python
python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
\`\`\`

**Step 3:** Configure environment

\`\`\`bash
cp .env.example .env

# Get your OAuth token
claude setup-token

# Add the token to .env
# CLAUDE_CODE_OAUTH_TOKEN=your-token-here
\`\`\`

## Creating Specs

\`\`\`bash
# Activate the virtual environment
source .venv/bin/activate

# Create a spec interactively
python spec_runner.py --interactive

# Or with a task description
python spec_runner.py --task "Add user authentication with OAuth"

# Force a specific complexity level
python spec_runner.py --task "Fix button color" --complexity simple

# Continue an interrupted spec
python spec_runner.py --continue 001-my-feature
\`\`\`

### Complexity Tiers

The spec runner automatically assesses task complexity:

| Tier | Phases | When Used |
|------|--------|-----------|
| **SIMPLE** | 3 | 1-2 files, single service, no integrations (UI fixes, text changes) |
| **STANDARD** | 6 | 3-10 files, 1-2 services, minimal integrations (features, bug fixes) |
| **COMPLEX** | 8 | 10+ files, multiple services, external integrations |

## Running Builds

\`\`\`bash
# List all specs and their status
python run.py --list

# Run a specific spec
python run.py --spec 001
python run.py --spec 001-my-feature

# Limit iterations for testing
python run.py --spec 001 --max-iterations 5
\`\`\`

## QA Validation

After all chunks are complete, QA validation runs automatically:

\`\`\`bash
# Skip automatic QA
python run.py --spec 001 --skip-qa

# Run QA validation manually
python run.py --spec 001 --qa

# Check QA status
python run.py --spec 001 --qa-status
\`\`\`

The QA validation loop:
1. **QA Reviewer** checks all acceptance criteria
2. If issues found → creates \`QA_FIX_REQUEST.md\`
3. **QA Fixer** applies fixes
4. Loop repeats until approved (up to 50 iterations)

## Workspace Management

Auto Claude uses Git worktrees for isolated builds:

\`\`\`bash
# Test the feature in the isolated workspace
cd .worktrees/001-my-feature/

npm run dev  # or your project's run command

# See what was changed
python run.py --spec 001 --review

# Merge changes into your project
python run.py --spec 001 --merge

# Discard if you don't like it
python run.py --spec 001 --discard
\`\`\`

## Interactive Controls

While the agent is running:

\`\`\`bash
# Pause and add instructions
Ctrl+C (once)

# Exit immediately
Ctrl+C (twice)
\`\`\`

**File-based alternative:**
\`\`\`bash
# Create PAUSE file to pause after current session
touch specs/001-my-feature/PAUSE

# Add instructions
echo "Focus on fixing the login bug first" > specs/001-my-feature/HUMAN_INPUT.md
\`\`\`

## Spec Validation

\`\`\`bash
python validate_spec.py --spec-dir specs/001-my-feature --checkpoint all
\`\`\`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| \`CLAUDE_CODE_OAUTH_TOKEN\` | Yes | OAuth token from \`claude setup-token\` |
| \`AUTO_BUILD_MODEL\` | No | Model override (default: claude-opus-4-5-20251101) |
`
  },
  {
    id: 'docker-setup',
    title: 'Docker & FalkorDB Setup',
    description: 'Installing and troubleshooting Docker for the Memory Layer with FalkorDB',
    category: 'setup',
    icon: 'container',
    content: `# Docker & FalkorDB Setup Guide

This guide covers installing and troubleshooting Docker for Auto Claude's Memory Layer. The Memory Layer uses FalkorDB (a graph database) to provide persistent cross-session memory for AI agents.

> **Good news!** If you're using the Desktop UI, it automatically detects Docker and FalkorDB status and offers one-click setup. This guide is for manual setup or troubleshooting.

## Quick Start

If Docker Desktop is already installed and running:

\`\`\`bash
# Start FalkorDB
docker run -d --name auto-claude-falkordb -p 6379:6379 falkordb/falkordb:latest

# Verify it's running
docker ps | grep falkordb
\`\`\`

---

## What is Docker?

Docker is a tool that runs applications in isolated "containers". Think of it as a lightweight virtual machine that:

- **Keeps things contained** - FalkorDB runs inside Docker without affecting your system
- **Makes setup easy** - One command to start, no complex installation
- **Works everywhere** - Same setup on Mac, Windows, and Linux

**You don't need to understand Docker** - just install Docker Desktop and Auto Claude handles the rest.

---

## Installing Docker Desktop

### macOS

#### Step 1: Download

| Mac Type | Download Link |
|----------|---------------|
| **Apple Silicon (M1/M2/M3/M4)** | [Download for Apple Chip](https://desktop.docker.com/mac/main/arm64/Docker.dmg) |
| **Intel** | [Download for Intel Chip](https://desktop.docker.com/mac/main/amd64/Docker.dmg) |

> **Which do I have?** Click the Apple logo () → "About This Mac". Look for "Chip" - if it says Apple M1/M2/M3/M4, use Apple Silicon. If it says Intel, use Intel.

#### Step 2: Install

1. Open the downloaded \`.dmg\` file
2. Drag the Docker icon to your Applications folder
3. Open Docker from Applications (or Spotlight: Cmd+Space, type "Docker")
4. Click "Open" if you see a security warning
5. **Wait** - Docker takes 1-2 minutes to start the first time

#### Step 3: Verify

Look for the whale icon in your menu bar. When it stops animating, Docker is ready.

Open Terminal and run:

\`\`\`bash
docker --version
# Expected: Docker version 24.x.x or higher
\`\`\`

### Windows

#### Prerequisites

- Windows 10 (version 2004 or higher) or Windows 11
- WSL 2 enabled (Docker will prompt you to install it)

#### Step 1: Download

[Download Docker Desktop for Windows](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)

#### Step 2: Install

1. Run the downloaded installer
2. **Keep "Use WSL 2" checked** (recommended)
3. Follow the installation wizard with default settings
4. **Restart your computer** when prompted
5. After restart, Docker Desktop will start automatically

#### Step 3: WSL 2 Setup (if prompted)

If Docker shows a WSL 2 warning:

1. Open PowerShell as Administrator
2. Run:
   \`\`\`powershell
   wsl --install
   \`\`\`
3. Restart your computer
4. Open Docker Desktop again

#### Step 4: Verify

Look for the whale icon in your system tray. When it stops animating, Docker is ready.

Open PowerShell or Command Prompt and run:

\`\`\`bash
docker --version
# Expected: Docker version 24.x.x or higher
\`\`\`

### Linux

#### Ubuntu/Debian

\`\`\`bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository
echo \\
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \\
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \\
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to the docker group (to run without sudo)
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker --version
\`\`\`

---

## Starting FalkorDB

### Option 1: Using Docker Compose (Recommended)

From the Auto Claude root directory:

\`\`\`bash
# Start FalkorDB only (for Python library integration)
docker-compose up -d falkordb

# Or start both FalkorDB + Graphiti MCP server (for agent memory access)
docker-compose up -d
\`\`\`

This uses the project's \`docker-compose.yml\` which is pre-configured.

### Option 2: Using Docker Run

\`\`\`bash
docker run -d \\
  --name auto-claude-falkordb \\
  -p 6379:6379 \\
  --restart unless-stopped \\
  falkordb/falkordb:latest
\`\`\`

### Option 3: Let the Desktop UI Handle It

If you're using the Auto Claude Desktop UI:

1. Go to Project Settings → Memory Backend
2. Enable "Use Graphiti"
3. The UI will show Docker/FalkorDB status
4. Click "Start" to launch FalkorDB automatically

---

## Verifying Your Setup

### Check Docker is Running

\`\`\`bash
docker info
# Should show Docker system information without errors
\`\`\`

### Check FalkorDB is Running

\`\`\`bash
docker ps | grep falkordb
# Should show the running container
\`\`\`

### Test FalkorDB Connection

\`\`\`bash
docker exec auto-claude-falkordb redis-cli PING
# Expected response: PONG
\`\`\`

---

## Troubleshooting

### Docker Issues

| Problem | Solution |
|---------|----------|
| **"docker: command not found"** | Docker Desktop isn't installed or isn't in PATH. Reinstall Docker Desktop. |
| **"Cannot connect to Docker daemon"** | Docker Desktop isn't running. Open Docker Desktop and wait for it to start. |
| **"permission denied"** | On Linux, add your user to the docker group: \`sudo usermod -aG docker $USER\` then log out and back in. |
| **Docker Desktop won't start** | Try restarting your computer. On Mac, check System Preferences → Security for blocked apps. |

### FalkorDB Issues

| Problem | Solution |
|---------|----------|
| **Container won't start** | Check if port 6379 is in use: \`lsof -i :6379\` (Mac/Linux) or \`netstat -ano | findstr 6379\` (Windows) |
| **"port is already allocated"** | Stop conflicting container: \`docker stop auto-claude-falkordb && docker rm auto-claude-falkordb\` |
| **Connection refused** | Verify container is running: \`docker ps\`. If not listed, start it again. |

---

## Getting Help

If you're still having issues:

1. Check the [Auto Claude GitHub Issues](https://github.com/auto-claude/auto-claude/issues)
2. Search for your error message
3. Create a new issue with:
   - Your operating system and version
   - Docker version (\`docker --version\`)
   - Error message or logs
   - Steps you've already tried
`
  },
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Quick start guide for new users to set up and run their first task',
    category: 'usage',
    icon: 'rocket',
    content: `# Getting Started with Auto Claude

Welcome to Auto Claude! This guide will help you set up and run your first automated task.

## What is Auto Claude?

Auto Claude is a multi-agent autonomous coding framework that builds software through coordinated AI agent sessions. It uses the Claude Code SDK to run agents in isolated workspaces with security controls.

## Quick Setup

### 1. Add Your First Project

1. Open Auto Claude
2. Click **"Add Project"** or press \`Cmd/Ctrl + T\`
3. Select your project folder
4. Click **"Initialize"** when prompted

This creates a \`.auto-claude\` folder in your project with the necessary configuration.

### 2. Configure Claude Authentication

You need a Claude Code OAuth token:

\`\`\`bash
# In terminal, run:
claude setup-token
\`\`\`

Then add the token to your project settings:
1. Go to **Settings** → **Project** → **Claude Token**
2. Paste your OAuth token

### 3. Create Your First Task

1. Click **"New Task"** or press the + button
2. Describe what you want to build
3. Auto Claude will:
   - Analyze your codebase
   - Create a specification
   - Plan the implementation
   - Build it autonomously

## Understanding the UI

### Kanban Board (K)
Track your tasks through stages:
- **Planning** - Task is being analyzed
- **In Progress** - Agent is building
- **QA** - Testing and validation
- **Done** - Ready for review

### Agent Terminals (A)
Watch the AI agents work in real-time. Each task gets its own terminal session.

### Insights (N)
Chat with Claude about your project. Ask questions, get explanations.

### Roadmap (D)
Plan future features and organize your development timeline.

### Context (C)
View and manage the context Auto Claude has about your codebase.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| \`K\` | Kanban Board |
| \`A\` | Agent Terminals |
| \`N\` | Insights |
| \`D\` | Roadmap |
| \`I\` | Ideation |
| \`L\` | Changelog |
| \`C\` | Context |
| \`G\` | GitHub Issues |
| \`W\` | Worktrees |
| \`Cmd/Ctrl + T\` | Add Project |
| \`Cmd/Ctrl + 1-9\` | Switch Tabs |
| \`Cmd/Ctrl + Tab\` | Cycle Tabs |
| \`Cmd/Ctrl + W\` | Close Tab |

## Best Practices

### Writing Good Task Descriptions

**Good:**
> Add user authentication with email/password login. Include password reset functionality and remember me option.

**Not as good:**
> Add login

The more context you provide, the better the result.

### Reviewing Changes

Auto Claude works in an isolated Git worktree, so your main code is never modified until you approve:

1. Review changes in the worktree: \`.worktrees/{task-name}/\`
2. Test the feature works as expected
3. Click **"Merge"** to add changes to your project
4. Or click **"Discard"** to throw them away

### Iteration

If something isn't right:
1. Open the task details
2. Add feedback in the QA section
3. The agent will iterate based on your feedback

## Next Steps

- [CLI Usage Guide](cli-usage) - For terminal power users
- [Docker Setup](docker-setup) - Enable the memory layer
- Check the **Ideation** tab to brainstorm new features
`
  },
  {
    id: 'architecture',
    title: 'Architecture Overview',
    description: 'Understanding how Auto Claude works internally',
    category: 'reference',
    icon: 'layers',
    content: `# Auto Claude Architecture

This document explains how Auto Claude works under the hood.

## Core Components

### 1. Spec Creation Pipeline

The spec runner (\`spec_runner.py\`) creates task specifications through a multi-phase pipeline:

\`\`\`
Task Description
      ↓
[Discovery] → Analyze codebase structure
      ↓
[Requirements] → Extract user requirements
      ↓
[Research] → Validate external integrations (optional)
      ↓
[Context] → Build relevant codebase context
      ↓
[Spec Writing] → Create specification document
      ↓
[Planning] → Create implementation plan
      ↓
[Validation] → Verify spec completeness
\`\`\`

### Complexity Tiers

| Tier | Phases | Use Case |
|------|--------|----------|
| **SIMPLE** | 3 | 1-2 files, UI fixes, text changes |
| **STANDARD** | 6 | 3-10 files, features, bug fixes |
| **COMPLEX** | 8 | 10+ files, multiple services, integrations |

### 2. Implementation Pipeline

The runner (\`run.py → agent.py\`) executes the build:

\`\`\`
Specification
      ↓
[Planner Agent] → Create subtask-based plan
      ↓
[Coder Agent] → Implement each subtask
      ↓
[QA Reviewer] → Validate acceptance criteria
      ↓
[QA Fixer] → Fix issues (if any)
      ↓
Complete
\`\`\`

### 3. Agent Types

| Agent | Prompt File | Purpose |
|-------|-------------|---------|
| Planner | planner.md | Creates implementation plan with subtasks |
| Coder | coder.md | Implements individual subtasks |
| Coder Recovery | coder_recovery.md | Recovers from stuck/failed subtasks |
| QA Reviewer | qa_reviewer.md | Validates acceptance criteria |
| QA Fixer | qa_fixer.md | Fixes QA-reported issues |
| BUGFINDER-X | bugfinder.md | Autonomous debugging agent |

## Security Model

Three-layer defense protects your system:

### Layer 1: OS Sandbox
- Bash commands run in isolated environment
- Controlled by Claude Code SDK

### Layer 2: Filesystem Permissions
- Operations restricted to project directory
- Cannot access system files

### Layer 3: Command Allowlist
- Dynamic allowlist based on project analysis
- \`security.py\` + \`project_analyzer.py\` detect your stack
- Only relevant commands are permitted

Security profile is cached in \`.auto-claude-security.json\`.

## Workspace Isolation

### Git Worktree Strategy

\`\`\`
main (your branch)
    └── auto-claude/{spec-name}  ← spec branch (isolated worktree)
\`\`\`

Key principles:
- **ONE branch per spec** (\`auto-claude/{spec-name}\`)
- **NO automatic pushes** - you control when to push
- **Isolated testing** in \`.worktrees/{spec-name}/\`
- **Safe merging** - spec branch → main after approval

### Workflow

1. Build runs in isolated worktree on spec branch
2. Agent implements subtasks (can spawn subagents for parallel work)
3. User tests feature in \`.worktrees/{spec-name}/\`
4. User runs \`--merge\` to add to their project
5. User pushes to remote when ready

## Memory System

Dual-layer memory architecture:

### File-Based Memory (Primary)
- \`memory.py\`
- Zero dependencies, always available
- Human-readable files in \`specs/XXX/memory/\`
- Stores: session insights, patterns, gotchas, codebase map

### Graphiti Memory (Optional)
- \`graphiti_memory.py\`
- Graph database with semantic search
- Uses LadybugDB (embedded, no Docker required for basic use)
- Cross-session context retrieval
- Requires Python 3.12+

## Spec Directory Structure

Each spec in \`auto-claude/specs/XXX-name/\` contains:

| File | Purpose |
|------|---------|
| \`spec.md\` | Feature specification |
| \`requirements.json\` | Structured user requirements |
| \`context.json\` | Discovered codebase context |
| \`implementation_plan.json\` | Subtask-based plan with status |
| \`qa_report.md\` | QA validation results |
| \`QA_FIX_REQUEST.md\` | Issues to fix (when rejected) |
| \`BUG_REPORT.md\` | Bug description for BUGFINDER-X |
| \`DEBUG_REPORT.md\` | BUGFINDER-X findings |

## Client Architecture

### SDK Client (\`client.py\`)
- Wraps Claude Code SDK
- Applies security hooks
- Manages tool permissions
- Handles session state

### IPC Communication
- Electron ↔ Python communication
- Real-time progress updates
- Terminal session management

## Key Files

| File | Description |
|------|-------------|
| \`run.py\` | Main entry point, CLI interface |
| \`agent.py\` | Agent execution logic |
| \`client.py\` | Claude SDK client wrapper |
| \`security.py\` | Command allowlist enforcement |
| \`project_analyzer.py\` | Stack detection |
| \`worktree.py\` | Git worktree management |
| \`memory.py\` | File-based memory |
| \`spec_runner.py\` | Spec creation pipeline |
`
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Common issues and how to resolve them',
    category: 'reference',
    icon: 'wrench',
    content: `# Troubleshooting Guide

Common issues and solutions for Auto Claude.

## Authentication Issues

### "OAuth token not found" or "Authentication failed"

**Problem:** Claude cannot authenticate with your token.

**Solution:**
1. Generate a new token:
   \`\`\`bash
   claude setup-token
   \`\`\`
2. Copy the token
3. Add to project settings or \`.env\`:
   \`\`\`
   CLAUDE_CODE_OAUTH_TOKEN=your-token-here
   \`\`\`
4. Restart Auto Claude

### Token expires frequently

OAuth tokens have limited lifetimes. If you're experiencing frequent expirations:

1. Check if you're using a personal or organization token
2. Consider setting up token refresh in CI/CD environments

## Build Issues

### "Command not allowed" errors

**Problem:** The security layer is blocking a command your project needs.

**Solution:**
1. Delete the security cache:
   \`\`\`bash
   rm .auto-claude-security.json
   \`\`\`
2. Restart the build - security profile will be regenerated
3. If still blocked, check \`project_analyzer.py\` for supported frameworks

### Build gets stuck

**Problem:** The agent isn't making progress.

**Solution:**
1. Check the terminal for any prompts requiring input
2. Add a \`PAUSE\` file to stop gracefully:
   \`\`\`bash
   touch specs/001-name/PAUSE
   \`\`\`
3. Add instructions in \`HUMAN_INPUT.md\`
4. Remove \`PAUSE\` to continue

### "Worktree already exists" error

**Problem:** A previous build left a worktree behind.

**Solution:**
\`\`\`bash
# List worktrees
git worktree list

# Remove the stuck worktree
git worktree remove .worktrees/spec-name --force

# Clean up the branch if needed
git branch -D auto-claude/spec-name
\`\`\`

## QA Loop Issues

### QA keeps failing on the same issue

**Problem:** The QA fixer can't resolve an issue.

**Solution:**
1. Check \`QA_FIX_REQUEST.md\` for the specific issue
2. Add detailed instructions in \`HUMAN_INPUT.md\`:
   \`\`\`markdown
   # Human Input

   The test is failing because X. Try approach Y instead.
   \`\`\`
3. Consider manually fixing and letting QA re-verify

### QA validation times out

**Problem:** Tests take too long.

**Solution:**
1. Add test timeout configuration to your project
2. Exclude slow integration tests during QA:
   \`\`\`bash
   # In your test command
   pytest -m "not slow"
   \`\`\`

## UI Issues

### Project won't initialize

**Problem:** "Initialize Auto Claude" fails.

**Solution:**
1. Check that the Auto Claude source path is configured in App Settings
2. Ensure you have write permissions to the project directory
3. Check for existing \`.auto-claude\` folder (delete if corrupted)

### Terminal shows no output

**Problem:** Agent terminal is blank.

**Solution:**
1. Check if the task is actually running (look at Kanban status)
2. Try switching to another tab and back
3. Restart the task if needed

### Dark mode looks wrong

**Problem:** UI elements have wrong colors.

**Solution:**
1. Go to Settings → Appearance
2. Toggle theme to System, then back to Dark
3. If using custom theme, try Default first

## Performance Issues

### Auto Claude is slow

**Problem:** Tasks take too long to start or run.

**Solution:**
1. Check your internet connection (required for Claude API)
2. Reduce concurrent builds if running multiple
3. Close unnecessary browser tabs and apps
4. Consider using the CLI for faster execution

### High memory usage

**Problem:** Auto Claude uses too much RAM.

**Solution:**
1. Close terminals for completed tasks
2. Limit the number of open project tabs
3. If using Docker/FalkorDB, limit container memory:
   \`\`\`bash
   docker update --memory=2g auto-claude-falkordb
   \`\`\`

## Git Issues

### "Not a git repository" error

**Problem:** Project needs git initialization.

**Solution:**
\`\`\`bash
cd your-project
git init
git add .
git commit -m "Initial commit"
\`\`\`

### Merge conflicts after build

**Problem:** Conflicts when merging spec branch.

**Solution:**
1. Don't use \`--merge\` yet
2. Manually resolve in the worktree:
   \`\`\`bash
   cd .worktrees/spec-name
   git status
   # Fix conflicts
   git add .
   git commit -m "Resolve conflicts"
   \`\`\`
3. Then merge:
   \`\`\`bash
   python run.py --spec 001 --merge
   \`\`\`

## Getting More Help

If none of these solutions work:

1. Check the terminal output for detailed error messages
2. Look at \`specs/XXX/\` files for diagnostic info
3. Search [GitHub Issues](https://github.com/auto-claude/auto-claude/issues)
4. Create a new issue with:
   - Your OS and version
   - Error message
   - Steps to reproduce
   - Relevant log output
`
  },
  {
    id: 'faq',
    title: 'Frequently Asked Questions',
    description: 'Common questions about Auto Claude, pricing, workflow, and integrations',
    category: 'faq',
    icon: 'help',
    content: `# Frequently Asked Questions

---

## General

### What is Auto Claude?

Auto Claude is an autonomous coding framework that uses multiple AI agents to build software. You describe what you want, and it handles planning, implementation, and quality assurance automatically.

### How is this different from using Claude directly?

| Claude (chat) | Auto Claude |
|---------------|-------------|
| Single conversation | Multi-agent coordination |
| You guide each step | Autonomous execution |
| No memory between sessions | Persistent memory |
| Manual code application | Automatic code changes |
| No QA validation | Built-in QA loop |

### Is my code sent to Anthropic?

Yes, like any Claude interaction:
- Your code is processed by Claude's API
- Anthropic's standard privacy policy applies
- Code is not used to train models (per Anthropic's policy)
- See [Anthropic's privacy policy](https://www.anthropic.com/privacy)

### What languages/frameworks are supported?

Auto Claude works with any language or framework. It analyzes your project to understand the tech stack. Commonly tested with:
- JavaScript/TypeScript (React, Next.js, Node.js)
- Python (Django, Flask, FastAPI)
- Go, Rust, Java, C#
- And many more

---

## Pricing & Subscriptions

### What subscription do I need?

**Claude Pro or Claude Max subscription** is required.

- Claude Pro: Standard rate limits
- Claude Max: Higher rate limits, recommended for heavy use

### Does Auto Claude cost extra?

No additional cost beyond your Claude subscription. Auto Claude uses the Claude Code OAuth system which is included with Pro/Max subscriptions.

### Are there API costs?

Not for the main agents. However, optional features may have costs:
- **Memory System (Graphiti)** - Requires embedding provider (OpenAI, etc.)
- **Linear Integration** - Free with Linear account

---

## Tasks & Workflow

### How long does a task take?

Depends on complexity:

| Complexity | Typical Time |
|------------|--------------|
| Simple (1-2 files) | 5-15 minutes |
| Standard (3-10 files) | 15-45 minutes |
| Complex (10+ files) | 45+ minutes |

### Can I run multiple tasks at once?

Yes! Each task runs in an isolated git worktree. You can run up to 12 agent terminals simultaneously.

### What if the agent makes a mistake?

Several safeguards:
1. **QA validation** catches most issues
2. **Isolated worktrees** protect your main branch
3. **You review before merging**
4. **You can discard** any task completely

### Can I modify the code while a task is running?

**In the worktree:** Not recommended while agents are active (can cause conflicts)

**In your main branch:** Yes! The worktree is isolated.

### How do I provide feedback during a build?

1. Create \`HUMAN_INPUT.md\` in the spec directory:

   \`\`\`bash
   echo "Use the existing Button component" > specs/001-my-feature/HUMAN_INPUT.md
   \`\`\`

2. Or pause the task and add instructions via the UI

### Can I edit the implementation plan?

Yes! Edit \`specs/{spec-name}/implementation_plan.json\` (e.g., \`specs/001-my-feature/implementation_plan.json\`):
- Change subtask order
- Modify subtask descriptions
- Add or remove subtasks
- Mark subtasks as completed/pending

---

## Quality & Security

### How reliable is the code it produces?

Quality depends on:
- **Task clarity** - Clear descriptions produce better results
- **Codebase complexity** - Well-organized code = better results
- **QA validation** - Catches most issues before you review

Always review code before deploying to production.

### What security controls are in place?

Three-layer security model:

1. **OS Sandbox** - Bash commands run in isolation
2. **Filesystem Restrictions** - Operations limited to project directory
3. **Dynamic Command Allowlist** - Only approved commands for your tech stack

### Can it access the internet?

Limited:
- **Web search** for documentation lookup
- **API calls** your project normally makes
- **No arbitrary network access**

### Can it delete my files?

Only within the project directory, and:
- All changes happen in isolated worktrees
- Your main branch is protected
- You can discard any changes

---

## Memory System

### What is the Memory Layer?

Graphiti-based persistent memory that helps agents:
- Remember patterns from your codebase
- Recall past gotchas and solutions
- Maintain context across sessions

### Is the Memory Layer required?

No. It's optional but recommended. Without it:
- Each session starts fresh
- Agents may repeat past mistakes
- Less efficient for complex projects

### Where is memory data stored?

Locally in your project:

\`\`\`text
.auto-claude/specs/001-my-feature/memory/      # File-based fallback
.auto-claude/specs/001-my-feature/graphiti/    # Graphiti database
\`\`\`

### Does memory sync across machines?

Not automatically. Memory is stored locally. You could:
- Commit the \`memory/\` directory (not recommended for large DBs)
- Use a shared filesystem
- Export/import manually

---

## Git & Version Control

### What happens to my git history?

Each subtask creates a commit. Your history looks like:

\`\`\`text
abc123 feat(user): Add avatar upload endpoint
def456 feat(user): Add avatar component
ghi789 feat(user): Add avatar styling
\`\`\`

### What if I have uncommitted changes?

Auto Claude creates a worktree from your current branch. Uncommitted changes in your main directory are preserved.

### Can I use this with git-flow or trunk-based development?

Yes! Auto Claude creates feature branches:
- \`auto-claude/001-feature-name\`

You merge into your workflow however you prefer.

### What if the build takes multiple days?

No problem:
- Progress is saved after each subtask
- Sessions resume where they left off
- \`--continue\` flag explicitly resumes

---

## Integrations

### How do I use with GitHub Issues?

1. Connect GitHub in the app settings
2. Go to GitHub tab
3. Browse/search issues
4. Click "Import as Task" or "Investigate"

### How do I use with GitLab?

Add to \`apps/backend/.env\`:
\`\`\`bash
GITLAB_TOKEN=glpat-...
GITLAB_INSTANCE_URL=https://gitlab.example.com  # or omit for gitlab.com
\`\`\`

### How do I use with Linear?

Add to \`apps/backend/.env\`:
\`\`\`bash
LINEAR_API_KEY=lin_api_...
\`\`\`

Tasks automatically sync:
- New task → Linear issue created
- Progress → Linear status updated
- Complete → Linear issue closed

---

## Technical

### What models does Auto Claude use?

Three Claude models are available:

| Model | ID | Best For |
|-------|------|----------|
| **Opus** | \`claude-opus-4-5-20251101\` | Complex tasks, highest quality (default) |
| **Sonnet** | \`claude-sonnet-4-5-20250929\` | Balanced speed and quality |
| **Haiku** | \`claude-haiku-4-5-20251001\` | Fast utility operations, cost-effective |

Override with:
\`\`\`bash
AUTO_BUILD_MODEL=claude-sonnet-4-5-20250929
\`\`\`

Or select in the UI when creating a task.

### Can I use my own API key?

No. Auto Claude is designed to use Claude Code OAuth tokens only. This ensures:
- Proper rate limiting
- Subscription verification
- No accidental API charges

### What's the difference between CLI and Desktop app?

| CLI | Desktop App |
|-----|-------------|
| Terminal-based | Visual interface |
| Manual Python setup | Auto-configured |
| Good for servers/CI | Good for daily use |
| Same core functionality | Same core functionality |

### Can I run this on a server?

Yes! Use the CLI:
\`\`\`bash
cd apps/backend
python run.py --spec 001
\`\`\`

See the CLI Usage guide for details.

---

## Troubleshooting

### Where do I get help?

1. Check the Troubleshooting guide in this Knowledge Base
2. [GitHub Issues](https://github.com/AndyMik90/Auto-Claude/issues) - Bug reports
3. [GitHub Discussions](https://github.com/AndyMik90/Auto-Claude/discussions) - Questions

### How do I report a bug?

1. Go to [GitHub Issues](https://github.com/AndyMik90/Auto-Claude/issues)
2. Click "New Issue"
3. Include:
   - Your operating system and version
   - Auto Claude version
   - Steps to reproduce
   - Error messages or logs
`
  }
];

export const GUIDE_CATEGORIES = [
  { id: 'all', label: 'All Guides' },
  { id: 'usage', label: 'Usage' },
  { id: 'setup', label: 'Setup' },
  { id: 'reference', label: 'Reference' },
  { id: 'faq', label: 'FAQ' }
] as const;
