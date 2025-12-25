/**
 * GitHub PR Review IPC handlers
 *
 * Handles AI-powered PR review:
 * 1. List and fetch PRs
 * 2. Run AI review with code analysis
 * 3. Post review comments
 * 4. Apply fixes
 */

import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC_CHANNELS, MODEL_ID_MAP, DEFAULT_FEATURE_MODELS, DEFAULT_FEATURE_THINKING } from '../../../shared/constants';
import { getGitHubConfig, githubFetch } from './utils';
import { readSettingsFile } from '../../settings-utils';
import type { Project, AppSettings, FeatureModelConfig, FeatureThinkingConfig } from '../../../shared/types';
import { createContextLogger } from './utils/logger';
import { withProjectOrNull, withProjectSyncOrNull } from './utils/project-middleware';
import { createIPCCommunicators } from './utils/ipc-communicator';
import {
  runPythonSubprocess,
  getBackendPath,
  getPythonPath,
  getRunnerPath,
  validateRunner,
  validateGitHubModule,
  buildRunnerArgs,
} from './utils/subprocess-runner';

// Debug logging
const { debug: debugLog } = createContextLogger('GitHub PR');

/**
 * Registry of running PR review processes
 * Key format: `${projectId}:${prNumber}`
 */
const runningReviews = new Map<string, import('child_process').ChildProcess>();

/**
 * Get the registry key for a PR review
 */
function getReviewKey(projectId: string, prNumber: number): string {
  return `${projectId}:${prNumber}`;
}

/**
 * PR review finding from AI analysis
 */
export interface PRReviewFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'quality' | 'style' | 'test' | 'docs' | 'pattern' | 'performance';
  title: string;
  description: string;
  file: string;
  line: number;
  endLine?: number;
  suggestedFix?: string;
  fixable: boolean;
}

/**
 * Complete PR review result
 */
export interface PRReviewResult {
  prNumber: number;
  repo: string;
  success: boolean;
  findings: PRReviewFinding[];
  summary: string;
  overallStatus: 'approve' | 'request_changes' | 'comment';
  reviewId?: number;
  reviewedAt: string;
  error?: string;
  // Follow-up review fields
  reviewedCommitSha?: string;
  isFollowupReview?: boolean;
  previousReviewId?: number;
  resolvedFindings?: string[];
  unresolvedFindings?: string[];
  newFindingsSinceLastReview?: string[];
  // Track if findings have been posted to GitHub (enables follow-up review)
  hasPostedFindings?: boolean;
  postedFindingIds?: string[];
}

/**
 * Result of checking for new commits since last review
 */
export interface NewCommitsCheck {
  hasNewCommits: boolean;
  newCommitCount: number;
  lastReviewedCommit?: string;
  currentHeadCommit?: string;
}

/**
 * PR data from GitHub API
 */
