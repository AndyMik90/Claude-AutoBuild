# GitHub Handlers Architecture

## Module Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────┐
│                         github-handlers.ts                          │
│                    (Main Entry Point - 33 lines)                    │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ imports
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          github/index.ts                            │
│                  (Handler Orchestrator - 37 lines)                  │
│                                                                     │
│  Responsibilities:                                                  │
│  - Registers all handler modules                                   │
│  - Exports public API                                              │
│  - Coordinates module initialization                               │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             │ orchestrates
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Handler Modules                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ repository-handlers.ts (127 lines)                        │    │
│  │ • Check GitHub connection                                 │    │
│  │ • Fetch repositories                                      │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ issue-handlers.ts (125 lines)                             │    │
│  │ • Fetch issues (with filtering)                           │    │
│  │ • Fetch single issue                                      │    │
│  │ • Transform API responses                                 │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ investigation-handlers.ts (211 lines)                     │    │
│  │ • AI-powered issue investigation                          │    │
│  │ • Progress tracking                                       │    │
│  │ • Event emission to renderer                              │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ import-handlers.ts (107 lines)                            │    │
│  │ • Bulk issue import                                       │    │
│  │ • Error aggregation                                       │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ release-handlers.ts (126 lines)                           │    │
│  │ • Create GitHub releases                                  │    │
│  │ • Validate gh CLI availability                            │    │
│  │ • Check authentication status                             │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ oauth-handlers.ts (220 lines)                             │    │
│  │ • Check gh CLI installation                               │    │
│  │ • Check authentication status                             │    │
│  │ • Start OAuth flow via gh CLI                             │    │
│  │ • Retrieve OAuth tokens                                   │    │
│  │ • Get authenticated user info                             │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             │ depends on
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Shared Infrastructure                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ utils.ts (85 lines)                                       │    │
│  │ • getGitHubConfig() - Extract config from .env           │    │
│  │ • getTokenFromGhCli() - Get token from gh CLI             │    │
│  │ • githubFetch() - GitHub API wrapper                     │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ spec-utils.ts (169 lines)                                 │    │
│  │ • createSpecForIssue() - Create spec directory            │    │
│  │ • buildIssueContext() - Build context string              │    │
│  │ • buildInvestigationTask() - Generate task description    │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────┐    │
│  │ types.ts (48 lines)                                       │    │
│  │ • GitHubConfig                                            │    │
│  │ • GitHubAPIIssue                                          │    │
│  │ • GitHubAPIRepository                                     │    │
│  │ • ReleaseOptions                                          │    │
│  └───────────────────────────────────────────────────────────┘    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             │ uses
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      External Dependencies                          │
├─────────────────────────────────────────────────────────────────────┤
│  • electron (IPC communication)                                     │
│  • fs (File system operations)                                      │
│  • path (Path manipulation)                                         │
│  • child_process (gh CLI execution)                                 │
│  • ../../shared/constants                                           │
│  • ../../shared/types                                               │
│  • ../project-store                                                 │
│  • ../agent                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Issue Investigation Flow

```
Renderer Process
     │
     │ IPC: GITHUB_INVESTIGATE_ISSUE
     ▼
investigation-handlers.ts
     │
     ├──► utils.getGitHubConfig() ──────► Get GitHub token & repo
     │
     ├──► utils.githubFetch() ───────────► Fetch issue from GitHub API
     │
     ├──► utils.githubFetch() ───────────► Fetch comments from GitHub API
     │
     ├──► spec-utils.buildIssueContext() ► Build context string
     │
     ├──► spec-utils.buildInvestigationTask() ► Generate task description
     │
     ├──► spec-utils.createSpecForIssue() ─┬─► Create spec directory
     │                                      ├─► Write implementation_plan.json
     │                                      ├─► Write requirements.json
     │                                      └─► Write task_metadata.json
     │
     ├──► AgentManager.startSpecCreation() ► Start AI agent
     │
     └──► Send progress & completion events
          │
          ▼
     Renderer Process
     (Progress updates & results)
```

