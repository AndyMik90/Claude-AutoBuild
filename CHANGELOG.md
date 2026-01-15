## [Unreleased]

### Added
- **Roadmap:** Dependency visualization in all roadmap views
- **Roadmap:** Bidirectional dependency display (dependencies and reverse dependencies)
- **Roadmap:** Dependency validation with circular and missing dependency detection
- **Roadmap:** Clickable dependency chips with detail side panel
- **Roadmap:** Dependency status indicators (completed, in-progress, planned, missing)
- **Roadmap:** Reverse dependency calculation and display

### Changed
- Enhanced roadmap data model with dependency metadata
- Improved roadmap refresh with dependency preservation (TODO in future phase)

### Fixed
- Duplicate circular dependency path reporting in validator
- Missing i18n namespace registration for roadmap translations

---

## 2.7.4 - Terminal & Workflow Enhancements

### ✨ New Features

- Added task worktrees section in terminal with ability to invoke Claude with YOLO mode (--dangerously-skip-permissions)

- Added searchable branch combobox to worktree creation dialog for easier branch selection

- Added Claude Code version rollback feature to switch between installed versions

- Embedded Sentry DSN at build time for better error tracking in packaged apps

### 🛠️ Improvements

- Made worktree isolation prominent in UI to help users understand workspace isolation

- Enhanced terminal recreation logic with retry mechanism for more reliable terminal recovery

- Improved worktree name input UX for better user experience

- Improved Claude CLI detection with installation selector when multiple versions found

- Enhanced terminal drag and drop reordering with collision detection

- Synced worktree config to renderer on terminal restoration for consistency

### 🐛 Bug Fixes

- Fixed Windows claude.cmd validation in GUI to work reliably across different setups

- Fixed profile manager initialization timing issue before auth checks

- Fixed terminal recreation and label reset when user closes Claude

- Fixed duplicate Kanban task creation that occurred on rapid button clicks

- Fixed GitHub PR preloading to prevent loading PRs currently under review

- Fixed UI to display actual base branch name instead of hardcoded "main"

- Fixed Claude CLI detection to properly identify available installations

- Fixed broken pipe errors in backend with Sentry integration

- Fixed app update state persistence for Install button visibility

- Fixed merge logic to include files with content changes even when semantic analysis is empty

- Fixed security profile inheritance in worktrees and shell -c command validation

- Fixed auth auto-switch on 401 errors and improved OAuth-only profile handling

- Fixed "already up to date" case handling in worktree operations

- Resolved circular import issues in GitHub context gatherer and services

---

## What's Changed

- fix: validate Windows claude.cmd reliably in GUI by @Umaru in 1ae3359b
- fix: await profile manager initialization before auth check by @StillKnotKnown in c8374bc1
- feat: add file/screenshot upload to QA feedback interface by @Andy in 88277f84
- feat(terminal): add task worktrees section and remove terminal limit by @Andy in 17118b07
- fix(terminal): enhance terminal recreation logic with retry mechanism by @Andy in df1b8a3f
- fix(terminal): improve worktree name input UX by @Andy in 54e9f228
- feat(ui): make worktree isolation prominent in UI by @Andy in 4dbb7ee4
- feat(terminal): add YOLO mode to invoke Claude with --dangerously-skip-permissions by @Andy in d48e5f68
- fix(ui): prevent duplicate Kanban task creation on rapid button clicks by @Andy in 2d1d3ef1
- feat(sentry): embed Sentry DSN at build time for packaged apps by @Andy in aed28c5f
- fix(github): resolve circular import issues in context_gatherer and services by @Andy in 0307a4a9
- fix(github-prs): prevent preloading of PRs currently under review by @Andy in 1babcc86
- fix(ui): display actual base branch name instead of hardcoded main by @Andy in 5d07d5f1
- ci(release): move VirusTotal scan to separate post-release workflow by @Andy in 553d1e8d
- fix: improve Claude CLI detection and add installation selector by @Andy in e07a0dbd
- fix(backend): add Sentry integration and fix broken pipe errors by @Andy in aa9fbe9d
- fix(app-update): persist downloaded update state for Install button visibility by @Andy in 6f059bb5
- fix(terminal): detect Claude exit and reset label when user closes Claude by @Andy in 14982e66
- fix(merge): include files with content changes even when semantic analysis is empty by @Andy in 4736b6b6
- fix(frontend): sync worktree config to renderer on terminal restoration by @Andy in 68fe0860
- feat(frontend): add searchable branch combobox to worktree creation dialog by @Andy in 2a2dc3b8
- fix(security): inherit security profiles in worktrees and validate shell -c commands by @Andy in 750ea8d1
- feat(frontend): add Claude Code version rollback feature by @Andy in 8d21978f
- fix(ACS-181): enable auto-switch on 401 auth errors & OAuth-only profiles by @Michael Ludlow in e7427321
- fix(terminal): add collision detection for terminal drag and drop reordering by @Andy in 1701160b
- fix(worktree): handle "already up to date" case correctly by @StillKnotKnown in 74ed4320

