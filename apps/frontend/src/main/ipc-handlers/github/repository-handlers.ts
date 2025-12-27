/**
 * GitHub repository-related IPC handlers
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult, GitHubRepository, GitHubSyncStatus } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { getGitHubConfig, githubFetch, normalizeRepoReference } from './utils';
import type { GitHubAPIRepository } from './types';

/**
 * Result of fork detection via GitHub API
 */
export interface ForkStatus {
  isFork: boolean;
  parentRepo?: string;  // owner/repo format
  parentUrl?: string;   // full GitHub URL
}

/**
 * GitHub API response type for repository with fork information
 */
interface GitHubRepoWithForkInfo {
  full_name: string;
  description?: string;
  fork: boolean;
  parent?: {
    full_name: string;
    html_url: string;
  };
}

/**
 * Detect if a repository is a fork via the GitHub API
 *
 * Queries the GitHub API /repos/{owner}/{repo} endpoint and checks the `fork`
 * boolean field. If the repository is a fork, extracts the parent repository
 * information from the `parent` object in the response.
 *
 * @param token - GitHub API token for authentication
 * @param repo - Repository in owner/repo format
 * @returns ForkStatus object with isFork boolean and optional parent info
 */
export async function detectForkStatus(
  token: string,
  repo: string
): Promise<ForkStatus> {
  const normalizedRepo = normalizeRepoReference(repo);
  if (!normalizedRepo) {
    return { isFork: false };
  }

  const repoData = await githubFetch(
    token,
    `/repos/${normalizedRepo}`
  ) as GitHubRepoWithForkInfo;

  // Check if repository is a fork
  if (!repoData.fork) {
    return { isFork: false };
  }

  // If it's a fork, extract parent repository info
  const result: ForkStatus = { isFork: true };

  if (repoData.parent) {
    result.parentRepo = repoData.parent.full_name;
    result.parentUrl = repoData.parent.html_url;
  }

  return result;
}

/**
 * Check GitHub connection status
 */
export function registerCheckConnection(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_CHECK_CONNECTION,
    async (_, projectId: string): Promise<IPCResult<GitHubSyncStatus>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return {
          success: true,
          data: {
            connected: false,
            error: 'No GitHub token or repository configured'
          }
        };
      }

      try {
        // Normalize repo reference (handles full URLs, git URLs, etc.)
        const normalizedRepo = normalizeRepoReference(config.repo);
        if (!normalizedRepo) {
          return {
            success: true,
            data: {
              connected: false,
              error: 'Invalid repository format. Use owner/repo or GitHub URL.'
            }
          };
        }

        // Fetch repo info
        const repoData = await githubFetch(
          config.token,
          `/repos/${normalizedRepo}`
        ) as { full_name: string; description?: string };

        // Count open issues
        const issuesData = await githubFetch(
          config.token,
          `/repos/${normalizedRepo}/issues?state=open&per_page=1`
        ) as unknown[];

        const openCount = Array.isArray(issuesData) ? issuesData.length : 0;

        // Build response data with fork status
        const data: GitHubSyncStatus = {
          connected: true,
          repoFullName: repoData.full_name,
          repoDescription: repoData.description,
          issueCount: openCount,
          lastSyncedAt: new Date().toISOString(),
          isFork: config.isFork ?? false
        };

        // Add parent repository info if available
        if (config.isFork && config.parentRepo) {
          data.parentRepository = {
            fullName: config.parentRepo,
            url: `https://github.com/${config.parentRepo}`
          };
        }

        return {
          success: true,
          data
        };
      } catch (error) {
        return {
          success: true,
          data: {
            connected: false,
            error: error instanceof Error ? error.message : 'Failed to connect to GitHub'
          }
        };
      }
    }
  );
}

/**
 * Detect if a repository is a fork via the GitHub API
 * IPC handler for github:detectFork channel
 */
export function registerDetectFork(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_DETECT_FORK,
    async (_, projectId: string): Promise<IPCResult<ForkStatus>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token or repository configured' };
      }

      try {
        // Normalize repo reference (handles full URLs, git URLs, etc.)
        const normalizedRepo = normalizeRepoReference(config.repo);
        if (!normalizedRepo) {
          return {
            success: false,
            error: 'Invalid repository format. Use owner/repo or GitHub URL.'
          };
        }

        const forkStatus = await detectForkStatus(config.token, normalizedRepo);
        return { success: true, data: forkStatus };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to detect fork status'
        };
      }
    }
  );
}

/**
 * Get list of GitHub repositories (personal + organization)
 */
export function registerGetRepositories(): void {
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_GET_REPOSITORIES,
    async (_, projectId: string): Promise<IPCResult<GitHubRepository[]>> => {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return { success: false, error: 'Project not found' };
      }

      const config = getGitHubConfig(project);
      if (!config) {
        return { success: false, error: 'No GitHub token configured' };
      }

      try {
        // Fetch user's personal + organization repos
        // affiliation parameter includes: owner, collaborator, organization_member
        const repos = await githubFetch(
          config.token,
          '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member'
        ) as GitHubAPIRepository[];

        const result: GitHubRepository[] = repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          defaultBranch: repo.default_branch,
          private: repo.private,
          owner: {
            login: repo.owner.login,
            avatarUrl: repo.owner.avatar_url
          }
        }));

        return { success: true, data: result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch repositories'
        };
      }
    }
  );
}

/**
 * Register all repository-related handlers
 */
export function registerRepositoryHandlers(): void {
  registerCheckConnection();
  registerDetectFork();
  registerGetRepositories();
}
