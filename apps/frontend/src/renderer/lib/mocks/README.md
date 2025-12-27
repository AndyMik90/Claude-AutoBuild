# Browser Mock Modules

This directory contains modular mock implementations for the Electron API, enabling the app to run in a regular browser for UI development and testing.

## Architecture

The mock system is organized into separate modules by functional domain, making it easier to maintain and extend.

### Module Structure

```
mocks/
├── index.ts                    # Central export point
├── mock-data.ts               # Sample data (projects, tasks, sessions)
├── project-mock.ts            # Project CRUD and initialization
├── task-mock.ts               # Task operations and lifecycle
├── workspace-mock.ts          # Git worktree management
├── terminal-mock.ts           # Terminal and session management
├── claude-profile-mock.ts     # Claude profile and rate limiting
├── roadmap-mock.ts            # Roadmap generation and features
├── context-mock.ts            # Project context and memory
├── integration-mock.ts        # External integrations (Linear, GitHub)
├── changelog-mock.ts          # Changelog and release operations
├── insights-mock.ts           # AI insights and conversations
├── infrastructure-mock.ts     # LadybugDB, memory, ideation, updates
└── settings-mock.ts           # App settings and version info
```

## Usage

The main `browser-mock.ts` file aggregates all mocks:

```typescript
import {
  projectMock,
  taskMock,
  workspaceMock,
  // ... other mocks
} from './mocks';

const browserMockAPI: ElectronAPI = {
  ...projectMock,
  ...taskMock,
  ...workspaceMock,
  // ... other mocks
};
```

## Adding New Mocks

1. Create a new file in the `mocks/` directory following the naming pattern: `<domain>-mock.ts`
2. Export a const object with your mock implementations
3. Add the export to `index.ts`
4. Spread the mock into `browserMockAPI` in `browser-mock.ts`

Example:

```typescript
// mocks/new-feature-mock.ts
export const newFeatureMock = {
  getFeature: async () => ({ success: true, data: null }),
  updateFeature: async () => ({ success: true })
};

// mocks/index.ts
export { newFeatureMock } from './new-feature-mock';

// browser-mock.ts
import { newFeatureMock, /* ... */ } from './mocks';

const browserMockAPI: ElectronAPI = {
  // ... existing mocks
  ...newFeatureMock
};
```

## Mock Data

Sample data is centralized in `mock-data.ts` and includes:
- `mockProjects` - Sample project entries
- `mockTasks` - Sample tasks with various statuses
- `mockInsightsSessions` - Sample conversation sessions

This data can be imported and used by any mock module.

## Console Logging

Mock operations that involve side effects (e.g., terminal operations, external processes) log to the console with the `[Browser Mock]` prefix for debugging.

## Type Safety

All mocks conform to the `ElectronAPI` interface from `shared/types`, ensuring type safety and API compatibility.