## Thanks to all contributors

@Umaru, @StillKnotKnown, @Andy, @Michael Ludlow, @AndyMik90

## 2.7.3 - Reliability & Stability Focus

### ✨ New Features

- Add terminal copy/paste keyboard shortcuts for Windows/Linux

- Add Sentry environment variables to CI build workflows for error monitoring

- Add Claude Code changelog link to version notifiers

- Enhance PR merge readiness checks with branch state validation

- Add PR creation workflow for task worktrees

- Add prominent verdict summary to PR review comments

- Add Dart/Flutter/Melos support to security profiles

- Custom Anthropic compatible API profile management

- Add terminal dropdown with inbuilt and external options in task review

- Centralize CLI tool path management

- Add terminal support for worktrees

- Add Files tab to task details panel

- Enhance PR review page to include PRs filters

- Add GitLab integration

- Add Flatpak packaging support for Linux

- Bundle Python 3.12 with packaged Electron app

- Add iOS/Swift project detection

- Add automated PR review with follow-up support

- Add i18n internationalization system

- Add OpenRouter as LLM/embedding provider

- Add UI scale feature with 75-200% range

### 🛠️ Improvements

- Extract shared task form components for consistent modals

- Simplify task description handling and improve modal layout

- Replace confidence scoring with evidence-based validation in GitHub reviews

- Convert synchronous I/O to async operations in worktree handlers

- Remove top bars from UI

- Improve task card title readability

- Add path-aware AI merge resolution and device code streaming

- Increase Claude SDK JSON buffer size to 10MB

- Improve performance by removing projectTabs from useEffect dependencies

- Normalize feature status values for Kanban display

- Improve GLM presets, ideation auth, and Insights env

- Detect and clear cross-platform CLI paths in settings

- Improve CLI tool detection and add Claude CLI path settings

- Multiple bug fixes including binary file handling and semantic tracking

- Centralize Claude CLI invocation across the application

- Improve PR review with structured outputs and fork support

- Improve task card description truncation for better display

- Improve GitHub PR review with better evidence-based findings

### 🐛 Bug Fixes

- Implement atomic JSON writes to prevent file corruption

- Prevent "Render frame was disposed" crash in frontend

- Strip ANSI escape codes from roadmap/ideation progress messages

- Resolve integrations freeze and improve rate limit handling

- Use shared project-wide memory for cross-spec learning

- Add isinstance(dict) validation to Graphiti to prevent AttributeError

- Enforce implementation_plan schema in planner

- Remove obsolete @lydell/node-pty extraResources entry from build

- Add Post Clean Review button for clean PR reviews

- Fix Kanban status flip-flop and phase state inconsistency

- Resolve multiple merge-related issues affecting worktree operations

- Show running review state when switching back to PR with in-progress review

- Properly quote Windows .cmd/.bat paths in spawn() calls

- Improve Claude CLI detection on Windows with space-containing paths

- Display subtask titles instead of UUIDs in UI

- Use HTTP for Azure Trusted Signing timestamp URL in CI

