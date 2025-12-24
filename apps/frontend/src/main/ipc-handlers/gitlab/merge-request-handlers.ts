/**
 * GitLab Merge Request handlers
 * Handles MR operations (equivalent to GitHub PRs)
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, Project, GitLabMergeRequest } from '../../../shared/types';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIMergeRequest, CreateMergeRequestOptions } from './types';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Logs a debug message prefixed with "[GitLab MR]" when debugging is enabled.
 *
 * @param message - The log message to emit
 * @param data - Optional additional context or data to include with the message
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab MR] ${message}`, data);
    } else {
      console.debug(`[GitLab MR] ${message}`);
    }
  }
}

/**
 * Convert a GitLab API merge request object into the internal GitLabMergeRequest shape.
 *
 * @param apiMr - The merge request object returned by the GitLab API
 * @returns A GitLabMergeRequest with fields mapped from the API object, including identifiers, title and description, source/target branches, author and assignees (with avatars), labels, web URL, timestamps, and merge status
 */
function transformMergeRequest(apiMr: GitLabAPIMergeRequest): GitLabMergeRequest {
  return {
    id: apiMr.id,
    iid: apiMr.iid,
    title: apiMr.title,
    description: apiMr.description,
    state: apiMr.state,
    sourceBranch: apiMr.source_branch,
    targetBranch: apiMr.target_branch,
    author: {
      username: apiMr.author.username,
      avatarUrl: apiMr.author.avatar_url
    },
    assignees: apiMr.assignees.map(a => ({
      username: a.username,
      avatarUrl: a.avatar_url
    })),
    labels: apiMr.labels,
    webUrl: apiMr.web_url,
    createdAt: apiMr.created_at,
    updatedAt: apiMr.updated_at,
    mergedAt: apiMr.merged_at,
    mergeStatus: apiMr.merge_status
  };
}

/**
 * Register an IPC handler that retrieves merge requests for a GitLab project.
 *
 * The registered handler listens on the `GITLAB_GET_MERGE_REQUESTS` channel. It expects a `Project`
 * and an optional `state` string and returns an `IPCResult` whose `data` is an array of
 * `GitLabMergeRequest` objects on success or an `error` message on failure.
 */
export function registerGetMergeRequests(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_MERGE_REQUESTS,
    async (_event, project: Project, state?: string): Promise<IPCResult<GitLabMergeRequest[]>> => {
      debugLog('getGitLabMergeRequests handler called', { state });

      const config = getGitLabConfig(project);
      if (!config) {
        return {
          success: false,
          error: 'GitLab not configured'
        };
      }

      try {
        const encodedProject = encodeProjectPath(config.project);
        const stateParam = state || 'opened';

        const apiMrs = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/merge_requests?state=${stateParam}&per_page=100&order_by=updated_at&sort=desc`
        ) as GitLabAPIMergeRequest[];

        debugLog('Fetched merge requests:', apiMrs.length);

        const mrs = apiMrs.map(transformMergeRequest);

        return {
          success: true,
          data: mrs
        };
      } catch (error) {
        debugLog('Failed to get merge requests:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get merge requests'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that retrieves a single GitLab merge request by IID for a given project.
 *
 * The handler listens on the `GITLAB_GET_MERGE_REQUEST` channel, validates GitLab configuration for the project,
 * fetches the merge request from the configured GitLab instance, transforms it to the internal `GitLabMergeRequest`
 * shape, and returns an `IPCResult` containing the merge request data or an error message.
 */
export function registerGetMergeRequest(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_MERGE_REQUEST,
    async (_event, project: Project, mrIid: number): Promise<IPCResult<GitLabMergeRequest>> => {
      debugLog('getGitLabMergeRequest handler called', { mrIid });

      const config = getGitLabConfig(project);
      if (!config) {
        return {
          success: false,
          error: 'GitLab not configured'
        };
      }

      try {
        const encodedProject = encodeProjectPath(config.project);

        const apiMr = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/merge_requests/${mrIid}`
        ) as GitLabAPIMergeRequest;

        const mr = transformMergeRequest(apiMr);

        return {
          success: true,
          data: mr
        };
      } catch (error) {
        debugLog('Failed to get merge request:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get merge request'
        };
      }
    }
  );
}

