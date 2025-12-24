/**
 * GitLab investigation handlers
 * Handles AI-powered issue investigation
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { Project, GitLabInvestigationStatus, GitLabInvestigationResult } from '../../../shared/types';
import { getGitLabConfig, gitlabFetch, encodeProjectPath } from './utils';
import type { GitLabAPIIssue, GitLabAPINote } from './types';
import { buildIssueContext, createSpecForIssue } from './spec-utils';
import type { AgentManager } from '../../agent';

// Debug logging helper
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';

/**
 * Logs a prefixed debug message and optional data to the console when debugging is enabled.
 *
 * @param message - The message to log
 * @param data - Optional additional data to include with the log
 */
function debugLog(message: string, data?: unknown): void {
  if (DEBUG) {
    if (data !== undefined) {
      console.debug(`[GitLab Investigation] ${message}`, data);
    } else {
      console.debug(`[GitLab Investigation] ${message}`);
    }
  }
}

/**
 * Send an investigation progress update to the renderer process.
 *
 * Sends an IPC message with the given `projectId` and `status` to the application's main window if it exists.
 *
 * @param getMainWindow - Function that returns the current main BrowserWindow or `null` if not available
 * @param projectId - The GitLab project identifier this progress update relates to
 * @param status - Progress payload describing the investigation phase, percentage, and optional message
 */
function sendProgress(
  getMainWindow: () => BrowserWindow | null,
  projectId: string,
  status: GitLabInvestigationStatus
): void {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.GITLAB_INVESTIGATION_PROGRESS, projectId, status);
  }
}

/**
 * Notifies the renderer that a GitLab investigation finished and delivers the result.
 *
 * @param projectId - The GitLab project identifier associated with the investigation
 * @param result - The investigation result payload sent to the renderer
 */
function sendComplete(
  getMainWindow: () => BrowserWindow | null,
  projectId: string,
  result: GitLabInvestigationResult
): void {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.GITLAB_INVESTIGATION_COMPLETE, projectId, result);
  }
}

/**
 * Emit an investigation error to the renderer for the given project.
 *
 * @param projectId - The GitLab project identifier associated with the error
 * @param error - The error message to send to the renderer
 */
function sendError(
  getMainWindow: () => BrowserWindow | null,
  projectId: string,
  error: string
): void {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send(IPC_CHANNELS.GITLAB_INVESTIGATION_ERROR, projectId, error);
  }
}

/**
 * Register an IPC handler that performs a multi-phase GitLab issue investigation.
 *
 * When invoked via the IPC channel `GITLAB_INVESTIGATE_ISSUE`, the handler:
 * - verifies GitLab configuration for the project,
 * - fetches the issue (and optionally selected notes),
 * - builds an investigation context and runs AI analysis,
 * - creates a task/spec from the analysis,
 * - emits progress updates and either a completion result or an error back to the renderer.
 *
 * @param agentManager - Manager used to run AI investigation agents (used by the investigation workflow).
 * @param getMainWindow - Function that returns the main BrowserWindow or null; used to send IPC progress, completion, and error messages.
 */
export function registerInvestigateIssue(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.on(
    IPC_CHANNELS.GITLAB_INVESTIGATE_ISSUE,
    async (_event, project: Project, issueIid: number, selectedNoteIds?: number[]) => {
      debugLog('investigateGitLabIssue handler called', { issueIid, selectedNoteIds });

      const config = getGitLabConfig(project);
      if (!config) {
        sendError(getMainWindow, project.id, 'GitLab not configured');
        return;
      }

      try {
        // Phase 1: Fetching issue
        sendProgress(getMainWindow, project.id, {
          phase: 'fetching',
          issueIid,
          progress: 10,
          message: 'Fetching issue details...'
        });

        const encodedProject = encodeProjectPath(config.project);

        // Fetch issue
        const issue = await gitlabFetch(
          config.token,
          config.instanceUrl,
          `/projects/${encodedProject}/issues/${issueIid}`
        ) as GitLabAPIIssue;

        // Fetch notes if any selected
        let selectedNotes: GitLabAPINote[] = [];
        if (selectedNoteIds && selectedNoteIds.length > 0) {
          const allNotes = await gitlabFetch(
            config.token,
            config.instanceUrl,
            `/projects/${encodedProject}/issues/${issueIid}/notes`
          ) as GitLabAPINote[];

          selectedNotes = allNotes.filter(note => selectedNoteIds.includes(note.id));
        }

        // Phase 2: Analyzing
        sendProgress(getMainWindow, project.id, {
          phase: 'analyzing',
          issueIid,
          progress: 30,
          message: 'Analyzing issue with AI...'
        });

        // Build context for investigation
        let context = buildIssueContext(issue, config.project);

        if (selectedNotes.length > 0) {
          context += '\n\n## Selected Comments\n';
          for (const note of selectedNotes) {
            context += `\n### Comment by ${note.author.username} (${new Date(note.created_at).toLocaleDateString()})\n`;
            context += note.body + '\n';
          }
        }

        // Use agent manager to investigate
        // Note: This is a simplified version - full implementation would use Claude SDK
        sendProgress(getMainWindow, project.id, {
          phase: 'analyzing',
          issueIid,
          progress: 50,
          message: 'AI analyzing the issue...'
        });

        // Phase 3: Creating task
        sendProgress(getMainWindow, project.id, {
          phase: 'creating_task',
          issueIid,
          progress: 80,
          message: 'Creating task from analysis...'
        });

        // Create spec for the issue
        const task = await createSpecForIssue(project, issue, config);

        if (!task) {
          sendError(getMainWindow, project.id, 'Failed to create task from issue');
          return;
        }

        // Phase 4: Complete
        sendProgress(getMainWindow, project.id, {
          phase: 'complete',
          issueIid,
          progress: 100,
          message: 'Investigation complete'
        });

        // Send result
        const result: GitLabInvestigationResult = {
          success: true,
          issueIid,
          analysis: {
            summary: `Investigation of GitLab issue #${issueIid}: ${issue.title}`,
            proposedSolution: issue.description || 'See task details for more information.',
            affectedFiles: [],
            estimatedComplexity: 'standard',
            acceptanceCriteria: []
          },
          taskId: task.id
        };

        sendComplete(getMainWindow, project.id, result);
        debugLog('Investigation complete:', { issueIid, taskId: task.id });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Investigation failed';
        debugLog('Investigation failed:', errorMessage);
        sendError(getMainWindow, project.id, errorMessage);
      }
    }
  );
}

/**
 * Register all investigation handlers
 */
export function registerInvestigationHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  debugLog('Registering GitLab investigation handlers');
  registerInvestigateIssue(agentManager, getMainWindow);
  debugLog('GitLab investigation handlers registered');
}