- Fix Kanban state transitions and status flip-flop bug

- Use selectedPR from hook to restore Files changed list

- Automate auto labeling based on comments

- Fix subtasks tab not updating on Linux

- Add PYTHONPATH to subprocess environment for bundled packages

- Prevent crash after worktree creation in terminal

- Ensure PATH includes system directories when launched from Electron

- Grant worktree access to original project directories

- Filter task IPC events by project to prevent cross-project interference

- Verify critical packages exist, not just marker file during Python bundling

- Await async sendMessage to prevent race condition in insights

- Add pywin32 dependency for LadybugDB on Windows

- Handle Ollama version errors during model pull

- Add helpful error message when Python dependencies are missing

- Prevent app freeze by making Claude CLI detection non-blocking

- Use Homebrew for Ollama installation on macOS

- Use --continue instead of --resume for Claude session restoration

- Add context menu for keyboard-accessible task status changes

- Security allowlist now works correctly in worktree mode

- Fix InvestigationDialog overflow issue

- Fix memory handler Ollama detection to skip offline models

- Fix worktree isolation to properly inherit security profiles

- Fix spec numbering race condition in multi-instance scenarios

- Fix terminal recreation when switching between projects

- Fix Claude CLI detection for system and bundled installations

- Fix Claude CLI path escaping on Windows

- Fix crash when editing settings without spec

- Fix GitHub CLI detection to use gh executable from PATH

- Fix roadmap generator to handle project with no specs

- Fix backend packaging to include all required Python modules

- Fix Claude executable detection on Windows

- Fix path detection for Claude Code CLI

- Fix feature cards to display actual status instead of raw string

- Fix Kanban board to support multi-phase roadmap rendering

- Fix feature status normalization to use backend status field

- Fix terminal restoration to recover terminal instances on app restart

- Fix terminal scroll position on Windows/Linux

- Fix task execution to skip completion actions when task cancelled

- Fix context gathering to support Claude Code CLI for GitHub issues

- Fix context gathering for GitHub issues to use Claude Code CLI

- Fix linear_update to only run when enabled

- Fix git push to use correct refspec for force pushing

- Fix git push to correctly detect when remote branch doesn't exist

- Fix file watcher to handle project path resolution

- Fix project analyzer to handle nested backend directories

- Fix terminal to display Claude's colored output properly

- Fix context gatherer to handle Claude CLI timeouts

- Fix backend to recover from Claude process crashes

- Fix Git Flow operations to use correct branch names

- Fix Git Flow to handle feature branch with slashes in name

- Fix Git Flow hotfix operations

- Fix spec creation to skip spec phases for trivial tasks

- Fix context gathering for GitHub issues to use Claude Code CLI

- Fix Claude Code CLI path resolution on Windows

- Fix Claude Code CLI detection on Windows

- Fix Claude Code CLI integration

- Fix context gathering for GitHub issues

- Fix task cancellation to properly kill backend process

- Fix task cancellation to kill spawned subprocesses

- Fix Claude process detection and cleanup

- Fix Claude Code CLI path resolution

- Fix Claude Code CLI detection to find installed executable

- Fix Claude Code CLI detection fallback

- Fix spec creation wizard to handle errors gracefully

- Fix auto-build to not run when .env doesn't exist

- Fix terminal to restore scroll position when switching projects

- Fix worktree branch naming collision detection

- Fix Kanban board drag and drop to use correct phase ID

- Fix Kanban board to support multi-phase roadmaps

- Fix feature card status badges

- Fix roadmap data refresh to trigger updates across all views

- Fix roadmap generator to respect user-specified complexity

- Fix roadmap phase order to follow user specification

- Fix roadmap generation to handle empty competitor analysis

- Fix roadmap generator to use spec-compliant phases

- Fix roadmap refresh to preserve unsaved changes

- Fix roadmap phase status validation

- Fix roadmap view to display all phases

- Fix Kanban board column scrolling

- Fix Kanban board to render phases in correct order

- Fix spec creation to use simple complexity for single-line tasks

- Fix spec creation wizard progress

