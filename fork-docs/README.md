# Fork Documentation

This folder contains all documentation specific to the **auto-claude-gemini** fork.

## Contents

| Document                                     | Description                               |
| -------------------------------------------- | ----------------------------------------- |
| [ROADMAP.md](./ROADMAP.md)                   | Phased roadmap for fork-specific features |
| [EPIC_BREAKDOWN.md](./EPIC_BREAKDOWN.md)     | Detailed epic/feature/task breakdown      |
| [architecture/](./architecture/)             | Technical architecture documents          |
| [../CHANGELOG.fork.md](../CHANGELOG.fork.md) | Fork-specific changelog                   |

### Architecture Documents

| Document                                                      | Description                                    |
| ------------------------------------------------------------- | ---------------------------------------------- |
| [provider-extension.md](./architecture/provider-extension.md) | Detailed multi-provider extension architecture |
| [diagrams.md](./architecture/diagrams.md)                     | Visual architecture diagrams (Mermaid)         |

## Fork Overview

This fork extends [AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude) with:

- **Gemini CLI Provider** – Support for Google's Gemini 3 models via CLI
- **Jules API Provider** – Async background agent powered by Jules REST API
- **Profile-Based Routing** – Route tasks to different providers based on complexity
- **Antigravity Integration** – Compatibility with Google Antigravity workflows

## Related Documentation

- [FORK.md](../FORK.md) – Fork maintenance strategy and sync workflow
- [ANTIGRAVITY.md](../ANTIGRAVITY.md) – Antigravity agent configuration
- [CLAUDE.md](../CLAUDE.md) – Claude Code agent documentation

## Quick Links

- **Upstream Repository**: [AndyMik90/Auto-Claude](https://github.com/AndyMik90/Auto-Claude)
- **Fork Repository**: [andrewarr/auto-claude-gemini](https://github.com/andrewarr/auto-claude-gemini)
