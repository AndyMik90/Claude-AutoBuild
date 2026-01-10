/**
 * Forgejo integration IPC handlers
 *
 * Main entry point that registers all Forgejo-related handlers.
 * Handlers are organized into modules by functionality:
 * - instance-handlers: Instance management (add, remove, test)
 * - repository-handlers: Repository and connection management
 * - issue-handlers: Issue fetching and management
 * - pr-handlers: Pull request operations
 */

import type { BrowserWindow } from 'electron';
import { AgentManager } from '../../agent';
import { registerInstanceHandlers } from './instance-handlers';
import { registerRepositoryHandlers } from './repository-handlers';
import { registerIssueHandlers } from './issue-handlers';
import { registerPRHandlers } from './pr-handlers';
import { registerInvestigationHandlers } from './investigation-handlers';

/**
 * Register all Forgejo-related IPC handlers
 */
export function registerForgejoHandlers(
  agentManager?: AgentManager,
  getMainWindow?: () => BrowserWindow | null
): void {
  registerInstanceHandlers();
  registerRepositoryHandlers();
  registerIssueHandlers();
  registerPRHandlers();

  // Register investigation handlers if agentManager and getMainWindow are provided
  if (agentManager && getMainWindow) {
    registerInvestigationHandlers(agentManager, getMainWindow);
  }
}

// Re-export utilities for potential external use
export { getForgejoConfig, forgejoFetch, loadForgejoInstances } from './utils';
export type { ForgejoConfig, ForgejoInstanceConfig } from './types';
