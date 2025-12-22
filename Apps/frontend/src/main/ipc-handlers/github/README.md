# GitHub Handlers Module

This directory contains the modularized GitHub integration handlers, refactored from the original 742-line `github-handlers.ts` file for better maintainability and code organization.

## Module Structure

```
github/
├── README.md                      # This file
├── index.ts                       # Main entry point, registers all handlers
├── types.ts                       # TypeScript type definitions
├── utils.ts                       # Shared utility functions
├── spec-utils.ts                  # Spec creation and management utilities
├── repository-handlers.ts         # Repository and connection handlers
├── issue-handlers.ts              # Issue fetching and retrieval handlers
├── investigation-handlers.ts      # AI-powered issue investigation handlers
├── import-handlers.ts             # Bulk issue import handlers
└── release-handlers.ts            # GitHub release creation handlers
```

## File Descriptions

### Core Files

**index.ts** (37 lines)
- Main entry point that orchestrates all handler registrations
- Re-exports utilities for external use
- Clean interface for the parent module

**types.ts** (48 lines)
- Shared TypeScript interfaces and types
- GitHub API response types
- Configuration interfaces

**utils.ts** (60 lines)
- `getGitHubConfig()` - Extract GitHub configuration from project
- `githubFetch()` - Wrapper for GitHub API requests with authentication

**spec-utils.ts** (169 lines)
- `createSpecForIssue()` - Create spec directory and initial files
- `buildIssueContext()` - Build context string from issue data
- `buildInvestigationTask()` - Generate task description for AI
- Helper functions for spec numbering and slug generation

### Handler Modules

**repository-handlers.ts** (127 lines)
- `GITHUB_CHECK_CONNECTION` - Verify GitHub connection status
- `GITHUB_GET_REPOSITORIES` - Fetch user's repositories

**issue-handlers.ts** (125 lines)
- `GITHUB_GET_ISSUES` - Fetch issues with filtering
- `GITHUB_GET_ISSUE` - Fetch single issue details
- `transformIssue()` - Transform API response to app format

**investigation-handlers.ts** (211 lines)
- `GITHUB_INVESTIGATE_ISSUE` - AI-powered issue investigation
- Progress tracking and event emission
- Integration with AgentManager for task creation

**import-handlers.ts** (107 lines)
- `GITHUB_IMPORT_ISSUES` - Bulk import of multiple issues
- Error handling and progress tracking
- Task creation for each imported issue

**release-handlers.ts** (126 lines)
- `GITHUB_CREATE_RELEASE` - Create GitHub releases via gh CLI
- CLI availability and authentication checks
- Support for draft and prerelease options

## Benefits of This Structure

### 1. Improved Maintainability
- Each module has a single, clear responsibility
- Easy to locate and update specific functionality
- Reduced cognitive load when working on specific features

### 2. Better Code Organization
- Logical grouping of related handlers
- Shared utilities extracted to dedicated files
- Clear separation between data types, utilities, and handlers

### 3. Enhanced Testability
- Individual modules can be tested in isolation
- Mock dependencies at module boundaries
- Easier to write focused unit tests

### 4. Scalability
- Easy to add new handler types as separate modules
- Can extend functionality without modifying existing modules
- Clear patterns for new contributors to follow

### 5. Reduced Complexity
- Main entry file reduced from 742 to 33 lines (95.6% reduction)
- No single file exceeds 211 lines
- Each module is focused and comprehensible

## Usage

The module maintains the same public interface as the original file:

```typescript
import { registerGithubHandlers } from './github-handlers';
import { AgentManager } from '../agent';
import type { BrowserWindow } from 'electron';

const agentManager = new AgentManager();
const getMainWindow = () => mainWindow;

registerGithubHandlers(agentManager, getMainWindow);
```

## Dependencies

- `electron` - IPC communication
- `child_process` - For gh CLI operations
- `fs` - File system operations
- `path` - Path manipulation
- Project modules:
  - `../../shared/constants` - Constants and configuration
  - `../../shared/types` - Type definitions
  - `../project-store` - Project data access
  - `../agent` - Agent management

## Handler Registration Flow

```
registerGithubHandlers()
  ├── registerRepositoryHandlers()
  │   ├── registerCheckConnection()
  │   └── registerGetRepositories()
  ├── registerIssueHandlers()
  │   ├── registerGetIssues()
  │   └── registerGetIssue()
  ├── registerInvestigationHandlers()
  │   └── registerInvestigateIssue()
  ├── registerImportHandlers()
  │   └── registerImportIssues()
  └── registerReleaseHandlers()
      └── registerCreateRelease()
```

## IPC Channels

All handlers use channels defined in `IPC_CHANNELS`:

- `GITHUB_CHECK_CONNECTION`
- `GITHUB_GET_REPOSITORIES`
- `GITHUB_GET_ISSUES`
- `GITHUB_GET_ISSUE`
- `GITHUB_INVESTIGATE_ISSUE`
- `GITHUB_INVESTIGATION_PROGRESS`
- `GITHUB_INVESTIGATION_COMPLETE`
- `GITHUB_INVESTIGATION_ERROR`
- `GITHUB_IMPORT_ISSUES`
- `GITHUB_CREATE_RELEASE`

## Future Enhancements

Potential areas for further improvement:

1. **Error Handling** - Centralized error handling middleware
2. **Caching** - Add response caching for frequently accessed data
3. **Rate Limiting** - Implement GitHub API rate limit handling
4. **Testing** - Add comprehensive unit and integration tests
5. **Logging** - Enhanced logging and debugging capabilities
6. **Webhooks** - Support for GitHub webhook integration
7. **PR Handlers** - Separate module for pull request operations
