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

- Python 3.12 bundled with packaged Electron app

- OpenRouter support as LLM/embedding provider

- Internationalization (i18n) system for multi-language support

- Flatpak packaging support for Linux

- Path-aware AI merge resolution with device code streaming

### 🛠️ Improvements

- Improved terminal experience with persistent state when switching projects

- Enhanced PR review with structured outputs and fork support

- Better UX for display and scaling changes

- Convert synchronous I/O to async operations in worktree handlers

- Enhanced logs for commit linting stage

- Remove top navigation bars for cleaner UI

- Enhanced PR detail area visual design

- Improved CLI tool detection with more language support

- Added iOS/Swift project detection

- Optimize performance by removing projectTabs from useEffect dependencies

- Improved Python detection and version validation for compatibility

### 🐛 Bug Fixes

- Fixed CI Python setup and PR status gate checks

- Fixed cross-platform CLI path detection and clearing in settings

- Preserve original task description after spec creation

- Fixed learning loop to retrieve patterns and gotchas from memory

- Resolved frontend lag and updated dependencies

- Fixed Content-Security-Policy to allow external HTTPS images

- Fixed PR review isolation by using temporary worktree

- Fixed Homebrew Python detection to prefer versioned Python over system python3

- Added support for Bun 1.2.0+ lock file format detection

- Fixed infinite re-render loop in task selection

- Fixed infinite loop in task detail merge preview loading

- Resolved Windows EINVAL error when opening worktree in VS Code

- Fixed fallback to prevent tasks stuck in ai_review status

- Fixed SDK permissions to include spec_dir

- Added --base-branch argument support to spec_runner

- Allow Windows to run CC PR Reviewer

- Fixed model selection to respect task_metadata.json

- Improved GitHub PR review by passing repo parameter explicitly

- Fixed electron-log imports with .js extension

- Fixed Swift detection order in project analyzer

- Prevent TaskEditDialog from unmounting when opened

- Fixed subprocess handling for Python paths with spaces

- Fixed file system race conditions and unused variables in security scanning

- Resolved Python detection and backend packaging issues

- Fixed version-specific links in README and pre-commit hooks

- Fixed task status persistence reverting on refresh

- Proper semver comparison for pre-release versions

- Use virtual environment Python for all services to fix dotenv errors

- Fixed explicit Windows System32 tar path for builds

- Added augmented PATH environment to all GitHub CLI calls

- Use PowerShell for tar extraction on Windows

- Added --force-local flag to tar on Windows

- Stop tracking spec files in git

- Fixed GitHub API calls with explicit GET method for comment fetches

- Support archiving tasks across all worktree locations

- Validated backend source path before using it

- Resolved spawn Python ENOENT error on Linux

- Fixed CodeQL alerts for uncontrolled command line

- Resolved GitHub follow-up review API issues

- Fixed relative path normalization to POSIX format

- Accepted bug_fix workflow_type alias during planning

- Added global spec numbering lock to prevent collisions

- Fixed ideation status sync

- Stopped running process when task status changes away from in_progress

- Removed legacy path from auto-claude source detection

- Resolved Python environment race condition

---

## What's Changed

