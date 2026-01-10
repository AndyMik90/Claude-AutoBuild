/**
 * Forgejo issue handlers
 * Handles issue fetching, creation, and management
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, ForgejoIssue } from '../../../shared/types';
import { projectStore } from '../../project-store';
import {
  getForgejoConfig,
  forgejoFetch,
  debugLog,
} from './utils';
import type { ForgejoAPIIssue, ForgejoAPIComment } from './types';

/**
 * Transform API issue to frontend issue type
 */
function transformIssue(issue: ForgejoAPIIssue, instanceUrl: string, repoFullName: string): ForgejoIssue {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: (issue.labels || []).map(l => ({
      id: l.id,
      name: l.name,
      color: l.color,
      description: l.description,
    })),
    assignees: (issue.assignees || []).map(a => ({
      login: a.login,
      avatarUrl: a.avatar_url,
    })),
    author: {
      login: issue.user.login,
      avatarUrl: issue.user.avatar_url,
    },
    milestone: issue.milestone ? {
      id: issue.milestone.id,
      title: issue.milestone.title,
      state: issue.milestone.state === 'open' ? 'open' : 'closed',
    } : undefined,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    commentsCount: issue.comments,
    webUrl: issue.html_url,
    repoFullName,
    instanceUrl,
  };
}

/**
 * Get issues for a project
 */
export function registerGetIssues(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_GET_ISSUES,
    async (
      _event,
      projectId: string,
      state: 'open' | 'closed' | 'all' = 'open'
    ): Promise<IPCResult<ForgejoIssue[]>> => {
      debugLog('getForgejoIssues handler called', { projectId, state });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const issues = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues?state=${state}&type=issues&limit=100`
        ) as ForgejoAPIIssue[];

        const repoFullName = `${config.owner}/${config.repo}`;
        const result = issues.map(issue => transformIssue(issue, config.instanceUrl, repoFullName));

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch issues';
        debugLog('Failed to fetch issues:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Get a single issue by number
 */
export function registerGetIssue(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_GET_ISSUE,
    async (
      _event,
      projectId: string,
      issueNumber: number
    ): Promise<IPCResult<ForgejoIssue>> => {
      debugLog('getForgejoIssue handler called', { projectId, issueNumber });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const issue = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues/${issueNumber}`
        ) as ForgejoAPIIssue;

        const repoFullName = `${config.owner}/${config.repo}`;
        const result = transformIssue(issue, config.instanceUrl, repoFullName);

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch issue';
        debugLog('Failed to fetch issue:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Get comments for an issue
 */
export function registerGetIssueComments(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_GET_ISSUE_COMMENTS,
    async (
      _event,
      projectId: string,
      issueNumber: number
    ): Promise<IPCResult<Array<{ id: number; body: string; author: { login: string; avatarUrl?: string }; createdAt: string }>>> => {
      debugLog('getForgejoIssueComments handler called', { projectId, issueNumber });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const comments = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`
        ) as ForgejoAPIComment[];

        const result = comments.map(c => ({
          id: c.id,
          body: c.body,
          author: {
            login: c.user.login,
            avatarUrl: c.user.avatar_url,
          },
          createdAt: c.created_at,
        }));

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch comments';
        debugLog('Failed to fetch comments:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Create a new issue
 */
export function registerCreateIssue(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_CREATE_ISSUE,
    async (
      _event,
      projectId: string,
      title: string,
      body: string,
      labels?: string[],
      assignees?: string[]
    ): Promise<IPCResult<ForgejoIssue>> => {
      debugLog('createForgejoIssue handler called', { projectId, title });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const issueData: Record<string, unknown> = { title, body };
        if (labels && labels.length > 0) {
          issueData.labels = labels;
        }
        if (assignees && assignees.length > 0) {
          issueData.assignees = assignees;
        }

        const issue = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues`,
          {
            method: 'POST',
            body: JSON.stringify(issueData),
          }
        ) as ForgejoAPIIssue;

        const repoFullName = `${config.owner}/${config.repo}`;
        const result = transformIssue(issue, config.instanceUrl, repoFullName);

        return { success: true, data: result };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create issue';
        debugLog('Failed to create issue:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Close an issue
 */
export function registerCloseIssue(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_CLOSE_ISSUE,
    async (
      _event,
      projectId: string,
      issueNumber: number,
      comment?: string
    ): Promise<IPCResult<void>> => {
      debugLog('closeForgejoIssue handler called', { projectId, issueNumber });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        // Add comment if provided
        if (comment) {
          await forgejoFetch(
            config.token,
            config.instanceUrl,
            `/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`,
            {
              method: 'POST',
              body: JSON.stringify({ body: comment }),
            }
          );
        }

        // Close the issue
        await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues/${issueNumber}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ state: 'closed' }),
          }
        );

        return { success: true, data: undefined };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to close issue';
        debugLog('Failed to close issue:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Add a comment to an issue
 */
export function registerAddComment(): void {
  ipcMain.handle(
    IPC_CHANNELS.FORGEJO_ADD_COMMENT,
    async (
      _event,
      projectId: string,
      issueNumber: number,
      body: string
    ): Promise<IPCResult<{ id: number }>> => {
      debugLog('addForgejoComment handler called', { projectId, issueNumber });

      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getForgejoConfig(project);
      if (!config) {
        return { success: false, error: 'Forgejo not configured' };
      }

      try {
        const comment = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`,
          {
            method: 'POST',
            body: JSON.stringify({ body }),
          }
        ) as ForgejoAPIComment;

        return { success: true, data: { id: comment.id } };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to add comment';
        debugLog('Failed to add comment:', errorMessage);
        return { success: false, error: errorMessage };
      }
    }
  );
}

/**
 * Register all issue handlers
 */
export function registerIssueHandlers(): void {
  registerGetIssues();
  registerGetIssue();
  registerGetIssueComments();
  registerCreateIssue();
  registerCloseIssue();
  registerAddComment();
}
