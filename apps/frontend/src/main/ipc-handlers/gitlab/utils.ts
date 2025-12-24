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
 * Retrieve a GitLab access token from the glab CLI.
 *
 * @param instanceUrl - Optional GitLab instance URL to target (used for self-hosted instances)
 * @returns The GitLab access token if found, `null` otherwise.
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
 * Load GitLab token, instance URL, and project reference from a project's .env file.
 *
 * If `GITLAB_TOKEN` is not present in the file, attempts to retrieve a token from the `glab` CLI for the resolved instance URL. Returns `null` if the `.env` file is missing, cannot be read/parsed, or if either the token or project reference is not available.
 *
 * @param project - Project whose `path` and `autoBuildPath` are used to locate the `.env` file
 * @returns A GitLabConfig containing `token`, `instanceUrl`, and `project` if all are found; `null` otherwise.
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
 * Normalize a GitLab project reference into a namespace/path or return a numeric project ID unchanged.
 *
 * @param project - Project reference to normalize; may be a numeric ID, a namespace path (e.g., `group/project` or `group/subgroup/project`), an HTTPS URL, or an SSH URL.
 * @param instanceUrl - GitLab base URL used to identify and strip host-specific prefixes (defaults to the module's default GitLab URL).
 * @returns The normalized project path such as `group/project` or `group/subgroup/project`, the original numeric ID if `project` is numeric, or an empty string when `project` is empty.
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
 * Encode a GitLab project path for use in API URLs.
 *
 * Numeric project IDs are returned unchanged; otherwise the path is URL-encoded
 * (for example, `group/project` becomes `group%2Fproject`).
 *
 * @param projectPath - Project path or numeric project ID
 * @returns The encoded project path suitable for GitLab API requests
 */
export function encodeProjectPath(projectPath: string): string {
  // If it's a numeric ID, return as-is
  if (/^\d+$/.test(projectPath)) {
    return projectPath;
  }
  return encodeURIComponent(projectPath);
}

/**
 * Perform an authenticated request to the GitLab API and return the parsed JSON response.
 *
 * The `PRIVATE-TOKEN` header is set from `token`, and `Content-Type` defaults to `application/json`.
 *
 * @param token - Personal access token placed in the `PRIVATE-TOKEN` header
 * @param instanceUrl - Base GitLab instance URL used when `endpoint` is a relative path
 * @param endpoint - Full URL or a path appended to `{instanceUrl}/api/v4`; if it starts with `http` it is used as-is
 * @param options - Additional fetch options; provided headers are merged with defaults
 * @returns The response body parsed as JSON
 * @throws Error if the HTTP response has a non-OK status; the error message includes status, statusText, and response body
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
 * Resolve a GitLab project's numeric ID from a project path or numeric ID.
 *
 * @param pathWithNamespace - The project's path with namespace (e.g., `group/subgroup/project`) or a numeric project ID
 * @returns The project's numeric ID
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
 * Infers the GitLab project path and instance URL from the repository's `origin` remote.
 *
 * @param projectPath - Filesystem path of the git repository to inspect
 * @returns An object with `project` as the namespace/path (for example, `group/project`) and `instanceUrl` as the GitLab base URL (for example, `https://gitlab.com`), or `null` if the remote cannot be parsed or detection fails
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
    const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
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