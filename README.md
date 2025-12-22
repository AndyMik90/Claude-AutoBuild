# Auto Claude

Your AI coding companion. Build features, fix bugs, and ship faster — with autonomous agents that plan, code, and validate for you.

![Auto Claude Kanban Board](.github/assets/Auto-Claude-Kanban.png)

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/KCXaPBr4Dj)

## What It Does ✨

**Auto Claude is a desktop app that supercharges your AI coding workflow.** Whether you're a vibe coder just getting started or an experienced developer, Auto Claude meets you where you are.

- **Autonomous Tasks** — Describe what you want to build, and agents handle planning, coding, and validation while you focus on other work
- **Agent Terminals** — Run Claude Code in up to 12 terminals with a clean layout, smart naming based on context, and one-click task context injection
- **Safe by Default** — All work happens in git worktrees, keeping your main branch undisturbed until you're ready to merge
- **Self-Validating** — Built-in QA agents check their own work before you review

**The result?** 10x your output while maintaining code quality.

## Key Features

- **Parallel Agents**: Run multiple builds simultaneously while you focus on other work
- **Context Engineering**: Agents understand your codebase structure before writing code
- **Self-Validating**: Built-in QA loop catches issues before you review
- **Isolated Workspaces**: All work happens in git worktrees — your code stays safe
- **AI Merge Resolution**: Intelligent conflict resolution when merging back to main — no manual conflict fixing
- **Cross-Platform**: Desktop app runs on Mac, Windows, and Linux
- **Any Project Type**: Build web apps, APIs, CLIs — works with any software project

## Quick Start

### Download Auto Claude

