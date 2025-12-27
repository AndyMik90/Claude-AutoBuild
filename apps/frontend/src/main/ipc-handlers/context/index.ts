import type { BrowserWindow } from 'electron';
import { registerProjectContextHandlers } from './project-context-handlers';
import { registerMemoryStatusHandlers } from './memory-status-handlers';
import { registerMemoryDataHandlers } from './memory-data-handlers';

/**
 * Register all context-related IPC handlers
 */
export function registerContextHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  registerProjectContextHandlers(getMainWindow);
  registerMemoryStatusHandlers(getMainWindow);
  registerMemoryDataHandlers(getMainWindow);
}

// Re-export utility functions for testing or external use
export * from './utils';
export * from './memory-status-handlers';
export * from './memory-data-handlers';
export * from './project-context-handlers';
