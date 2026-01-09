/**
 * Azure DevOps utility functions
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { Project } from '../../../shared/types';
import { parseEnvFile } from '../utils';
import type { ADOConfig } from './types';

/**
 * Get Azure DevOps configuration from project environment file
 */
export function getADOConfig(project: Project): ADOConfig | null {
  if (!project.autoBuildPath) return null;
  const envPath = path.join(project.path, project.autoBuildPath, '.env');
  if (!existsSync(envPath)) return null;

  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars = parseEnvFile(content);

    const organization = vars['ADO_ORGANIZATION'];
    const projectName = vars['ADO_PROJECT'];
    const pat = vars['ADO_PAT'];
    const repoName = vars['ADO_REPO_NAME'] || projectName;
    const instanceUrl = vars['ADO_INSTANCE_URL'] || 'https://dev.azure.com';

    if (!organization || !projectName || !pat) return null;

    return {
      organization,
      project: projectName,
      repoName: repoName || '',
      pat,
      instanceUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Build the base URL for Azure DevOps API calls
 */
export function buildADOApiUrl(config: ADOConfig, endpoint: string): string {
  // ADO API URL format: https://dev.azure.com/{organization}/{project}/_apis/{endpoint}
  const baseUrl = `${config.instanceUrl}/${config.organization}/${config.project}/_apis`;
  const separator = endpoint.includes('?') ? '&' : '?';
  return `${baseUrl}${endpoint}${separator}api-version=7.1`;
}

/**
 * Make a request to the Azure DevOps API
 */
export async function adoFetch(
  config: ADOConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = buildADOApiUrl(config, endpoint);

  // ADO uses Basic auth with PAT (empty username, PAT as password)
  const auth = Buffer.from(`:${config.pat}`).toString('base64');

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Make a PATCH request to the Azure DevOps API (for work item updates)
 */
export async function adoPatch(
  config: ADOConfig,
  endpoint: string,
  operations: Array<{ op: string; path: string; value?: unknown }>
): Promise<unknown> {
  const url = buildADOApiUrl(config, endpoint);
  const auth = Buffer.from(`:${config.pat}`).toString('base64');

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json-patch+json', // Required for work item updates
    },
    body: JSON.stringify(operations),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Azure DevOps API error: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  return response.json();
}

/**
 * Sanitize a string for use in WIQL queries
 * Prevents WIQL injection attacks
 */
export function sanitizeWiqlString(value: string): string {
  if (!value) return '';
  // Escape single quotes (WIQL string delimiter)
  let sanitized = value.replace(/'/g, "''");
  // Remove control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
  // Limit length
  return sanitized.slice(0, 500);
}

/**
 * Parse ADO work item state to normalized open/closed
 */
export function normalizeWorkItemState(state: string): 'open' | 'closed' {
  const closedStates = ['closed', 'resolved', 'done', 'removed'];
  return closedStates.includes(state.toLowerCase()) ? 'closed' : 'open';
}

/**
 * Parse ADO PR status to normalized state
 */
export function normalizePRState(status: string): 'open' | 'closed' | 'merged' {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'merged';
    case 'abandoned':
      return 'closed';
    case 'active':
    default:
      return 'open';
  }
}

/**
 * Extract branch name from ADO ref format
 * e.g., "refs/heads/main" -> "main"
 */
export function extractBranchName(refName: string): string {
  return refName.replace('refs/heads/', '');
}
