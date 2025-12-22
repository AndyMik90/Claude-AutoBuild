# Changelog Module

This directory contains the refactored changelog generation system, split into focused, maintainable modules.

## Architecture

The changelog service has been decomposed from a monolithic 1,279-line file into specialized modules:

### Module Structure

```
changelog/
├── changelog-service.ts    # Main orchestrator (slim facade)
├── generator.ts            # AI-powered changelog generation
├── parser.ts               # Parsing and extraction logic
├── formatter.ts            # Prompt building and formatting
├── git-integration.ts      # Git operations (branches, tags, commits)
├── types.ts                # Module-specific type definitions
└── index.ts                # Clean module exports
```

### Responsibilities

#### `changelog-service.ts` (Main Facade)
- Orchestrates all changelog operations
- Manages configuration and environment setup
- Delegates to specialized modules
- Provides public API for IPC handlers
- ~465 lines (down from 1,279)

#### `generator.ts` (AI Generation)
- Handles Claude CLI subprocess spawning
- Manages generation lifecycle and progress
- Rate limit detection and error handling
- Environment configuration for subprocess
- ~340 lines

#### `parser.ts` (Parsing & Extraction)
- Extract spec overviews
- Extract changelog from AI output
- Parse existing changelog files
- Parse git log output into structured data
- ~160 lines

#### `formatter.ts` (Prompt Building)
- Build prompts for task-based changelogs
- Build prompts for git-based changelogs
- Format templates (keep-a-changelog, simple-list, github-release)
- Audience-specific instructions (technical, user-facing, marketing)
- Python script generation for Claude CLI
- ~190 lines

#### `git-integration.ts` (Git Operations)
- Get branches (local and remote)
- Get tags with metadata
- Get current and default branch
- Get commits for various scenarios (recent, since-date, tag-range)
- Get branch diff commits
- ~230 lines

#### `types.ts` (Type Definitions)
- Changelog-specific types
- Configuration interfaces
- Internal type definitions
- ~25 lines

## Usage

### Import the Service

```typescript
import { changelogService } from './changelog-service';
// or
import { changelogService } from './changelog';
```

### Backward Compatibility

The original `/src/main/changelog-service.ts` now serves as a re-export facade, maintaining full backward compatibility with existing code.

## Benefits of Refactoring

1. **Single Responsibility**: Each module has one clear purpose
2. **Easier Testing**: Smaller, focused modules are easier to test
3. **Better Maintainability**: Changes are isolated to relevant modules
4. **Reduced Complexity**: No single file exceeds 500 lines
5. **Improved Readability**: Clear separation of concerns
6. **Easier Navigation**: Developers can quickly find relevant code

## Design Patterns Used

- **Facade Pattern**: `changelog-service.ts` provides unified interface
- **Delegation**: Service delegates to specialized modules
- **Single Responsibility**: Each module has one clear concern
- **Event Emitter**: Generator emits progress and error events

## Migration Notes

No changes required for existing code - the refactoring maintains full API compatibility through the facade pattern.
