/**
 * Forgejo integration IPC handlers
 *
 * This file serves as the main entry point for Forgejo-related handlers.
 * All handler implementations have been modularized into the forgejo/ subdirectory.
 *
 * Module organization:
 * - forgejo/instance-handlers.ts - Instance management (add, remove, test)
 * - forgejo/repository-handlers.ts - Repository and connection management
 * - forgejo/issue-handlers.ts - Issue fetching and management
 * - forgejo/pr-handlers.ts - Pull request operations
 * - forgejo/utils.ts - Shared utility functions
 * - forgejo/types.ts - TypeScript type definitions
 */

import type { BrowserWindow } from 'electron';
import { AgentManager } from '../agent';
import { registerForgejoHandlers as registerModularHandlers } from './forgejo';

/**
 * Register all Forgejo-related IPC handlers
 *
 * @param agentManager - Agent manager instance for task creation
 * @param getMainWindow - Function to get the main browser window
 */
export function registerForgejoHandlers(
  agentManager?: AgentManager,
  getMainWindow?: () => BrowserWindow | null
): void {
  registerModularHandlers(agentManager, getMainWindow);
}
