/**
 * GitLab repository handlers
 * Handles connection status and project management
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, Project, GitLabSyncStatus } from '../../../shared/types';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIProject, GitLabAPIIssue } from './types';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Logs debug messages for GitLab repository handlers when debug mode is enabled.
 *
 * @param message - The message to record
 * @param data - Optional additional context to include with the message
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab Repo] ${message}`, data);
    } else {
      console.debug(`[GitLab Repo] ${message}`);
    }
  }
}

/**
 * Registers an IPC handler for GITLAB_CHECK_CONNECTION that checks a project's GitLab configuration and connectivity.
 *
 * The handler returns an IPCResult containing connection status and, when connected, the instance URL, project path with namespace, project description, open issue count, and a lastSyncedAt timestamp.
 */
export function registerCheckConnection(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CHECK_CONNECTION,
    async (_event, project: Project): Promise<IPCResult<GitLabSyncStatus>> => {
      debugLog('checkGitLabConnection handler called', { projectId: project.id });

      const config = getGitLabConfig(project);
      if (!config) {
        debugLog('No GitLab config found');
        return {
          success: true,
          data: {
            connected: false,
            error: 'GitLab not configured. Please add GITLAB_TOKEN and GITLAB_PROJECT to your .env file.'
          }
        };
      }

      try {
        const encodedProject = encodeProjectPath(config.project);

        // Fetch project info
        const projectInfo = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}`
        ) as GitLabAPIProject;

        debugLog('Project info retrieved:', { name: projectInfo.name });

        // Get issue count
        const issues = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/issues?state=opened&per_page=1`
        ) as GitLabAPIIssue[];

        // GitLab returns total count in headers, but for simplicity we just count opened
        const issueCount = Array.isArray(issues) ? issues.length : 0;

        return {
          success: true,
          data: {
            connected: true,
            instanceUrl: config.instanceUrl,
            projectPathWithNamespace: projectInfo.path_with_namespace,
            projectDescription: projectInfo.description,
            issueCount,
            lastSyncedAt: new Date().toISOString()
          }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to connect to GitLab';
        debugLog('Connection check failed:', errorMessage);
        return {
          success: true,
          data: {
            connected: false,
            error: errorMessage
          }
        };
      }
    }
  );
}

/**
 * Register an IPC handler that retrieves GitLab projects the current user can access.
 *
 * The handler listens on IPC_CHANNELS.GITLAB_GET_PROJECTS and expects a `Project` argument.
 * If GitLab is not configured for the given project the handler returns a failure result with an error message.
 * On success the handler returns an IPC result containing an array of `GitLabAPIProject`.
 */
export function registerGetProjects(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_PROJECTS,
    async (_event, project: Project): Promise<IPCResult<GitLabAPIProject[]>> => {
      debugLog('getGitLabProjects handler called');

      const config = getGitLabConfig(project);
      if (!config) {
        return {
          success: false,
          error: 'GitLab not configured'
        };
      }

      try {
        const projects = await gitlabFetch(
          config.token,
          config.instanceUrl,
          '/projects?membership=true&per_page=100'
        ) as GitLabAPIProject[];

        debugLog('Found projects:', projects.length);

        return {
          success: true,
          data: projects
        };
      } catch (error) {
        debugLog('Failed to get projects:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get projects'
        };
      }
    }
  );
}

/**
 * Register IPC handlers for GitLab repository operations.
 *
 * Registers the handlers used to check GitLab connection status and to retrieve
 * accessible GitLab projects.
 */
export function registerRepositoryHandlers(): void {
  debugLog('Registering GitLab repository handlers');
  registerCheckConnection();
  registerGetProjects();
  debugLog('GitLab repository handlers registered');
}