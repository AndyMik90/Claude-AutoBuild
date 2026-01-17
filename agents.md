# AI Agent Development Rules

## Critical Rules - NO EXCEPTIONS

### Git Workflow
- [ ] **NEVER CREATE PRs** - I only push to `origin` (your fork)
- [ ] **NEVER MERGE** - Only maintainers merge to upstream
- [ ] **NEVER PUSH TO UPSTREAM** - I have no permission anyway
- [ ] Only push to `origin` (rayBlock/Auto-Claude-Fork.git)

### Remote Configuration (REQUIRED)
```bash
origin    → https://github.com/rayBlock/Auto-Claude-Fork.git (YOUR FORK)
upstream  → https://github.com/AndyMik90/Auto-Claude.git (MAINTAINERS)
```

### Branch Management
- Develop only on feature branches: `feature/*`, `fix/*`, `refactor/*`, `docs/*`
- Never work directly on `develop` or `main`
- Always rebase on `upstream/develop` before work
- Push to `origin` when ready for review

### PR Creation
- [ ] User creates PR manually via GitHub UI
- [ ] Base: `upstream/develop` (NOT main)
- [ ] Head: `origin/feature-branch`
- [ ] Never auto-create PRs under any circumstances

### Code Review
- All changes require maintainer approval
- Wait for review completion before merge
- No merging without explicit user confirmation

## Workflow Summary
```
1. User creates feature branch locally
2. I implement changes on feature branch
3. I push to origin/feature-branch
4. User creates PR via GitHub UI
5. Maintainers review and merge to upstream
6. I never touch the merge process
```

## When In Doubt
- Stop and ask for user confirmation
- Never assume permission to create PRs or merge
- Push to origin only, nothing else
