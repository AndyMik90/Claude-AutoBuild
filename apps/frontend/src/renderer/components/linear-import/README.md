# Linear Task Import Module

This directory contains the refactored Linear task import functionality, structured for better code quality, maintainability, and reusability.

## Directory Structure

```
linear-import/
├── README.md                          # This file
├── index.ts                           # Central export point
├── types.ts                           # Type definitions and constants
├── LinearTaskImportModalRefactored.tsx # Main modal component
├── hooks/                             # Custom React hooks
│   ├── index.ts                      # Hook exports
│   ├── useLinearTeams.ts            # Load Linear teams
│   ├── useLinearProjects.ts         # Load Linear projects
│   ├── useLinearIssues.ts           # Load Linear issues
│   ├── useIssueFiltering.ts         # Filter and search issues
│   ├── useIssueSelection.ts         # Manage issue selection state
│   ├── useLinearImport.ts           # Handle import operation
│   └── useLinearImportModal.ts      # Main orchestration hook
└── components/                       # UI Components
    ├── index.ts                     # Component exports
    ├── ImportSuccessBanner.tsx      # Success message banner
    ├── ErrorBanner.tsx              # Error message banner
    ├── TeamProjectSelector.tsx      # Team/project dropdowns
    ├── SearchAndFilterBar.tsx       # Search and filter controls
    ├── SelectionControls.tsx        # Select all/deselect controls
    ├── IssueCard.tsx               # Individual issue display
    └── IssueList.tsx               # Issue list with states

```

## Architecture

### Separation of Concerns

The module is organized into three main layers:

1. **Hooks Layer** (`hooks/`)
   - Data fetching hooks for teams, projects, and issues
   - Business logic for filtering, selection, and import
   - Main orchestration hook that coordinates all functionality

2. **Components Layer** (`components/`)
   - Presentational components for UI elements
   - Each component has a single responsibility
   - Props-driven, easy to test and reuse

3. **Types Layer** (`types.ts`)
   - TypeScript interfaces and type definitions
   - Shared constants (colors, priority levels, etc.)
   - Props interfaces for components and hooks

### Main Orchestration Hook

`useLinearImportModal` is the central hook that:
- Combines all individual hooks
- Manages state coordination
- Provides a single interface for the main component
- Handles side effects and state updates

### Benefits of This Structure

1. **Maintainability**: Each file has a single, clear purpose
2. **Testability**: Hooks and components can be tested in isolation
3. **Reusability**: Components and hooks can be used independently
4. **Readability**: Clear file names and structure make navigation easy
5. **Type Safety**: Centralized types prevent duplication and errors

## Usage

### Main Component

```tsx
import { LinearTaskImportModal } from './linear-import';

<LinearTaskImportModal
  projectId="project-123"
  open={isOpen}
  onOpenChange={setIsOpen}
  onImportComplete={(result) => console.log('Imported:', result)}
/>
```

### Individual Hooks

You can also use individual hooks for custom implementations:

```tsx
import { useLinearTeams, useLinearIssues } from './linear-import/hooks';

function MyCustomComponent() {
  const { teams, isLoadingTeams } = useLinearTeams(projectId, true);
  const { issues, isLoadingIssues } = useLinearIssues(projectId, teamId, '');

  // Your custom logic here
}
```

### Individual Components

Components can be reused in different contexts:

```tsx
import { IssueCard, SearchAndFilterBar } from './linear-import/components';

function MyCustomView() {
  return (
    <>
      <SearchAndFilterBar
        searchQuery={query}
        filterState={filter}
        uniqueStateTypes={states}
        onSearchChange={setQuery}
        onFilterChange={setFilter}
      />
      {issues.map(issue => (
        <IssueCard
          key={issue.id}
          issue={issue}
          isSelected={selected.has(issue.id)}
          onToggle={toggleSelection}
        />
      ))}
    </>
  );
}
```

## File Size Reduction

The original `LinearTaskImportModal.tsx` was **611 lines**. After refactoring:
- Main modal component: ~150 lines (75% reduction)
- Functionality split across 15 focused files
- Each file is under 150 lines, easy to understand and maintain

## Type Safety

All components and hooks are fully typed with TypeScript:
- Props interfaces for all components
- Return type definitions for all hooks
- Shared types exported from `types.ts`
- No `any` types used

## Future Improvements

Possible enhancements to this structure:
1. Add unit tests for each hook and component
2. Extract additional utility functions as needed
3. Consider adding error boundary components
4. Add more granular loading states
5. Implement optimistic updates for better UX