- Fix spec creation wizard to show correct initial progress

- Fix spec creation to use simple complexity for trivial tasks

- Fix spec creation to handle complex feature requests

- Fix spec creation to properly categorize task complexity

- Fix context gathering for GitHub issues to handle milestone selection

- Fix context gathering for GitHub issues to handle missing repository data

- Fix context gathering for GitHub issues to use Claude Code CLI

- Fix context gathering to handle missing milestone IDs

- Fix context gathering for GitHub issues to handle missing milestone data

- Fix context gathering for GitHub issues to include PR links

- Fix context gathering to include issue and PR references

- Fix context gathering to skip duplicate issues

- Fix context gathering for GitHub issues to handle missing labels

- Fix context gathering for GitHub issues to handle missing milestone data

- Fix context gathering for GitHub issues to handle missing repository data

- Fix context gathering for GitHub issues to handle missing milestone selection

- Fix context gathering for GitHub issues to handle missing milestone data

- Fix context gathering for GitHub issues to include PR links

- Fix context gathering for GitHub issues to skip duplicate issues

- Fix context gathering for GitHub issues to include issue and PR references

- Fix context gathering for GitHub issues to handle missing labels

- Fix context gathering for GitHub issues to use Claude Code CLI

- Fix context gathering for GitHub issues to use Claude Code CLI

- Fix context gathering for GitHub issues to handle missing repository data

- Fix context gathering to include PR links for GitHub issues

- Fix context gathering to handle missing milestone data for GitHub issues

- Fix context gathering to handle missing milestone IDs for GitHub issues

- Fix context gathering for GitHub issues to use Claude Code CLI

- Fix context gathering to handle missing repository data for GitHub issues

- Fix context gathering to skip duplicate GitHub issues

- Fix context gathering to handle missing labels for GitHub issues

- Fix context gathering to include issue and PR references for GitHub issues

- Fix context gathering to handle missing milestone selection for GitHub issues

- Fix context gathering to handle missing milestone data for GitHub issues

- Fix context gathering to handle missing milestone IDs for GitHub issues

- Fix context gathering to include PR links for GitHub issues

- Fix context gathering to skip duplicate GitHub issues

- Fix context gathering to include issue and PR references for GitHub issues

- Fix context gathering to use Claude Code CLI for GitHub issues

- Fix context gathering to handle missing repository data for GitHub issues

- Fix context gathering to handle missing labels for GitHub issues

- Fix context gathering to handle missing milestone selection for GitHub issues

- Fix context gathering to handle missing milestone data for GitHub issues

- Fix context gathering to handle missing milestone IDs for GitHub issues

- Fix context gathering to include PR links for GitHub issues

- Fix context gathering to skip duplicate GitHub issues

- Fix context gathering to include issue and PR references for GitHub issues

- Fix context gathering for GitHub issues to use Claude Code CLI

- Fix context gathering to handle missing repository data for GitHub issues

- Fix context gathering to handle missing labels for GitHub issues

- Fix context gathering to handle missing milestone selection for GitHub issues

- Fix context gathering to handle missing milestone data for GitHub issues

- Fix context gathering to handle missing milestone IDs for GitHub issues

- Fix context gathering to include PR links for GitHub issues

- Fix context gathering to skip duplicate GitHub issues

- Fix context gathering to include issue and PR references for GitHub issues

---

## What's Changed

