/**
 * GitHub utility functions
 */

import { existsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';
import type { Project } from '../../../shared/types';
import { parseEnvFile } from '../utils';
import type { GitHubConfig } from './types';
import { getAugmentedEnv } from '../../env-utils';
import { getToolPath } from '../../cli-tool-manager';

/**
 * Operation types for determining which repository to target
 * - 'issues': Issue-related operations (should use parent repo for forks)
 * - 'prs': Pull request operations (should use parent repo for forks)
 * - 'code': Code-related operations (should use fork repo)
 */
export type OperationType = 'issues' | 'prs' | 'code';

/**
 * Get GitHub token from gh CLI if available
 * Uses augmented PATH to find gh CLI in common locations (e.g., Homebrew on macOS)
 */
function getTokenFromGhCli(): string | null {
  try {
    const token = execFileSync(getToolPath('gh'), ['auth', 'token'], {
      encoding: 'utf-8',
      stdio: 'pipe',
      env: getAugmentedEnv()
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}

/**
 * Get GitHub configuration from project environment file
 * Falls back to gh CLI token if GITHUB_TOKEN not in .env
 * Parses IS_FORK and GITHUB_PARENT_REPO for fork detection support
 */
export function getGitHubConfig(project: Project): GitHubConfig | null {
  if (!project.autoBuildPath) return null;
  const envPath = path.join(project.path, project.autoBuildPath, '.env');
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars = parseEnvFile(content);
    let token: string | undefined = vars['GITHUB_TOKEN'];
    const repo = vars['GITHUB_REPO'];

    // If no token in .env, try to get it from gh CLI
    if (!token) {
      const ghToken = getTokenFromGhCli();
      if (ghToken) {
        token = ghToken;
      }
    }

    if (!token || !repo) return null;

    // Parse fork detection fields
    const isForkRaw = vars['IS_FORK'];
    const isFork = isForkRaw === 'true' || isForkRaw === 'TRUE';

    // Parse parent repo - normalize and validate
    const parentRepoRaw = vars['GITHUB_PARENT_REPO'];
    let parentRepo: string | undefined;
    if (parentRepoRaw && parentRepoRaw.trim()) {
      parentRepo = normalizeRepoReference(parentRepoRaw);
      // Validate normalized format is owner/repo
      if (!parentRepo || !parentRepo.includes('/')) {
        parentRepo = undefined;
      }
    }

    return { token, repo, isFork, parentRepo };
  } catch {
    return null;
  }
}

/**
 * Normalize a GitHub repository reference to owner/repo format
 * Handles:
 * - owner/repo (already normalized)
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
export function normalizeRepoReference(repo: string): string {
  if (!repo) return '';

  // Remove trailing .git if present
  let normalized = repo.replace(/\.git$/, '');

  // Handle full GitHub URLs
  if (normalized.startsWith('https://github.com/')) {
    normalized = normalized.replace('https://github.com/', '');
  } else if (normalized.startsWith('http://github.com/')) {
    normalized = normalized.replace('http://github.com/', '');
  } else if (normalized.startsWith('git@github.com:')) {
    normalized = normalized.replace('git@github.com:', '');
  }

  return normalized.trim();
}

/**
 * Get the target repository based on fork configuration and operation type
 * For forks:
 * - Issues and PRs should be fetched from the parent repository (if available)
 * - Code operations should use the fork repository
 * For non-forks:
 * - Always use the configured repository
 *
 * @param config - GitHub configuration containing fork and parent info
 * @param operationType - Type of operation: 'issues', 'prs', or 'code'
 * @returns The repository to target in owner/repo format
 */
export function getTargetRepo(config: GitHubConfig, operationType: OperationType): string {
  // If not a fork, always use the configured repo
  if (!config.isFork) {
    return config.repo;
  }

  // For forks, route issues and PRs to parent if available
  if (operationType === 'issues' || operationType === 'prs') {
    // If parent repo is available, use it; otherwise fall back to fork
    return config.parentRepo || config.repo;
  }

  // Code operations always use the fork
  return config.repo;
}

/**
 * Make a request to the GitHub API
 */
export async function githubFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://api.github.com${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Auto-Claude-UI',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Result type for githubFetchWithFallback
 */
export interface FetchWithFallbackResult<T = unknown> {
  data: T;
  usedFallback: boolean;
  repo: string;
}

/**
 * Make a GitHub API request with fallback to fork repository
 *
 * When fetching from a fork's parent repository, if the request fails with
 * 403 (Forbidden) or 404 (Not Found), this function automatically falls back
 * to fetching from the fork repository instead.
 *
 * @param config - GitHub configuration containing token, repo, and fork info
 * @param endpointBuilder - Function that takes a repo string and returns the API endpoint
 * @param operationType - Type of operation: 'issues', 'prs', or 'code'
 * @param options - Optional fetch options
 * @returns Object containing data, usedFallback flag, and the repo that was used
 */
export async function githubFetchWithFallback<T = unknown>(
  config: GitHubConfig,
  endpointBuilder: (repo: string) => string,
  operationType: OperationType,
  options: RequestInit = {}
): Promise<FetchWithFallbackResult<T>> {
  // Determine the primary target repo based on fork config and operation type
  const targetRepo = getTargetRepo(config, operationType);
  const endpoint = endpointBuilder(targetRepo);

  try {
    const data = await githubFetch(config.token, endpoint, options);
    return {
      data: data as T,
      usedFallback: false,
      repo: targetRepo
    };
  } catch (error) {
    // Only attempt fallback if:
    // 1. This is a fork with a parent repo configured
    // 2. The target repo was the parent (not already the fork)
    // 3. The error is a 403 or 404
    const shouldFallback =
      config.isFork &&
      config.parentRepo &&
      targetRepo === config.parentRepo &&
      error instanceof Error &&
      (error.message.includes('403') || error.message.includes('404'));

    if (!shouldFallback) {
      throw error;
    }

    // Fall back to the fork repository
    const fallbackEndpoint = endpointBuilder(config.repo);
    const fallbackData = await githubFetch(config.token, fallbackEndpoint, options);
    return {
      data: fallbackData as T,
      usedFallback: true,
      repo: config.repo
    };
  }
}
