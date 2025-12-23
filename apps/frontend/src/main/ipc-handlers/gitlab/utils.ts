/**
 * GitLab utility functions
 */

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import type { Project } from '../../../shared/types';
import { parseEnvFile } from '../utils';
import type { GitLabConfig } from './types';
import { getAugmentedEnv } from '../../env-utils';

const DEFAULT_GITLAB_URL = 'https://gitlab.com';

/**
 * Get GitLab token from glab CLI if available
 * Uses augmented PATH to find glab CLI in common locations
 */
function getTokenFromGlabCli(instanceUrl?: string): string | null {
  try {
    // glab auth token outputs the token for the current authenticated host
    const args = ['auth', 'token'];
    if (instanceUrl && !instanceUrl.includes('gitlab.com')) {
      // For self-hosted, specify the hostname
      const hostname = new URL(instanceUrl).hostname;
      args.push('--hostname', hostname);
    }

    const token = execSync(`glab ${args.join(' ')}`, {
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
 * Get GitLab configuration from project environment file
 * Falls back to glab CLI token if GITLAB_TOKEN not in .env
 */
export function getGitLabConfig(project: Project): GitLabConfig | null {
  if (!project.autoBuildPath) return null;
  const envPath = path.join(project.path, project.autoBuildPath, '.env');
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars = parseEnvFile(content);
    let token: string | undefined = vars['GITLAB_TOKEN'];
    const projectRef = vars['GITLAB_PROJECT'];
    const instanceUrl = vars['GITLAB_INSTANCE_URL'] || DEFAULT_GITLAB_URL;

    // If no token in .env, try to get it from glab CLI
    if (!token) {
      const glabToken = getTokenFromGlabCli(instanceUrl);
      if (glabToken) {
        token = glabToken;
      }
    }

    if (!token || !projectRef) return null;
    return { token, instanceUrl, project: projectRef };
  } catch {
    return null;
  }
}

/**
 * Normalize a GitLab project reference to group/project format
 * Handles:
 * - group/project (already normalized)
 * - group/subgroup/project (nested groups)
 * - https://gitlab.com/group/project
 * - https://gitlab.com/group/project.git
 * - git@gitlab.com:group/project.git
 * - Numeric project ID (returns as-is)
 */
export function normalizeProjectReference(project: string, instanceUrl: string = DEFAULT_GITLAB_URL): string {
  if (!project) return '';

  // If it's a numeric ID, return as-is
  if (/^\d+$/.test(project)) {
    return project;
  }

  // Remove trailing .git if present
  let normalized = project.replace(/\.git$/, '');

  // Extract hostname for comparison
  const gitlabHostname = new URL(instanceUrl).hostname;

  // Handle full GitLab URLs
  const httpsPattern = new RegExp(`https?://${gitlabHostname}/`);
  if (httpsPattern.test(normalized)) {
    normalized = normalized.replace(httpsPattern, '');
  } else if (normalized.startsWith(`git@${gitlabHostname}:`)) {
    normalized = normalized.replace(`git@${gitlabHostname}:`, '');
  }

  return normalized.trim();
}

/**
 * URL-encode a project path for GitLab API
 * GitLab API requires project paths to be URL-encoded (e.g., group%2Fproject)
 */
export function encodeProjectPath(projectPath: string): string {
  // If it's a numeric ID, return as-is
  if (/^\d+$/.test(projectPath)) {
    return projectPath;
  }
  return encodeURIComponent(projectPath);
}

/**
 * Make a request to the GitLab API
 */
export async function gitlabFetch(
  token: string,
  instanceUrl: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  // Ensure instanceUrl doesn't have trailing slash
  const baseUrl = instanceUrl.replace(/\/$/, '');
  const url = endpoint.startsWith('http')
    ? endpoint
    : `${baseUrl}/api/v4${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'PRIVATE-TOKEN': token, // GitLab uses PRIVATE-TOKEN header
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`GitLab API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Get project ID from a project path
 * GitLab API can work with either numeric IDs or URL-encoded paths
 */
export async function getProjectIdFromPath(
  token: string,
  instanceUrl: string,
  pathWithNamespace: string
): Promise<number> {
  const encodedPath = encodeProjectPath(pathWithNamespace);
  const project = await gitlabFetch(token, instanceUrl, `/projects/${encodedPath}`) as { id: number };
  return project.id;
}

/**
 * Detect GitLab project from git remote URL
 */
export function detectGitLabProjectFromRemote(projectPath: string): { project: string; instanceUrl: string } | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: 'pipe',
      env: getAugmentedEnv()
    }).trim();

    if (!remoteUrl) return null;

    // Parse the remote URL to extract instance URL and project path
    let instanceUrl = DEFAULT_GITLAB_URL;
    let project = '';

    // SSH format: git@gitlab.example.com:group/project.git
    const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (sshMatch) {
      instanceUrl = `https://${sshMatch[1]}`;
      project = sshMatch[2];
    }

    // HTTPS format: https://gitlab.example.com/group/project.git
    const httpsMatch = remoteUrl.match(/^https?:\/\/([^\/]+)\/(.+?)(?:\.git)?$/);
    if (httpsMatch) {
      instanceUrl = `https://${httpsMatch[1]}`;
      project = httpsMatch[2];
    }

    if (project) {
      return { project, instanceUrl };
    }

    return null;
  } catch {
    return null;
  }
}
