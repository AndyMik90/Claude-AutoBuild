/**
 * Task handlers - Main entry point
 *
 * This file serves as the main entry point for all task-related IPC handlers.
 * The actual implementation has been refactored into smaller, focused modules
 * organized by responsibility:
 *
 * - task/crud-handlers.ts - Create, Read, Update, Delete operations
 * - task/execution-handlers.ts - Start, Stop, Review, Status management, Recovery
 * - task/worktree-handlers.ts - Worktree management (status, diff, merge, discard, list)
 * - task/logs-handlers.ts - Task logs management (get, watch, unwatch)
 * - task/shared.ts - Shared utilities and helper functions
 *
 * This modular structure improves:
 * - Code maintainability and readability
 * - Testability of individual components
 * - Separation of concerns
 * - Developer experience when working with the codebase
 */

// Re-export the main registration function from the task module
export { registerTaskHandlers } from './task';
