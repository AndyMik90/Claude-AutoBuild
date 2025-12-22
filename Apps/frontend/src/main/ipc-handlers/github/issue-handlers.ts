/**
 * GitHub issue-related IPC handlers
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, GitHubIssue } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getGitHubConfig, githubFetch, normalizeRepoReference } from './utils';
import type { GitHubAPIIssue, GitHubAPIComment } from './types';

/**
 * Transform GitHub API issue to application format
 */
function transformIssue(issue: GitHubAPIIssue, repoFullName: string): GitHubIssue {
  return {
    id: issue.id,
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    labels: issue.labels,
    assignees: issue.assignees.map(a => ({
      login: a.login,
      avatarUrl: a.avatar_url
    })),
    author: {
      login: issue.user.login,
      avatarUrl: issue.user.avatar_url
    },
    milestone: issue.milestone,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
    commentsCount: issue.comments,
    url: issue.url,
    htmlUrl: issue.html_url,
    repoFullName
  };
}

/**
 * Get list of issues from repository
 */
export function registerGetIssues(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_ISSUES,
    async (_, projectId: string, state: 'open' | 'closed' | 'all' = 'open'): Promise<IPCResult<GitHubIssue[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token or repository configured' };
      }

      try {
        const normalizedRepo = normalizeRepoReference(config.repo);
        if (!normalizedRepo) {
          return {
            success: false,
            error: 'Invalid repository format. Use owner/repo or GitHub URL.'
          };
        }

        const issues = await githubFetch(
          config.token,
          `/repos/${normalizedRepo}/issues?state=${state}&per_page=100&sort=updated`
        );

        // Ensure issues is an array
        if (!Array.isArray(issues)) {
          return {
            success: false,
            error: 'Unexpected response format from GitHub API'
          };
        }

        // Filter out pull requests
        const issuesOnly = issues.filter((issue: GitHubAPIIssue) => !issue.pull_request);

        const result: GitHubIssue[] = issuesOnly.map((issue: GitHubAPIIssue) =>
          transformIssue(issue, normalizedRepo)
        );

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch issues'
        };
      }
    }
  );
}

/**
 * Get a single issue by number
 */
export function registerGetIssue(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_ISSUE,
    async (_, projectId: string, issueNumber: number): Promise<IPCResult<GitHubIssue>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token or repository configured' };
      }

      try {
        const normalizedRepo = normalizeRepoReference(config.repo);
        if (!normalizedRepo) {
          return {
            success: false,
            error: 'Invalid repository format. Use owner/repo or GitHub URL.'
          };
        }

        const issue = await githubFetch(
          config.token,
          `/repos/${normalizedRepo}/issues/${issueNumber}`
        ) as GitHubAPIIssue;

        const result = transformIssue(issue, normalizedRepo);

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch issue'
        };
      }
    }
  );
}

/**
 * Get comments for a specific issue
 */
export function registerGetIssueComments(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_ISSUE_COMMENTS,
    async (_, projectId: string, issueNumber: number): Promise<IPCResult<GitHubAPIComment[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token or repository configured' };
      }

      try {
        const normalizedRepo = normalizeRepoReference(config.repo);
        if (!normalizedRepo) {
          return {
            success: false,
            error: 'Invalid repository format. Use owner/repo or GitHub URL.'
          };
        }

        const comments = await githubFetch(
          config.token,
          `/repos/${normalizedRepo}/issues/${issueNumber}/comments`
        ) as GitHubAPIComment[];

        return { success: true, data: comments };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch issue comments'
        };
      }
    }
  );
}

/**
 * Register all issue-related handlers
 */
export function registerIssueHandlers(): void {
  registerGetIssues();
  registerGetIssue();
  registerGetIssueComments();
}
