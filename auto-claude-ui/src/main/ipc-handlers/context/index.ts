import type { BrowserWindow } from 'electron';
import type { PythonEnvManager } from '../../python-env-manager';
import { registerProjectContextHandlers } from './project-context-handlers';
import { registerMemoryStatusHandlers } from './memory-status-handlers';
import { registerMemoryDataHandlers } from './memory-data-handlers';

/**
 * Register all context-related IPC handlers
 */
export function registerContextHandlers(
  pythonEnvManager: PythonEnvManager,
  getMainWindow: () => BrowserWindow | null
): void {
  registerProjectContextHandlers(pythonEnvManager, getMainWindow);
  registerMemoryStatusHandlers(getMainWindow);
  registerMemoryDataHandlers(getMainWindow);
}

// Re-export utility functions for testing or external use
export * from './utils';
export * from './memory-status-handlers';
export * from './memory-data-handlers';
export * from './project-context-handlers';
