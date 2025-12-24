/**
 * GitLab import handlers
 * Handles bulk importing issues as tasks
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, Project, GitLabImportResult } from '../../../shared/types';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIIssue } from './types';
import { createSpecForIssue, GitLabTaskInfo } from './spec-utils';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Logs debug messages for the GitLab import flow when debug mode is enabled.
 *
 * @param message - The message to log
 * @param data - Optional additional data to include with the log (any value)
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab Import] ${message}`, data);
    } else {
      console.debug(`[GitLab Import] ${message}`);
    }
  }
}

/**
 * Register an IPC handler that imports multiple GitLab issues into tasks.
 *
 * Sets up a handler for IPC_CHANNELS.GITLAB_IMPORT_ISSUES which accepts a project and an array of issue IIDs,
 * attempts to fetch and convert each issue into an internal task spec, and responds with a summary containing
 * whether any issues were imported, counts of imported and failed items, and any per-issue error messages.
 */
export function registerImportIssues(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_IMPORT_ISSUES,
    async (_event, project: Project, issueIids: number[]): Promise<IPCResult<GitLabImportResult>> => {
      debugLog('importGitLabIssues handler called', { issueIids });

      const config = getGitLabConfig(project);
      if (!config) {
        return {
          success: false,
          error: 'GitLab not configured'
        };
      }

      const tasks: GitLabTaskInfo[] = [];
      const errors: string[] = [];
      let imported = 0;
      let failed = 0;

      for (const iid of issueIids) {
        try {
          const encodedProject = encodeProjectPath(config.project);

          // Fetch the issue
          const apiIssue = await gitlabFetch(
            config.token,
            config.instanceUrl,
            `/projects/${encodedProject}/issues/${iid}`
          ) as GitLabAPIIssue;

          // Create a spec/task from the issue
          const task = await createSpecForIssue(project, apiIssue, config);

          if (task) {
            tasks.push(task);
            imported++;
            debugLog('Imported issue:', { iid, taskId: task.id });
          } else {
            failed++;
            errors.push(`Failed to create task for issue #${iid}`);
          }
        } catch (error) {
          failed++;
          const errorMessage = error instanceof Error ? error.message : `Unknown error for issue #${iid}`;
          errors.push(errorMessage);
          debugLog('Failed to import issue:', { iid, error: errorMessage });
        }
      }

      return {
        success: true,
        data: {
          success: imported > 0,
          imported,
          failed,
          errors: errors.length > 0 ? errors : undefined
        }
      };
    }
  );
}

/**
 * Register IPC handlers used to import data from GitLab.
 *
 * Registers the handlers required for bulk importing GitLab issues into the application.
 */
export function registerImportHandlers(): void {
  debugLog('Registering GitLab import handlers');
  registerImportIssues();
  debugLog('GitLab import handlers registered');
}