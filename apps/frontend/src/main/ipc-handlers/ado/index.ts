/**
 * Azure DevOps integration IPC handlers
 *
 * Main entry point that registers all ADO-related handlers.
 * Handlers are organized into modules by functionality:
 * - workitem-handlers: Work item (issue) fetching and management
 * - pr-handlers: Pull request operations and reviews
 */

import { registerWorkItemHandlers } from './workitem-handlers';
import { registerPRHandlers } from './pr-handlers';

/**
 * Register all Azure DevOps IPC handlers
 */
export function registerADOHandlers(): void {
  registerWorkItemHandlers();
  registerPRHandlers();
}

// Re-export utilities for potential external use
export { getADOConfig, adoFetch } from './utils';
export type { ADOConfig, ADOWorkItem, ADOPullRequest } from './types';
