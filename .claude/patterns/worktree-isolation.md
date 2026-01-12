# Worktree Isolation Pattern

Auto-Claude's git worktree isolation strategy for safe, parallel feature development.

## Pattern Overview

```
main branch (your work)
    ↓
spec creation
    ↓
git worktree (isolated build environment)
    ↓
autonomous build
    ↓
user review & testing
    ↓
merge back to main
```

## Why Worktrees?

### Safety
- Main codebase untouched during autonomous builds
- Bad builds don't break your working environment
- Easy to discard failed attempts

### Testing
- Full project available in isolated environment
- Run tests without affecting main
- Test changes before integrating

### Parallelization
- Multiple specs can build simultaneously
- Each in its own worktree
- No branch conflicts

## Worktree Structure

```
Auto-Claude/                  # Main project
├── .git/                     # Main git repository
├── .worktrees/               # Isolated build environments
│   ├── 001-auth-feature/     # Worktree for spec 001
│   │   ├── .git             # Worktree git link
│   │   └── [full project]   # Complete codebase
│   ├── 002-dark-mode/        # Worktree for spec 002
│   └── 003-notifications/    # Worktree for spec 003
└── [main project files]
```

## Workflow

### 1. Build Start

```bash
cd apps/backend && python run.py --spec 001
```

Auto-Claude automatically:
1. Creates branch: `auto-claude/001-auth-feature`
2. Creates worktree: `.worktrees/001-auth-feature/`
3. Links worktree to branch
4. Starts build in worktree

### 2. Build Execution

All changes happen in `.worktrees/001-auth-feature/`:
- Code modifications
- Test execution
- Build verification
- QA validation

Main project remains unchanged.

### 3. Review

```bash
python run.py --spec 001 --review
```

Opens worktree for manual testing:
```bash
cd .worktrees/001-auth-feature
npm run dev  # Test frontend
npm test     # Run tests
```

### 4. Merge

```bash
python run.py --spec 001 --merge
```

Auto-Claude:
1. Confirms worktree is on correct branch
2. Merges `auto-claude/001-auth-feature` → main
3. Cleans up worktree
4. Deletes spec branch (optional)

### 5. Discard

```bash
python run.py --spec 001 --discard
```

Auto-Claude:
1. Removes worktree
2. Deletes spec branch
3. No changes to main

## Branch Strategy

### Branch Naming
`auto-claude/{spec-name}`

Example:
- `auto-claude/001-auth-feature`
- `auto-claude/002-dark-mode`
- `auto-claude/003-notifications`

### Branch Lifecycle
1. **Created**: When build starts
2. **Updated**: During autonomous coding
3. **Merged**: When user approves
4. **Deleted**: After merge (optional) or on discard

### Local Only (Default)
- Branches stay local until user pushes
- User controls when to push to remote
- No automatic GitHub integration

## Safety Mechanisms

### 1. Worktree Protection
- Worktrees can't interfere with each other
- Each has its own working directory
- Changes isolated to specific branch

### 2. Main Branch Protection
- Main branch never modified directly
- All changes via merge
- User reviews before merge

### 3. Clean State Validation
- Check for uncommitted changes before merge
- Verify tests pass in worktree
- Confirm QA accepted

## Parallelization

### Multiple Specs
```bash
# Terminal 1
python run.py --spec 001  # Builds in .worktrees/001-auth-feature/

# Terminal 2
python run.py --spec 002  # Builds in .worktrees/002-dark-mode/
```

Each build:
- Independent worktree
- Independent branch
- No conflicts

### Agent Subagents
Within a single build, the coder agent can spawn subagents for parallel subtask execution:
```
Subtask 1 → Subagent 1 (in same worktree)
Subtask 2 → Subagent 2 (in same worktree)
Subtask 3 → Subagent 3 (in same worktree)
```

## Merge Strategies

### Fast-Forward (Preferred)
```bash
git merge --ff auto-claude/001-auth-feature
```
- Clean history
- No merge commit
- Works when main hasn't changed

### Merge Commit
```bash
git merge --no-ff auto-claude/001-auth-feature
```
- Explicit merge commit
- Documents feature integration
- Works when main has diverged

### Squash (Optional)
```bash
git merge --squash auto-claude/001-auth-feature
git commit -m "feat: add auth feature"
```
- Clean commit history
- Single commit for entire feature
- Loses individual commit messages

## Best Practices

1. **Always review**: Test in worktree before merging
2. **Keep specs focused**: Smaller specs → easier to review and merge
3. **Merge frequently**: Don't let specs diverge too far from main
4. **Clean up**: Discard failed builds promptly
5. **Test before merge**: Ensure QA passed and tests pass

## Troubleshooting

### Worktree Already Exists
```bash
# Remove old worktree
git worktree remove .worktrees/001-auth-feature
# Or force remove
git worktree remove --force .worktrees/001-auth-feature
```

### Branch Conflicts on Merge
```bash
# In worktree, rebase on main
cd .worktrees/001-auth-feature
git rebase main
# Resolve conflicts
git add .
git rebase --continue
```

### Disk Space Issues
```bash
# List all worktrees
git worktree list

# Remove unused worktrees
python run.py --spec 001 --discard
```

## Metrics

**Target Metrics**:
- Merge success rate: > 95%
- Average worktree lifetime: < 24 hours
- Parallel builds: Support 3-5 simultaneous

**Red Flags**:
- Many long-lived worktrees (>1 week)
- High merge conflict rate (>10%)
- Disk space issues from worktree accumulation
