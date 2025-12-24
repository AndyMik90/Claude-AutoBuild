/**
 * GitLab spec utilities
 * Handles creating task specs from GitLab issues
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import type { Project } from '../../../shared/types';
import type { GitLabAPIIssue, GitLabConfig } from './types';

/**
 * Simplified task info returned when creating a spec from a GitLab issue.
 * This is not a full Task object - it's just the basic info needed for the UI.
 */
export interface GitLabTaskInfo {
  id: string;
  specId: string;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Logs a message prefixed with "[GitLab Spec]" to the console when debug mode is enabled.
 *
 * @param message - The text message to log
 * @param data - Optional additional value to include in the log output
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab Spec] ${message}`, data);
    } else {
      console.debug(`[GitLab Spec] ${message}`);
    }
  }
}

/**
 * Create a filesystem-friendly spec directory name from a GitLab issue IID and title.
 *
 * @param issueIid - The issue IID used as a zero-padded 3-digit prefix
 * @param title - The issue title to normalize into a directory-safe slug
 * @returns The directory name in the form `NNN-cleaned-title`, where `NNN` is the zero-padded 3-digit IID and `cleaned-title` is a normalized, filesystem-friendly version of the title
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
 * Create a Markdown-formatted context for a GitLab issue to include in a spec.
 *
 * @param issue - The GitLab issue object to render into the context
 * @param projectPath - The repository or project path to display in the context
 * @returns A Markdown string containing issue metadata (ID, project, state, dates, labels, assignees, milestone), the issue description, and the web URL suitable for writing to a TASK.md file
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
 * Create a filesystem spec directory and metadata for a GitLab issue, or return info for an existing spec.
 *
 * @param project - Project metadata containing `path` and `autoBuildPath` where specs are stored
 * @param issue - GitLab API issue object used to populate the spec contents and metadata
 * @param config - GitLab integration configuration (e.g., `instanceUrl` and `project`) included in the spec metadata
 * @returns A `GitLabTaskInfo` describing the created or existing spec, or `null` if spec creation failed
 */
export async function createSpecForIssue(
  project: Project,
  issue: GitLabAPIIssue,
  config: GitLabConfig
): Promise<GitLabTaskInfo | null> {
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
        specId: specDirName,
        title: issue.title,
        description: issue.description || '',
        createdAt: new Date(issue.created_at),
        updatedAt: new Date()
      };
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

    // Return task info
    return {
      id: specDirName,
      specId: specDirName,
      title: issue.title,
      description: issue.description || '',
      createdAt: new Date(issue.created_at),
      updatedAt: new Date()
    };
  } catch (error) {
    debugLog('Failed to create spec for issue:', { iid: issue.iid, error });
    return null;
  }
}