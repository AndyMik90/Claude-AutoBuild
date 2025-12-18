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