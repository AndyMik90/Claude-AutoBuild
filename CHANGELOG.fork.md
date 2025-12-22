# Fork Changelog

> **This changelog tracks changes specific to the `auto-claude-gemini` fork.**
>
> For upstream Auto-Claude changes, see [CHANGELOG.md](./CHANGELOG.md).

---

## Versioning Strategy

This fork uses a **parallel versioning scheme**:

- **Upstream versions**: `2.x.x` (tracked in CHANGELOG.md)
- **Fork versions**: `2.x.x-fork.N` where N increments for fork-specific releases

Example: If upstream is at `2.7.1`, our fork releases would be `2.7.1-fork.1`, `2.7.1-fork.2`, etc.

When upstream releases a new version, we sync and reset: `2.8.0-fork.1`

---

## [Unreleased]

### 🚀 Fork Features

<!-- New features specific to this fork -->

### 🔧 Fork Improvements

<!-- Improvements to fork-specific code -->

### 📚 Fork Documentation

<!-- Documentation changes for fork features -->

### 🔄 Upstream Syncs

<!-- Record of upstream syncs -->

---

## [2.7.1-fork.1] - 2025-12-22

### 📚 Fork Documentation

- **Initial fork setup** — Created fork-specific documentation structure

  - Added `fork-docs/` directory with ROADMAP.md, architecture docs
  - Created `FORK.md` with fork maintenance strategy
  - Updated `ANTIGRAVITY.md` for fork compatibility
  - Created comprehensive `EPIC_BREAKDOWN.md` for development planning

- **Changelog system** — Established dual-changelog system
  - Created `CHANGELOG.fork.md` for fork-specific changes
  - Added workflow for changelog management
  - Preserved upstream `CHANGELOG.md` for sync tracking

### 🔄 Upstream Syncs

- **Initial fork from upstream** — Forked from AndyMik90/Auto-Claude at v2.7.1
  - Base commit: [upstream main as of 2025-12-22]
  - All upstream functionality preserved

---

## Changelog Format Guide

### Entry Format

Each entry should follow this format:

```markdown
- **Short title** — Detailed description of the change
  - Sub-bullet for additional context if needed
  - Reference to related epic/feature: (Epic 1, Feature 1.2)
```

### Categories

| Category           | Icon | Use For                                   |
| ------------------ | ---- | ----------------------------------------- |
| Fork Features      | 🚀   | New features specific to this fork        |
| Fork Improvements  | 🔧   | Enhancements to fork-specific code        |
| Fork Bug Fixes     | 🐛   | Fixes for fork-specific issues            |
| Fork Documentation | 📚   | Docs for fork features                    |
| Upstream Syncs     | 🔄   | Record of upstream merge syncs            |
| Breaking Changes   | ⚠️   | Changes that break backward compatibility |

### When to Update

1. **After completing a feature** from EPIC_BREAKDOWN.md
2. **After syncing upstream** (record upstream version)
3. **Before creating a release** (finalize unreleased section)

---

## Links

- [Upstream Changelog](./CHANGELOG.md)
- [Fork Roadmap](./fork-docs/ROADMAP.md)
- [Epic Breakdown](./fork-docs/EPIC_BREAKDOWN.md)
