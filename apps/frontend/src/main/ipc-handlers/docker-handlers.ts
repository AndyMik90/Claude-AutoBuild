/**
 * Docker & Infrastructure IPC Handlers
 *
 * DEPRECATED: This file is kept for backward compatibility.
 * Memory infrastructure has moved to LadybugDB (no Docker required).
 * See memory-handlers.ts for the new implementation.
 *
 * This file now re-exports from memory-handlers.ts
 */

import { registerMemoryHandlers } from './memory-handlers';

/**
 * Register all Docker-related IPC handlers
 * @deprecated Use registerMemoryHandlers() instead
 */
export function registerDockerHandlers(): void {
  // Register the new memory handlers instead
  registerMemoryHandlers();
}
