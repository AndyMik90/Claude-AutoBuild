# Context Component Refactoring

This directory contains the refactored Context component, broken down into logical, maintainable modules.

## Structure

```
context/
├── Context.tsx                 # Main component - entry point (2.3KB, down from 35KB)
├── types.ts                    # TypeScript type definitions
├── constants.ts                # Icon mappings and color schemes
├── hooks.ts                    # Custom React hooks for data fetching
├── utils.ts                    # Utility functions (date formatting, etc.)
├── InfoItem.tsx                # Reusable info display component
├── MemoryCard.tsx              # Memory episode card component
├── ServiceCard.tsx             # Service card component with all service details
├── ProjectIndexTab.tsx         # Project index tab content
├── MemoriesTab.tsx             # Memories tab content
├── service-sections/           # Collapsible service detail sections
│   ├── EnvironmentSection.tsx
│   ├── APIRoutesSection.tsx
│   ├── DatabaseSection.tsx
│   ├── ExternalServicesSection.tsx
│   ├── MonitoringSection.tsx
│   ├── DependenciesSection.tsx
│   └── index.ts
└── index.ts                    # Module exports

../Context.tsx                  # Re-export wrapper for backward compatibility
```

## Architecture

### Main Component (`Context.tsx`)
- Orchestrates the two main tabs (Project Index and Memories)
- Uses custom hooks for data fetching and state management
- Delegates rendering to specialized tab components
- Clean, readable entry point (~70 lines)

### Tab Components
- **ProjectIndexTab**: Displays project structure, services, infrastructure, and conventions
- **MemoriesTab**: Shows memory status, search interface, and recent memories

### Service Sections
Each service detail section (environment, API routes, database, etc.) is a separate component:
- Self-contained with its own expand/collapse state
- Consistent UI patterns
- Easy to test and modify independently

### Shared Components
- **ServiceCard**: Comprehensive service display with all collapsible sections
- **MemoryCard**: Memory episode display with expand/collapse
- **InfoItem**: Simple label/value pair display

### Utilities
- **hooks.ts**: Custom hooks for project context loading, refresh, and search
- **constants.ts**: Icon and color mappings for service types and memory types
- **utils.ts**: Date formatting and other utility functions

## Benefits

1. **Maintainability**: Each component has a single responsibility
2. **Testability**: Small, focused components are easier to test
3. **Reusability**: Components like InfoItem and section components can be reused
4. **Readability**: Clear file organization and naming conventions
5. **Type Safety**: Proper TypeScript types for all props and data
6. **Scalability**: Easy to add new service sections or features

## Backward Compatibility

The original `Context.tsx` file now acts as a re-export wrapper, ensuring all existing imports continue to work:

```typescript
import { Context } from './components/Context'; // Still works!
```

## File Size Reduction

- **Before**: 854 lines in a single file (35KB)
- **After**: Main component is 70 lines (2.3KB), with logic distributed across 14 focused modules
- **Reduction**: ~95% reduction in main file size

## Usage

```typescript
import { Context } from '@/components/context';
// or
import { Context } from '@/components/Context'; // Backward compatible

function App() {
  return <Context projectId="my-project-id" />;
}
```
