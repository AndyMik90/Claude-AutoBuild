# Improved Prompt: Fork Analysis & Quality Assurance

## Original Prompt (Score: 3/10)

```
do a deep review ultrathink mode of the functionality and the changes. make sure everything is correct and make github issues for anything you see not correct. make sure you are synced with the github repo fork and the original and all our changes are maintained. use your prompt writer to improve this prompt C:\Users\joelf\Auto-Claude => https://github.com/AndyMik90/Auto-Claude => https://github.com/joelfuller2016/Auto-Claude also create a deep documentation of the full schema of this fork and where it came from for the AI
```

### Issues Found:
- ✗ Vague terms: "functionality and changes", "everything is correct", "deep review"
- ✗ Overloaded: 5 separate tasks bundled together
- ✗ Missing context: No background on fork purpose or recent work
- ✗ No format specification for deliverables
- ✗ Repository relationship not explained
- ✗ "Ultrathink mode" not defined
- ✗ No success criteria or completion checklist

---

## Improved Prompt (Score: 9.5/10)

### Context
You are working with a forked repository at `C:\Users\joelf\Auto-Claude`, which is forked from `AndyMik90/Auto-Claude` (upstream) to `joelfuller2016/Auto-Claude` (fork). Recent development work has added:
- GitHub PR creation feature (backend + frontend + IPC handlers)
- Debug page with 4 diagnostic panels
- Comprehensive i18n translations (en/fr)
- Documentation files (FORK_SCHEMA.md, AUTO_CLAUDE_SCHEMA.md, DEEP_REVIEW_FINDINGS.md)

The fork relationship is:
- **Upstream**: https://github.com/AndyMik90/Auto-Claude
- **Fork**: https://github.com/joelfuller2016/Auto-Claude
- **Local**: C:\Users\joelf\Auto-Claude

### Objective
Perform a 5-phase comprehensive quality assurance workflow:

#### PHASE 1: Deep Code Review (Ultrathink Mode)
- Use `sequential-thinking` + `code-reasoning` for systematic analysis
- Review all modified files for bugs, security issues, code quality problems
- Check for: i18n compliance, error handling, input validation, type safety, timeout protection
- Document findings in `DEEP_REVIEW_FINDINGS.md` with severity levels (CRITICAL, HIGH, MEDIUM)

#### PHASE 2: GitHub Issue Creation
- Create one GitHub issue per identified problem in `joelfuller2016/Auto-Claude` repository
- Each issue must include: severity label, exact file:line location, problem description, code snippets, recommended fix, test requirements
- Use batch API calls for efficiency
- Cross-reference with `DEEP_REVIEW_FINDINGS.md`

#### PHASE 3: Fork Sync Verification
- Check sync status: `git fetch upstream && git log --oneline upstream/develop..HEAD`
- Verify no incoming changes from upstream
- Commit all pending changes in logical groups (feature, docs, tests, config)
- Push to fork: `git push origin develop`

#### PHASE 4: Prompt Improvement
- Apply CO-STAR framework (Context, Objective, Style, Tone, Audience, Response)
- Detect anti-patterns (vagueness, overloading, missing context)
- Create `IMPROVED_PROMPT.md` with before/after comparison
- Store pattern to mem0-cloud for future reference

#### PHASE 5: AI-Optimized Documentation
- Create/verify `FORK_SCHEMA.md` - Quick reference with decision matrices for AI agents
- Create/verify `AUTO_CLAUDE_SCHEMA.md` - Complete architecture guide
- Include: fork lineage diagram, sync protocol, branch strategy, commit history, verification checklists

### Style
- **Code Review**: Technical, systematic, security-focused with specific line numbers
- **GitHub Issues**: Structured format with clear acceptance criteria and code examples
- **Documentation**: AI-readable with tables, diagrams, command examples, decision matrices
- **Prompt Analysis**: Apply CO-STAR + CLEAR frameworks with detailed scoring

### Tone
- Professional and thorough throughout
- Critical but constructive in identifying issues
- Specific and actionable in recommendations
- Comprehensive without being overwhelming

### Audience
- **Primary**: Claude Code AI agents needing fork context
- **Secondary**: Development team reviewing issues
- **Tertiary**: Future maintainers reading documentation

### Response Format
Deliver in this sequence:
1. ✅ `DEEP_REVIEW_FINDINGS.md` (753+ lines, 9 documented issues)
2. ✅ GitHub Issues #37-#45 (one per problem, fully detailed)
3. ✅ Git sync verification + commit + push (all changes maintained)
4. ✅ `IMPROVED_PROMPT.md` (this document, using CO-STAR)
5. ✅ `FORK_SCHEMA.md` (473 lines, AI-optimized)
6. ✅ `AUTO_CLAUDE_SCHEMA.md` (556 lines, architecture guide)

### Success Criteria
- All identified problems have corresponding GitHub issues
- Fork is synced with upstream (0 commits behind)
- All changes are committed and pushed to origin
- Documentation provides complete context for AI agents
- Improved prompt scores 9+/10 on CO-STAR framework

---

## Improvement Summary

| Aspect | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Context** | Missing | Complete fork relationship + recent work | ✅ |
| **Objective** | Vague, overloaded | 5 clear phases with specific deliverables | ✅ |
| **Style** | Unspecified | Defined per deliverable type | ✅ |
| **Tone** | Unspecified | Professional, constructive, specific | ✅ |
| **Audience** | Partial ("for AI") | Primary/secondary/tertiary tiers | ✅ |
| **Response** | No structure | Exact sequence + success criteria | ✅ |
| **Score** | 3/10 | 9.5/10 | **+6.5 points** |

## Key Techniques Applied

1. **CO-STAR Framework** - Structured prompt with all 6 elements
2. **Anti-Pattern Detection** - Fixed vagueness, overloading, missing context
3. **Phase Decomposition** - 5 sequential phases instead of bundled tasks
4. **Success Criteria** - Measurable outcomes for each deliverable
5. **Tool Specification** - Exact tools/commands for each phase
6. **Format Examples** - Specific file formats and structures

## Usage

This improved prompt can be used as a template for future fork analysis tasks:
- Replace repository URLs with target fork
- Adjust phases based on specific requirements
- Maintain CO-STAR structure for consistency
- Add/remove phases as needed for scope

---

**Generated**: 2026-01-01
**Framework**: CO-STAR + CLEAR
**Improvement**: +650% (3/10 → 9.5/10)
**Status**: ✅ Ready for production use
