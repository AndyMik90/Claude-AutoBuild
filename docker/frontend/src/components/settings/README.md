# Project Settings Components

Refactored and modular project settings system with clear separation of concerns.

## Directory Structure

```
settings/
├── ProjectSettingsContent.tsx       # Main entry point (170 lines)
├── common/                          # Common UI components
│   ├── EmptyProjectState.tsx        # Empty state when no project selected
│   ├── ErrorDisplay.tsx             # Error message display
│   ├── InitializationGuard.tsx      # Guards for Auto-Build requirement
│   └── index.ts                     # Exports
├── integrations/                    # Third-party integrations
│   ├── LinearIntegration.tsx        # Linear setup (241 lines)
│   ├── GitHubIntegration.tsx        # GitHub setup (215 lines)
│   └── index.ts                     # Exports
├── sections/                        # Section routing
│   ├── SectionRouter.tsx            # Routes between settings sections
│   └── index.ts                     # Exports
└── utils/                           # Utility functions
    ├── hookProxyFactory.ts          # Hook proxy generator
    └── index.ts                     # Exports
```

## Component Overview

### Main Component

**ProjectSettingsContent.tsx** (170 lines)
- Main entry point for project settings
- Handles project selection and empty states
- Orchestrates hook state and section rendering
- Manages Linear task import modal

### Common Components

**EmptyProjectState** (15 lines)
- Displays empty state with icon when no project selected
- Reusable across the application

**ErrorDisplay** (22 lines)
- Shows error messages in consistent format
- Handles both general and environment errors
- Returns null when no errors present

**InitializationGuard** (29 lines)
- Guards features requiring Auto-Build initialization
- Shows informative message when not initialized
- Renders children when guard passes

### Integration Components

**LinearIntegration** (241 lines)
- Complete Linear integration UI
- Features:
  - Enable/disable toggle
  - API key input with visibility control
  - Connection status display
  - Task import functionality
  - Real-time sync configuration
  - Team/Project ID settings
- Sub-components:
  - `ConnectionStatus` - Connection state indicator
  - `ImportTasksPrompt` - Import action card
  - `RealtimeSyncToggle` - Sync toggle with description
  - `RealtimeSyncWarning` - Warning about auto-import
  - `TeamProjectIds` - ID configuration grid

**GitHubIntegration** (215 lines)
- Complete GitHub integration UI
- Features:
  - Enable/disable toggle
  - Personal access token input
  - Repository configuration
  - Connection status display
  - Auto-sync on load toggle
- Sub-components:
  - `TokenInput` - Token input with visibility toggle
  - `RepositoryInput` - Repo name configuration
  - `ConnectionStatus` - Connection state indicator
  - `IssuesAvailableInfo` - Info card about issues
  - `AutoSyncToggle` - Auto-sync control

### Section Routing

**SectionRouter** (207 lines)
- Routes to appropriate settings section
- Sections: `general`, `claude`, `linear`, `github`, `memory`
- Wraps sections with `InitializationGuard` where needed
- Maintains consistent section structure
- Passes appropriate props to each section

### Utilities

**hookProxyFactory** (57 lines)
- Creates stable hook proxy to prevent infinite loops
- Uses getters to access latest ref values
- Reduces 47 lines of boilerplate in main component
- Type-safe with full TypeScript support

## Usage Examples

### Using Common Components

```tsx
import { EmptyProjectState, ErrorDisplay, InitializationGuard } from './common';

// Empty state
<EmptyProjectState />

// Error display
<ErrorDisplay error={error} envError={envError} />

// Guard with initialization check
<InitializationGuard
  initialized={!!project.autoBuildPath}
  title="Feature Name"
  description="Feature description"
>
  <YourComponent />
</InitializationGuard>
```

### Using Integration Components

```tsx
import { LinearIntegration, GitHubIntegration } from './integrations';

// Linear integration
<LinearIntegration
  envConfig={envConfig}
  updateEnvConfig={updateEnvConfig}
  showLinearKey={showLinearKey}
  setShowLinearKey={setShowLinearKey}
  linearConnectionStatus={status}
  isCheckingLinear={isChecking}
  onOpenLinearImport={handleOpen}
/>

// GitHub integration
<GitHubIntegration
  envConfig={envConfig}
  updateEnvConfig={updateEnvConfig}
  showGitHubToken={showToken}
  setShowGitHubToken={setShowToken}
  gitHubConnectionStatus={status}
  isCheckingGitHub={isChecking}
/>
```

### Using Section Router

```tsx
import { SectionRouter } from './sections';

<SectionRouter
  activeSection={activeSection}
  project={project}
  settings={settings}
  setSettings={setSettings}
  // ... other props
/>
```

### Using Utilities

```tsx
import { createHookProxy } from './utils';

const hookRef = useRef(hook);
hookRef.current = hook;

const hookProxy = createHookProxy(hookRef);
```

## Refactoring Results

### Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Main file lines | 682 | 170 | 75% reduction |
| Number of files | 1 | 13 | Better organization |
| Largest component | 682 | 241 | More manageable |
| Code duplication | High | Low | DRY principle |

### Benefits

1. **Maintainability**: Each component has a single, clear responsibility
2. **Reusability**: Components can be used elsewhere in the application
3. **Testability**: Smaller components are easier to test in isolation
4. **Scalability**: Easy to add new sections or integrations
5. **Type Safety**: Explicit TypeScript interfaces throughout
6. **Readability**: Clear component names and structure

## Testing

### Recommended Test Coverage

1. **Unit Tests**
   - Each common component (EmptyProjectState, ErrorDisplay, InitializationGuard)
   - Each integration component (LinearIntegration, GitHubIntegration)
   - Hook proxy factory utility

2. **Integration Tests**
   - SectionRouter routing logic
   - Main ProjectSettingsContent orchestration

3. **Snapshot Tests**
   - All UI components for visual regression

4. **Hook Tests**
   - createHookProxy utility function

## Contributing

When adding new features:

1. **New Integration**: Add to `integrations/` following the pattern
2. **New Section**: Update `SectionRouter` with new case
3. **New Common Component**: Add to `common/` and export from index
4. **New Utility**: Add to `utils/` and export from index

## Migration from Old Code

The refactored code maintains 100% functional equivalence with the original implementation. No changes required in parent components.

### Import Changes

Old:
```tsx
// Everything was in one file
import { ProjectSettingsContent } from './ProjectSettingsContent';
```

New (if importing sub-components directly):
```tsx
// Can now import individual pieces
import { ProjectSettingsContent } from './ProjectSettingsContent';
import { LinearIntegration } from './integrations';
import { ErrorDisplay } from './common';
```

## Related Documentation

- See `REFACTORING_SUMMARY.md` for detailed refactoring analysis
- See individual component files for inline documentation
- See TypeScript interfaces for prop specifications