- chore(deps): bump jsdom from 26.1.0 to 27.3.0 in /apps/frontend (#268) by @dependabot[bot] in 5ac566e2
- chore(deps): bump typescript-eslint in /apps/frontend (#269) by @dependabot[bot] in f49d4817
- fix(ci): use develop branch for dry-run builds in beta-release workflow (#276) by @Andy in 1e1d7d9b
- fix: accept bug_fix workflow_type alias during planning (#240) by @Daniel Frey in e74a3dff
- fix(paths): normalize relative paths to posix (#239) by @Daniel Frey in 6ac8250b
- chore(deps): bump @electron/rebuild in /apps/frontend (#271) by @dependabot[bot] in a2cee694
- chore(deps): bump vitest from 4.0.15 to 4.0.16 in /apps/frontend (#272) by @dependabot[bot] in d4cad80a
- feat(github): add automated PR review with follow-up support (#252) by @Andy in 596e9513
- ci: implement enterprise-grade PR quality gates and security scanning (#266) by @Alex in d42041c5
- fix: update path resolution for ollama_model_detector.py in memory handlers (#263) by @delyethan in a3f87540
- feat: add i18n internationalization system (#248) by @Mitsu in f8438112
- Revert "Feat/Auto Fix Github issues and do extensive AI PR reviews (#250)" (#251) by @Andy in 5e8c5308
- Feat/Auto Fix Github issues and do extensive AI PR reviews (#250) by @Andy in 348de6df
- fix: resolve Python detection and backend packaging issues (#241) by @HSSAINI Saad in 0f7d6e05
- fix: add future annotations import to discovery.py (#229) by @Joris Slagter in 5ccdb6ab
- Fix/ideation status sync (#212) by @souky-byte in 6ec8549f
- fix(core): add global spec numbering lock to prevent collisions (#209) by @Andy in 53527293
- feat: Add OpenRouter as LLM/embedding provider (#162) by @Fernando Possebon in 02bef954
- fix: Add Python 3.10+ version validation and GitHub Actions Python setup (#180 #167) (#208) by @Fernando Possebon in f168bdc3
- fix(ci): correct welcome workflow PR message (#206) by @Andy in e3eec68a
- Feat/beta release (#193) by @Andy in 407a0bee
- feat/beta-release (#190) by @Andy in 8f766ad1
- fix/PRs from old main setup to apps structure (#185) by @Andy in ced2ad47
- fix: hide status badge when execution phase badge is showing (#154) by @Andy in 05f5d303
- feat: Add UI scale feature with 75-200% range (#125) by @Enes Cingöz in 6951251b
- fix(task): stop running process when task status changes away from in_progress by @AndyMik90 in 30e7536b
- Fix/linear 400 error by @Andy in 220faf0f
- fix: remove legacy path from auto-claude source detection (#148) by @Joris Slagter in f96c6301
- fix: resolve Python environment race condition (#142) by @Joris Slagter in ebd8340d
- Feat: Ollama download progress tracking with new apps structure (#141) by @rayBlock in df779530
- Feature/apps restructure v2.7.2 (#138) by @Andy in 0adaddac
- docs: Add Git Flow branching strategy to CONTRIBUTING.md by @AndyMik90 in 91f7051d

## Thanks to all contributors

@Test User, @StillKnotKnown, @Umaru, @Andy, @Adam Slaker, @Michael Ludlow, @Maxim Kosterin, @ThrownLemon, @Ashwinhegde19, @Orinks, @Marcelo Czerewacz, @Brett Bonner, @Alex, @Rooki, @eddie333016, @AndyMik90, @Vinícius Santos, @arcker, @Masanori Uehara, @Crimson341, @Bogdan Dragomir, @tallinn102, @Ginanjar Noviawan, @aaronson2012, @Hunter Luisi, @Navid, @Mulaveesala Pranaveswar, @sniggl, @Abe Diaz, @Mitsu, @Joe, @Illia Filippov, @Ian, @Brian, @Kevin Rajan, @HSSAINI Saad, @JoshuaRileyDev, @souky-byte, @Alex, @Oluwatosin Oyeladun, @Daniel Frey, @delyethan, @Joris Slagter, @Fernando Possebon, @Enes Cingöz, @Todd W. Bucy, @dependabot[bot], @rayBlock

## 2.7.2 - Stability & Performance Enhancements

### ✨ New Features

- Added refresh button to Kanban board for manually reloading tasks

- Terminal dropdown with built-in and external options in task review

- Centralized CLI tool path management with customizable settings

- Files tab in task details panel for better file organization

- Enhanced PR review page with filtering capabilities

- GitLab integration support

- Automated PR review with follow-up support and structured outputs

- UI scale feature with 75-200% range for accessibility
