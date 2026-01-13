/**
 * GitLab IPC Handlers Module
 *
 * This module exports the main registration function for all GitLab-related IPC handlers.
 */

import type { BrowserWindow } from 'electron';
import type { AgentManager } from '../../agent';

import { registerGitlabOAuthHandlers } from './oauth-handlers';
import { registerRepositoryHandlers } from './repository-handlers';
import { registerIssueHandlers } from './issue-handlers';
import { registerInvestigationHandlers } from './investigation-handlers';
import { registerImportHandlers } from './import-handlers';
import { registerReleaseHandlers } from './release-handlers';
import { registerMergeRequestHandlers } from './merge-request-handlers';
import { registerMRReviewHandlers } from './mr-review-handlers';
import { registerAutoFixHandlers } from './autofix-handlers';
import { registerTriageHandlers } from './triage-handlers';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debugLog(message: string): void {
  if (DEBUG) {
    console.debug(`[GitLab] ${message}`);
  }
}

/**
 * Register all GitLab IPC handlers
 */
export function registerGitlabHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  debugLog('Registering all GitLab handlers');

  // OAuth and authentication handlers (glab CLI)
  registerGitlabOAuthHandlers();

  // Repository/project handlers
  registerRepositoryHandlers();

  // Issue handlers
  registerIssueHandlers();

  // Investigation handlers (AI-powered)
  registerInvestigationHandlers(agentManager, getMainWindow);

  // Import handlers
  registerImportHandlers();

  // Release handlers
  registerReleaseHandlers();

  // Merge request handlers
  registerMergeRequestHandlers();

  // MR Review handlers (AI-powered)
  registerMRReviewHandlers(getMainWindow);

  // Auto-Fix handlers
  registerAutoFixHandlers(getMainWindow);

  // Triage handlers
  registerTriageHandlers(getMainWindow);

  debugLog('All GitLab handlers registered');
}

// Re-export individual registration functions for custom usage
export {
  registerGitlabOAuthHandlers,
  registerRepositoryHandlers,
  registerIssueHandlers,
  registerInvestigationHandlers,
  registerImportHandlers,
  registerReleaseHandlers,
  registerMergeRequestHandlers,
  registerMRReviewHandlers,
  registerAutoFixHandlers,
  registerTriageHandlers
};
