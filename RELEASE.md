# Release Process

This document describes how releases are created for Auto Claude.

## Overview

Auto Claude uses an automated release pipeline that ensures releases are only published after all builds succeed. This prevents version mismatches between documentation and actual releases.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RELEASE FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   develop branch                    main branch                              │
│   ──────────────                    ───────────                              │
│        │                                 │                                   │
│        │  1. bump-version.js             │                                   │
│        │     (creates commit)            │                                   │
│        │                                 │                                   │
│        ▼                                 │                                   │
│   ┌─────────┐                           │                                   │
│   │ v2.8.0  │  2. Create PR             │                                   │
│   │ commit  │ ────────────────────►     │                                   │
│   └─────────┘                           │                                   │
│                                          │                                   │
│                           3. Merge PR    ▼                                   │
│                                    ┌──────────┐                              │
│                                    │ v2.8.0   │                              │
│                                    │ on main  │                              │
│                                    └────┬─────┘                              │
│                                         │                                    │
│                     ┌───────────────────┴───────────────────┐               │
│                     │     GitHub Actions (automatic)         │               │
│                     ├───────────────────────────────────────┤               │
│                     │ 4. prepare-release.yml                 │               │
│                     │    - Detects version > latest tag      │               │
│                     │    - Creates tag v2.8.0                │               │
│                     │                                        │               │
│                     │ 5. release.yml (triggered by tag)      │               │
│                     │    - Builds macOS (Intel + ARM)        │               │
│                     │    - Builds Windows                    │               │
│                     │    - Builds Linux                      │               │
│                     │    - Generates changelog               │               │
│                     │    - Creates GitHub release            │               │
│                     │    - Updates README                    │               │
│                     └───────────────────────────────────────┘               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## For Maintainers: Creating a Release

### Step 1: Bump the Version

On your development branch (typically `develop` or a feature branch):

```bash
# Navigate to project root
cd /path/to/auto-claude

# Bump version (choose one)
node scripts/bump-version.js patch   # 2.7.1 -> 2.7.2 (bug fixes)
node scripts/bump-version.js minor   # 2.7.1 -> 2.8.0 (new features)
node scripts/bump-version.js major   # 2.7.1 -> 3.0.0 (breaking changes)
node scripts/bump-version.js 2.8.0   # Set specific version
```

This will:
- Update `apps/frontend/package.json`
- Update `package.json` (root)
- Update `apps/backend/__init__.py`
- Create a commit with message `chore: bump version to X.Y.Z`

### Step 2: Push and Create PR

```bash
# Push your branch
git push origin your-branch

# Create PR to main (via GitHub UI or gh CLI)
gh pr create --base main --title "Release v2.8.0"
```

### Step 3: Merge to Main

Once the PR is approved and merged to `main`, GitHub Actions will automatically:

1. **Detect the version bump** (`prepare-release.yml`)
2. **Create a git tag** (e.g., `v2.8.0`)
3. **Trigger the release workflow** (`release.yml`)
4. **Build binaries** for all platforms:
   - macOS Intel (x64) - code signed & notarized
   - macOS Apple Silicon (arm64) - code signed & notarized
   - Windows (NSIS installer) - code signed
   - Linux (AppImage + .deb)
5. **Generate changelog** from merged PRs (using release-drafter)
6. **Scan binaries** with VirusTotal
7. **Create GitHub release** with all artifacts
8. **Update README** with new version badge and download links

### Step 4: Verify

After merging, check:
- [GitHub Actions](https://github.com/AndyMik90/Auto-Claude/actions) - ensure all workflows pass
- [Releases](https://github.com/AndyMik90/Auto-Claude/releases) - verify release was created
- [README](https://github.com/AndyMik90/Auto-Claude#download) - confirm version updated

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes, incompatible API changes
- **MINOR** (0.X.0): New features, backwards compatible
- **PATCH** (0.0.X): Bug fixes, backwards compatible

## Changelog Generation

Changelogs are automatically generated from merged PRs using [Release Drafter](https://github.com/release-drafter/release-drafter).

### PR Labels for Changelog Categories

| Label | Category |
|-------|----------|
| `feature`, `enhancement` | New Features |
| `bug`, `fix` | Bug Fixes |
| `improvement`, `refactor` | Improvements |
| `documentation` | Documentation |
| (any other) | Other Changes |

**Tip:** Add appropriate labels to your PRs for better changelog organization.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `prepare-release.yml` | Push to `main` | Detects version bump, creates tag |
| `release.yml` | Tag `v*` pushed | Builds binaries, creates release |
| `validate-version.yml` | Tag `v*` pushed | Validates tag matches package.json |
| `update-readme` (in release.yml) | After release | Updates README with new version |

## Troubleshooting

### Release didn't trigger after merge

1. Check if version in `package.json` is greater than latest tag:
   ```bash
   git tag -l 'v*' --sort=-version:refname | head -1
   cat apps/frontend/package.json | grep version
   ```

2. Ensure the merge commit touched `package.json`:
   ```bash
   git diff HEAD~1 --name-only | grep package.json
   ```

### Build failed after tag was created

- The release won't be published if builds fail
- Fix the issue and create a new patch version
- Don't reuse failed version numbers

### README shows wrong version

- README is only updated after successful release
- If release failed, README keeps the previous version (this is intentional)
- Once you successfully release, README will update automatically

## Manual Release (Emergency Only)

In rare cases where you need to bypass the automated flow:

```bash
# Create tag manually (NOT RECOMMENDED)
git tag -a v2.8.0 -m "Release v2.8.0"
git push origin v2.8.0

# This will trigger release.yml directly
```

**Warning:** Only do this if you're certain the version in package.json matches the tag.

## Security

- All macOS binaries are code signed with Apple Developer certificate
- All macOS binaries are notarized by Apple
- Windows binaries are code signed
- All binaries are scanned with VirusTotal
- SHA256 checksums are generated for all artifacts
