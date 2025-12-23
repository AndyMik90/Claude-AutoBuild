/**
 * GitLab spec utilities
 * Handles creating task specs from GitLab issues
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import type { Project, Task } from '../../../shared/types';
import type { GitLabAPIIssue, GitLabConfig } from './types';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[GitLab Spec] ${message}`, data);
    } else {
      console.warn(`[GitLab Spec] ${message}`);
    }
  }
}

/**
 * Generate a spec directory name from issue title
 */
function generateSpecDirName(issueIid: number, title: string): string {
  // Clean title for directory name
  const cleanTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  // Format: 001-issue-title (padded issue IID)
  const paddedIid = String(issueIid).padStart(3, '0');
  return `${paddedIid}-${cleanTitle}`;
}

/**
 * Build issue context for spec creation
 */
export function buildIssueContext(issue: GitLabAPIIssue, projectPath: string): string {
  const lines: string[] = [];

  lines.push(`# GitLab Issue #${issue.iid}: ${issue.title}`);
  lines.push('');
  lines.push(`**Project:** ${projectPath}`);
  lines.push(`**State:** ${issue.state}`);
  lines.push(`**Created:** ${new Date(issue.created_at).toLocaleDateString()}`);

  if (issue.labels.length > 0) {
    lines.push(`**Labels:** ${issue.labels.join(', ')}`);
  }

  if (issue.assignees.length > 0) {
    lines.push(`**Assignees:** ${issue.assignees.map(a => a.username).join(', ')}`);
  }

  if (issue.milestone) {
    lines.push(`**Milestone:** ${issue.milestone.title}`);
  }

  lines.push('');
  lines.push('## Description');
  lines.push('');
  lines.push(issue.description || '_No description provided_');
  lines.push('');
  lines.push(`**Web URL:** ${issue.web_url}`);

  return lines.join('\n');
}

/**
 * Create a task spec from a GitLab issue
 */
export async function createSpecForIssue(
  project: Project,
  issue: GitLabAPIIssue,
  config: GitLabConfig
): Promise<Task | null> {
  try {
    const specsDir = path.join(project.path, project.autoBuildPath, 'specs');

    // Ensure specs directory exists
    if (!existsSync(specsDir)) {
      mkdirSync(specsDir, { recursive: true });
    }

    // Generate spec directory name
    const specDirName = generateSpecDirName(issue.iid, issue.title);
    const specDir = path.join(specsDir, specDirName);

    // Check if spec already exists
    if (existsSync(specDir)) {
      debugLog('Spec already exists for issue:', { iid: issue.iid, specDir });
      // Return existing task info
      return {
        id: specDirName,
        name: issue.title,
        description: issue.description || '',
        status: 'pending',
        createdAt: new Date(issue.created_at),
        updatedAt: new Date(),
        specDir: specDirName,
        source: {
          type: 'gitlab',
          issueIid: issue.iid,
          instanceUrl: config.instanceUrl,
          project: config.project
        }
      } as Task;
    }

    // Create spec directory
    mkdirSync(specDir, { recursive: true });

    // Create TASK.md with issue context
    const taskContent = buildIssueContext(issue, config.project);
    writeFileSync(path.join(specDir, 'TASK.md'), taskContent, 'utf-8');

    // Create metadata.json
    const metadata = {
      source: 'gitlab',
      gitlab: {
        issueId: issue.id,
        issueIid: issue.iid,
        instanceUrl: config.instanceUrl,
        project: config.project,
        webUrl: issue.web_url,
        state: issue.state,
        labels: issue.labels,
        createdAt: issue.created_at
      },
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    writeFileSync(path.join(specDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf-8');

    debugLog('Created spec for issue:', { iid: issue.iid, specDir });

    // Return task object
    return {
      id: specDirName,
      name: issue.title,
      description: issue.description || '',
      status: 'pending',
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(),
      specDir: specDirName,
      source: {
        type: 'gitlab',
        issueIid: issue.iid,
        instanceUrl: config.instanceUrl,
        project: config.project
      }
    } as Task;
  } catch (error) {
    debugLog('Failed to create spec for issue:', { iid: issue.iid, error });
    return null;
  }
}