- fix(ci): add Python setup to beta-release and fix PR status gate checks (#565) by @Andy in c2148bb9
- fix: detect and clear cross-platform CLI paths in settings (#535) by @Andy in 29e45505
- fix(ui): preserve original task description after spec creation (#536) by @Andy in 7990dcb4
- fix(memory): fix learning loop to retrieve patterns and gotchas (#530) by @Andy in f58c2578
- fix: resolve frontend lag and update dependencies (#526) by @Andy in 30f7951a
- feat(kanban): add refresh button to manually reload tasks (#548) by @Adryan Serage in 252242f9
- fix(csp): allow external HTTPS images in Content-Security-Policy (#549) by @Michael Ludlow in 3db02c5d
- fix(pr-review): use temporary worktree for PR review isolation (#532) by @Andy in 344ec65e
- fix: prefer versioned Homebrew Python over system python3 (#494) by @Navid in 8d58dd6f
- fix(detection): support bun.lock text format for Bun 1.2.0+ (#525) by @Andy in 4da8cd66
- chore: bump version to 2.7.2-beta.12 (#460) by @Andy in 8e5c11ac
- Fix/windows issues (#471) by @Andy in 72106109
- fix(ci): add Rust toolchain for Intel Mac builds (#459) by @Andy in 52a4fcc6
- fix: create spec.md during roadmap-to-task conversion (#446) by @Mulaveesala Pranaveswar in fb6b7fc6
- fix(pr-review): treat LOW-only findings as ready to merge (#455) by @Andy in 0f9c5b84
- Fix/2.7.2 beta12 (#424) by @Andy in 5d8ede23
- feat: remove top bars (#386) by @Vinícius Santos in da31b687
- fix: prevent infinite re-render loop in task selection useEffect (#442) by @Abe Diaz in 2effa535
- fix: accept Python 3.12+ in install-backend.js (#443) by @Abe Diaz in c15bb311
- fix: infinite loop in useTaskDetail merge preview loading (#444) by @Abe Diaz in 203a970a
- fix(windows): resolve EINVAL error when opening worktree in VS Code (#434) by @Vinícius Santos in 3c0708b7
- feat(frontend): Add Files tab to task details panel (#430) by @Mitsu in 666794b5
- refactor: remove deprecated TaskDetailPanel component (#432) by @Mitsu in ac8dfcac
- fix(ui): add fallback to prevent tasks stuck in ai_review status (#397) by @Michael Ludlow in 798ca79d
- feat: Enhance the look of the PR Detail area (#427) by @Alex in bdb01549
- ci: remove conventional commits PR title validation workflow by @AndyMik90 in 515b73b5
- fix(client): add spec_dir to SDK permissions (#429) by @Mitsu in 88c76059
- fix(spec_runner): add --base-branch argument support (#428) by @Mitsu in 62a75515
- feat: enhance pr review page to include PRs filters (#423) by @Alex in 717fba04
- feat: add gitlab integration (#254) by @Mitsu in 0a571d3a
- fix: Allow windows to run CC PR Reviewer (#406) by @Alex in 2f662469
- fix(model): respect task_metadata.json model selection (#415) by @Andy in e7e6b521
- feat(build): add Flatpak packaging support for Linux (#404) by @Mitsu in 230de5fc
- fix(github): pass repo parameter to GHClient for explicit PR resolution (#413) by @Andy in 4bdf7a0c
- chore(ci): remove redundant CLA GitHub Action workflow by @AndyMik90 in a39ea49d
- fix(frontend): add .js extension to electron-log/main imports by @AndyMik90 in 9aef0dd0
- fix: 2.7.2 bug fixes and improvements (#388) by @Andy in 05131217
- fix(analyzer): move Swift detection before Ruby detection (#401) by @Michael Ludlow in 321c9712
- fix(ui): prevent TaskEditDialog from unmounting when opened (#395) by @Michael Ludlow in 98b12ed8
- fix: improve CLI tool detection and add Claude CLI path settings (#393) by @Joe in aaa83131
- feat(analyzer): add iOS/Swift project detection (#389) by @Michael Ludlow in 68548e33
- fix(github): improve PR review with structured outputs and fork support (#363) by @Andy in 7751588e
- fix(ideation): update progress calculation to include just-completed ideation type (#381) by @Illia Filippov in 8b4ce58c
- Fixes failing spec - "gh CLI Check Handler - should return installed: true when gh CLI is found" (#370) by @Ian in bc220645
- fix: Memory Status card respects configured embedding provider (#336) (#373) by @Michael Ludlow in db0cbea3
- fix: fixed version-specific links in readme and pre-commit hook that updates them (#378) by @Ian in 0ca2e3f6
- docs: add security research documentation (#361) by @Brian in 2d3b7fb4
- fix/Improving UX for Display/Scaling Changes (#332) by @Kevin Rajan in 9bbdef09
- fix(perf): remove projectTabs from useEffect deps to fix re-render loop (#362) by @Michael Ludlow in 753dc8bb
- fix(security): invalidate profile cache when file is created/modified (#355) by @Michael Ludlow in 20f20fa3
- fix(subprocess): handle Python paths with spaces (#352) by @Michael Ludlow in eabe7c7d
- fix: Resolve pre-commit hook failures with version sync, pytest path, ruff version, and broken quality-dco workflow (#334) by @Ian in 1fa7a9c7
- fix(terminal): preserve terminal state when switching projects (#358) by @Andy in 7881b2d1
- fix(analyzer): add C#/Java/Swift/Kotlin project files to security hash (#351) by @Michael Ludlow in 4e71361b
- fix: make backend tests pass on Windows (#282) by @Oluwatosin Oyeladun in 4dcc5afa
- fix(ui): close parent modal when Edit dialog opens (#354) by @Michael Ludlow in e9782db0
- chore: bump version to 2.7.2-beta.10 by @AndyMik90 in 40d04d7c
- feat: add terminal dropdown with inbuilt and external options in task review (#347) by @JoshuaRileyDev in fef07c95
- refactor: remove deprecated code across backend and frontend (#348) by @Mitsu in 9d43abed
- feat: centralize CLI tool path management (#341) by @HSSAINI Saad in d51f4562
- refactor(components): remove deprecated TaskDetailPanel re-export (#344) by @Mitsu in 787667e9
- chore: Refactor/kanban realtime status sync (#249) by @souky-byte in 9734b70b
- refactor(settings): remove deprecated ProjectSettings modal and hooks (#343) by @Mitsu in fec6b9f3
- perf: convert synchronous I/O to async operations in worktree handlers (#337) by @JoshuaRileyDev in d3a63b09
- feat: bump version (#329) by @Alex in 50e3111a
- fix(ci): remove version bump to fix branch protection conflict (#325) by @Michael Ludlow in 8a80b1d5
- fix(tasks): sync status to worktree implementation plan to prevent reset (#243) (#323) by @Alex in cb6b2165
- fix(ci): add auto-updater manifest files and version auto-update (#317) by @Michael Ludlow in 661e47c3
- fix(project): fix task status persistence reverting on refresh (#246) (#318) by @Michael Ludlow in e80ef79d
- fix(updater): proper semver comparison for pre-release versions (#313) by @Michael Ludlow in e1b0f743
- fix(python): use venv Python for all services to fix dotenv errors (#311) by @Alex in 92c6f278
- chore(ci): cancel in-progress runs (#302) by @Oluwatosin Oyeladun in 1c142273
- fix(build): use explicit Windows System32 tar path (#308) by @Andy in c0a02a45
- fix(github): add augmented PATH env to all gh CLI calls by @AndyMik90 in 086429cb
- fix(build): use PowerShell for tar extraction on Windows by @AndyMik90 in d9fb8f29
- fix(build): add --force-local flag to tar on Windows (#303) by @Andy in d0b0b3df
- fix: stop tracking spec files in git (#295) by @Andy in 937a60f8
- Fix/2.7.2 fixes (#300) by @Andy in 7a51cbd5
- feat(merge,oauth): add path-aware AI merge resolution and device code streaming (#296) by @Andy in 26beefe3
- feat: enhance the logs for the commit linting stage (#293) by @Alex in 8416f307
- fix(github): add explicit GET method to gh api comment fetches (#294) by @Andy in 217249c8
- fix(frontend): support archiving tasks across all worktree locations (#286) by @Andy in 8bb3df91
- Potential fix for code scanning alert no. 224: Uncontrolled command line (#285) by @Andy in 5106c6e9
- fix(frontend): validate backend source path before using it (#287) by @Andy in 3ff61274
- feat(python): bundle Python 3.12 with packaged Electron app (#284) by @Andy in 7f19c2e1
- fix: resolve spawn python ENOENT error on Linux by using getAugmentedEnv() (#281) by @Todd W. Bucy in d98e2830
- fix(ci): add write permissions to beta-release update-version job by @AndyMik90 in 0b874d4b
- chore(deps): bump @xterm/xterm from 5.5.0 to 6.0.0 in /apps/frontend (#270) by @dependabot[bot] in 50dd1078
- fix(github): resolve follow-up review API issues by @AndyMik90 in f1cc5a09
- fix(security): resolve CodeQL file system race conditions and unused variables (#277) by @Andy in b005fa5c
- fix(ci): use correct electron-builder arch flags (#278) by @Andy in d79f2da4
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

@Andy, @Adryan Serage, @Michael Ludlow, @Navid, @Mulaveesala Pranaveswar, @Vinícius Santos, @Abe Diaz, @Mitsu, @Alex, @AndyMik90, @Joe, @Illia Filippov, @Ian, @Brian, @Kevin Rajan, @Oluwatosin Oyeladun, @JoshuaRileyDev, @HSSAINI Saad, @souky-byte, @Todd W. Bucy, @dependabot[bot], @Daniel Frey, @delyethan, @Joris Slagter, @Fernando Possebon, @Enes Cingöz, @rayBlock

## 2.7.1 - Build Pipeline Enhancements

### 🛠️ Improvements

- Enhanced VirusTotal scan error handling in release workflow with graceful failure recovery and improved reporting visibility

- Refactored macOS build workflow to support both Intel and ARM64 architectures with notarization for Intel builds and improved artifact handling

- Streamlined CI/CD processes with updated caching strategies and enhanced error handling for external API interactions

### 📚 Documentation

- Clarified README documentation

---

## What's Changed

- chore: Enhance VirusTotal scan error handling in release workflow by @AndyMik90 in d23fcd8

- chore: Refactor macOS build workflow to support Intel and ARM64 architectures by @AndyMik90 in 326118b

- docs: readme clarification by @AndyMik90 in 6afcc92

- fix: version by @AndyMik90 in 2c93890

## Thanks to all contributors

@AndyMik90

## 2.7.0 - Tab Persistence & Memory System Modernization

### ✨ New Features

- Project tab bar with persistent tab management and GitHub organization initialization on project creation

- Task creation enhanced with @ autocomplete for agent profiles and improved drag-and-drop support

- Keyboard shortcuts and tooltips added to project tabs for better navigation

- Agent task restart functionality with new profile support for flexible task recovery

- Ollama embedding model support with automatic dimension detection for self-hosted deployments

### 🛠️ Improvements

- Memory system completely redesigned with embedded LadybugDB, eliminating Docker/FalkorDB dependency and improving performance

- Tab persistence implemented via IPC-based mechanism for reliable session state management

- Terminal environment improved by using virtual environment Python for proper terminal name generation

- AI merge operations timeout increased from 2 to 10 minutes for reliability with larger changes

- Merge operations now use stored baseBranch metadata for consistent branch targeting

- Memory configuration UI simplified and rebranded with improved Ollama integration and detection

- CI/CD workflows enhanced with code signing support and automated release process

- Cross-platform compatibility improved by replacing Unix shell syntax with portable git commands

- Python venv created in userData for packaged applications to ensure proper environment isolation

### 🐛 Bug Fixes

- Task title no longer blocks edit/close buttons in UI

- Tab persistence and terminal shortcuts properly scoped to prevent conflicts

- Agent profile fallback corrected from 'Balanced' to 'Auto (Optimized)'

- macOS notarization made optional and improved with private artifact storage

- Embedding provider changes now properly detected during migration

- Memory query CLI respects user's memory enabled flag

- CodeRabbit review issues and linting errors resolved across codebase

- F-string prefixes removed from strings without placeholders

- Import ordering fixed for ruff compliance

- Preview panel now receives projectPath prop correctly for image component functionality

- Default database path unified to ~/.auto-claude/memories for consistency

- @lydell/node-pty build scripts compatibility improved for pnpm v10

---

## What's Changed

- feat(ui): add project tab bar from PR #101 by @AndyMik90 in c400fe9

- feat: improve task creation UX with @ autocomplete and better drag-drop by @AndyMik90 in 20d1487

- feat(ui): add keyboard shortcuts and tooltips for project tabs by @AndyMik90 in ed73265

- feat(agent): enhance task restart functionality with new profile support by @AndyMik90 in c8452a5

- feat: add Ollama embedding model support with auto-detected dimensions by @AndyMik90 in 45901f3

- feat(memory): replace FalkorDB with LadybugDB embedded database by @AndyMik90 in 87d0b52

- feat: add automated release workflow with code signing by @AndyMik90 in 6819b00

- feat: add embedding provider change detection and fix import ordering by @AndyMik90 in 36f8006

- fix(tests): update tab management tests for IPC-based persistence by @AndyMik90 in ea25d6e

- fix(ui): address CodeRabbit PR review issues by @AndyMik90 in 39ce754

- fix: address CodeRabbit review issues by @AndyMik90 in 95ae0b0

- fix: prevent task title from blocking edit/close buttons by @AndyMik90 in 8a0fb26

- fix: use venv Python for terminal name generation by @AndyMik90 in 325cb54

- fix(merge): increase AI merge timeout from 2 to 10 minutes by @AndyMik90 in 4477538

- fix(merge): use stored baseBranch from task metadata for merge operations by @AndyMik90 in 8d56474

- fix: unify default database path to ~/.auto-claude/memories by @AndyMik90 in 684e3f9

- fix(ui): fix tab persistence and scope terminal shortcuts by @AndyMik90 in 2d1168b

- fix: create Python venv in userData for packaged apps by @AndyMik90 in b83377c

- fix(ui): change agent profile fallback from 'Balanced' to 'Auto (Optimized)' by @AndyMik90 in 385dcc1

- fix: check APPLE_ID in shell instead of workflow if condition by @AndyMik90 in 9eece01

- fix: allow @lydell/node-pty build scripts in pnpm v10 by @AndyMik90 in 1f6963f

- fix: use shell guard for notarization credentials check by @AndyMik90 in 4cbddd3

- fix: improve migrate_embeddings robustness and correctness by @AndyMik90 in 61f0238

- fix: respect user's memory enabled flag in query_memory CLI by @AndyMik90 in 45b2c83

- fix: save notarization logs to private artifact instead of public logs by @AndyMik90 in a82525d

- fix: make macOS notarization optional by @AndyMik90 in f2b7b56

- fix: add author email for Linux builds by @AndyMik90 in 5f66127

- fix: add GH_TOKEN and homepage for release workflow by @AndyMik90 in 568ea18

- fix(ci): quote GITHUB_OUTPUT for shell safety by @AndyMik90 in 1e891e1

- fix: address CodeRabbit review feedback by @AndyMik90 in 8e4b1da

- fix: update test and apply ruff formatting by @AndyMik90 in a087ba3

- fix: address additional CodeRabbit review comments by @AndyMik90 in 461fad6

- fix: sort imports in memory.py for ruff I001 by @AndyMik90 in b3c257d

- fix: address CodeRabbit review comments from PR #100 by @AndyMik90 in 1ed237a

- fix: remove f-string prefixes from strings without placeholders by @AndyMik90 in bcd453a

- fix: resolve remaining CI failures by @AndyMik90 in cfbccda

- fix: resolve all CI failures in PR #100 by @AndyMik90 in c493d6c

- fix(cli): update graphiti status display for LadybugDB by @AndyMik90 in 049c60c

- fix(ui): replace Unix shell syntax with cross-platform git commands by @AndyMik90 in 83aa3f0

- fix: correct model name and release workflow conditionals by @AndyMik90 in de41dfc

- style: fix ruff linting errors in graphiti queries by @AndyMik90 in 127559f

- style: apply ruff formatting to 4 files by @AndyMik90 in 9d5d075

- refactor: update memory test suite for LadybugDB by @AndyMik90 in f0b5efc

- refactor(ui): simplify reference files and images handling in task modal by @AndyMik90 in 1975e4d

- refactor: rebrand memory system UI and simplify configuration by @AndyMik90 in 2b3cd49

- refactor: replace Docker/FalkorDB with embedded LadybugDB for memory system by @AndyMik90 in 325458d

- docs: add CodeRabbit review response tracking by @AndyMik90 in 3452548

- chore: use GitHub noreply email for author field by @AndyMik90 in 18f2045

- chore: simplify notarization step after successful setup by @AndyMik90 in e4fe7cd

- chore: update CI and release workflows, remove changelog config by @AndyMik90 in 6f891b7

- chore: remove docker-compose.yml (FalkorDB no longer used) by @AndyMik90 in 68f3f06

- fix: Replace space with hyphen in productName to fix PTY daemon spawn (#65) by @Craig Van in 8f1f7a7

- fix: update npm scripts to use hyphenated product name by @AndyMik90 in 89978ed

- fix(ui): improve Ollama UX in memory settings by @AndyMik90 in dea1711

- auto-claude: subtask-1-1 - Add projectPath prop to PreviewPanel and implement custom img component by @AndyMik90 in e6529e0

- Project tab persistence and github org init on project creation by @AndyMik90 in ae1dac9

- Readme for installors by @AndyMik90 in 1855d7d

---

## Thanks to all contributors

@AndyMik90, @Craig Van

## 2.6.0 - Improved User Experience and Agent Configuration

### ✨ New Features

- Add customizable phase configuration in app settings, allowing users to tailor the AI build pipeline to their workflow

- Implement parallel AI merge functionality for faster integration of completed builds

- Add Google AI as LLM and embedding provider for Graphiti memory system

- Implement device code authentication flow with timeout handling, browser launch fallback, and comprehensive testing

### 🛠️ Improvements

- Move Agent Profiles from dashboard to Settings for better organization and discoverability

- Default agent profile to 'Auto (Optimized)' for streamlined out-of-the-box experience

- Enhance WorkspaceStatus component UI with improved visual design

- Refactor task management from sidebar to modal interface for cleaner navigation

- Add comprehensive theme system with multiple color schemes (Forest, Neo, Retro, Dusk, Ocean, Lime) and light/dark mode support

- Extract human-readable feature titles from spec.md for better task identification

- Improve task description display for specs with compact markdown formatting

### 🐛 Bug Fixes

- Fix asyncio coroutine creation in worker threads to properly support async operations

- Improve UX for phase configuration in task creation workflow

- Address CodeRabbit PR #69 feedback and additional review comments

- Fix auto-close behavior for task modal when marking tasks as done

- Resolve Python lint errors and import sorting issues (ruff I001 compliance)

- Ensure planner agent properly writes implementation_plan.json

- Add platform detection for terminal profile commands on Windows

- Set default selected agent profile to 'auto' across all users

- Fix display of correct merge target branch in worktree UI

- Add validation for invalid colorTheme fallback to prevent UI errors

- Remove outdated Sun/Moon toggle button from sidebar

---

## What's Changed

- feat: add customizable phase configuration in app settings by @AndyMik90 in aee0ba4

- feat: implement parallel AI merge functionality by @AndyMik90 in 458d4bb

- feat(graphiti): add Google AI as LLM and embedding provider by @adryserage in fe69106

- fix: create coroutine inside worker thread for asyncio.run by @AndyMik90 in f89e4e6

- fix: improve UX for phase configuration in task creation by @AndyMik90 in b9797cb

- fix: address CodeRabbit PR #69 feedback by @AndyMik90 in cc38a06

- fix: sort imports in workspace.py to pass ruff I001 check by @AndyMik90 in 9981ee4

- fix(ui): auto-close task modal when marking task as done by @AndyMik90 in 297d380

- fix: resolve Python lint errors in workspace.py by @AndyMik90 in 0506256

- refactor: move Agent Profiles from dashboard to Settings by @AndyMik90 in 1094990

- fix(planning): ensure planner agent writes implementation_plan.json by @AndyMik90 in 9ab5a4f

- fix(windows): add platform detection for terminal profile commands by @AndyMik90 in f0a6a0a

- fix: default agent profile to 'Auto (Optimized)' for all users by @AndyMik90 in 08aa2ff

- fix: update default selected agent profile to 'auto' by @AndyMik90 in 37ace0a

- style: enhance WorkspaceStatus component UI by @AndyMik90 in 3092155

- fix: display correct merge target branch in worktree UI by @AndyMik90 in 2b96160

- Improvement/refactor task sidebar to task modal by @AndyMik90 in 2a96f85

- fix: extract human-readable title from spec.md when feature field is spec ID by @AndyMik90 in 8b59375

- fix: task descriptions not showing for specs with compact markdown by @AndyMik90 in 7f12ef0

- Add comprehensive theme system with Forest, Neo, Retro, Dusk, Ocean, and Lime color schemes by @AndyMik90 in ba776a3, e2b24e2, 7589046, e248256, 76c1bd7, bcbced2

- Add ColorTheme type and configuration to app settings by @AndyMik90 in 2ca89ce, c505d6e, a75c0a9

- Implement device code authentication flow with timeout handling and fallback URL display by @AndyMik90 in 5f26d39, 81e1536, 1a7cf40, 4a4ad6b, 6a4c1b4, b75a09c, e134c4c

- fix(graphiti): address CodeRabbit review comments by @adryserage in 679b8cd

- fix(lint): sort imports in Google provider files by @adryserage in 1a38a06

## 2.6.0 - Multi-Provider Graphiti Support & Platform Fixes

### ✨ New Features

- **Google AI Provider for Graphiti**: Full Google AI (Gemini) support for both LLM and embeddings in the Memory Layer
  - Add GoogleLLMClient with gemini-2.0-flash default model
  - Add GoogleEmbedder with text-embedding-004 default model
  - UI integration for Google API key configuration with link to Google AI Studio
- **Ollama LLM Provider in UI**: Add Ollama as an LLM provider option in Graphiti onboarding wizard
  - Ollama runs locally and doesn't require an API key
  - Configure Base URL instead of API key for local inference
- **LLM Provider Selection UI**: Add provider selection dropdown to Graphiti setup wizard for flexible backend configuration
- **Per-Project GitHub Configuration**: UI clarity improvements for per-project GitHub org/repo settings

### 🛠️ Improvements

- Enhanced Graphiti provider factory to support Google AI alongside existing providers
- Updated env-handlers to properly populate graphitiProviderConfig from .env files
- Improved type definitions with proper Graphiti provider config properties in AppSettings
- Better API key loading when switching between providers in settings

### 🐛 Bug Fixes

- **node-pty Migration**: Replaced node-pty with @lydell/node-pty for prebuilt Windows binaries
  - Updated all imports to use @lydell/node-pty directly
  - Fixed "Cannot find module 'node-pty'" startup error
- **GitHub Organization Support**: Fixed repository support for GitHub organization accounts
  - Add defensive array validation for GitHub issues API response
- **Asyncio Deprecation**: Fixed asyncio deprecation warning by using get_running_loop() instead of get_event_loop()
- Applied ruff formatting and fixed import sorting (I001) in Google provider files

### 🔧 Other Changes

- Added google-generativeai dependency to requirements.txt
- Updated provider validation to include Google/Groq/HuggingFace type assertions

---

## What's Changed

- fix(graphiti): address CodeRabbit review comments by @adryserage in 679b8cd
- fix(lint): sort imports in Google provider files by @adryserage in 1a38a06
- feat(graphiti): add Google AI as LLM and embedding provider by @adryserage in fe69106
- fix: GitHub organization repository support by @mojaray2k in 873cafa
- feat(ui): add LLM provider selection to Graphiti onboarding by @adryserage in 4750869
- fix(types): add missing AppSettings properties for Graphiti providers by @adryserage in 6680ed4
- feat(ui): add Ollama as LLM provider option for Graphiti by @adryserage in a3eee92
- fix(ui): address PR review feedback for Graphiti provider selection by @adryserage in b8a419a
- fix(deps): update imports to use @lydell/node-pty directly by @adryserage in 2b61ebb
- fix(deps): replace node-pty with @lydell/node-pty for prebuilt binaries by @adryserage in e1aee6a
- fix: add UI clarity for per-project GitHub configuration by @mojaray2k in c9745b6
- fix: add defensive array validation for GitHub issues API response by @mojaray2k in b3636a5

---

## 2.5.5 - Enhanced Agent Reliability & Build Workflow

### ✨ New Features

- Required GitHub setup flow after Auto Claude initialization to ensure proper configuration
- Atomic log saving mechanism to prevent log file corruption during concurrent operations
- Per-session model and thinking level selection in insights management
- Multi-auth token support and ANTHROPIC_BASE_URL passthrough for flexible authentication
- Comprehensive DEBUG logging at Claude SDK invocation points for improved troubleshooting
- Auto-download of prebuilt node-pty binaries for Windows environments
- Enhanced merge workflow with current branch detection for accurate change previews
- Phase configuration module and enhanced agent profiles for improved flexibility
- Stage-only merge handling with comprehensive verification checks
- Authentication failure detection system with patterns and validation checks across agent pipeline

### 🛠️ Improvements

- Changed default agent profile from 'balanced' to 'auto' for more adaptive behavior
- Better GitHub issue tracking and improved user experience in issue management
- Improved merge preview accuracy using git diff counts for file statistics
- Preserved roadmap generation state when switching between projects
- Enhanced agent profiles with phase configuration support

### 🐛 Bug Fixes

- Resolved CI test failures and improved merge preview reliability
- Fixed CI failures related to linting, formatting, and tests
- Prevented dialog skip during project initialization flow
- Updated model IDs for Sonnet and Haiku to match current Claude versions
- Fixed branch namespace conflict detection to prevent worktree creation failures
- Removed duplicate LINEAR_API_KEY checks and consolidated imports
- Python 3.10+ version requirement enforced with proper version checking
- Prevented command injection vulnerabilities in GitHub API calls

### 🔧 Other Changes

- Code cleanup and test fixture updates
- Removed redundant auto-claude/specs directory structure
- Untracked .auto-claude directory to respect gitignore rules

---

## What's Changed

- fix: resolve CI test failures and improve merge preview by @AndyMik90 in de2eccd
- chore: code cleanup and test fixture updates by @AndyMik90 in 948db57
- refactor: change default agent profile from 'balanced' to 'auto' by @AndyMik90 in f98a13e
- security: prevent command injection in GitHub API calls by @AndyMik90 in 24ff491
- fix: resolve CI failures (lint, format, test) by @AndyMik90 in a8f2d0b
- fix: use git diff count for totalFiles in merge preview by @AndyMik90 in 46d2536
- feat: enhance stage-only merge handling with verification checks by @AndyMik90 in 7153558
- feat: introduce phase configuration module and enhance agent profiles by @AndyMik90 in 2672528
- fix: preserve roadmap generation state when switching projects by @AndyMik90 in 569e921
- feat: add required GitHub setup flow after Auto Claude initialization by @AndyMik90 in 03ccce5
- chore: remove redundant auto-claude/specs directory by @AndyMik90 in 64d5170
- chore: untrack .auto-claude directory (should be gitignored) by @AndyMik90 in 0710c13
- fix: prevent dialog skip during project initialization by @AndyMik90 in 56cedec
- feat: enhance merge workflow by detecting current branch by @AndyMik90 in c0c8067
- fix: update model IDs for Sonnet and Haiku by @AndyMik90 in 059315d
- feat: add comprehensive DEBUG logging and fix lint errors by @AndyMik90 in 99cf21e
- feat: implement atomic log saving to prevent corruption by @AndyMik90 in da5e26b
- feat: add better github issue tracking and UX by @AndyMik90 in c957eaa
- feat: add comprehensive DEBUG logging to Claude SDK invocation points by @AndyMik90 in 73d01c0
- feat: auto-download prebuilt node-pty binaries for Windows by @AndyMik90 in 41a507f
- feat(insights): add per-session model and thinking level selection by @AndyMik90 in e02aa59
- fix: require Python 3.10+ and add version check by @AndyMik90 in 9a5ca8c
- fix: detect branch namespace conflict blocking worktree creation by @AndyMik90 in 63a1d3c
- fix: remove duplicate LINEAR_API_KEY check and consolidate imports by @Jacob in 7d351e3
- feat: add multi-auth token support and ANTHROPIC_BASE_URL passthrough by @Jacob in 9dea155

## 2.5.0 - Roadmap Intelligence & Workflow Refinements

### ✨ New Features

- Interactive competitor analysis viewer for roadmap planning with real-time data visualization

- GitHub issue label mapping to task categories for improved organization and tracking

- GitHub issue comment selection in task creation workflow for better context integration

- TaskCreationWizard enhanced with drag-and-drop support for file references and inline @mentions

- Roadmap generation now includes stop functionality and comprehensive debug logging

### 🛠️ Improvements

- Refined visual drop zone feedback in file reference system for more subtle user guidance

- Remove auto-expand behavior for referenced files on draft restore to improve UX

- Always-visible referenced files section in TaskCreationWizard for better discoverability

- Drop zone wrapper added around main modal content area for improved drag-and-drop ergonomics

- Stuck task detection now enabled for ai_review status to better track blocked work

- Enhanced React component stability with proper key usage in RoadmapHeader and PhaseProgressIndicator

### 🐛 Bug Fixes

- Corrected CompetitorAnalysisViewer type definitions for proper TypeScript compliance

- Fixed multiple CodeRabbit review feedback items for improved code quality

- Resolved React key warnings in PhaseProgressIndicator component

- Fixed git status parsing in merge preview for accurate worktree state detection

- Corrected path resolution in runners for proper module imports and .env loading

- Resolved CI lint and TypeScript errors across codebase

- Fixed HTTP error handling and path resolution issues in core modules

- Corrected worktree test to match intended branch detection behavior

- Refined TaskReview component conditional rendering for proper staged task display

---

## What's Changed

- feat: add interactive competitor analysis viewer for roadmap by @AndyMik90 in 7ff326d

- fix: correct CompetitorAnalysisViewer to match type definitions by @AndyMik90 in 4f1766b

- fix: address multiple CodeRabbit review feedback items by @AndyMik90 in 48f7c3c

- fix: use stable React keys instead of array indices in RoadmapHeader by @AndyMik90 in 892e01d

- fix: additional fixes for http error handling and path resolution by @AndyMik90 in 54501cb

- fix: update worktree test to match intended branch detection behavior by @AndyMik90 in f1d578f

- fix: resolve CI lint and TypeScript errors by @AndyMik90 in 2e3a5d9

- feat: enhance roadmap generation with stop functionality and debug logging by @AndyMik90 in a6dad42

- fix: correct path resolution in runners for module imports and .env loading by @AndyMik90 in 3d24f8f

- fix: resolve React key warning in PhaseProgressIndicator by @AndyMik90 in 9106038

- fix: enable stuck task detection for ai_review status by @AndyMik90 in 895ed9f

- feat: map GitHub issue labels to task categories by @AndyMik90 in cbe14fd

- feat: add GitHub issue comment selection and fix auto-start bug by @AndyMik90 in 4c1dd89

- feat: enhance TaskCreationWizard with drag-and-drop support for file references and inline @mentions by @AndyMik90 in d93eefe

- cleanup docs by @AndyMik90 in 8e891df

- fix: correct git status parsing in merge preview by @AndyMik90 in c721dc2

- Update TaskReview component to refine conditional rendering for staged tasks, ensuring proper display when staging is unsuccessful by @AndyMik90 in 1a2b7a1

- auto-claude: subtask-2-3 - Refine visual drop zone feedback to be more subtle by @AndyMik90 in 6cff442

- auto-claude: subtask-2-1 - Remove showFiles auto-expand on draft restore by @AndyMik90 in 12bf69d

- auto-claude: subtask-1-3 - Create an always-visible referenced files section by @AndyMik90 in 3818b46

- auto-claude: subtask-1-2 - Add drop zone wrapper around main modal content area by @AndyMik90 in 219b66d

- auto-claude: subtask-1-1 - Remove Reference Files toggle button by @AndyMik90 in 4e63e85

## 2.4.0 - Enhanced Cross-Platform Experience with OAuth & Auto-Updates

### ✨ New Features

- Claude account OAuth implementation on onboarding for seamless token setup

- Integrated release workflow with AI-powered version suggestion capabilities

- Auto-upgrading functionality supporting Windows, Linux, and macOS with automatic app updates

- Git repository initialization on app startup with project addition checks

- Debug logging for app updater to track update processes

- Auto-open settings to updates section when app update is ready

### 🛠️ Improvements

- Major Windows and Linux compatibility enhancements for cross-platform reliability

- Enhanced task status handling to support 'done' status in limbo state with worktree existence checks

- Better handling of lock files from worktrees upon merging

- Improved README documentation and build process

- Refined visual drop zone feedback for more subtle user experience

- Removed showFiles auto-expand on draft restore for better UX consistency

- Created always-visible referenced files section in task creation wizard

- Removed Reference Files toggle button for streamlined interface

- Worktree manual deletion enforcement for early access safety (prevents accidental work loss)

### 🐛 Bug Fixes

- Corrected git status parsing in merge preview functionality

- Fixed ESLint warnings and failing tests

- Fixed Windows/Linux Python handling for cross-platform compatibility

- Fixed Windows/Linux source path detection

- Refined TaskReview component conditional rendering for proper staged task display

---

## What's Changed

- docs: cleanup docs by @AndyMik90 in 8e891df
- fix: correct git status parsing in merge preview by @AndyMik90 in c721dc2
- refactor: Update TaskReview component to refine conditional rendering for staged tasks by @AndyMik90 in 1a2b7a1
- feat: Enhance task status handling to allow 'done' status in limbo state by @AndyMik90 in a20b8cf
- improvement: Worktree needs to be manually deleted for early access safety by @AndyMik90 in 0ed6afb
- feat: Claude account OAuth implementation on onboarding by @AndyMik90 in 914a09d
- fix: Better handling of lock files from worktrees upon merging by @AndyMik90 in e44202a
- feat: GitHub OAuth integration upon onboarding by @AndyMik90 in 4249644
- chore: lock update by @AndyMik90 in b0fc497
- improvement: Improved README and build process by @AndyMik90 in 462edcd
- fix: ESLint warnings and failing tests by @AndyMik90 in affbc48
- feat: Major Windows and Linux compatibility enhancements with auto-upgrade by @AndyMik90 in d7fd1a2
- feat: Add debug logging to app updater by @AndyMik90 in 96dd04d
- feat: Auto-open settings to updates section when app update is ready by @AndyMik90 in 1d0566f
- feat: Add integrated release workflow with AI version suggestion by @AndyMik90 in 7f3cd59
- fix: Windows/Linux Python handling by @AndyMik90 in 0ef0e15
- feat: Implement Electron app auto-updater by @AndyMik90 in efc112a
- fix: Windows/Linux source path detection by @AndyMik90 in d33a0aa
- refactor: Refine visual drop zone feedback to be more subtle by @AndyMik90 in 6cff442
- refactor: Remove showFiles auto-expand on draft restore by @AndyMik90 in 12bf69d
- feat: Create always-visible referenced files section by @AndyMik90 in 3818b46
- feat: Add drop zone wrapper around main modal content by @AndyMik90 in 219b66d
- feat: Remove Reference Files toggle button by @AndyMik90 in 4e63e85
- docs: Update README with git initialization and folder structure by @AndyMik90 in 2fa3c51
- chore: Version bump to 2.3.2 by @AndyMik90 in 59b091a

## 2.3.2 - UI Polish & Build Improvements

### 🛠️ Improvements

- Restructured SortableFeatureCard badge layout for improved visual presentation

Bug Fixes:
- Fixed spec runner path configuration for more reliable task execution

---

## What's Changed

- fix: fix to spec runner paths by @AndyMik90 in 9babdc2

- feat: auto-claude: subtask-1-1 - Restructure SortableFeatureCard badge layout by @AndyMik90 in dc886dc

## 2.3.1 - Linux Compatibility Fix

### 🐛 Bug Fixes

- Resolved path handling issues on Linux systems for improved cross-platform compatibility

---

## What's Changed

- fix: Fix to linux path issue by @AndyMik90 in 3276034

## 2.2.0 - 2025-12-17

### ✨ New Features

- Add usage monitoring with profile swap detection to prevent cascading resource issues

- Option to stash changes before merge operations for safer branch integration

- Add hideCloseButton prop to DialogContent component for improved UI flexibility

### 🛠️ Improvements

- Enhance AgentManager to manage task context cleanup and preserve swapCount on restarts

- Improve changelog feature with version tracking, markdown/preview, and persistent styling options

- Refactor merge conflict handling to use branch names instead of commit hashes for better clarity

- Streamline usage monitoring logic by removing unnecessary dynamic imports

- Better handling of lock files during merge conflicts

- Refactor code for improved readability and maintainability

- Refactor IdeationHeader and update handleDeleteSelected logic

### 🐛 Bug Fixes

- Fix worktree merge logic to correctly handle branch operations

- Fix spec_runner.py path resolution after move to runners/ directory

- Fix Discord release webhook failing on large changelogs

- Fix branch logic for merge AI operations

- Hotfix for spec-runner path location

---

## What's Changed

- fix: hotfix/spec-runner path location by @AndyMik90 in f201f7e

- refactor: Remove unnecessary dynamic imports of getUsageMonitor in terminal-handlers.ts to streamline usage monitoring logic by @AndyMik90 in 0da4bc4

- feat: Improve changelog feature, version tracking, markdown/preview, persistent styling options by @AndyMik90 in a0d142b

- refactor: Refactor code for improved readability and maintainability by @AndyMik90 in 473b045

- feat: Enhance AgentManager to manage task context cleanup and preserve swapCount on restarts. Update UsageMonitor to delay profile usage checks to prevent cascading swaps by @AndyMik90 in e5b9488

- feat: Usage-monitoring by @AndyMik90 in de33b2c

- feat: option to stash changes before merge by @AndyMik90 in 7e09739

- refactor: Refactor merge conflict check to use branch names instead of commit hashes by @AndyMik90 in e6d6cea

- fix: worktree merge logic by @AndyMik90 in dfb5cf9

- test: Sign off - all verification passed by @AndyMik90 in 34631c3

- feat: Pass hideCloseButton={showFileExplorer} to DialogContent by @AndyMik90 in 7c327ed

- feat: Add hideCloseButton prop to DialogContent component by @AndyMik90 in 5f9653a

- fix: branch logic for merge AI by @AndyMik90 in 2d2a813

- fix: spec_runner.py path resolution after move to runners/ directory by @AndyMik90 in ce9c2cd

- refactor: Better handling of lock files during merge conflicts by @AndyMik90 in 460c76d

- fix: Discord release webhook failing on large changelogs by @AndyMik90 in 4eb66f5

- chore: Update CHANGELOG with new features, improvements, bug fixes, and other changes by @AndyMik90 in 788b8d0

- refactor: Enhance merge conflict handling by excluding lock files by @AndyMik90 in 957746e

- refactor: Refactor IdeationHeader and update handleDeleteSelected logic by @AndyMik90 in 36338f3

## What's New

### ✨ New Features

- Added GitHub OAuth integration for seamless authentication

- Implemented roadmap feature management with kanban board and drag-and-drop support

- Added ability to select AI model during task creation with agent profiles

- Introduced file explorer integration and referenced files section in task creation wizard

- Added .gitignore entry management during project initialization

- Created comprehensive onboarding wizard with OAuth configuration, Graphiti setup, and first spec guidance

- Introduced Electron MCP for debugging and validation support

- Added BMM workflow status tracking and project scan reporting

### 🛠️ Improvements

- Refactored IdeationHeader component and improved deleteSelected logic

- Refactored backend for upcoming features with improved architecture

- Enhanced RouteDetector to exclude specific directories from route detection

- Improved merge conflict resolution with parallel processing and AI-assisted resolution

- Optimized merge conflict resolution performance and context sending

- Refactored AI resolver to use async context manager and Claude SDK patterns

- Enhanced merge orchestrator logic and frontend UX for conflict handling

- Refactored components for better maintainability and faster development

- Refactored changelog formatter for GitHub Release compatibility

- Enhanced onboarding wizard completion logic and step progression

- Updated README to clarify Auto Claude's role as an AI coding companion

### 🐛 Bug Fixes

- Fixed GraphitiStep TypeScript compilation error

- Added missing onRerunWizard prop to AppSettingsDialog

- Improved merge lock file conflict handling

### 🔧 Other Changes

- Removed .auto-claude and _bmad-output from git tracking (already in .gitignore)

- Updated Python versions in CI workflows

- General linting improvements and code cleanup

---

## What's Changed

- feat: New github oauth integration by @AndyMik90 in afeb54f
- feat: Implement roadmap feature management kanban with drag-and-drop support by @AndyMik90 in 9403230
- feat: Agent profiles, be able to select model on task creation by @AndyMik90 in d735c5c
- feat: Add Referenced Files Section and File Explorer Integration in Task Creation Wizard by @AndyMik90 in 31e4e87
- feat: Add functionality to manage .gitignore entries during project initialization by @AndyMik90 in 2ac00a9
- feat: Introduce electron mcp for electron debugging/validation by @AndyMik90 in 3eb2ead
- feat: Add BMM workflow status tracking and project scan report by @AndyMik90 in 7f6456f
- refactor: Refactor IdeationHeader and update handleDeleteSelected logic by @AndyMik90 in 36338f3
- refactor: Big backend refactor for upcoming features by @AndyMik90 in 11fcdf4
- refactor: Refactoring for better codebase by @AndyMik90 in feb0d4e
- refactor: Refactor Roadmap component to utilize RoadmapGenerationProgress for better status display by @AndyMik90 in d8e5784
- refactor: refactoring components for better future maintence and more rapid coding by @AndyMik90 in 131ec4c
- refactor: Enhance RouteDetector to exclude specific directories from route detection by @AndyMik90 in 08dc24c
- refactor: Update AI resolver to use Claude Opus model and improve error logging by @AndyMik90 in 1d830ba
- refactor: Use claude sdk pattern for ai resolver by @AndyMik90 in 4bba9d1
- refactor: Refactor AI resolver to use async context manager for client connection by @AndyMik90 in 579ea40
- refactor: Update changelog formatter for GitHub Release compatibility by @AndyMik90 in 3b832db
- refactor: Enhance onboarding wizard completion logic by @AndyMik90 in 7c01638
- refactor: Update GraphitiStep to proceed to the next step after successful configuration save by @AndyMik90 in a5a1eb1
- fix: Add onRerunWizard prop to AppSettingsDialog (qa-requested) by @AndyMik90 in 6b5b714
- fix: Add first-run detection to App.tsx by @AndyMik90 in 779e36f
- fix: Add TypeScript compilation check - fix GraphitiStep type error by @AndyMik90 in f90fa80
- improve: ideation improvements and linting by @AndyMik90 in 36a69fc
- improve: improve merge conflicts for lock files by @AndyMik90 in a891225
- improve: Roadmap competitor analysis by @AndyMik90 in ddf47ae
- improve: parallell merge conflict resolution by @AndyMik90 in f00aa33
- improve: improvement to speed of merge conflict resolution by @AndyMik90 in 56ff586
- improve: improve context sending to merge agent by @AndyMik90 in e409ae8
- improve: better conflict handling in the frontend app for merge contlicts (better UX) by @AndyMik90 in 65937e1
- improve: resolve claude agent sdk by @AndyMik90 in 901e83a
- improve: Getting ready for BMAD integration by @AndyMik90 in b94eb65
- improve: Enhance AI resolver and debugging output by @AndyMik90 in bf787ad
- improve: Integrate profile environment for OAuth token in task handlers by @AndyMik90 in 01e801a
- chore: Remove .auto-claude from tracking (already in .gitignore) by @AndyMik90 in 87f353c
- chore: Update Python versions in CI workflows by @AndyMik90 in 43a338c
- chore: Linting gods pleased now? by @AndyMik90 in 6aea4bb
- chore: Linting and test fixes by @AndyMik90 in 140f11f
- chore: Remove _bmad-output from git tracking by @AndyMik90 in 4cd7500
- chore: Add _bmad-output to .gitignore by @AndyMik90 in dbe27f0
- chore: Linting gods are happy by @AndyMik90 in 3fc1592
- chore: Getting ready for the lint gods by @AndyMik90 in 142cd67
- chore: CLI testing/linting by @AndyMik90 in d8ad17d
- chore: CLI and tests by @AndyMik90 in 9a59b7e
- chore: Update implementation_plan.json - fixes applied by @AndyMik90 in 555a46f
- chore: Update parallel merge conflict resolution metrics in workspace.py by @AndyMik90 in 2e151ac
- chore: merge logic v0.3 by @AndyMik90 in c5d33cd
- chore: merge orcehestrator logic by @AndyMik90 in e8b6669
- chore: Merge-orchestrator by @AndyMik90 in d8ba532
- chore: merge orcehstrator logic by @AndyMik90 in e8b6669
- chore: Electron UI fix for merge orcehstrator by @AndyMik90 in e08ab62
- chore: Frontend lints by @AndyMik90 in 488bbfa
- docs: Revise README.md to enhance clarity and focus on Auto Claude's capabilities by @AndyMik90 in f9ef7ea
- qa: Sign off - all verification passed by @AndyMik90 in b3f4803
- qa: Rejected - fixes required by @AndyMik90 in 5e56890
- qa: subtask-6-2 - Run existing tests to verify no regressions by @AndyMik90 in 5f989a4
- qa: subtask-5-2 - Enhance OAuthStep to detect and display if token is already configured by @AndyMik90 in 50f22da
- qa: subtask-5-1 - Add settings migration logic - set onboardingCompleted by @AndyMik90 in f57c28e
- qa: subtask-4-1 - Add 'Re-run Wizard' button to AppSettings navigation by @AndyMik90 in 9144e7f
- qa: subtask-3-1 - Add first-run detection to App.tsx by @AndyMik90 in 779e36f
- qa: subtask-2-8 - Create index.ts barrel export for onboarding components by @AndyMik90 in b0af2dc
- qa: subtask-2-7 - Create OnboardingWizard component by @AndyMik90 in 3de8928
- qa: subtask-2-6 - Create CompletionStep component - success message by @AndyMik90 in aa0f608
- qa: subtask-2-5 - Create FirstSpecStep component - guided first spec by @AndyMik90 in 32f17a1
- qa: subtask-2-4 - Create GraphitiStep component - optional Graphiti/FalkorDB configuration by @AndyMik90 in 61184b0
- qa: subtask-2-3 - Create OAuthStep component - Claude OAuth token configuration step by @AndyMik90 in 79d622e
- qa: subtask-2-2 - Create WelcomeStep component by @AndyMik90 in a97f697
- qa: subtask-2-1 - Create WizardProgress component - step progress indicator by @AndyMik90 in b6e604c
- qa: subtask-1-2 - Add onboardingCompleted to DEFAULT_APP_SETTINGS by @AndyMik90 in c5a0331
- qa: subtask-1-1 - Add onboardingCompleted to AppSettings type interface by @AndyMik90 in 7c24b48
- chore: Version 2.0.1 by @AndyMik90 in 4b242c4
- test: Merge-orchestrator by @AndyMik90 in d8ba532
- test: test for ai merge AI by @AndyMik90 in 9d9cf16

## What's New in 2.0.1

### 🚀 New Features
- **Update Check with Release URLs**: Enhanced update checking functionality to include release URLs, allowing users to easily access release information
- **Markdown Renderer for Release Notes**: Added markdown renderer in advanced settings to properly display formatted release notes
- **Terminal Name Generator**: New feature for generating terminal names

### 🔧 Improvements
- **LLM Provider Naming**: Updated project settings to reflect new LLM provider name
- **IPC Handlers**: Improved IPC handlers for external link management
- **UI Simplification**: Refactored App component to simplify project selection display by removing unnecessary wrapper elements
- **Docker Infrastructure**: Updated FalkorDB service container naming in docker-compose configuration
- **Documentation**: Improved README with dedicated CLI documentation and infrastructure status information

### 📚 Documentation
- Enhanced README with comprehensive CLI documentation and setup instructions
- Added Docker infrastructure status documentation

## What's New in v2.0.0

### New Features
- **Task Integration**: Connected ideas to tasks with "Go to Task" functionality across the UI
- **File Explorer Panel**: Implemented file explorer panel with directory listing capabilities
- **Terminal Task Selection**: Added task selection dropdown in terminal with auto-context loading
- **Task Archiving**: Introduced task archiving functionality
- **Graphiti MCP Server Integration**: Added support for Graphiti memory integration
- **Roadmap Functionality**: New roadmap visualization and management features

### Improvements
- **File Tree Virtualization**: Refactored FileTree component to use efficient virtualization for improved performance with large file structures
- **Agent Parallelization**: Improved Claude Code agent decision-making for parallel task execution
- **Terminal Experience**: Enhanced terminal with task features and visual feedback for better user experience
- **Python Environment Detection**: Auto-detect Python environment readiness before task execution
- **Version System**: Cleaner version management system
- **Project Initialization**: Simpler project initialization process

### Bug Fixes
- Fixed project settings bug
- Fixed insight UI sidebar
- Resolved Kanban and terminal integration issues

### Changed
- Updated project-store.ts to use proper Dirent type for specDirs variable
- Refactored codebase for better code quality
- Removed worktree-worker logic in favor of Claude Code's internal agent system
- Removed obsolete security configuration file (.auto-claude-security.json)

### Documentation
- Added CONTRIBUTING.md with development guidelines

## What's New in v1.1.0

### New Features
- **Follow-up Tasks**: Continue working on completed specs by adding new tasks to existing implementations. The system automatically re-enters planning mode and integrates with your existing documentation and context.
- **Screenshot Support for Feedback**: Attach screenshots to your change requests when reviewing tasks, providing visual context for your feedback alongside text comments.
- **Unified Task Editing**: The Edit Task dialog now includes all the same options as the New Task dialog—classification metadata, image attachments, and review settings—giving you full control when modifying tasks.

### Improvements
- **Enhanced Kanban Board**: Improved visual design and interaction patterns for task cards, making it easier to scan status, understand progress, and work with tasks efficiently.
- **Screenshot Handling**: Paste screenshots directly into task descriptions using Ctrl+V (Cmd+V on Mac) for faster documentation.
- **Draft Auto-Save**: Task creation state is now automatically saved when you navigate away, preventing accidental loss of work-in-progress.

### Bug Fixes
- Fixed task editing to support the same comprehensive options available in new task creation