### Issue Import Flow

```
Renderer Process
     │
     │ IPC: GITHUB_IMPORT_ISSUES (with issue numbers)
     ▼
import-handlers.ts
     │
     └──► For each issue number:
          │
          ├──► utils.githubFetch() ──────────► Fetch issue details
          │
          ├──► spec-utils.createSpecForIssue() ► Create spec
          │
          └──► AgentManager.startSpecCreation() ► Start agent
     │
     └──► Return import results
          │
          ▼
     Renderer Process
     (Import summary)
```

## Separation of Concerns

### Handler Modules (IPC Layer)
- Register IPC handlers
- Validate inputs
- Coordinate operations
- Send responses/events
- **Do NOT** contain business logic

### Utility Modules (Business Logic Layer)
- Implement core functionality
- Perform data transformations
- Make external API calls
- Manage file operations
- **Reusable** across handlers

### Type Modules (Contract Layer)
- Define interfaces
- Document data structures
- Type safety guarantees
- **No implementation code**

## Testing Strategy

### Unit Tests
Each module can be tested independently:

```typescript
// Example: Testing utils.ts
describe('getGitHubConfig', () => {
  it('should return config when valid .env exists', () => {
    // Mock fs.readFileSync
    // Test function
  });
});

// Example: Testing issue-handlers.ts
describe('transformIssue', () => {
  it('should transform GitHub API issue to app format', () => {
    // Test pure transformation function
  });
});
```

### Integration Tests
Test module interactions:

```typescript
describe('Investigation flow', () => {
  it('should investigate issue and create spec', async () => {
    // Mock GitHub API
    // Mock AgentManager
    // Trigger investigation
    // Verify spec creation
  });
});
```

### E2E Tests
Test complete flows:

```typescript
describe('Import issues E2E', () => {
  it('should import multiple issues successfully', async () => {
    // Use real Electron IPC
    // Mock external APIs only
    // Verify end-to-end behavior
  });
});
```

## Error Handling Pattern

All handlers follow consistent error handling:

```typescript
try {
  // Validation
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  // Get config
  const config = getGitHubConfig(project);
  if (!config) {
    return { success: false, error: 'Configuration error' };
  }

  // Perform operation
  const result = await githubFetch(config.token, endpoint);

  // Return success
  return { success: true, data: transformedResult };

} catch (error) {
  // Catch and format errors
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error'
  };
}
```

## Future Scalability

### Adding New Handlers

1. Create new handler file in `github/` directory
2. Implement handler registration function
3. Add registration call in `index.ts`
4. Update documentation

Example:

```typescript
// github/pull-request-handlers.ts
export function registerPullRequestHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GITHUB_GET_PULL_REQUESTS, async (...) => {
    // Implementation
  });
}

// github/index.ts
import { registerPullRequestHandlers } from './pull-request-handlers';

export function registerGithubHandlers(...) {
  // ... existing registrations
  registerPullRequestHandlers();
}
```

### Extending Functionality

- Add new utility functions to `utils.ts` or `spec-utils.ts`
- Add new types to `types.ts`
- Create specialized utility files as needed
- Keep handlers thin, move logic to utilities

## Performance Considerations

1. **Parallel Operations**: Handlers use Promise.all where appropriate
2. **API Rate Limiting**: GitHub API has rate limits (5000 requests/hour for authenticated users)
3. **Caching**: Future enhancement to cache frequently accessed data
4. **Pagination**: Large result sets should be paginated
5. **Async/Await**: All I/O operations use async/await for non-blocking execution

## Security Considerations

1. **Token Storage**: Tokens stored in project .env (not version controlled)
2. **Input Validation**: All user inputs validated before use
3. **Command Injection**: Release handler carefully escapes shell arguments
4. **API Errors**: GitHub API errors don't leak sensitive information
5. **File Operations**: All file ops restricted to project directory