Download the latest release for your platform from [GitHub Releases](https://github.com/AndyMik90/Auto-Claude/releases/latest):

| Platform | Download |
|----------|----------|
| **macOS (Apple Silicon M1-M4)** | `*-arm64.dmg` |
| **macOS (Intel)** | `*-x64.dmg` |
| **Windows** | `*.exe` |
| **Linux** | `*.AppImage` or `*.deb` |

> **Not sure which Mac?** Click the Apple menu () > "About This Mac". Look for "Chip" - M1/M2/M3/M4 = Apple Silicon, otherwise Intel.

### Prerequisites

Before using Auto Claude, you need:

1. **Claude Subscription** - Requires [Claude Pro or Max](https://claude.ai/upgrade) for Claude Code access
2. **Claude Code CLI** - Install with: `npm install -g @anthropic-ai/claude-code`

### Install and Run

1. **Download** the installer for your platform from the table above
2. **Install**:
   - **macOS**: Open the `.dmg`, drag Auto Claude to Applications
   - **Windows**: Run the `.exe` installer (see note below about security warning)
   - **Linux**: Make the AppImage executable (`chmod +x`) and run it, or install the `.deb`
3. **Launch** Auto Claude
4. **Add your project** and start building!

<details>
<summary><b>Windows users:</b> Security warning when installing</summary>

The Windows installer is not yet code-signed, so you may see a "Windows protected your PC" warning from Microsoft Defender SmartScreen.

**To proceed:**
1. Click "More info"
2. Click "Run anyway"

This is safe — all releases are automatically scanned with VirusTotal before publishing. You can verify any installer by checking the **VirusTotal Scan Results** section in each [release's notes](https://github.com/AndyMik90/Auto-Claude/releases).

We're working on obtaining a code signing certificate for future releases.

</details>

> **Want to build from source?** See [CONTRIBUTING.md](CONTRIBUTING.md#running-from-source) for development setup.

---

## 🎯 Features

### Kanban Board

Plan tasks and let AI handle the planning, coding, and validation — all in a visual interface. Track progress from "Planning" to "Done" while agents work autonomously.

### Agent Terminals

Spawn up to 12 AI-powered terminals for hands-on coding. Inject task context with a click, reference files from your project, and work rapidly across multiple sessions.

**Power users:** Connect multiple Claude Code subscriptions to run even more agents in parallel — perfect for teams or heavy workloads.

![Auto Claude Agent Terminals](.github/assets/Auto-Claude-Agents-terminals.png)

### Insights

Have a conversation about your project in a ChatGPT-style interface. Ask questions, get explanations, and explore your codebase through natural dialogue.

### Roadmap

Based on your target audience, AI anticipates and plans the most impactful features you should focus on. Prioritize what matters most to your users.

![Auto Claude Roadmap](.github/assets/Auto-Claude-roadmap.png)

### Ideation

Let AI help you create a project that shines. Rapidly understand your codebase and discover:
- Code improvements and refactoring opportunities
- Performance bottlenecks
- Security vulnerabilities
- Documentation gaps
- UI/UX enhancements
- Overall code quality issues

### Changelog

Write professional changelogs effortlessly. Generate release notes from completed Auto Claude tasks or integrate with GitHub to create masterclass changelogs automatically.

### Context

See exactly what Auto Claude understands about your project — the tech stack, file structure, patterns, and insights it uses to write better code.

### AI Merge Resolution

When your main branch evolves while a build is in progress, Auto Claude automatically resolves merge conflicts using AI — no manual `<<<<<<< HEAD` fixing required.

**How it works:**
1. **Git Auto-Merge First** — Simple non-conflicting changes merge instantly without AI
2. **Conflict-Only AI** — For actual conflicts, AI receives only the specific conflict regions (not entire files), achieving ~98% prompt reduction
3. **Parallel Processing** — Multiple conflicting files resolve simultaneously for faster merges
4. **Syntax Validation** — Every merge is validated before being applied

**The result:** A build that was 50+ commits behind main merges in seconds instead of requiring manual conflict resolution.

---

## CLI Usage (Terminal-Only)

For terminal-based workflows, headless servers, or CI/CD integration, see **[guides/CLI-USAGE.md](guides/CLI-USAGE.md)**.

## ⚙️ How It Works

Auto Claude focuses on three core principles: **context engineering** (understanding your codebase before writing code), **good coding standards** (following best practices and patterns), and **validation logic** (ensuring code works before you see it).

### The Agent Pipeline

**Phase 1: Spec Creation** (3-8 phases based on complexity)

Before any code is written, agents gather context and create a detailed specification:

1. **Discovery** — Analyzes your project structure and tech stack
2. **Requirements** — Gathers what you want to build through interactive conversation
3. **Research** — Validates external integrations against real documentation
4. **Context Discovery** — Finds relevant files in your codebase
5. **Spec Writer** — Creates a comprehensive specification document
6. **Spec Critic** — Self-critiques using extended thinking to find issues early
7. **Planner** — Breaks work into subtasks with dependencies
8. **Validation** — Ensures all outputs are valid before proceeding

**Phase 2: Implementation**

With a validated spec, coding agents execute the plan:

1. **Planner Agent** — Creates subtask-based implementation plan
2. **Coder Agent** — Implements subtasks one-by-one with verification
3. **QA Reviewer** — Validates all acceptance criteria
4. **QA Fixer** — Fixes issues in a self-healing loop (up to 50 iterations)

Each session runs with a fresh context window. Progress is tracked via `implementation_plan.json` and Git commits.

**Phase 3: Merge**

When you're ready to merge, AI handles any conflicts that arose while you were working:

1. **Conflict Detection** — Identifies files modified in both main and the build
2. **3-Tier Resolution** — Git auto-merge → Conflict-only AI → Full-file AI (fallback)
3. **Parallel Merge** — Multiple files resolve simultaneously
4. **Staged for Review** — Changes are staged but not committed, so you can review before finalizing

### 🔒 Security Model

Three-layer defense keeps your code safe:
- **OS Sandbox** — Bash commands run in isolation
- **Filesystem Restrictions** — Operations limited to project directory
- **Command Allowlist** — Only approved commands based on your project's stack

## Project Structure

```
your-project/
├── .worktrees/               # Created during build (git-ignored)
│   └── auto-claude/          # Isolated workspace for AI coding
├── .auto-claude/             # Per-project data (specs, plans, QA reports)
│   ├── specs/                # Task specifications
│   ├── roadmap/              # Project roadmap
│   └── ideation/             # Ideas and planning
├── auto-claude/              # Python backend (framework code)
│   ├── run.py                # Build entry point
│   ├── spec_runner.py        # Spec creation orchestrator
│   ├── prompts/              # Agent prompt templates
│   └── ...
└── auto-claude-ui/           # Electron desktop application
    └── ...
```

### Understanding the Folders

**You don't create these folders manually** - they serve different purposes:

- **`auto-claude/`** - The framework repository itself (clone this once from GitHub)
- **`.auto-claude/`** - Created automatically in YOUR project when you run Auto Claude (stores specs, plans, QA reports)
- **`.worktrees/`** - Temporary isolated workspaces created during builds (git-ignored, deleted after merge)

**When using Auto Claude on your project:**
```bash
cd your-project/              # Your own project directory
python /path/to/auto-claude/run.py --spec 001
# Auto Claude creates .auto-claude/ automatically in your-project/
```

**When developing Auto Claude itself:**
```bash
git clone https://github.com/yourusername/auto-claude
cd auto-claude/               # You're working in the framework repo
```

The `.auto-claude/` directory is gitignored and project-specific - you'll have one per project you use Auto Claude on.

## Environment Variables (CLI Only)

> **Desktop UI users:** These are configured through the app settings — no manual setup needed.

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Yes | OAuth token from `claude setup-token` |
| `AUTO_BUILD_MODEL` | No | Model override (default: claude-opus-4-5-20251101) |

See `auto-claude/.env.example` for complete configuration options.

## 💬 Community

Join our Discord to get help, share what you're building, and connect with other Auto Claude users:

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/KCXaPBr4Dj)

## 🤝 Contributing

We welcome contributions! Whether it's bug fixes, new features, or documentation improvements.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for guidelines on how to get started.

## Acknowledgments

This framework was inspired by Anthropic's [Autonomous Coding Agent](https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding). Thank you to the Anthropic team for their innovative work on autonomous coding systems.

## License

**AGPL-3.0** - GNU Affero General Public License v3.0

This software is licensed under AGPL-3.0, which means:

- **Attribution Required**: You must give appropriate credit, provide a link to the license, and indicate if changes were made. When using Auto Claude, please credit the project.
- **Open Source Required**: If you modify this software and distribute it or run it as a service, you must release your source code under AGPL-3.0.
- **Network Use (Copyleft)**: If you run this software as a network service (e.g., SaaS), users interacting with it over a network must be able to receive the source code.
- **No Closed-Source Usage**: You cannot use this software in proprietary/closed-source projects without open-sourcing your entire project under AGPL-3.0.

**In simple terms**: You can use Auto Claude freely, but if you build on it, your code must also be open source under AGPL-3.0 and attribute this project. Closed-source commercial use requires a separate license.

For commercial licensing inquiries (closed-source usage), please contact the maintainers.
