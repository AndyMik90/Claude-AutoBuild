# Plane Work Item Import Module

This directory contains the Plane.so work item import functionality, structured for better code quality, maintainability, and reusability. The architecture mirrors the Linear import module for consistency.

## Directory Structure

```
plane-import/
├── README.md                          # This file
├── index.ts                           # Central export point
├── types.ts                           # Type definitions and constants
├── PlaneTaskImportModal.tsx           # Main modal component
├── hooks/                             # Custom React hooks
│   ├── index.ts                      # Hook exports
│   ├── usePlaneProjects.ts           # Load Plane projects
│   ├── usePlaneWorkItems.ts          # Load Plane work items
│   ├── usePlaneStates.ts             # Load Plane states
│   ├── useWorkItemFiltering.ts       # Filter and search work items
│   ├── useWorkItemSelection.ts       # Manage work item selection state
│   ├── usePlaneImport.ts             # Handle import operation
│   └── usePlaneImportModal.ts        # Main orchestration hook
└── components/                        # UI Components
    ├── index.ts                      # Component exports
    ├── ImportSuccessBanner.tsx       # Success message banner
    ├── ErrorBanner.tsx               # Error message banner
    ├── WorkspaceProjectSelector.tsx  # Workspace/project dropdowns
    ├── SearchAndFilterBar.tsx        # Search and filter controls
    ├── SelectionControls.tsx         # Select all/deselect controls
    ├── WorkItemCard.tsx              # Individual work item display
    └── WorkItemList.tsx              # Work item list with states
```

## Architecture

### Separation of Concerns

The module is organized into three main layers:

1. **Hooks Layer** (`hooks/`)
   - Data fetching hooks for projects, work items, and states
   - Business logic for filtering, selection, and import
   - Main orchestration hook that coordinates all functionality

2. **Components Layer** (`components/`)
   - Presentational components for UI elements
   - Each component has a single responsibility
   - Props-driven, easy to test and reuse

3. **Types Layer** (`types.ts`)
   - TypeScript interfaces and type definitions
   - Shared constants (colors, priority levels, state groups)
   - Props interfaces for components and hooks

### Main Orchestration Hook

`usePlaneImportModal` is the central hook that:
- Combines all individual hooks
- Manages state coordination
- Provides a single interface for the main component
- Handles side effects and state updates

### Plane-Specific Concepts

Unlike Linear which uses teams, Plane uses:
- **Workspaces** - Top-level organization (identified by slug)
- **Projects** - Containers for work items within a workspace
- **Work Items** - Tasks/issues (called "issues" in Plane API)
- **States** - Workflow states grouped into: backlog, unstarted, started, completed, cancelled

## Usage

### Main Component

```tsx
import { PlaneTaskImportModal } from './plane-import';

<PlaneTaskImportModal
  projectId="project-123"
  open={isOpen}
  onOpenChange={setIsOpen}
  onImportComplete={(result) => console.log('Imported:', result)}
  defaultWorkspaceSlug="my-workspace"
/>
```

### Individual Hooks

You can also use individual hooks for custom implementations:

```tsx
import { usePlaneProjects, usePlaneWorkItems } from './plane-import/hooks';

function MyCustomComponent() {
  const { projects, isLoadingProjects } = usePlaneProjects(projectId, workspaceSlug);
  const { workItems, isLoadingWorkItems } = usePlaneWorkItems(
    projectId,
    workspaceSlug,
    planeProjectId
  );

  // Your custom logic here
}
```

### Individual Components

Components can be reused in different contexts:

```tsx
import { WorkItemCard, SearchAndFilterBar } from './plane-import/components';

function MyCustomView() {
  return (
    <>
      <SearchAndFilterBar
        searchQuery={query}
        filterStateGroup={filter}
        uniqueStates={states}
        onSearchChange={setQuery}
        onFilterChange={setFilter}
      />
      {workItems.map(item => (
        <WorkItemCard
          key={item.id}
          workItem={item}
          isSelected={selected.has(item.id)}
          onToggle={toggleSelection}
        />
      ))}
    </>
  );
}
```

## Configuration

Plane integration requires the following environment variables in the project's `.env`:

```bash
# Required
PLANE_API_KEY=plane_api_xxxxxxxxxxxxxxxxxxxxxxxx

# Optional (defaults shown)
PLANE_BASE_URL=https://api.plane.so
PLANE_WORKSPACE_SLUG=my-workspace
```

## Type Safety

All components and hooks are fully typed with TypeScript:
- Props interfaces for all components
- Return type definitions for all hooks
- Shared types exported from `types.ts`
- Re-exports core types from `shared/types`

## Comparison with Linear Import

| Feature | Linear | Plane |
|---------|--------|-------|
| Organization | Teams | Workspaces (slug-based) |
| Containers | Projects | Projects |
| Items | Issues | Work Items |
| States | State types | State groups |
| API Auth | OAuth / API Key | API Key only |
