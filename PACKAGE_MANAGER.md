# Package Manager Decision: npm vs bun

## TL;DR

**Use npm for this project.** Do not switch to bun, yarn, or pnpm.

---

## Analysis (January 2026)

### Why npm?

| Factor | npm | bun | Winner |
|--------|-----|-----|--------|
| Native modules (`node-pty`) | Works with `electron-rebuild` | Compatibility issues | npm |
| Electron tooling | First-class support | Edge cases | npm |
| CI/CD workflows | 5+ existing workflows | Would need migration | npm |
| Windows build tools | Custom postinstall script | Untested | npm |
| Community support | Mature ecosystem | Growing | npm |

### Technical Details

#### 1. Native Module Compilation

The project uses `@lydell/node-pty` which requires:
- Native compilation via `electron-rebuild`
- Windows: Visual Studio Build Tools
- macOS/Linux: Standard compilers

Bun's native module support is not fully compatible with Electron's rebuild process.

#### 2. Electron Ecosystem

```
electron-vite + electron-builder + electron-rebuild
```

These tools are primarily tested with npm. Using bun introduces risk of:
- Build failures on some platforms
- Inconsistent behavior in CI

#### 3. Postinstall Script

`scripts/postinstall.js` handles:
- Downloading prebuilt node-pty binaries
- Fallback to electron-rebuild
- Windows Build Tools error messaging

This script assumes npm behavior and hasn't been tested with bun.

#### 4. CI/CD Workflows

Files using npm:
- `.github/workflows/build-prebuilds.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/lint.yml`
- `.github/workflows/release.yml`
- `.github/workflows/test-on-tag.yml`

Migration would require testing on all platforms (Windows, macOS Intel, macOS ARM, Linux).

---

## When to Reconsider

Consider switching to bun if:

1. **Bun 2.x** releases with full Electron native module support
2. **electron-rebuild** officially supports bun
3. **Major refactor** removes native module dependencies
4. **New project** without Electron (pure web app)

---

## Commands Reference

```bash
# Install dependencies
npm install

# Development
npm run dev

# Build
npm run build

# Package for distribution
npm run package

# Tests
npm test

# Linting
npm run lint
```

---

## Related Projects

For **new projects** without Electron, prefer bun:

```bash
# New Next.js project
bunx create-next-app@latest my-app

# Install deps
bun install

# Run dev
bun dev
```

---

## Decision Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-01 | Keep npm | Native modules + Electron compatibility |
