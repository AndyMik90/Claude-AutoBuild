/**
 * GitLab issue handlers
 * Handles fetching issues and notes (comments)
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, GitLabIssue, GitLabNote } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIIssue, GitLabAPINote } from './types';

// Debug logging helper - enabled in development OR when DEBUG flag is set
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab Issues] ${message}`, data);
    } else {
      console.debug(`[GitLab Issues] ${message}`);
    }
  }
}

/**
 * Transform GitLab API issue to our format
 */
function transformIssue(apiIssue: GitLabAPIIssue, projectPath: string): GitLabIssue {
  // Transform milestone with state validation
  let milestone: GitLabIssue['milestone'];
  if (apiIssue.milestone) {
    const rawState = apiIssue.milestone.state;
    let milestoneState: 'active' | 'closed';
    if (rawState === 'active' || rawState === 'closed') {
      milestoneState = rawState;
    } else {
      console.warn(`[GitLab Issues] Unknown milestone state '${rawState}' for issue #${apiIssue.iid} (id: ${apiIssue.id}), defaulting to 'active'`);
      milestoneState = 'active';
    }
    milestone = {
      id: apiIssue.milestone.id,
      title: apiIssue.milestone.title,
      state: milestoneState
    };
  }

  return {
    id: apiIssue.id,
    iid: apiIssue.iid,
    title: apiIssue.title,
    description: apiIssue.description,
    state: apiIssue.state,
    labels: apiIssue.labels ?? [],
    assignees: (apiIssue.assignees ?? []).map(a => ({
      username: a?.username ?? 'unknown',
      avatarUrl: a?.avatar_url
    })),
    author: {
      username: apiIssue.author?.username ?? 'unknown',
      avatarUrl: apiIssue.author?.avatar_url
    },
    milestone,
    createdAt: apiIssue.created_at,
    updatedAt: apiIssue.updated_at,
    closedAt: apiIssue.closed_at,
    userNotesCount: apiIssue.user_notes_count,
    webUrl: apiIssue.web_url,
    projectPathWithNamespace: projectPath
  };
}

/**
 * Transform GitLab API note to our format
 */
function transformNote(apiNote: GitLabAPINote): GitLabNote {
  return {
    id: apiNote.id,
    body: apiNote.body,
    author: {
      username: apiNote.author.username,
      avatarUrl: apiNote.author.avatar_url
    },
    createdAt: apiNote.created_at,
    updatedAt: apiNote.updated_at,
    system: apiNote.system
  };
}

/**
 * Get issues from GitLab project
 */
export function registerGetIssues(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_ISSUES,
    async (_event, projectId: string, state?: 'opened' | 'closed' | 'all'): Promise<IPCResult<GitLabIssue[]>> => {
      debugLog('getGitLabIssues handler called', { state });

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
        const stateParam = state || 'opened';

        const apiIssues = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/issues?state=${stateParam}&per_page=100&order_by=updated_at&sort=desc`
        ) as GitLabAPIIssue[];

        debugLog('Fetched issues:', apiIssues.length);

        const issues = apiIssues.map(issue => transformIssue(issue, config.project));

        return {
          success: true,
          data: issues
        };
      } catch (error) {
        debugLog('Failed to get issues:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get issues'
        };
      }
    }
  );
}

/**
 * Get a single issue by IID
 */
export function registerGetIssue(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_ISSUE,
    async (_event, projectId: string, issueIid: number): Promise<IPCResult<GitLabIssue>> => {
      debugLog('getGitLabIssue handler called', { issueIid });

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

        const apiIssue = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/issues/${issueIid}`
        ) as GitLabAPIIssue;

        const issue = transformIssue(apiIssue, config.project);

        return {
          success: true,
          data: issue
        };
      } catch (error) {
        debugLog('Failed to get issue:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get issue'
        };
      }
    }
  );
}

/**
 * Get notes (comments) for an issue
 */
export function registerGetIssueNotes(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_ISSUE_NOTES,
    async (_event, projectId: string, issueIid: number): Promise<IPCResult<GitLabNote[]>> => {
      debugLog('getGitLabIssueNotes handler called', { issueIid });

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

        const apiNotes = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/issues/${issueIid}/notes?per_page=100&order_by=created_at&sort=asc`
        ) as GitLabAPINote[];

        // Filter out system notes (status changes, etc.) for cleaner comments
        const userNotes = apiNotes.filter(note => !note.system);
        const notes = userNotes.map(transformNote);

        debugLog('Fetched notes:', notes.length);

        return {
          success: true,
          data: notes
        };
      } catch (error) {
        debugLog('Failed to get notes:', error instanceof Error ? error.message : error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get notes'
        };
      }
    }
  );
}

/**
 * Register all issue handlers
 */
export function registerIssueHandlers(): void {
  debugLog('Registering GitLab issue handlers');
  registerGetIssues();
  registerGetIssue();
  registerGetIssueNotes();
  debugLog('GitLab issue handlers registered');
}
