/**
 * GitLab issue handlers
 * Handles fetching issues and notes (comments)
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, Project, GitLabIssue, GitLabNote } from '../../../shared/types';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIIssue, GitLabAPINote } from './types';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Logs a debug message prefixed with "[GitLab Issues]" when debug mode is enabled.
 *
 * @param message - The message to log
 * @param data - Optional additional data to include with the log
 */
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
 * Convert a GitLab API issue into the application's GitLabIssue shape.
 *
 * Maps API fields to the internal format, including author and assignees as `{ username, avatarUrl }`,
 * and normalizes milestone state to either `active` or `closed` (unknown states default to `active`).
 *
 * @param apiIssue - The raw issue object returned by the GitLab API
 * @param projectPath - The project's path with namespace to attach to the transformed issue
 * @returns The transformed `GitLabIssue` ready for use within the application
 */
function transformIssue(apiIssue: GitLabAPIIssue, projectPath: string): GitLabIssue {
  return {
    id: apiIssue.id,
    iid: apiIssue.iid,
    title: apiIssue.title,
    description: apiIssue.description,
    state: apiIssue.state,
    labels: apiIssue.labels,
    assignees: apiIssue.assignees.map(a => ({
      username: a.username,
      avatarUrl: a.avatar_url
    })),
    author: {
      username: apiIssue.author.username,
      avatarUrl: apiIssue.author.avatar_url
    },
    milestone: apiIssue.milestone ? {
      id: apiIssue.milestone.id,
      title: apiIssue.milestone.title,
      state: apiIssue.milestone.state === 'active' || apiIssue.milestone.state === 'closed'
        ? apiIssue.milestone.state
        : 'active' // Default to 'active' for unknown states
    } : undefined,
    createdAt: apiIssue.created_at,
    updatedAt: apiIssue.updated_at,
    closedAt: apiIssue.closed_at,
    userNotesCount: apiIssue.user_notes_count,
    webUrl: apiIssue.web_url,
    projectPathWithNamespace: projectPath
  };
}

/**
 * Convert a GitLab API note object into the application's GitLabNote shape.
 *
 * @param apiNote - The note object returned by the GitLab API
 * @returns The transformed GitLabNote with normalized author, timestamps, body, and system flag
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
 * Registers an IPC handler that fetches issues for a GitLab project.
 *
 * The handler listens on IPC_CHANNELS.GITLAB_GET_ISSUES. When invoked it reads the GitLab
 * configuration for the provided project, requests issues from the GitLab API (optionally
 * filtered by state), transforms API issues into the application's GitLabIssue format, and
 * returns an IPCResult containing the transformed issues or an error message.
 */
export function registerGetIssues(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_ISSUES,
    async (_event, project: Project, state?: 'opened' | 'closed' | 'all'): Promise<IPCResult<GitLabIssue[]>> => {
      debugLog('getGitLabIssues handler called', { state });

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
 * Registers an IPC handler that fetches a single GitLab issue by IID for a project.
 *
 * The handler listens on IPC_CHANNELS.GITLAB_GET_ISSUE and responds with an IPCResult containing the transformed GitLabIssue on success or an error message on failure.
 */
export function registerGetIssue(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_ISSUE,
    async (_event, project: Project, issueIid: number): Promise<IPCResult<GitLabIssue>> => {
      debugLog('getGitLabIssue handler called', { issueIid });

      const config = getGitLabConfig(project);
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
 * Registers an IPC handler that fetches user comments (non-system notes) for a GitLab issue and returns them in the app's `GitLabNote` format.
 *
 * The handler responds with an IPCResult containing the issue's notes on success or an error message on failure. It filters out GitLab system notes so only user-created comments are returned.
 */
export function registerGetIssueNotes(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITLAB_GET_ISSUE_NOTES,
    async (_event, project: Project, issueIid: number): Promise<IPCResult<GitLabNote[]>> => {
      debugLog('getGitLabIssueNotes handler called', { issueIid });

      const config = getGitLabConfig(project);
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