export interface PRData {
  number: number;
  title: string;
  body: string;
  state: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  assignees: Array<{ login: string }>;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

/**
 * PR review progress status
 */
export interface PRReviewProgress {
  phase: 'fetching' | 'analyzing' | 'generating' | 'posting' | 'complete';
  prNumber: number;
  progress: number;
  message: string;
}

/**
 * Get the GitHub directory for a project
 */
function getGitHubDir(project: Project): string {
  return path.join(project.path, '.auto-claude', 'github');
}

/**
 * Get saved PR review result
 */
function getReviewResult(project: Project, prNumber: number): PRReviewResult | null {
  const reviewPath = path.join(getGitHubDir(project), 'pr', `review_${prNumber}.json`);

  if (fs.existsSync(reviewPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
      return {
        prNumber: data.pr_number,
        repo: data.repo,
        success: data.success,
        findings: data.findings?.map((f: Record<string, unknown>) => ({
          id: f.id,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description,
          file: f.file,
          line: f.line,
          endLine: f.end_line,
          suggestedFix: f.suggested_fix,
          fixable: f.fixable ?? false,
        })) ?? [],
        summary: data.summary ?? '',
        overallStatus: data.overall_status ?? 'comment',
        reviewId: data.review_id,
        reviewedAt: data.reviewed_at ?? new Date().toISOString(),
        error: data.error,
        // Follow-up review fields (snake_case -> camelCase)
        reviewedCommitSha: data.reviewed_commit_sha,
        isFollowupReview: data.is_followup_review ?? false,
        previousReviewId: data.previous_review_id,
        resolvedFindings: data.resolved_findings ?? [],
        unresolvedFindings: data.unresolved_findings ?? [],
        newFindingsSinceLastReview: data.new_findings_since_last_review ?? [],
        // Track posted findings for follow-up review eligibility
        hasPostedFindings: data.has_posted_findings ?? false,
        postedFindingIds: data.posted_finding_ids ?? [],
      };
    } catch {
      return null;
    }
  }

  return null;
}

// IPC communication helpers removed - using createIPCCommunicators instead

/**
 * Get GitHub PR model and thinking settings from app settings
 */
function getGitHubPRSettings(): { model: string; thinkingLevel: string } {
  const rawSettings = readSettingsFile() as Partial<AppSettings> | undefined;

  // Get feature models/thinking with defaults
  const featureModels = rawSettings?.featureModels ?? DEFAULT_FEATURE_MODELS;
  const featureThinking = rawSettings?.featureThinking ?? DEFAULT_FEATURE_THINKING;

  // Get PR-specific settings (with fallback to defaults)
  const modelShort = featureModels.githubPrs ?? DEFAULT_FEATURE_MODELS.githubPrs;
  const thinkingLevel = featureThinking.githubPrs ?? DEFAULT_FEATURE_THINKING.githubPrs;

  // Convert model short name to full model ID
  const model = MODEL_ID_MAP[modelShort] ?? MODEL_ID_MAP['opus'];

  debugLog('GitHub PR settings', { modelShort, model, thinkingLevel });

  return { model, thinkingLevel };
}

// getBackendPath function removed - using subprocess-runner utility instead

/**
 * Run the Python PR reviewer
 */
async function runPRReview(
  project: Project,
  prNumber: number,
  mainWindow: BrowserWindow
): Promise<PRReviewResult> {
  // Comprehensive validation of GitHub module
  const validation = await validateGitHubModule(project);

  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const backendPath = validation.backendPath!;

  const { sendProgress } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
    mainWindow,
    {
      progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
      error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
      complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
    },
    project.id
  );

  const { model, thinkingLevel } = getGitHubPRSettings();
  const args = buildRunnerArgs(
    getRunnerPath(backendPath),
    project.path,
    'review-pr',
    [prNumber.toString()],
    { model, thinkingLevel }
  );

  debugLog('Spawning PR review process', { args, model, thinkingLevel });

  const { process: childProcess, promise } = runPythonSubprocess<PRReviewResult>({
    pythonPath: getPythonPath(backendPath),
    args,
    cwd: backendPath,
    onProgress: (percent, message) => {
      debugLog('Progress update', { percent, message });
      sendProgress({
        phase: 'analyzing',
        prNumber,
        progress: percent,
        message,
      });
    },
    onStdout: (line) => debugLog('STDOUT:', line),
    onStderr: (line) => debugLog('STDERR:', line),
    onComplete: () => {
      // Load the result from disk
      const reviewResult = getReviewResult(project, prNumber);
      if (!reviewResult) {
        throw new Error('Review completed but result not found');
      }
      debugLog('Review result loaded', { findingsCount: reviewResult.findings.length });
      return reviewResult;
    },
  });

  // Register the running process
  const reviewKey = getReviewKey(project.id, prNumber);
  runningReviews.set(reviewKey, childProcess);
  debugLog('Registered review process', { reviewKey, pid: childProcess.pid });

  try {
    // Wait for the process to complete
    const result = await promise;

    if (!result.success) {
      throw new Error(result.error ?? 'Review failed');
    }

    return result.data!;
  } finally {
    // Clean up the registry when done (success or error)
    runningReviews.delete(reviewKey);
    debugLog('Unregistered review process', { reviewKey });
  }
}

/**
 * Register PR-related handlers
 */
