/**
 * GitLab import handlers
 * Handles bulk importing issues as tasks
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, GitLabImportResult } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIIssue } from './types';
import { createSpecForIssue, GitLabTaskInfo } from './spec-utils';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

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
 * Import multiple GitLab issues as tasks
 */
export function registerImportIssues(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_IMPORT_ISSUES,
    async (_event, projectId: string, issueIids: number[]): Promise<IPCResult<GitLabImportResult>> => {
      debugLog('importGitLabIssues handler called', { issueIids });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = await getGitLabConfig(project);
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
          const task = await createSpecForIssue(project, apiIssue, config, project.settings?.mainBranch);

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

      // Note: IPCResult.success indicates transport success (IPC call completed without system error).
      // data.success indicates operation success (at least one issue was imported).
      // This distinction allows the UI to differentiate between system failures and partial imports.
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
 * Register all import handlers
 */
export function registerImportHandlers(): void {
  debugLog('Registering GitLab import handlers');
  registerImportIssues();
  debugLog('GitLab import handlers registered');
}