/**
 * Register an IPC handler that creates a GitLab merge request for a project.
 *
 * The handler listens on the GITLAB_CREATE_MERGE_REQUEST channel and expects a
 * Project and CreateMergeRequestOptions; it returns an IPCResult containing the
 * created GitLabMergeRequest on success or an error message on failure.
 */
export function registerCreateMergeRequest(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CREATE_MERGE_REQUEST,
    async (_event, project: Project, options: CreateMergeRequestOptions): Promise<IPCResult<GitLabMergeRequest>> => {
      debugLog('createGitLabMergeRequest handler called', { title: options.title });

      const config = getGitLabConfig(project);
      if (!config) {
        return {
          success: false,
          error: 'GitLab not configured'
        };
      }

      try {
        const encodedProject = encodeProjectPath(config.project);

        const mrBody: Record<string, unknown> = {
          source_branch: options.sourceBranch,
          target_branch: options.targetBranch,
          title: options.title
        };

        if (options.description) {
          mrBody.description = options.description;
        }

        if (options.labels) {
          mrBody.labels = options.labels.join(',');
        }

        if (options.assigneeIds) {
          mrBody.assignee_ids = options.assigneeIds;
        }

        if (options.removeSourceBranch !== undefined) {
          mrBody.remove_source_branch = options.removeSourceBranch;
        }

        if (options.squash !== undefined) {
          mrBody.squash = options.squash;
        }

        const apiMr = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/merge_requests`,
          {
            method: 'POST',
            body: JSON.stringify(mrBody)
          }
        ) as GitLabAPIMergeRequest;

        debugLog('Merge request created:', { iid: apiMr.iid });

        const mr = transformMergeRequest(apiMr);

        return {
          success: true,
          data: mr
        };
      } catch (error) {
        debugLog('Failed to create merge request:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create merge request'
        };
      }
    }
  );
}

/**
 * Registers an IPC handler that updates an existing GitLab merge request for a project.
 *
 * The registered handler listens on the GITLAB_UPDATE_MERGE_REQUEST channel and accepts
 * a Project, a merge request IID, and a partial set of update fields. It applies the
 * provided updates to the merge request and returns the transformed updated merge request
 * on success or an error message on failure.
 *
 * The handler returns an error if GitLab is not configured for the given project.
 */
export function registerUpdateMergeRequest(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_UPDATE_MERGE_REQUEST,
    async (
      _event,
      project: Project,
      mrIid: number,
      updates: Partial<CreateMergeRequestOptions>
    ): Promise<IPCResult<GitLabMergeRequest>> => {
      debugLog('updateGitLabMergeRequest handler called', { mrIid });

      const config = getGitLabConfig(project);
      if (!config) {
        return {
          success: false,
          error: 'GitLab not configured'
        };
      }

      try {
        const encodedProject = encodeProjectPath(config.project);

        const mrBody: Record<string, unknown> = {};

        if (updates.title) mrBody.title = updates.title;
        if (updates.description) mrBody.description = updates.description;
        if (updates.targetBranch) mrBody.target_branch = updates.targetBranch;
        if (updates.labels) mrBody.labels = updates.labels.join(',');
        if (updates.assigneeIds) mrBody.assignee_ids = updates.assigneeIds;

        const apiMr = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/merge_requests/${mrIid}`,
          {
            method: 'PUT',
            body: JSON.stringify(mrBody)
          }
        ) as GitLabAPIMergeRequest;

        debugLog('Merge request updated:', { iid: apiMr.iid });

        const mr = transformMergeRequest(apiMr);

        return {
          success: true,
          data: mr
        };
      } catch (error) {
        debugLog('Failed to update merge request:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update merge request'
        };
      }
    }
  );
}

/**
 * Register all merge request handlers
 */
export function registerMergeRequestHandlers(): void {
  debugLog('Registering GitLab merge request handlers');
  registerGetMergeRequests();
  registerGetMergeRequest();
  registerCreateMergeRequest();
  registerUpdateMergeRequest();
  debugLog('GitLab merge request handlers registered');
}