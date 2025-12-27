# Terminal Component Architecture

This directory contains the refactored Terminal component, broken down into smaller, maintainable modules with clear separation of concerns.

## Directory Structure

```
terminal/
├── README.md                    # This file
├── index.ts                     # Public exports
├── types.ts                     # TypeScript types and constants
├── TerminalHeader.tsx           # Terminal header with controls
├── TerminalTitle.tsx            # Editable title component
├── TaskSelector.tsx             # Task selection dropdown
├── useXterm.ts                  # Xterm.js initialization hook
├── usePtyProcess.ts             # PTY process management hook
├── useTerminalEvents.ts         # Terminal event listeners hook
└── useAutoNaming.ts             # Auto-naming functionality hook
```

## Component Hierarchy

```
Terminal (main component - 196 lines, down from 767)
├── TerminalHeader
│   ├── TerminalTitle (editable title with tooltip)
│   └── TaskSelector (task selection/status dropdown)
├── useXterm (xterm.js UI management)
├── usePtyProcess (PTY lifecycle management)
├── useTerminalEvents (event listeners)
└── useAutoNaming (command-based naming)
```

## Files Overview

### Main Component

**Terminal.tsx** (196 lines)
- Main entry point that composes all sub-components and hooks
- Handles drag-and-drop for file insertion
- Manages terminal activation and focus
- Coordinates task selection and context passing
- Reduced from 767 lines to 196 lines (74% reduction)

### UI Components

**TerminalHeader.tsx** (94 lines)
- Renders terminal header with status indicator
- Contains Claude invocation button
- Integrates title editing and task selection
- Handles terminal close action

**TerminalTitle.tsx** (111 lines)
- Inline editable title with double-click to edit
- Shows task description in tooltip when task is associated
- Handles keyboard shortcuts (Enter to save, Escape to cancel)
- Auto-sizes input field based on content

**TaskSelector.tsx** (168 lines)
- Dropdown for selecting tasks from backlog
- Shows current task status with phase indicator
- Animated loading states for active phases
- Supports task switching and clearing
- Integrates with task creation flow

### Type Definitions

**types.ts** (32 lines)
- `TerminalProps` interface
- `STATUS_COLORS` mapping for terminal status indicators
- `PHASE_CONFIG` for execution phase display configuration
- Centralized type definitions for the entire module

### Custom Hooks

**useXterm.ts** (166 lines)
- Initializes xterm.js terminal UI with theme configuration
- Manages FitAddon for responsive terminal sizing
- Handles input buffering and command tracking
- Provides write, writeln, focus, and dispose methods
- Manages output buffer replay for session persistence

**usePtyProcess.ts** (78 lines)
- Creates and manages PTY (pseudoterminal) processes
- Handles both new terminal creation and session restoration
- Manages process lifecycle (creation, running, exit)
- Provides error handling for PTY operations
- Prevents double-creation with ref guards

**useTerminalEvents.ts** (54 lines)
- Sets up IPC event listeners for terminal events
- Handles terminal output streaming
- Manages exit notifications
- Tracks title changes from shell
- Captures Claude session IDs

**useAutoNaming.ts** (62 lines)
- Generates intelligent terminal names based on commands
- Filters out common/short commands
- Debounces naming requests (1.5s delay)
- Only runs when auto-naming is enabled
- Respects Claude mode (no auto-naming during Claude sessions)

## Key Improvements

### Code Organization
- **Single Responsibility**: Each file has one clear purpose
- **Separation of Concerns**: UI, logic, and state management are separated
- **Reusability**: Hooks and components can be reused or tested independently
- **Type Safety**: Centralized types prevent inconsistencies

### Maintainability
- **Smaller Files**: Easier to understand and modify (largest file is 196 lines)
- **Clear Dependencies**: Import structure shows relationships clearly
- **Better Testing**: Isolated units are easier to test
- **Documentation**: Each file has a clear purpose

### Developer Experience
- **Easy Navigation**: Related code is grouped logically
- **Reduced Cognitive Load**: Can focus on one concern at a time
- **Clear Interfaces**: Hook APIs are well-defined with TypeScript
- **Composability**: Components can be mixed and matched

## Usage

### Importing the Main Component

```typescript
import { Terminal } from './components/Terminal';
// or
import { Terminal } from './components/terminal';
```

### Importing Sub-components or Hooks

```typescript
import { TerminalHeader, useXterm, useAutoNaming } from './components/terminal';
```

### Using Individual Hooks

```typescript
function CustomTerminal() {
  const { terminalRef, write, focus } = useXterm({
    terminalId: 'my-terminal',
    onCommandEnter: (cmd) => console.log('Command:', cmd),
    onResize: (cols, rows) => console.log('Resized:', cols, rows),
  });

  useTerminalEvents({
    terminalId: 'my-terminal',
    onOutput: (data) => write(data),
    onExit: (code) => console.log('Exited:', code),
  });

  return <div ref={terminalRef} />;
}
```

## Design Patterns

### Custom Hooks Pattern
All terminal functionality is encapsulated in custom hooks that:
- Accept configuration via options object
- Return methods and state via object destructuring
- Use refs to avoid unnecessary re-renders
- Provide cleanup functions where needed

### Component Composition
The main Terminal component uses composition over inheritance:
- Renders TerminalHeader which composes TerminalTitle and TaskSelector
- Uses hooks for all complex logic
- Keeps the component focused on coordination

### Event-Driven Architecture
Terminal events flow through a clear pipeline:
1. Main process emits event via IPC
2. useTerminalEvents hook catches event
3. Hook updates store and calls callback
4. Component reacts to state changes

## Future Enhancements

Potential improvements that are now easier to implement:

1. **Testing**: Each hook and component can be unit tested independently
2. **Theming**: Terminal theme configuration could be extracted to a separate hook
3. **Plugins**: New features can be added as additional hooks
4. **Performance**: Individual hooks can be optimized without affecting others
5. **Alternative UIs**: Components can be swapped for different terminal UIs

## Migration Guide

The refactored component maintains 100% API compatibility with the original:

```typescript
// Before and after - same props, same behavior
<Terminal
  id={terminalId}
  cwd={workingDir}
  projectPath={projectPath}
  isActive={activeId === terminalId}
  onClose={() => handleClose(terminalId)}
  onActivate={() => setActive(terminalId)}
  tasks={tasks}
  onNewTaskClick={openTaskDialog}
/>
```

No changes needed to existing code using the Terminal component!