export function registerPRHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  debugLog('Registering PR handlers');

  // List open PRs
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_LIST,
    async (_, projectId: string): Promise<PRData[]> => {
      debugLog('listPRs handler called', { projectId });
      const result = await withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found for project');
          return [];
        }

        try {
          const prs = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls?state=open&per_page=50`
          ) as Array<{
            number: number;
            title: string;
            body?: string;
            state: string;
            user: { login: string };
            head: { ref: string };
            base: { ref: string };
            additions: number;
            deletions: number;
            changed_files: number;
            assignees?: Array<{ login: string }>;
            created_at: string;
            updated_at: string;
            html_url: string;
          }>;

          debugLog('Fetched PRs', { count: prs.length });
          return prs.map(pr => ({
            number: pr.number,
            title: pr.title,
            body: pr.body ?? '',
            state: pr.state,
            author: { login: pr.user.login },
            headRefName: pr.head.ref,
            baseRefName: pr.base.ref,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            assignees: pr.assignees?.map((a: { login: string }) => ({ login: a.login })) ?? [],
            files: [],
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            htmlUrl: pr.html_url,
          }));
        } catch (error) {
          debugLog('Failed to fetch PRs', { error: error instanceof Error ? error.message : error });
          return [];
        }
      });
      return result ?? [];
    }
  );

  // Get single PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET,
    async (_, projectId: string, prNumber: number): Promise<PRData | null> => {
      debugLog('getPR handler called', { projectId, prNumber });
      return withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) return null;

        try {
          const pr = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}`
          ) as {
            number: number;
            title: string;
            body?: string;
            state: string;
            user: { login: string };
            head: { ref: string };
            base: { ref: string };
            additions: number;
            deletions: number;
            changed_files: number;
            assignees?: Array<{ login: string }>;
            created_at: string;
            updated_at: string;
            html_url: string;
          };

          const files = await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}/files`
          ) as Array<{
            filename: string;
            additions: number;
            deletions: number;
            status: string;
          }>;

          return {
            number: pr.number,
            title: pr.title,
            body: pr.body ?? '',
            state: pr.state,
            author: { login: pr.user.login },
            headRefName: pr.head.ref,
            baseRefName: pr.base.ref,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changed_files,
            assignees: pr.assignees?.map((a: { login: string }) => ({ login: a.login })) ?? [],
            files: files.map(f => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              status: f.status,
            })),
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            htmlUrl: pr.html_url,
          };
        } catch {
          return null;
        }
      });
    }
  );

  // Get PR diff
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET_DIFF,
    async (_, projectId: string, prNumber: number): Promise<string | null> => {
      return withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) return null;

        try {
          const { execFileSync } = await import('child_process');
          // Validate prNumber to prevent command injection
          if (!Number.isInteger(prNumber) || prNumber <= 0) {
            throw new Error('Invalid PR number');
          }
          // Use execFileSync with arguments array to prevent command injection
          const diff = execFileSync('gh', ['pr', 'diff', String(prNumber)], {
            cwd: project.path,
            encoding: 'utf-8',
          });
          return diff;
        } catch {
          return null;
        }
      });
    }
  );

  // Get saved review
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_GET_REVIEW,
    async (_, projectId: string, prNumber: number): Promise<PRReviewResult | null> => {
      return withProjectOrNull(projectId, async (project) => {
        return getReviewResult(project, prNumber);
      });
    }
  );

  // Run AI review
  ipcMain.on(
    IPC_CHANNELS.GITHUB_PR_REVIEW,
    async (_, projectId: string, prNumber: number) => {
      debugLog('runPRReview handler called', { projectId, prNumber });
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window available');
        return;
      }

      try {
        await withProjectOrNull(projectId, async (project) => {
          const { sendProgress, sendError, sendComplete } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
            mainWindow,
            {
              progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
              error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
              complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
            },
            projectId
          );

          debugLog('Starting PR review', { prNumber });
          sendProgress({
            phase: 'fetching',
            prNumber,
            progress: 5,
            message: 'Assigning you to PR...',
          });

          // Auto-assign current user to PR
          const config = getGitHubConfig(project);
          if (config) {
            try {
              // Get current user
              const user = await githubFetch(config.token, '/user') as { login: string };
              debugLog('Auto-assigning user to PR', { prNumber, username: user.login });

              // Assign to PR
              await githubFetch(
                config.token,
                `/repos/${config.repo}/issues/${prNumber}/assignees`,
                {
                  method: 'POST',
                  body: JSON.stringify({ assignees: [user.login] }),
                }
              );
              debugLog('User assigned successfully', { prNumber, username: user.login });
            } catch (assignError) {
              // Don't fail the review if assignment fails, just log it
              debugLog('Failed to auto-assign user', { prNumber, error: assignError instanceof Error ? assignError.message : assignError });
            }
          }

          sendProgress({
            phase: 'fetching',
            prNumber,
            progress: 10,
            message: 'Fetching PR data...',
          });

          const result = await runPRReview(project, prNumber, mainWindow);

          debugLog('PR review completed', { prNumber, findingsCount: result.findings.length });
          sendProgress({
            phase: 'complete',
            prNumber,
            progress: 100,
            message: 'Review complete!',
          });

          sendComplete(result);
        });
      } catch (error) {
        debugLog('PR review failed', { prNumber, error: error instanceof Error ? error.message : error });
        const { sendError } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
          mainWindow,
          {
            progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
            error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
            complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
          },
          projectId
        );
        sendError(error instanceof Error ? error.message : 'Failed to run PR review');
      }
    }
  );

  // Post review to GitHub
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_POST_REVIEW,
    async (_, projectId: string, prNumber: number, selectedFindingIds?: string[]): Promise<boolean> => {
      debugLog('postPRReview handler called', { projectId, prNumber, selectedCount: selectedFindingIds?.length });
      const postResult = await withProjectOrNull(projectId, async (project) => {
        const result = getReviewResult(project, prNumber);
        if (!result) {
          debugLog('No review result found', { prNumber });
          return false;
        }

        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found');
          return false;
        }

        try {
          // Filter findings if selection provided
          const selectedSet = selectedFindingIds ? new Set(selectedFindingIds) : null;
          const findings = selectedSet
            ? result.findings.filter(f => selectedSet.has(f.id))
            : result.findings;

          debugLog('Posting findings', { total: result.findings.length, selected: findings.length });

          // Build review body
          let body = `## 🤖 Auto Claude PR Review\n\n${result.summary}\n\n`;

          if (findings.length > 0) {
            // Show selected count vs total if filtered
            const countText = selectedSet
              ? `${findings.length} selected of ${result.findings.length} total`
              : `${findings.length} total`;
            body += `### Findings (${countText})\n\n`;

            for (const f of findings) {
              const emoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵' }[f.severity] || '⚪';
              body += `#### ${emoji} [${f.severity.toUpperCase()}] ${f.title}\n`;
              body += `📁 \`${f.file}:${f.line}\`\n\n`;
              body += `${f.description}\n\n`;
              // Only show suggested fix if it has actual content
              const suggestedFix = f.suggestedFix?.trim();
              if (suggestedFix) {
                body += `**Suggested fix:**\n\`\`\`\n${suggestedFix}\n\`\`\`\n\n`;
              }
            }
          } else {
            body += `*No findings selected for this review.*\n\n`;
          }

          body += `---\n*This review was generated by Auto Claude.*`;

          // Determine review status based on selected findings
          let overallStatus = result.overallStatus;
          if (selectedSet) {
            const hasBlocker = findings.some(f => f.severity === 'critical' || f.severity === 'high');
            overallStatus = hasBlocker ? 'request_changes' : (findings.length > 0 ? 'comment' : 'approve');
          }

          // Map to GitHub API event type
          const event = overallStatus === 'approve' ? 'APPROVE' :
            overallStatus === 'request_changes' ? 'REQUEST_CHANGES' : 'COMMENT';

          debugLog('Posting review to GitHub', { prNumber, status: overallStatus, event, findingsCount: findings.length });

          // Post review via GitHub API to capture review ID
          let reviewResponse: { id: number };
          let actualEvent = event;
          try {
            reviewResponse = await githubFetch(
              config.token,
              `/repos/${config.repo}/pulls/${prNumber}/reviews`,
              {
                method: 'POST',
                body: JSON.stringify({
                  body,
                  event,
                }),
              }
            ) as { id: number };
          } catch (error) {
            // GitHub doesn't allow REQUEST_CHANGES or APPROVE on your own PR
            // Fall back to COMMENT if that's the error
            const errorMsg = error instanceof Error ? error.message : String(error);
            if (errorMsg.includes('Can not request changes on your own pull request') ||
                errorMsg.includes('Can not approve your own pull request')) {
              debugLog('Cannot use REQUEST_CHANGES/APPROVE on own PR, falling back to COMMENT', { prNumber });
              actualEvent = 'COMMENT';
              reviewResponse = await githubFetch(
                config.token,
                `/repos/${config.repo}/pulls/${prNumber}/reviews`,
                {
                  method: 'POST',
                  body: JSON.stringify({
                    body,
                    event: 'COMMENT',
                  }),
                }
              ) as { id: number };
            } else {
              throw error;
            }
          }

          const reviewId = reviewResponse.id;
          debugLog('Review posted successfully', { prNumber, reviewId });

          // Update the stored review result with the review ID and posted findings
          const reviewPath = path.join(getGitHubDir(project), 'pr', `review_${prNumber}.json`);
          if (fs.existsSync(reviewPath)) {
            try {
              const data = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
              data.review_id = reviewId;
              // Track posted findings to enable follow-up review
              data.has_posted_findings = true;
              const newPostedIds = findings.map(f => f.id);
              const existingPostedIds = data.posted_finding_ids || [];
              data.posted_finding_ids = [...new Set([...existingPostedIds, ...newPostedIds])];
              fs.writeFileSync(reviewPath, JSON.stringify(data, null, 2), 'utf-8');
              debugLog('Updated review result with review ID and posted findings', { prNumber, reviewId, postedCount: newPostedIds.length });
            } catch (error) {
              debugLog('Failed to update review result file', { error: error instanceof Error ? error.message : error });
            }
          }

          return true;
        } catch (error) {
          debugLog('Failed to post review', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return postResult ?? false;
    }
  );

  // Post comment to PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_POST_COMMENT,
    async (_, projectId: string, prNumber: number, body: string): Promise<boolean> => {
      debugLog('postPRComment handler called', { projectId, prNumber });
      const postResult = await withProjectOrNull(projectId, async (project) => {
        try {
          const { execFileSync } = await import('child_process');
          const { writeFileSync, unlinkSync } = await import('fs');
          const { join } = await import('path');

          debugLog('Posting comment to PR', { prNumber });

          // Validate prNumber to prevent command injection
          if (!Number.isInteger(prNumber) || prNumber <= 0) {
            throw new Error('Invalid PR number');
          }

          // Use temp file to avoid shell escaping issues
          const tmpFile = join(project.path, '.auto-claude', 'tmp_comment_body.txt');
          try {
            writeFileSync(tmpFile, body, 'utf-8');
            // Use execFileSync with arguments array to prevent command injection
            execFileSync('gh', ['pr', 'comment', String(prNumber), '--body-file', tmpFile], {
              cwd: project.path,
            });
            unlinkSync(tmpFile);
          } catch (error) {
            try { unlinkSync(tmpFile); } catch {
              // Ignore cleanup errors
            }
            throw error;
          }

          debugLog('Comment posted successfully', { prNumber });
          return true;
        } catch (error) {
          debugLog('Failed to post comment', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return postResult ?? false;
    }
  );

  // Delete review from PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_DELETE_REVIEW,
    async (_, projectId: string, prNumber: number): Promise<boolean> => {
      debugLog('deletePRReview handler called', { projectId, prNumber });
      const deleteResult = await withProjectOrNull(projectId, async (project) => {
        const result = getReviewResult(project, prNumber);
        if (!result || !result.reviewId) {
          debugLog('No review ID found for deletion', { prNumber });
          return false;
        }

        const config = getGitHubConfig(project);
        if (!config) {
          debugLog('No GitHub config found');
          return false;
        }

        try {
          debugLog('Deleting review from GitHub', { prNumber, reviewId: result.reviewId });

          // Delete review via GitHub API
          await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}/reviews/${result.reviewId}`,
            {
              method: 'DELETE',
            }
          );

          debugLog('Review deleted successfully', { prNumber, reviewId: result.reviewId });

          // Clear the review ID from the stored result
          const reviewPath = path.join(getGitHubDir(project), 'pr', `review_${prNumber}.json`);
          if (fs.existsSync(reviewPath)) {
            try {
              const data = JSON.parse(fs.readFileSync(reviewPath, 'utf-8'));
              delete data.review_id;
              fs.writeFileSync(reviewPath, JSON.stringify(data, null, 2), 'utf-8');
              debugLog('Cleared review ID from result file', { prNumber });
            } catch (error) {
              debugLog('Failed to update review result file', { error: error instanceof Error ? error.message : error });
            }
          }

          return true;
        } catch (error) {
          debugLog('Failed to delete review', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return deleteResult ?? false;
    }
  );

  // Merge PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_MERGE,
    async (_, projectId: string, prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<boolean> => {
      debugLog('mergePR handler called', { projectId, prNumber, mergeMethod });
      const mergeResult = await withProjectOrNull(projectId, async (project) => {
        try {
          const { execFileSync } = await import('child_process');
          debugLog('Merging PR', { prNumber, method: mergeMethod });

          // Validate prNumber to prevent command injection
          if (!Number.isInteger(prNumber) || prNumber <= 0) {
            throw new Error('Invalid PR number');
          }

          // Validate mergeMethod to prevent command injection
          const validMethods = ['merge', 'squash', 'rebase'];
          if (!validMethods.includes(mergeMethod)) {
            throw new Error('Invalid merge method');
          }

          // Use execFileSync with arguments array to prevent command injection
          execFileSync('gh', ['pr', 'merge', String(prNumber), `--${mergeMethod}`], {
            cwd: project.path,
          });
          debugLog('PR merged successfully', { prNumber });
          return true;
        } catch (error) {
          debugLog('Failed to merge PR', { prNumber, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return mergeResult ?? false;
    }
  );

  // Assign user to PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_ASSIGN,
    async (_, projectId: string, prNumber: number, username: string): Promise<boolean> => {
      debugLog('assignPR handler called', { projectId, prNumber, username });
      const assignResult = await withProjectOrNull(projectId, async (project) => {
        const config = getGitHubConfig(project);
        if (!config) return false;

        try {
          // Use GitHub API to add assignee
          await githubFetch(
            config.token,
            `/repos/${config.repo}/issues/${prNumber}/assignees`,
            {
              method: 'POST',
              body: JSON.stringify({ assignees: [username] }),
            }
          );
          debugLog('User assigned successfully', { prNumber, username });
          return true;
        } catch (error) {
          debugLog('Failed to assign user', { prNumber, username, error: error instanceof Error ? error.message : error });
          return false;
        }
      });
      return assignResult ?? false;
    }
  );

  // Cancel PR review
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_REVIEW_CANCEL,
    async (_, projectId: string, prNumber: number): Promise<boolean> => {
      debugLog('cancelPRReview handler called', { projectId, prNumber });
      const reviewKey = getReviewKey(projectId, prNumber);
      const childProcess = runningReviews.get(reviewKey);

      if (!childProcess) {
        debugLog('No running review found to cancel', { reviewKey });
        return false;
      }

      try {
        debugLog('Killing review process', { reviewKey, pid: childProcess.pid });
        childProcess.kill('SIGTERM');

        // Give it a moment to terminate gracefully, then force kill if needed
        setTimeout(() => {
          if (!childProcess.killed) {
            debugLog('Force killing review process', { reviewKey, pid: childProcess.pid });
            childProcess.kill('SIGKILL');
          }
        }, 1000);

        // Clean up the registry
        runningReviews.delete(reviewKey);
        debugLog('Review process cancelled', { reviewKey });
        return true;
      } catch (error) {
        debugLog('Failed to cancel review', { reviewKey, error: error instanceof Error ? error.message : error });
        return false;
      }
    }
  );

  // Check for new commits since last review
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_PR_CHECK_NEW_COMMITS,
    async (_, projectId: string, prNumber: number): Promise<NewCommitsCheck> => {
      debugLog('checkNewCommits handler called', { projectId, prNumber });

      const result = await withProjectOrNull(projectId, async (project) => {
        // Check if review exists and has reviewed_commit_sha
        const githubDir = path.join(project.path, '.auto-claude', 'github');
        const reviewPath = path.join(githubDir, 'pr', `review_${prNumber}.json`);

        if (!fs.existsSync(reviewPath)) {
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        let review: PRReviewResult;
        try {
          const data = fs.readFileSync(reviewPath, 'utf-8');
          review = JSON.parse(data);
        } catch {
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        // Convert snake_case to camelCase for the field
        const reviewedCommitSha = review.reviewedCommitSha || (review as any).reviewed_commit_sha;
        if (!reviewedCommitSha) {
          debugLog('No reviewedCommitSha in review', { prNumber });
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        // Get current PR HEAD
        const config = getGitHubConfig(project);
        if (!config) {
          return { hasNewCommits: false, newCommitCount: 0 };
        }

        try {
          // Get PR data to find current HEAD
          const prData = (await githubFetch(
            config.token,
            `/repos/${config.repo}/pulls/${prNumber}`
          )) as { head: { sha: string }; commits: number };

          const currentHeadSha = prData.head.sha;

          if (reviewedCommitSha === currentHeadSha) {
            return {
              hasNewCommits: false,
              newCommitCount: 0,
              lastReviewedCommit: reviewedCommitSha,
              currentHeadCommit: currentHeadSha,
            };
          }

          // Get comparison to count new commits
          const comparison = (await githubFetch(
            config.token,
            `/repos/${config.repo}/compare/${reviewedCommitSha}...${currentHeadSha}`
          )) as { ahead_by?: number; total_commits?: number };

          return {
            hasNewCommits: true,
            newCommitCount: comparison.ahead_by || comparison.total_commits || 1,
            lastReviewedCommit: reviewedCommitSha,
            currentHeadCommit: currentHeadSha,
          };
        } catch (error) {
          debugLog('Error checking new commits', { prNumber, error: error instanceof Error ? error.message : error });
          return { hasNewCommits: false, newCommitCount: 0 };
        }
      });

      return result ?? { hasNewCommits: false, newCommitCount: 0 };
    }
  );

  // Run follow-up review
  ipcMain.on(
    IPC_CHANNELS.GITHUB_PR_FOLLOWUP_REVIEW,
    async (_, projectId: string, prNumber: number) => {
      debugLog('followupReview handler called', { projectId, prNumber });
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window available');
        return;
      }

      try {
        await withProjectOrNull(projectId, async (project) => {
          const { sendProgress, sendError, sendComplete } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
            mainWindow,
            {
              progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
              error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
              complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
            },
            projectId
          );

          // Comprehensive validation of GitHub module
          const validation = await validateGitHubModule(project);
          if (!validation.valid) {
            sendError({ prNumber, error: validation.error || 'GitHub module validation failed' });
            return;
          }

          const backendPath = validation.backendPath!;
          const reviewKey = getReviewKey(projectId, prNumber);

          // Check if already running
          if (runningReviews.has(reviewKey)) {
            debugLog('Follow-up review already running', { reviewKey });
            return;
          }

          debugLog('Starting follow-up review', { prNumber });
          sendProgress({
            phase: 'fetching',
            prNumber,
            progress: 5,
            message: 'Starting follow-up review...',
          });

          const { model, thinkingLevel } = getGitHubPRSettings();
          const args = buildRunnerArgs(
            getRunnerPath(backendPath),
            project.path,
            'followup-review-pr',
            [prNumber.toString()],
            { model, thinkingLevel }
          );

          debugLog('Spawning follow-up review process', { args, model, thinkingLevel });

          const { process: childProcess, promise } = runPythonSubprocess<PRReviewResult>({
            pythonPath: getPythonPath(backendPath),
            args,
            cwd: backendPath,
            onProgress: (percent, message) => {
              debugLog('Progress update', { percent, message });
              sendProgress({
                phase: 'analyzing',
                prNumber,
                progress: percent,
                message,
              });
            },
            onStdout: (line) => debugLog('STDOUT:', line),
            onStderr: (line) => debugLog('STDERR:', line),
            onComplete: () => {
              // Load the result from disk
              const reviewResult = getReviewResult(project, prNumber);
              if (!reviewResult) {
                throw new Error('Follow-up review completed but result not found');
              }
              debugLog('Follow-up review result loaded', { findingsCount: reviewResult.findings.length });
              return reviewResult;
            },
          });

          // Register the running process
          runningReviews.set(reviewKey, childProcess);
          debugLog('Registered follow-up review process', { reviewKey, pid: childProcess.pid });

          try {
            const result = await promise;

            if (!result.success) {
              throw new Error(result.error ?? 'Follow-up review failed');
            }

            debugLog('Follow-up review completed', { prNumber, findingsCount: result.data?.findings.length });
            sendProgress({
              phase: 'complete',
              prNumber,
              progress: 100,
              message: 'Follow-up review complete!',
            });

            sendComplete(result.data!);
          } finally {
            runningReviews.delete(reviewKey);
            debugLog('Unregistered follow-up review process', { reviewKey });
          }
        });
      } catch (error) {
        debugLog('Follow-up review failed', { prNumber, error: error instanceof Error ? error.message : error });
        const { sendError } = createIPCCommunicators<PRReviewProgress, PRReviewResult>(
          mainWindow,
          {
            progress: IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS,
            error: IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR,
            complete: IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE,
          },
          projectId
        );
        sendError({ prNumber, error: error instanceof Error ? error.message : 'Failed to run follow-up review' });
      }
    }
  );

  debugLog('PR handlers registered');
}
