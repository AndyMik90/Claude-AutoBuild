/**
 * Forgejo utility functions
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { Project } from '../../../shared/types';
import { parseEnvFile } from '../utils';
import type { ForgejoConfig, ForgejoInstanceConfig } from './types';
import { app } from 'electron';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

export function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[Forgejo] ${message}`, data);
    } else {
      console.debug(`[Forgejo] ${message}`);
    }
  }
}

/**
 * Get the path to the Forgejo instances configuration file
 */
function getInstancesFilePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'forgejo-instances.json');
}

/**
 * Load Forgejo instances from configuration
 */
export function loadForgejoInstances(): ForgejoInstanceConfig[] {
  const filePath = getInstancesFilePath();
  if (!existsSync(filePath)) {
    return [];
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ForgejoInstanceConfig[];
  } catch (error) {
    debugLog('Failed to load Forgejo instances', error);
    return [];
  }
}

/**
 * Save Forgejo instances to configuration
 */
export function saveForgejoInstances(instances: ForgejoInstanceConfig[]): void {
  const filePath = getInstancesFilePath();
  try {
    writeFileSync(filePath, JSON.stringify(instances, null, 2), 'utf-8');
  } catch (error) {
    debugLog('Failed to save Forgejo instances', error);
    throw error;
  }
}

/**
 * Get Forgejo configuration from project environment file
 * Checks for FORGEJO_INSTANCE_URL, FORGEJO_TOKEN, FORGEJO_REPO
 */
export function getForgejoConfig(project: Project): ForgejoConfig | null {
  if (!project.autoBuildPath) return null;
  const envPath = path.join(project.path, project.autoBuildPath, '.env');
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars = parseEnvFile(content);

    const instanceUrl = vars['FORGEJO_INSTANCE_URL'];
    const token = vars['FORGEJO_TOKEN'];
    const repo = vars['FORGEJO_REPO'];

    if (!instanceUrl || !token || !repo) return null;

    // Parse owner/repo
    const parts = repo.split('/');
    if (parts.length !== 2) return null;

    return {
      instanceUrl: instanceUrl.replace(/\/$/, ''), // Remove trailing slash
      token,
      owner: parts[0],
      repo: parts[1],
    };
  } catch {
    return null;
  }
}

/**
 * Get Forgejo configuration from an instance by ID
 */
export function getForgejoInstanceConfig(
  instanceId: string,
  owner: string,
  repo: string
): ForgejoConfig | null {
  const instances = loadForgejoInstances();
  const instance = instances.find(i => i.id === instanceId);
  if (!instance) return null;

  return {
    instanceUrl: instance.url.replace(/\/$/, ''),
    token: instance.token,
    owner,
    repo,
  };
}

/**
 * Make a request to the Forgejo API
 */
export async function forgejoFetch(
  token: string,
  instanceUrl: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  // Normalize the URL
  const baseUrl = instanceUrl.replace(/\/$/, '');
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}/api/v1${normalizedEndpoint}`;

  debugLog(`Fetch: ${options.method || 'GET'} ${url}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `token ${token}`,
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Forgejo API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Make a request to the Forgejo API and return total count from headers
 */
export async function forgejoFetchWithCount(
  token: string,
  instanceUrl: string,
  endpoint: string
): Promise<{ data: unknown; totalCount: number }> {
  const baseUrl = instanceUrl.replace(/\/$/, '');
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}/api/v1${normalizedEndpoint}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `token ${token}`,
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Forgejo API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();

  // Forgejo uses X-Total-Count header for pagination
  const totalCount = parseInt(response.headers.get('X-Total-Count') || '0', 10);

  return { data, totalCount };
}

/**
 * Get the raw diff for a pull request
 */
export async function forgejoFetchDiff(
  token: string,
  instanceUrl: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const baseUrl = instanceUrl.replace(/\/$/, '');
  const url = `${baseUrl}/api/v1/repos/${owner}/${repo}/pulls/${prNumber}.diff`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'text/plain',
      'Authorization': `token ${token}`,
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Forgejo API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.text();
}

/**
 * Normalize a Forgejo repository reference to owner/repo format
 * Handles:
 * - owner/repo (already normalized)
 * - https://instance.com/owner/repo
 * - https://instance.com/owner/repo.git
 * - git@instance.com:owner/repo.git
 */
export function normalizeRepoReference(repo: string): string {
  if (!repo) return '';

  // Remove trailing .git if present
  let normalized = repo.replace(/\.git$/, '');

  // Handle full URLs
  const urlMatch = normalized.match(/https?:\/\/[^/]+\/(.+)/);
  if (urlMatch) {
    normalized = urlMatch[1];
  }

  // Handle SSH format
  const sshMatch = normalized.match(/git@[^:]+:(.+)/);
  if (sshMatch) {
    normalized = sshMatch[1];
  }

  return normalized.trim();
}

/**
 * Generate a unique ID for a Forgejo instance
 */
export function generateInstanceId(): string {
  return `forgejo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
