/**
 * GitLab Merge Request handlers
 * Handles MR operations (equivalent to GitHub PRs)
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, GitLabMergeRequest } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIMergeRequest, CreateMergeRequestOptions } from './types';

// Valid merge request states per GitLab API
// - opened: MR is open and can be modified/merged
// - closed: MR has been closed without merging
// - merged: MR has been successfully merged
// - locked: MR is temporarily locked (during merge/rebase operations or by admin)
//   When locked, the MR cannot be modified or merged until unlocked
// - all: Query parameter to retrieve MRs in any state
const VALID_MR_STATES = ['opened', 'closed', 'merged', 'locked', 'all'] as const;
type MergeRequestState = typeof VALID_MR_STATES[number];

/**
 * Validate merge request state parameter
 */
function isValidMrState(state: string): state is MergeRequestState {
  return VALID_MR_STATES.includes(state as MergeRequestState);
}

// Debug logging helper - enabled in development OR when DEBUG flag is set
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

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
 * Transform GitLab API MR to our format
 * Defensively handles missing/null properties
 */
function transformMergeRequest(apiMr: GitLabAPIMergeRequest): GitLabMergeRequest {
  return {
    id: apiMr.id,
    iid: apiMr.iid,
    title: apiMr.title || '',
    description: apiMr.description || undefined,
    state: apiMr.state || 'opened',
    sourceBranch: apiMr.source_branch || '',
    targetBranch: apiMr.target_branch || '',
    author: apiMr.author
      ? {
          username: apiMr.author.username || '',
          avatarUrl: apiMr.author.avatar_url || undefined
        }
      : { username: '' },
    assignees: Array.isArray(apiMr.assignees)
      ? apiMr.assignees.map(a => ({
          username: a?.username || '',
          avatarUrl: a?.avatar_url || undefined
        }))
      : [],
    labels: Array.isArray(apiMr.labels) ? apiMr.labels : [],
    webUrl: apiMr.web_url || '',
    createdAt: apiMr.created_at || new Date().toISOString(),
    updatedAt: apiMr.updated_at || apiMr.created_at || new Date().toISOString(),
    mergedAt: apiMr.merged_at || undefined,
    mergeStatus: apiMr.merge_status || ''
  };
}

/**
 * Get merge requests from GitLab project
 */
export function registerGetMergeRequests(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_MERGE_REQUESTS,
    async (_event, projectId: string, state?: string): Promise<IPCResult<GitLabMergeRequest[]>> => {
      debugLog('getGitLabMergeRequests handler called', { state });

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

      // Validate state parameter
      const stateParam = state ?? 'opened';
      if (!isValidMrState(stateParam)) {
        return {
          success: false,
          error: `Invalid merge request state: '${stateParam}'. Must be one of: ${VALID_MR_STATES.join(', ')}`
        };
      }

      try {
        const encodedProject = encodeProjectPath(config.project);

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
 * Get a single merge request by IID
 */
export function registerGetMergeRequest(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_MERGE_REQUEST,
    async (_event, projectId: string, mrIid: number): Promise<IPCResult<GitLabMergeRequest>> => {
      debugLog('getGitLabMergeRequest handler called', { mrIid });

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
 * Create a new merge request
 */
export function registerCreateMergeRequest(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_CREATE_MERGE_REQUEST,
    async (_event, projectId: string, options: CreateMergeRequestOptions): Promise<IPCResult<GitLabMergeRequest>> => {
      debugLog('createGitLabMergeRequest handler called', { title: options.title });

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

      try {
        const encodedProject = encodeProjectPath(config.project);

        const mrBody: Record<string, unknown> = {
          source_branch: options.sourceBranch,
          target_branch: options.targetBranch,
          title: options.title
        };

        if (options.description !== undefined) {
          mrBody.description = options.description;
        }

        if (options.labels !== undefined) {
          mrBody.labels = options.labels.join(',');
        }

        if (options.assigneeIds !== undefined) {
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
 * Update a merge request
 */
export function registerUpdateMergeRequest(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_UPDATE_MERGE_REQUEST,
    async (
      _event,
      projectId: string,
      mrIid: number,
      updates: Partial<CreateMergeRequestOptions>
    ): Promise<IPCResult<GitLabMergeRequest>> => {
      debugLog('updateGitLabMergeRequest handler called', { mrIid });

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

      try {
        const encodedProject = encodeProjectPath(config.project);

        const mrBody: Record<string, unknown> = {};

        if (updates.title !== undefined) mrBody.title = updates.title;
        if (updates.description !== undefined) mrBody.description = updates.description;
        if (updates.targetBranch !== undefined) mrBody.target_branch = updates.targetBranch;
        if (updates.labels !== undefined) mrBody.labels = updates.labels.join(',');
        if (updates.assigneeIds !== undefined) mrBody.assignee_ids = updates.assigneeIds;

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
