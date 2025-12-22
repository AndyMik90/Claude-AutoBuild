/**
 * GitHub integration IPC handlers
 *
 * This file serves as the main entry point for GitHub-related handlers.
 * All handler implementations have been modularized into the github/ subdirectory.
 *
 * Module organization:
 * - github/repository-handlers.ts - Repository and connection management
 * - github/issue-handlers.ts - Issue fetching and retrieval
 * - github/investigation-handlers.ts - AI-powered issue investigation
 * - github/import-handlers.ts - Bulk issue import
 * - github/release-handlers.ts - GitHub release creation
 * - github/utils.ts - Shared utility functions
 * - github/spec-utils.ts - Spec creation utilities
 * - github/types.ts - TypeScript type definitions
 */

import type { BrowserWindow } from 'electron';
import { AgentManager } from '../agent';
import { registerGithubHandlers as registerModularHandlers } from './github';

/**
 * Register all GitHub-related IPC handlers
 *
 * @param agentManager - Agent manager instance for task creation
 * @param getMainWindow - Function to get the main browser window
 */
export function registerGithubHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  registerModularHandlers(agentManager, getMainWindow);
}
