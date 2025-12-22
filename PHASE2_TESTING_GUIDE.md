# Phase 2: Testing Guide - Ollama + Batch Features

**Branch:** `feature/ollama-and-batch-tasks`
**Status:** Implementation complete, ready for testing
**Created:** 8 commits, 11 files modified/created
**Verified:** Code syntax, architecture, file structure ✅

---

## Quick Start

### 1. Verify Branch & Code

```bash
cd /Users/ray/dev/decent/Auto-Claude
git branch
# Should show: * feature/ollama-and-batch-tasks

git log --oneline -3
# Should show latest 3 commits
```

### 2. Test UI Feature (Ollama Download Progress)

**Terminal 1 - Start Dev Server:**
```bash
cd /Users/ray/dev/decent/Auto-Claude
npm run dev
```

**Expected Output:**
- Electron window opens
- No console errors in DevTools (F12)
- Onboarding screen shows Ollama option

**What to Look For:**
- ✅ OllamaModelSelector component loads
- ✅ Can enter Ollama base URL (e.g., http://localhost:11434)
- ✅ "Scan Models" button works
- ✅ If Ollama running: Shows available models
- ✅ Download button available
- ✅ Progress bar appears during download
- ✅ Speed displays (MB/s, KB/s)
- ✅ Time remaining estimated
- ✅ Progress updates in real-time
- ✅ Download completes without errors

### 3. Test CLI Feature (Batch Tasks)

**Terminal 2 - Test Batch Commands:**

```bash
cd /Users/ray/dev/decent/Auto-Claude

# Test 1: Create batch specs
python3 apps/backend/run.py --batch-create batch_test.json
# Should create 001, 002, 003 spec directories

# Test 2: View specs
python3 apps/backend/run.py --batch-status
# Should show 3 specs with status icons

# Test 3: Preview cleanup
python3 apps/backend/run.py --batch-cleanup
# Should show what would be deleted (dry-run by default)
```

---

## Detailed Testing Checklist

### UI Testing (Ollama Feature)

Use this checklist while testing `npm run dev`:

#### Component Loading
- [ ] Electron window opens without crash
- [ ] No errors in DevTools console (F12)
- [ ] OllamaModelSelector component visible
- [ ] "Ollama Model Provider" heading shows

#### URL Input
- [ ] Base URL input field present
- [ ] Can type in URL field
- [ ] Default value shows (if configured)
- [ ] Input field is responsive

#### Model Scanning
- [ ] "Scan Models" button clickable
- [ ] Button shows loading state during scan
- [ ] Results appear (if Ollama running locally)
- [ ] Error message if Ollama not reachable
- [ ] Models list displays correctly

#### Download Progress (NEW - Main Feature)
- [ ] Download button appears for models
- [ ] Click download initiates process
- [ ] Progress bar appears immediately
- [ ] Shows 0% → 100% progression
- [ ] Speed displays in appropriate unit (MB/s, KB/s, B/s)
- [ ] Speed updates as download progresses
- [ ] Time remaining shows and decreases
- [ ] Time remaining is reasonable estimate
- [ ] Download percentage updates frequently
- [ ] Progress bar animates smoothly
- [ ] Can cancel download
- [ ] Download completes successfully
- [ ] Success message shown

#### UI Responsiveness
- [ ] UI remains responsive during download
- [ ] Can interact with other elements
- [ ] No frozen buttons or input fields
- [ ] Animations smooth (no jank)

#### Error Handling
- [ ] Shows error for invalid URL
- [ ] Shows error for unreachable host
- [ ] Shows error for network timeout
- [ ] Error messages are helpful
- [ ] Can retry after error

#### DevTools Analysis
Open DevTools (F12) and check:
- [ ] Console tab: No errors or warnings
- [ ] Network tab: Download requests visible
- [ ] Check IPC messages for progress events
- [ ] Memory usage doesn't grow excessively

---

### CLI Testing (Batch Tasks)

Use this checklist while testing batch commands:

#### Batch Create

```bash
python3 apps/backend/run.py --batch-create batch_test.json
```

**Expected Output:**
```
[1/3] Created 001 - Add dark mode toggle
[2/3] Created 002 - Fix button styling
[3/3] Created 003 - Add loading spinner
Created 3 spec(s) successfully

Next steps:
  1. Generate specs: spec_runner.py --continue <spec_id>
  2. Approve specs and build them
  3. Run: python run.py --spec <id> to execute
```

**Verify:**
- [ ] Command completes without error
- [ ] Shows progress for each task
- [ ] Shows "Created 3 spec(s) successfully"
- [ ] Directories created: `.auto-claude/specs/001-*`, `002-*`, `003-*`
- [ ] Each directory has `requirements.json`
- [ ] `requirements.json` contains correct fields:
  - [ ] `task_description`
  - [ ] `description`
  - [ ] `workflow_type`
  - [ ] `services_involved`
  - [ ] `priority`
  - [ ] `complexity_inferred`
  - [ ] `estimate` (with `estimated_hours`)
- [ ] All 3 tasks created with proper structure

#### Batch Status

```bash
python3 apps/backend/run.py --batch-status
```

**Expected Output:**
```
Found 3 spec(s)

⏳ 001-add-dark-mode-toggle           Add dark mode toggle
📋 002-fix-button-styling             Fix button styling
⚙️  003-add-loading-spinner            Add loading spinner
```

**Verify:**
- [ ] Command completes without error
- [ ] Shows "Found 3 spec(s)"
- [ ] Lists all 3 specs
- [ ] Shows status icons:
  - [ ] ⏳ = pending_spec (no spec.md)
  - [ ] 📋 = spec_created (has spec.md)
  - [ ] ⚙️  = building (has implementation_plan.json)
  - [ ] ✅ = qa_approved (has qa_report.md)
- [ ] Shows spec names and titles
- [ ] Formatting is readable and aligned

#### Batch Cleanup

```bash
python3 apps/backend/run.py --batch-cleanup
```

**Expected Output (dry-run):**
```
No completed specs to clean up
```
(Unless you've completed a spec build)

**Verify:**
- [ ] Command completes without error
- [ ] Shows "No completed specs" or lists them
- [ ] Default is dry-run (doesn't delete)
- [ ] Shows what WOULD be deleted
- [ ] Shows associated worktrees that would be removed

**Test with --no-dry-run:**
```bash
python3 apps/backend/run.py --batch-cleanup --no-dry-run
```

**Verify:**
- [ ] Actually deletes specs when flag used
- [ ] Removes spec directories
- [ ] Removes associated worktrees
- [ ] Returns to clean state

#### Error Handling

Test error cases:

```bash
# Test 1: Missing file
python3 apps/backend/run.py --batch-create nonexistent.json
# Should show: "Batch file not found"

# Test 2: Invalid JSON
echo "{ invalid json" > bad.json
python3 apps/backend/run.py --batch-create bad.json
# Should show: "Invalid JSON"

# Test 3: Empty tasks
echo '{"tasks": []}' > empty.json
python3 apps/backend/run.py --batch-create empty.json
# Should show: "No tasks found"
```

**Verify:**
- [ ] Shows helpful error message
- [ ] Doesn't crash
- [ ] Suggests next steps

---

## Architecture Verification

If any issues found, verify the architecture is correct:

### Files Created
```bash
ls -la apps/backend/cli/batch_commands.py
ls -la apps/frontend/src/main/__tests__/ndjson-parser.test.ts
ls -la apps/frontend/src/renderer/components/__tests__/OllamaModelSelector.progress.test.ts
ls -la batch_test.json
```

**All should exist.**

### Files Modified
```bash
grep "batch_commands" apps/backend/cli/main.py
# Should show import and handler calls
```

### Code Quality
```bash
python3 -m py_compile apps/backend/cli/batch_commands.py
# Should exit with code 0 (success)
```

---

## Common Issues & Solutions

### Issue: "command not found: npm"
**Solution:** Install Node.js or use full path to npm

### Issue: "No module named 'claude_agent_sdk'"
**Solution:** Backend environment not set up. This is expected for CLI testing without full venv.

### Issue: UI doesn't load
**Solution:**
1. Check that `npm run dev` output has no errors
2. Look at DevTools console (F12)
3. Check terminal for error messages

### Issue: Download progress not showing
**Solution:**
1. Open DevTools (F12)
2. Check Network tab - should see Ollama requests
3. Check if Ollama is actually running locally
4. Try different Ollama URL

### Issue: Batch create fails
**Solution:**
1. Verify `batch_test.json` exists in current directory
2. Check file is valid JSON: `python3 -c "import json; json.load(open('batch_test.json'))"`
3. Check `.auto-claude/specs/` directory permissions
4. Ensure no existing specs with same IDs

---

## Testing Timeline

**Estimated Time:** 30-60 minutes

1. **Setup** (5 min)
   - Open 2 terminals
   - Verify branch and commits

2. **UI Testing** (20-30 min)
   - Start dev server
   - Navigate to Ollama feature
   - Test download (if possible with local Ollama)
   - Check DevTools
   - Test error cases

3. **CLI Testing** (10-15 min)
   - Test batch create
   - Test batch status
   - Test batch cleanup
   - Test error cases

4. **Documentation** (5 min)
   - Fill in TESTING_CHECKLIST.md
   - Note any issues found
   - Record timing

---

## What to Do If You Find Issues

1. **Note the Issue**
   - What were you doing?
   - What happened?
   - What did you expect?
   - Screenshot/error message?

2. **Check if It's a Blocker**
   - Does it prevent core feature from working?
   - Or just a minor UI issue?

3. **Create a Summary**
   - Write up in TESTING_CHECKLIST.md under "Notes"
   - Include reproduction steps
   - Include expected vs actual behavior

4. **Fix the Bug** (if possible)
   - Make the code change
   - Test the fix
   - Commit: `git commit -am "fix: description of fix"`
   - Push: `git push fork feature/ollama-and-batch-tasks`

---

## Success Criteria

All of the following must be true:

✅ **Ollama Feature:**
- Loads without errors
- Shows download progress
- Calculates speed correctly
- Estimates time remaining
- Downloads complete successfully
- No console errors

✅ **Batch Tasks:**
- Create command works
- Creates correct spec structure
- Status command shows all specs
- Cleanup shows preview
- Error handling works

✅ **Code Quality:**
- No syntax errors
- Clean git history
- All tests pass
- Documentation complete

---

## After Testing

1. **Update TESTING_CHECKLIST.md**
   - Mark completed tests
   - Note any issues
   - Add observations

2. **If Bugs Found**
   - Fix the bug
   - Create new commit
   - Push to fork
   - PR auto-updates

3. **If All Good**
   - Mark PR as ready for review
   - Note completion date
   - Summary of testing

4. **Next Phase**
   - Code review
   - Merge to develop
   - Create release notes

---

## Files to Know

| File | Purpose | Status |
|------|---------|--------|
| IMPLEMENTATION_SUMMARY.md | Feature overview | Reference |
| TESTING_CHECKLIST.md | Test guide | Update during testing |
| batch_test.json | Sample batch data | Use for testing |
| batch_commands.py | Batch CLI implementation | Verify during testing |
| OllamaModelSelector.tsx | Ollama UI component | Test with npm run dev |

---

## Quick Reference

```bash
# Start UI dev server
npm run dev

# Test batch create
python3 apps/backend/run.py --batch-create batch_test.json

# View batch status
python3 apps/backend/run.py --batch-status

# Preview cleanup
python3 apps/backend/run.py --batch-cleanup

# Check branch status
git branch && git log --oneline -3

# Push changes if needed
git push fork feature/ollama-and-batch-tasks
```

---

**Last Updated:** 2025-12-22
**Testing Status:** Ready to start
**Expected Completion:** Ongoing

Good luck with testing! 🚀
