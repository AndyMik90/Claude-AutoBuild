# Agent API Modules

This directory contains modularized agent API implementations, broken down by domain for better code organization and maintainability.

## Structure

The agent API has been refactored from a monolithic 677-line file into smaller, focused modules:

```
modules/
├── ipc-utils.ts          # Common IPC utilities and helper functions
├── roadmap-api.ts        # Roadmap generation and management
├── ideation-api.ts       # AI-powered ideation and idea management
├── insights-api.ts       # AI insights and chat functionality
├── changelog-api.ts      # Changelog generation and versioning
├── linear-api.ts         # Linear issue tracking integration
├── github-api.ts         # GitHub integration (issues, releases)
├── autobuild-api.ts      # Auto-build source update management
├── shell-api.ts          # Shell operations (e.g., opening URLs)
└── index.ts              # Barrel export for easy imports
```

## Module Organization

Each module follows a consistent pattern:

1. **Type Imports**: Import required types from shared types
2. **Interface Definition**: Define the module's API interface
3. **Implementation**: Create factory function that returns the API implementation
4. **IPC Communication**: Use utility functions from `ipc-utils.ts` for consistent IPC handling

### Example Module Structure

```typescript
// Import utilities and types
import { IPC_CHANNELS } from '../../../shared/constants';
import type { SomeType, IPCResult } from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc } from './ipc-utils';

// Define API interface
export interface ModuleAPI {
  operation: (arg: string) => Promise<IPCResult<SomeType>>;
  onEvent: (callback: (data: SomeType) => void) => () => void;
}

// Create implementation
export const createModuleAPI = (): ModuleAPI => ({
  operation: (arg: string) => invokeIpc(IPC_CHANNELS.SOME_CHANNEL, arg),
  onEvent: (callback) => createIpcListener(IPC_CHANNELS.SOME_EVENT, callback)
});
```

## IPC Utilities

The `ipc-utils.ts` module provides common functionality:

- **`createIpcListener`**: Creates typed event listeners with automatic cleanup
- **`invokeIpc`**: Invokes IPC methods with typed return values
- **`sendIpc`**: Sends IPC messages without expecting responses
- **`IpcListenerCleanup`**: Type for cleanup functions

## Main Entry Point

The `agent-api.ts` file in the parent directory aggregates all modules:

```typescript
import { createRoadmapAPI } from './modules/roadmap-api';
import { createIdeationAPI } from './modules/ideation-api';
// ... other imports

export const createAgentAPI = (): AgentAPI => ({
  ...createRoadmapAPI(),
  ...createIdeationAPI(),
  // ... other modules
});
```

## Benefits of This Structure

1. **Separation of Concerns**: Each module handles a specific domain
2. **Easier Maintenance**: Changes to one domain don't affect others
3. **Better Code Navigation**: Developers can quickly find relevant code
4. **Improved Testability**: Modules can be tested independently
5. **Reduced Complexity**: Smaller files are easier to understand
6. **Type Safety**: Strong TypeScript typing throughout
7. **Reusability**: Common IPC patterns extracted to utilities

## Adding New Operations

To add new operations to an existing module:

1. Add the operation to the module's interface
2. Implement the operation using IPC utilities
3. Export is automatically handled by the main `agent-api.ts`

To create a new module:

1. Create a new file in `modules/` (e.g., `new-feature-api.ts`)
2. Follow the standard module pattern
3. Import and integrate in `agent-api.ts`
4. Add export to `modules/index.ts`

## Migration Notes

This refactoring maintains 100% backward compatibility. The `AgentAPI` interface remains unchanged, so no updates to consuming code are required.

### Before (677 lines)
```typescript
// Single large file with all operations
export const createAgentAPI = (): AgentAPI => ({
  // 50+ operations defined inline
});
```

### After (90 lines + 8 focused modules)
```typescript
// Clean aggregation of modular APIs
export const createAgentAPI = (): AgentAPI => ({
  ...createRoadmapAPI(),
  ...createIdeationAPI(),
  // ... etc
});
```
