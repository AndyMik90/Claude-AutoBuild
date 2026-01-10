/**
 * GitHub Auto-Fix IPC handlers
 *
 * Handles automatic fixing of GitHub issues by:
 * 1. Detecting issues with configured labels (e.g., "auto-fix")
 * 2. Creating specs from issues
 * 3. Running the build pipeline
 * 4. Creating PRs when complete
 */

import { ipcMain, app } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC_CHANNELS, DEFAULT_APP_SETTINGS } from '../../../shared/constants';
import type { AppSettings } from '../../../shared/types';
import { getGitHubConfig, githubFetch } from './utils';
import { createSpecForIssue, buildIssueContext, buildInvestigationTask, updateImplementationPlanStatus } from './spec-utils';
import type { Project } from '../../../shared/types';
import { createContextLogger } from './utils/logger';
import { withProjectOrNull } from './utils/project-middleware';
import { createIPCCommunicators } from './utils/ipc-communicator';
import {
  runPythonSubprocess,
  getPythonPath,
  getRunnerPath,
  validateGitHubModule,
  buildRunnerArgs,
  parseJSONFromOutput,
} from './utils/subprocess-runner';
import { AgentManager } from '../../agent/agent-manager';
import { getRunnerEnv } from './utils/runner-env';
import { projectStore } from '../../project-store';
import type {
  AutoPRReviewConfig,
  AutoPRReviewProgress,
  AutoPRReviewStartRequest,
  AutoPRReviewStartResponse,
  AutoPRReviewStopRequest,
  AutoPRReviewStopResponse,
  AutoPRReviewStatusRequest,
  AutoPRReviewStatusResponse,
} from '../../../preload/api/modules/github-api';

// Debug logging
const { debug: debugLog } = createContextLogger('GitHub AutoFix');

/**
 * Get Auto-PR-Review settings from app settings
 */
function getAutoPRReviewAppSettings(): { enabled: boolean; maxIterations: number } {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const settings: AppSettings = { ...DEFAULT_APP_SETTINGS, ...JSON.parse(content) };
    return {
      enabled: settings.autoPRReviewEnabled ?? DEFAULT_APP_SETTINGS.autoPRReviewEnabled,
      maxIterations: settings.autoPRReviewMaxIterations ?? DEFAULT_APP_SETTINGS.autoPRReviewMaxIterations,
    };
  } catch {
    // Return defaults if settings can't be read
    return {
      enabled: DEFAULT_APP_SETTINGS.autoPRReviewEnabled,
      maxIterations: DEFAULT_APP_SETTINGS.autoPRReviewMaxIterations,
    };
  }
}

/**
 * Find a project from the project store.
 * For Auto-PR-Review operations, we use the first available project
 * since the repository is specified in the request.
 * Returns undefined if no projects are available.
 */
function findProjectForAutoPRReview(): Project | undefined {
  const projects = projectStore.getProjects();
  if (projects.length === 0) {
    debugLog('No projects available in project store');
    return undefined;
  }
  // Return the first project - in practice, Auto-PR-Review is typically
  // used with a single active project context
  debugLog('Using project for Auto-PR-Review', { projectId: projects[0].id, name: projects[0].name });
  return projects[0];
}

/**
 * Auto-fix configuration stored in .auto-claude/github/config.json
 */
export interface AutoFixConfig {
  enabled: boolean;
  labels: string[];
  requireHumanApproval: boolean;
  botToken?: string;
  model: string;
  thinkingLevel: string;
}

/**
 * Auto-fix queue item
 */
export interface AutoFixQueueItem {
  issueNumber: number;
  repo: string;
  status: 'pending' | 'analyzing' | 'creating_spec' | 'building' | 'qa_review' | 'pr_created' | 'completed' | 'failed';
  specId?: string;
  prNumber?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Progress status for auto-fix operations
 */
export interface AutoFixProgress {
  phase: 'checking' | 'fetching' | 'analyzing' | 'batching' | 'creating_spec' | 'building' | 'qa_review' | 'creating_pr' | 'complete';
  issueNumber: number;
  progress: number;
  message: string;
}

/**
 * Issue batch for grouped fixing
 */
export interface IssueBatch {
  batchId: string;
  repo: string;
  primaryIssue: number;
  issues: Array<{
    issueNumber: number;
    title: string;
    similarityToPrimary: number;
  }>;
  commonThemes: string[];
  status: 'pending' | 'analyzing' | 'creating_spec' | 'building' | 'qa_review' | 'pr_created' | 'completed' | 'failed';
  specId?: string;
  prNumber?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Batch progress status
 */
export interface BatchProgress {
  phase: 'analyzing' | 'batching' | 'creating_specs' | 'complete';
  progress: number;
  message: string;
  totalIssues: number;
  batchCount: number;
}

/**
 * Get the GitHub directory for a project
 */
function getGitHubDir(project: Project): string {
  return path.join(project.path, '.auto-claude', 'github');
}

/**
 * Get the auto-fix config for a project
 */
function getAutoFixConfig(project: Project): AutoFixConfig {
  const configPath = path.join(getGitHubDir(project), 'config.json');

  // Use try/catch instead of existsSync to avoid TOCTOU race condition
  try {
    const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      enabled: data.auto_fix_enabled ?? false,
      labels: data.auto_fix_labels ?? ['auto-fix'],
      requireHumanApproval: data.require_human_approval ?? true,
      botToken: data.bot_token,
      model: data.model ?? 'claude-sonnet-4-20250514',
      thinkingLevel: data.thinking_level ?? 'medium',
    };
  } catch {
    // File doesn't exist or is invalid - return defaults
  }

  return {
    enabled: false,
    labels: ['auto-fix'],
    requireHumanApproval: true,
    model: 'claude-sonnet-4-20250514',
    thinkingLevel: 'medium',
  };
}

/**
 * Save the auto-fix config for a project
 */
function saveAutoFixConfig(project: Project, config: AutoFixConfig): void {
  const githubDir = getGitHubDir(project);
  fs.mkdirSync(githubDir, { recursive: true });

  const configPath = path.join(githubDir, 'config.json');
  let existingConfig: Record<string, unknown> = {};

  // Use try/catch instead of existsSync to avoid TOCTOU race condition
  try {
    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    // File doesn't exist or is invalid - use empty config
  }

  const updatedConfig = {
    ...existingConfig,
    auto_fix_enabled: config.enabled,
    auto_fix_labels: config.labels,
    require_human_approval: config.requireHumanApproval,
    bot_token: config.botToken,
    model: config.model,
    thinking_level: config.thinkingLevel,
  };

  fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
}

/**
 * Get the auto-fix queue for a project
 */
function getAutoFixQueue(project: Project): AutoFixQueueItem[] {
  const issuesDir = path.join(getGitHubDir(project), 'issues');

  // Use try/catch instead of existsSync to avoid TOCTOU race condition
  let files: string[];
  try {
    files = fs.readdirSync(issuesDir);
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }

  const queue: AutoFixQueueItem[] = [];

  for (const file of files) {
    if (file.startsWith('autofix_') && file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(issuesDir, file), 'utf-8'));
        queue.push({
          issueNumber: data.issue_number,
          repo: data.repo,
          status: data.status,
          specId: data.spec_id,
          prNumber: data.pr_number,
          error: data.error,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });
      } catch {
        // Skip invalid files
      }
    }
  }

  return queue.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// IPC communication helpers removed - using createIPCCommunicators instead

/**
 * Check for issues with auto-fix labels
 */
async function checkAutoFixLabels(project: Project): Promise<number[]> {
  const config = getAutoFixConfig(project);
  if (!config.enabled || config.labels.length === 0) {
    return [];
  }

  const ghConfig = getGitHubConfig(project);
  if (!ghConfig) {
    return [];
  }

  // Fetch open issues
  const issues = await githubFetch(
    ghConfig.token,
    `/repos/${ghConfig.repo}/issues?state=open&per_page=100`
  ) as Array<{
    number: number;
    labels: Array<{ name: string }>;
    pull_request?: unknown;
  }>;

  // Filter for issues (not PRs) with matching labels
  const queue = getAutoFixQueue(project);
  const pendingIssues = new Set(queue.map(q => q.issueNumber));

  const matchingIssues: number[] = [];

  for (const issue of issues) {
    // Skip pull requests
    if (issue.pull_request) continue;

    // Skip already in queue
    if (pendingIssues.has(issue.number)) continue;

    // Check for matching labels
    const issueLabels = issue.labels.map(l => l.name.toLowerCase());
    const hasMatchingLabel = config.labels.some(
      label => issueLabels.includes(label.toLowerCase())
    );

    if (hasMatchingLabel) {
      matchingIssues.push(issue.number);
    }
  }

  return matchingIssues;
}

/**
 * Check for NEW issues not yet in the auto-fix queue (no labels required)
 */
async function checkNewIssues(project: Project): Promise<Array<{number: number}>> {
  const config = getAutoFixConfig(project);
  if (!config.enabled) {
    return [];
  }

  // Validate GitHub module
  const validation = await validateGitHubModule(project);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const backendPath = validation.backendPath!;
  const args = buildRunnerArgs(getRunnerPath(backendPath), project.path, 'check-new');
  const subprocessEnv = await getRunnerEnv();

  const { promise } = runPythonSubprocess<Array<{number: number}>>({
    pythonPath: getPythonPath(backendPath),
    args,
    cwd: backendPath,
    env: subprocessEnv,
    onComplete: (stdout) => {
      return parseJSONFromOutput<Array<{number: number}>>(stdout);
    },
  });

  const result = await promise;

  if (!result.success || !result.data) {
    throw new Error(result.error || 'Failed to check for new issues');
  }

  return result.data;
}

/**
 * Start auto-fix for an issue
 */
async function startAutoFix(
  project: Project,
  issueNumber: number,
  mainWindow: BrowserWindow,
  agentManager: AgentManager
): Promise<void> {
  const { sendProgress, sendComplete } = createIPCCommunicators<AutoFixProgress, AutoFixQueueItem>(
    mainWindow,
    {
      progress: IPC_CHANNELS.GITHUB_AUTOFIX_PROGRESS,
      error: IPC_CHANNELS.GITHUB_AUTOFIX_ERROR,
      complete: IPC_CHANNELS.GITHUB_AUTOFIX_COMPLETE,
    },
    project.id
  );

  const ghConfig = getGitHubConfig(project);
  if (!ghConfig) {
    throw new Error('No GitHub configuration found');
  }

  sendProgress({ phase: 'fetching', issueNumber, progress: 10, message: `Fetching issue #${issueNumber}...` });

  // Fetch the issue
  const issue = await githubFetch(ghConfig.token, `/repos/${ghConfig.repo}/issues/${issueNumber}`) as {
    number: number;
    title: string;
    body?: string;
    labels: Array<{ name: string }>;
    html_url: string;
  };

  // Fetch comments
  const comments = await githubFetch(ghConfig.token, `/repos/${ghConfig.repo}/issues/${issueNumber}/comments`) as Array<{
    id: number;
    body: string;
    user: { login: string };
  }>;

  sendProgress({ phase: 'analyzing', issueNumber, progress: 30, message: 'Analyzing issue...' });

  // Build context
  const labels = issue.labels.map(l => l.name);
  const issueContext = buildIssueContext(
    issue.number,
    issue.title,
    issue.body,
    labels,
    issue.html_url,
    comments.map(c => ({
      id: c.id,
      body: c.body,
      user: { login: c.user.login },
      created_at: '',
      html_url: '',
    }))
  );

  sendProgress({ phase: 'creating_spec', issueNumber, progress: 50, message: 'Creating spec from issue...' });

  // Create spec
  const taskDescription = buildInvestigationTask(issue.number, issue.title, issueContext);
  const specData = await createSpecForIssue(
    project,
    issue.number,
    issue.title,
    taskDescription,
    issue.html_url,
    labels,
    project.settings?.mainBranch  // Pass project's configured main branch
  );

  // Save auto-fix state
  const issuesDir = path.join(getGitHubDir(project), 'issues');
  fs.mkdirSync(issuesDir, { recursive: true });

  const state: AutoFixQueueItem = {
    issueNumber,
    repo: ghConfig.repo,
    status: 'creating_spec',
    specId: specData.specId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Validate and sanitize network data before writing to file
  const sanitizedIssueUrl = typeof issue.html_url === 'string' ? issue.html_url : '';
  const sanitizedRepo = typeof ghConfig.repo === 'string' ? ghConfig.repo : '';
  const sanitizedSpecId = typeof specData.specId === 'string' ? specData.specId : '';

  fs.writeFileSync(
    path.join(issuesDir, `autofix_${issueNumber}.json`),
    JSON.stringify({
      issue_number: issueNumber,
      repo: sanitizedRepo,
      status: state.status,
      spec_id: sanitizedSpecId,
      created_at: state.createdAt,
      updated_at: state.updatedAt,
      issue_url: sanitizedIssueUrl,
    }, null, 2)
  );

  sendProgress({ phase: 'creating_spec', issueNumber, progress: 70, message: 'Starting spec creation...' });

  // Automatically start spec creation using the robust spec_runner.py system
  try {
    // Start spec creation - spec_runner.py will create a proper detailed spec
    // After spec creation completes, the normal flow will handle implementation
    agentManager.startSpecCreation(
      specData.specId,
      project.path,
      specData.taskDescription,
      specData.specDir,
      specData.metadata
    );

    // Immediately update the plan status to 'planning' so the frontend shows the task as "In Progress"
    // This provides instant feedback to the user while spec_runner.py is starting up
    updateImplementationPlanStatus(specData.specDir, 'planning');

    sendProgress({ phase: 'complete', issueNumber, progress: 100, message: 'Auto-fix spec creation started!' });
    sendComplete(state);
  } catch (error) {
    debugLog('Failed to start spec creation', { error });
    sendProgress({ phase: 'complete', issueNumber, progress: 100, message: 'Spec directory created. Click Start to begin.' });
    sendComplete(state);
  }
}

/**
 * Convert analyze-preview Python result to camelCase
 */
function convertAnalyzePreviewResult(result: Record<string, unknown>): AnalyzePreviewResult {
  return {
    success: result.success as boolean,
    totalIssues: result.total_issues as number ?? 0,
    analyzedIssues: result.analyzed_issues as number ?? 0,
    alreadyBatched: result.already_batched as number ?? 0,
    proposedBatches: (result.proposed_batches as Array<Record<string, unknown>> ?? []).map((b) => ({
      primaryIssue: b.primary_issue as number,
      issues: (b.issues as Array<Record<string, unknown>>).map((i) => ({
        issueNumber: i.issue_number as number,
        title: i.title as string,
        labels: i.labels as string[] ?? [],
        similarityToPrimary: i.similarity_to_primary as number ?? 0,
      })),
      issueCount: b.issue_count as number ?? 0,
      commonThemes: b.common_themes as string[] ?? [],
      validated: b.validated as boolean ?? false,
      confidence: b.confidence as number ?? 0,
      reasoning: b.reasoning as string ?? '',
      theme: b.theme as string ?? '',
    })),
    singleIssues: (result.single_issues as Array<Record<string, unknown>> ?? []).map((i) => ({
      issueNumber: i.issue_number as number,
      title: i.title as string,
      labels: i.labels as string[] ?? [],
    })),
    message: result.message as string ?? '',
    error: result.error as string,
  };
}

/**
 * Register auto-fix related handlers
 */
export function registerAutoFixHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  debugLog('Registering AutoFix handlers');

  // Get auto-fix config
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTOFIX_GET_CONFIG,
    async (_, projectId: string): Promise<AutoFixConfig | null> => {
      debugLog('getAutoFixConfig handler called', { projectId });
      return withProjectOrNull(projectId, async (project) => {
        const config = getAutoFixConfig(project);
        debugLog('AutoFix config loaded', { enabled: config.enabled, labels: config.labels });
        return config;
      });
    }
  );

  // Save auto-fix config
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTOFIX_SAVE_CONFIG,
    async (_, projectId: string, config: AutoFixConfig): Promise<boolean> => {
      debugLog('saveAutoFixConfig handler called', { projectId, enabled: config.enabled });
      const result = await withProjectOrNull(projectId, async (project) => {
        saveAutoFixConfig(project, config);
        debugLog('AutoFix config saved');
        return true;
      });
      return result ?? false;
    }
  );

  // Get auto-fix queue
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTOFIX_GET_QUEUE,
    async (_, projectId: string): Promise<AutoFixQueueItem[]> => {
      debugLog('getAutoFixQueue handler called', { projectId });
      const result = await withProjectOrNull(projectId, async (project) => {
        const queue = getAutoFixQueue(project);
        debugLog('AutoFix queue loaded', { count: queue.length });
        return queue;
      });
      return result ?? [];
    }
  );

  // Check for issues with auto-fix labels
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTOFIX_CHECK_LABELS,
    async (_, projectId: string): Promise<number[]> => {
      debugLog('checkAutoFixLabels handler called', { projectId });
      const result = await withProjectOrNull(projectId, async (project) => {
        const issues = await checkAutoFixLabels(project);
        debugLog('Issues with auto-fix labels', { count: issues.length, issues });
        return issues;
      });
      return result ?? [];
    }
  );

  // Check for NEW issues not yet in auto-fix queue (no labels required)
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTOFIX_CHECK_NEW,
    async (_, projectId: string): Promise<Array<{number: number}>> => {
      debugLog('checkNewIssues handler called', { projectId });
      const result = await withProjectOrNull(projectId, async (project) => {
        const issues = await checkNewIssues(project);
        debugLog('New issues found', { count: issues.length, issues });
        return issues;
      });
      return result ?? [];
    }
  );

  // Start auto-fix for an issue
  ipcMain.on(
    IPC_CHANNELS.GITHUB_AUTOFIX_START,
    async (_, projectId: string, issueNumber: number) => {
      debugLog('startAutoFix handler called', { projectId, issueNumber });
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window available');
        return;
      }

      try {
        await withProjectOrNull(projectId, async (project) => {
          debugLog('Starting auto-fix for issue', { issueNumber });
          await startAutoFix(project, issueNumber, mainWindow, agentManager);
          debugLog('Auto-fix completed for issue', { issueNumber });
        });
      } catch (error) {
        debugLog('Auto-fix failed', { issueNumber, error: error instanceof Error ? error.message : error });
        const { sendError } = createIPCCommunicators<AutoFixProgress, AutoFixQueueItem>(
          mainWindow,
          {
            progress: IPC_CHANNELS.GITHUB_AUTOFIX_PROGRESS,
            error: IPC_CHANNELS.GITHUB_AUTOFIX_ERROR,
            complete: IPC_CHANNELS.GITHUB_AUTOFIX_COMPLETE,
          },
          projectId
        );
        sendError(error instanceof Error ? error.message : 'Failed to start auto-fix');
      }
    }
  );

  // Batch auto-fix for multiple issues
  ipcMain.on(
    IPC_CHANNELS.GITHUB_AUTOFIX_BATCH,
    async (_, projectId: string, issueNumbers?: number[]) => {
      debugLog('batchAutoFix handler called', { projectId, issueNumbers });
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window available');
        return;
      }

      try {
        await withProjectOrNull(projectId, async (project) => {
          const { sendProgress, sendComplete } = createIPCCommunicators<BatchProgress, IssueBatch[]>(
            mainWindow,
            {
              progress: IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_PROGRESS,
              error: IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_ERROR,
              complete: IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_COMPLETE,
            },
            projectId
          );

          debugLog('Starting batch auto-fix');
          sendProgress({
            phase: 'analyzing',
            progress: 10,
            message: 'Analyzing issues for similarity...',
            totalIssues: issueNumbers?.length ?? 0,
            batchCount: 0,
          });

          // Comprehensive validation of GitHub module
          const validation = await validateGitHubModule(project);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          const backendPath = validation.backendPath!;
          const additionalArgs = issueNumbers && issueNumbers.length > 0 ? issueNumbers.map(n => n.toString()) : [];
          const args = buildRunnerArgs(getRunnerPath(backendPath), project.path, 'batch-issues', additionalArgs);
          const subprocessEnv = await getRunnerEnv();

          debugLog('Spawning batch process', { args });

          const { promise } = runPythonSubprocess<IssueBatch[]>({
            pythonPath: getPythonPath(backendPath),
            args,
            cwd: backendPath,
            env: subprocessEnv,
            onProgress: (percent, message) => {
              sendProgress({
                phase: 'batching',
                progress: percent,
                message,
                totalIssues: issueNumbers?.length ?? 0,
                batchCount: 0,
              });
            },
            onStdout: (line) => debugLog('STDOUT:', line),
            onStderr: (line) => debugLog('STDERR:', line),
            onComplete: () => {
              const batches = getBatches(project);
              debugLog('Batch auto-fix completed', { batchCount: batches.length });
              sendProgress({
                phase: 'complete',
                progress: 100,
                message: `Created ${batches.length} batches`,
                totalIssues: issueNumbers?.length ?? 0,
                batchCount: batches.length,
              });
              return batches;
            },
          });

          const result = await promise;

          if (!result.success) {
            throw new Error(result.error ?? 'Failed to batch issues');
          }

          sendComplete(result.data!);
        });
      } catch (error) {
        debugLog('Batch auto-fix failed', { error: error instanceof Error ? error.message : error });
        const { sendError } = createIPCCommunicators<BatchProgress, IssueBatch[]>(
          mainWindow,
          {
            progress: IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_PROGRESS,
            error: IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_ERROR,
            complete: IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_COMPLETE,
          },
          projectId
        );
        sendError(error instanceof Error ? error.message : 'Failed to batch issues');
      }
    }
  );

  // Get batches for a project
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTOFIX_GET_BATCHES,
    async (_, projectId: string): Promise<IssueBatch[]> => {
      debugLog('getBatches handler called', { projectId });
      const result = await withProjectOrNull(projectId, async (project) => {
        const batches = getBatches(project);
        debugLog('Batches loaded', { count: batches.length });
        return batches;
      });
      return result ?? [];
    }
  );

  // Analyze issues and preview proposed batches (proactive workflow)
  ipcMain.on(
    IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW,
    async (_, projectId: string, issueNumbers?: number[], maxIssues?: number) => {
      debugLog('analyzePreview handler called', { projectId, issueNumbers, maxIssues });
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window available');
        return;
      }

      try {
        await withProjectOrNull(projectId, async (project) => {
          interface AnalyzePreviewProgress {
            phase: 'analyzing';
            progress: number;
            message: string;
          }

          const { sendProgress, sendComplete } = createIPCCommunicators<
            AnalyzePreviewProgress,
            AnalyzePreviewResult
          >(
            mainWindow,
            {
              progress: IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_PROGRESS,
              error: IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_ERROR,
              complete: IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_COMPLETE,
            },
            projectId
          );

          debugLog('Starting analyze-preview');
          sendProgress({ phase: 'analyzing', progress: 10, message: 'Fetching issues for analysis...' });

          // Comprehensive validation of GitHub module
          const validation = await validateGitHubModule(project);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          const backendPath = validation.backendPath!;
          const additionalArgs = ['--json'];
          if (maxIssues) {
            additionalArgs.push('--max-issues', maxIssues.toString());
          }
          if (issueNumbers && issueNumbers.length > 0) {
            additionalArgs.push(...issueNumbers.map(n => n.toString()));
          }

          const args = buildRunnerArgs(getRunnerPath(backendPath), project.path, 'analyze-preview', additionalArgs);
          const subprocessEnv = await getRunnerEnv();
          debugLog('Spawning analyze-preview process', { args });

          const { promise } = runPythonSubprocess<AnalyzePreviewResult>({
            pythonPath: getPythonPath(backendPath),
            args,
            cwd: backendPath,
            env: subprocessEnv,
            onProgress: (percent, message) => {
              sendProgress({ phase: 'analyzing', progress: percent, message });
            },
            onStdout: (line) => debugLog('STDOUT:', line),
            onStderr: (line) => debugLog('STDERR:', line),
            onComplete: (stdout) => {
              const rawResult = parseJSONFromOutput<Record<string, unknown>>(stdout);
              const convertedResult = convertAnalyzePreviewResult(rawResult);
              debugLog('Analyze preview completed', { batchCount: convertedResult.proposedBatches.length });
              return convertedResult;
            },
          });

          const result = await promise;

          if (!result.success) {
            throw new Error(result.error ?? 'Failed to analyze issues');
          }

          sendComplete(result.data!);
        });
      } catch (error) {
        debugLog('Analyze preview failed', { error: error instanceof Error ? error.message : error });
        const { sendError } = createIPCCommunicators<{ phase: 'analyzing'; progress: number; message: string }, AnalyzePreviewResult>(
          mainWindow,
          {
            progress: IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_PROGRESS,
            error: IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_ERROR,
            complete: IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_COMPLETE,
          },
          projectId
        );

        // Provide user-friendly error messages
        let userMessage = 'Failed to analyze issues';
        if (error instanceof Error) {
          if (error.message.includes('JSON')) {
            userMessage = 'Analysis completed, but there was an error processing the results. Please try again.';
          } else if (error.message.includes('No JSON found')) {
            userMessage = 'No analysis results returned. Please check your GitHub connection and try again.';
          } else {
            userMessage = error.message;
          }
        }

        sendError(userMessage);
      }
    }
  );

  // Approve and execute selected batches
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTOFIX_APPROVE_BATCHES,
    async (_, projectId: string, approvedBatches: Array<Record<string, unknown>>): Promise<{ success: boolean; batches?: IssueBatch[]; error?: string }> => {
      debugLog('approveBatches handler called', { projectId, batchCount: approvedBatches.length });
      const result = await withProjectOrNull(projectId, async (project) => {
        try {
          const tempFile = path.join(getGitHubDir(project), 'temp_approved_batches.json');

          // Convert camelCase to snake_case for Python
          const pythonBatches = approvedBatches.map(b => ({
            primary_issue: b.primaryIssue,
            issues: (b.issues as Array<Record<string, unknown>>).map((i: Record<string, unknown>) => ({
              issue_number: i.issueNumber,
              title: i.title,
              labels: i.labels ?? [],
              similarity_to_primary: i.similarityToPrimary ?? 1.0,
            })),
            common_themes: b.commonThemes ?? [],
            validated: b.validated ?? true,
            confidence: b.confidence ?? 1.0,
            reasoning: b.reasoning ?? 'User approved',
            theme: b.theme ?? '',
          }));

          fs.writeFileSync(tempFile, JSON.stringify(pythonBatches, null, 2));

          // Comprehensive validation of GitHub module
          const validation = await validateGitHubModule(project);
          if (!validation.valid) {
            throw new Error(validation.error);
          }

          const backendPath = validation.backendPath!;
          const { execFileSync } = await import('child_process');
          // Use execFileSync with arguments array to prevent command injection
          execFileSync(
            getPythonPath(backendPath),
            [getRunnerPath(backendPath), '--project', project.path, 'approve-batches', tempFile],
            { cwd: backendPath, encoding: 'utf-8' }
          );

          fs.unlinkSync(tempFile);

          const batches = getBatches(project);
          debugLog('Batches approved and created', { count: batches.length });

          return { success: true, batches };
        } catch (error) {
          debugLog('Approve batches failed', { error: error instanceof Error ? error.message : error });
          return { success: false, error: error instanceof Error ? error.message : 'Failed to approve batches' };
        }
      });
      return result ?? { success: false, error: 'Project not found' };
    }
  );

  // ==========================================================================
  // Auto-PR-Review Handlers (Autonomous PR review and fix loop)
  // ==========================================================================

  debugLog('Registering Auto-PR-Review handlers');

  // In-memory state for active Auto-PR-Review operations
  // Key: `${repository}#${prNumber}`
  const activeAutoPRReviews = new Map<string, {
    progress: AutoPRReviewProgress;
    abortController: AbortController;
  }>();

  /**
   * Load persisted auto-PR review states on startup.
   * This restores the in-memory state from disk so that active reviews
   * are visible in the UI after app restart.
   */
  function loadPersistedAutoPRReviewStates(): void {
    const project = findProjectForAutoPRReview();
    if (!project) {
      debugLog('No project available for loading persisted Auto-PR-Review states');
      return;
    }

    const stateDir = path.join(getGitHubDir(project), 'pr_review_state');
    const indexFile = path.join(stateDir, 'index.json');

    try {
      const indexData = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
      const reviews = indexData.reviews || [];

      for (const entry of reviews) {
        // Only load active (non-terminal) states
        const terminalStatuses = ['completed', 'failed', 'cancelled', 'max_iterations', 'ready_to_merge'];
        if (terminalStatuses.includes(entry.status)) {
          continue;
        }

        // Load full state from individual file
        const stateFile = path.join(stateDir, `pr_${entry.pr_number}.json`);
        try {
          const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
          const key = `${stateData.repo}#${entry.pr_number}`;

          // Map backend status to frontend status
          const statusMap: Record<string, AutoPRReviewProgress['status']> = {
            'pending': 'awaiting_checks',
            'awaiting_checks': 'awaiting_checks',
            'reviewing': 'pr_reviewing',
            'fixing': 'pr_fixing',
            'ready_to_merge': 'pr_ready_to_merge',
          };

          const progress: AutoPRReviewProgress = {
            prNumber: entry.pr_number,
            repository: stateData.repo,
            status: statusMap[entry.status] || 'awaiting_checks',
            currentIteration: entry.current_iteration || 0,
            maxIterations: stateData.max_iterations || 5,
            startedAt: entry.started_at || new Date().toISOString(),
            elapsedMs: 0,
            ciChecks: stateData.ci_checks || [],
            ciSummary: { total: 0, passed: 0, failed: 0, pending: 0 },
            externalBots: [],
            fixedFindingsCount: stateData.resolved_finding_ids?.length || 0,
            remainingFindingsCount: stateData.pending_finding_ids?.length || 0,
            isCancellable: false, // Recovered states are not cancellable (no subprocess)
            currentActivity: 'Recovered from previous session - restart review to continue',
          };

          activeAutoPRReviews.set(key, {
            progress,
            abortController: new AbortController(), // Placeholder, not connected to any subprocess
          });

          debugLog('Loaded persisted Auto-PR-Review state', {
            key,
            status: progress.status,
            iteration: progress.currentIteration,
          });
        } catch {
          // Skip invalid state files
        }
      }

      debugLog('Loaded persisted Auto-PR-Review states', {
        count: activeAutoPRReviews.size,
      });
    } catch {
      // Index file doesn't exist or is invalid - no states to load
      debugLog('No persisted Auto-PR-Review states to load');
    }
  }

  // Load persisted states on startup
  loadPersistedAutoPRReviewStates();

  /**
   * Get Auto-PR-Review configuration for a project
   */
  function getAutoPRReviewConfig(project: Project): { config: AutoPRReviewConfig; enabled: boolean } {
    const configPath = path.join(getGitHubDir(project), 'auto_pr_review_config.json');

    try {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return {
        config: {
          maxPRReviewIterations: data.max_pr_review_iterations ?? 5,
          ciCheckTimeout: data.ci_check_timeout ?? 1800000,
          externalBotTimeout: data.external_bot_timeout ?? 900000,
          pollInterval: data.poll_interval ?? 60000,
          requireHumanApproval: true, // CRITICAL: Always enforce
          allowedUsers: data.allowed_users ?? [],
        },
        enabled: data.enabled ?? false,
      };
    } catch {
      // File doesn't exist or is invalid - return defaults
      return {
        config: {
          maxPRReviewIterations: 5,
          ciCheckTimeout: 1800000,
          externalBotTimeout: 900000,
          pollInterval: 60000,
          requireHumanApproval: true,
          allowedUsers: [],
        },
        enabled: false,
      };
    }
  }

  /**
   * Save Auto-PR-Review configuration for a project
   */
  function saveAutoPRReviewConfig(project: Project, config: Partial<AutoPRReviewConfig>, enabled?: boolean): void {
    const githubDir = getGitHubDir(project);
    fs.mkdirSync(githubDir, { recursive: true });

    const configPath = path.join(githubDir, 'auto_pr_review_config.json');
    let existingConfig: Record<string, unknown> = {};

    try {
      existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // File doesn't exist or is invalid - use empty config
    }

    const updatedConfig = {
      ...existingConfig,
      ...(config.maxPRReviewIterations !== undefined && { max_pr_review_iterations: config.maxPRReviewIterations }),
      ...(config.ciCheckTimeout !== undefined && { ci_check_timeout: config.ciCheckTimeout }),
      ...(config.externalBotTimeout !== undefined && { external_bot_timeout: config.externalBotTimeout }),
      ...(config.pollInterval !== undefined && { poll_interval: config.pollInterval }),
      ...(config.allowedUsers !== undefined && { allowed_users: config.allowedUsers }),
      require_human_approval: true, // CRITICAL: Always enforce
      ...(enabled !== undefined && { enabled }),
    };

    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
  }

  /**
   * Get unique key for tracking Auto-PR-Review
   */
  function getAutoPRReviewKey(repository: string, prNumber: number): string {
    return `${repository}#${prNumber}`;
  }

  // Get Auto-PR-Review config
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_GET_CONFIG,
    async (_): Promise<{ config: AutoPRReviewConfig; enabled: boolean } | null> => {
      debugLog('getAutoPRReviewConfig handler called');
      // Auto-PR-Review config is global, so we get from the first available project
      const project = findProjectForAutoPRReview();
      if (!project) {
        debugLog('No project available for Auto-PR-Review config');
        return null;
      }
      const result = getAutoPRReviewConfig(project);
      debugLog('Auto-PR-Review config loaded', { enabled: result.enabled });
      return result;
    }
  );

  // Save Auto-PR-Review config
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_SAVE_CONFIG,
    async (_, args: { config: Partial<AutoPRReviewConfig>; enabled?: boolean }): Promise<{ success: boolean; error?: string }> => {
      debugLog('saveAutoPRReviewConfig handler called', { enabled: args.enabled });
      const project = findProjectForAutoPRReview();
      if (!project) {
        return { success: false, error: 'No project available' };
      }
      try {
        saveAutoPRReviewConfig(project, args.config, args.enabled);
        debugLog('Auto-PR-Review config saved');
        return { success: true };
      } catch (error) {
        debugLog('Failed to save Auto-PR-Review config', { error });
        return { success: false, error: error instanceof Error ? error.message : 'Failed to save config' };
      }
    }
  );

  // Start Auto-PR-Review for a PR
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_START,
    async (_, request: AutoPRReviewStartRequest): Promise<AutoPRReviewStartResponse> => {
      debugLog('startAutoPRReview handler called', { repository: request.repository, prNumber: request.prNumber });

      const key = getAutoPRReviewKey(request.repository, request.prNumber);

      // Check if already running
      if (activeAutoPRReviews.has(key)) {
        return {
          success: false,
          message: 'Auto-PR-Review already running for this PR',
          error: 'Review already in progress',
        };
      }

      // Find a project for Auto-PR-Review
      const project = findProjectForAutoPRReview();
      if (!project) {
        return {
          success: false,
          message: 'No project available',
          error: 'Please open a project before starting Auto-PR-Review',
        };
      }

      try {
        // Validate GitHub module
        const validation = await validateGitHubModule(project);
        if (!validation.valid) {
          return {
            success: false,
            message: 'GitHub module validation failed',
            error: validation.error,
          };
        }

        const backendPath = validation.backendPath!;
        const abortController = new AbortController();

        // Initialize progress state
        const progress: AutoPRReviewProgress = {
          prNumber: request.prNumber,
          repository: request.repository,
          status: 'awaiting_checks',
          currentIteration: 0,
          maxIterations: request.configOverrides?.maxPRReviewIterations ?? 5,
          startedAt: new Date().toISOString(),
          elapsedMs: 0,
          ciChecks: [],
          ciSummary: { total: 0, passed: 0, failed: 0, pending: 0 },
          externalBots: [],
          fixedFindingsCount: 0,
          remainingFindingsCount: 0,
            isCancellable: true,
            currentActivity: 'Starting autonomous PR review...',
          };

          activeAutoPRReviews.set(key, { progress, abortController });

          // Build args for the auto-pr-review command
          // Format: python runner.py auto-pr-review <pr_number> --repository <repo> --json
          const args = buildRunnerArgs(getRunnerPath(backendPath), project.path, 'auto-pr-review', [
            request.prNumber.toString(),
            '--repository', request.repository,
            '--json',
          ]);

          // Add max iterations if overridden
          if (request.configOverrides?.maxPRReviewIterations) {
            args.push('--max-iterations', request.configOverrides.maxPRReviewIterations.toString());
          }
          if (request.configOverrides?.ciCheckTimeout) {
            args.push('--ci-timeout', Math.floor(request.configOverrides.ciCheckTimeout / 1000).toString());
          }
          if (request.configOverrides?.externalBotTimeout) {
            args.push('--bot-timeout', Math.floor(request.configOverrides.externalBotTimeout / 1000).toString());
          }

          // Get Auto-PR-Review settings from app settings
          const autoPRReviewSettings = getAutoPRReviewAppSettings();
          debugLog('Auto-PR-Review settings from app', autoPRReviewSettings);

          // Get project-specific config for allowed users
          const projectConfig = getAutoPRReviewConfig(project);
          // Use allowedUsers from config, or fallback to "*" (allow all) if not configured
          const allowedUsers = projectConfig.config.allowedUsers?.length > 0
            ? projectConfig.config.allowedUsers.join(',')
            : '*';
          debugLog('Auto-PR-Review allowed users', { allowedUsers });

          const subprocessEnv = await getRunnerEnv({
            GITHUB_AUTO_PR_REVIEW_ENABLED: autoPRReviewSettings.enabled ? 'true' : 'false',
            GITHUB_AUTO_PR_REVIEW_MAX_ITERATIONS: autoPRReviewSettings.maxIterations.toString(),
            GITHUB_AUTO_PR_REVIEW_ALLOWED_USERS: allowedUsers,
          });

          // Helper to parse progress from Python output
          const parseProgressLine = (line: string): void => {
            const entry = activeAutoPRReviews.get(key);
            if (!entry) return;

            // Parse PROGRESS:{json} format
            if (line.startsWith('PROGRESS:')) {
              try {
                const data = JSON.parse(line.substring(9));
                entry.progress.currentActivity = data.message || entry.progress.currentActivity;
                entry.progress.elapsedMs = Date.now() - new Date(entry.progress.startedAt).getTime();

                // Map phase to status
                const phaseToStatus: Record<string, AutoPRReviewProgress['status']> = {
                  'initializing': 'awaiting_checks',
                  'awaiting_checks': 'awaiting_checks',
                  'reviewing': 'pr_reviewing',
                  'pr_reviewing': 'pr_reviewing',
                  'pr_fixing': 'pr_fixing',
                  'fixing': 'pr_fixing',
                  'pushing': 'pr_fixing',
                  'pr_ready_to_merge': 'pr_ready_to_merge',
                  'needs_human_review': 'needs_human_review',
                  'completed': 'completed',
                  'failed': 'failed',
                  'max_iterations': 'max_iterations',
                  'error': 'failed',
                };

                if (data.phase && phaseToStatus[data.phase]) {
                  entry.progress.status = phaseToStatus[data.phase];
                }

                // Update iteration if provided
                if (data.iteration !== undefined) {
                  entry.progress.currentIteration = data.iteration;
                }
                if (data.max_iterations !== undefined) {
                  entry.progress.maxIterations = data.max_iterations;
                }
                if (data.findings_fixed !== undefined) {
                  entry.progress.fixedFindingsCount = data.findings_fixed;
                }
                if (data.error) {
                  entry.progress.errorMessage = data.error;
                }

                // Track CI completion status
                // CI is complete when we're past the awaiting_checks phase
                if (data.phase && ['pr_reviewing', 'pr_fixing', 'pr_ready_to_merge', 'completed', 'needs_human_review', 'max_iterations'].includes(data.phase)) {
                  entry.progress.ciCompleted = true;
                }
                // Capture ci_passed from backend (explicit boolean)
                if (data.ci_passed !== undefined) {
                  entry.progress.ciPassed = data.ci_passed;
                  entry.progress.ciCompleted = true;
                }

                debugLog('Auto-PR-Review progress update', {
                  status: entry.progress.status,
                  activity: entry.progress.currentActivity,
                  iteration: entry.progress.currentIteration,
                });
              } catch (e) {
                debugLog('Failed to parse progress line', { line, error: e });
              }
            }
            // Parse RESULT:{json} format (final result)
            else if (line.startsWith('RESULT:')) {
              try {
                const data = JSON.parse(line.substring(7));
                entry.progress.elapsedMs = Date.now() - new Date(entry.progress.startedAt).getTime();

                // Map result to final status
                const resultToStatus: Record<string, AutoPRReviewProgress['status']> = {
                  'ready_to_merge': 'pr_ready_to_merge',
                  'no_findings': 'completed',
                  'needs_human_review': 'needs_human_review',
                  'max_iterations': 'max_iterations',
                  'ci_failed': 'failed',
                  'cancelled': 'cancelled',
                  'unauthorized': 'failed',
                  'pr_closed': 'failed',
                  'pr_merged': 'completed',
                  'error': 'failed',
                };

                if (data.result && resultToStatus[data.result]) {
                  entry.progress.status = resultToStatus[data.result];
                }

                entry.progress.fixedFindingsCount = data.findings_fixed || 0;
                entry.progress.remainingFindingsCount = data.findings_unfixed || 0;
                entry.progress.isCancellable = false;

                // Capture CI status from result
                entry.progress.ciCompleted = true;
                if (data.ci_all_passed !== undefined) {
                  entry.progress.ciPassed = data.ci_all_passed;
                }

                if (data.error_message) {
                  entry.progress.errorMessage = data.error_message;
                }

                debugLog('Auto-PR-Review result', {
                  result: data.result,
                  status: entry.progress.status,
                  findingsFixed: entry.progress.fixedFindingsCount,
                  ciPassed: entry.progress.ciPassed,
                });
              } catch (e) {
                debugLog('Failed to parse result line', { line, error: e });
              }
            }
          };

          // Start the subprocess in background (non-blocking)
          const { promise } = runPythonSubprocess<{ success: boolean; message: string }>({
            pythonPath: getPythonPath(backendPath),
            args,
            cwd: backendPath,
            env: subprocessEnv,
            signal: abortController.signal,
            onProgress: (percent, message) => {
              const entry = activeAutoPRReviews.get(key);
              if (entry) {
                entry.progress.currentActivity = message;
                entry.progress.elapsedMs = Date.now() - new Date(entry.progress.startedAt).getTime();
              }
            },
            onStdout: (line) => {
              debugLog('Auto-PR-Review STDOUT:', line);
              parseProgressLine(line);
            },
            onStderr: (line) => debugLog('Auto-PR-Review STDERR:', line),
            onComplete: () => {
              // Mark as completed if not already in a terminal state
              const entry = activeAutoPRReviews.get(key);
              if (entry) {
                const terminalStates = ['completed', 'failed', 'cancelled', 'max_iterations', 'pr_ready_to_merge', 'needs_human_review'];
                if (!terminalStates.includes(entry.progress.status)) {
                  entry.progress.status = 'completed';
                }
              }
              return { success: true, message: 'Auto-PR-Review completed' };
            },
          });

          // Don't await - let it run in background
          promise.then((result) => {
            if (!result.success) {
              debugLog('Auto-PR-Review failed', { error: result.error });
              const entry = activeAutoPRReviews.get(key);
              if (entry) {
                entry.progress.status = 'failed';
                entry.progress.errorMessage = result.error || 'Unknown error';
              }
            }
            // Keep entry for status polling, clean up after a delay
            setTimeout(() => activeAutoPRReviews.delete(key), 60000);
          }).catch((error) => {
            debugLog('Auto-PR-Review error', { error });
            const entry = activeAutoPRReviews.get(key);
            if (entry) {
              entry.progress.status = 'failed';
              entry.progress.errorMessage = error instanceof Error ? error.message : 'Unknown error';
            }
            // Keep entry for status polling, clean up after a delay
            setTimeout(() => activeAutoPRReviews.delete(key), 60000);
          });

          return {
            success: true,
            message: 'Auto-PR-Review started',
            reviewId: key,
          };
        } catch (error) {
          debugLog('Failed to start Auto-PR-Review', { error });
          activeAutoPRReviews.delete(key);
          return {
            success: false,
            message: 'Failed to start Auto-PR-Review',
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
    }
  );

  // Stop Auto-PR-Review
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_STOP,
    async (_, request: AutoPRReviewStopRequest): Promise<AutoPRReviewStopResponse> => {
      debugLog('stopAutoPRReview handler called', { repository: request.repository, prNumber: request.prNumber });

      const key = getAutoPRReviewKey(request.repository, request.prNumber);
      const entry = activeAutoPRReviews.get(key);

      if (!entry) {
        return {
          success: false,
          message: 'No active Auto-PR-Review found for this PR',
          error: 'Review not found',
        };
      }

      try {
        // Abort the subprocess
        entry.abortController.abort();
        entry.progress.status = 'cancelled';
        entry.progress.isCancellable = false;
        entry.progress.currentActivity = request.reason ?? 'Cancelled by user';

        // Clean up
        activeAutoPRReviews.delete(key);

        return {
          success: true,
          message: 'Auto-PR-Review cancelled',
        };
      } catch (error) {
        debugLog('Failed to stop Auto-PR-Review', { error });
        return {
          success: false,
          message: 'Failed to cancel Auto-PR-Review',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  // Get Auto-PR-Review status
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_GET_STATUS,
    async (_, request: AutoPRReviewStatusRequest): Promise<AutoPRReviewStatusResponse> => {
      debugLog('getAutoPRReviewStatus handler called', { repository: request.repository, prNumber: request.prNumber });

      const key = getAutoPRReviewKey(request.repository, request.prNumber);
      const entry = activeAutoPRReviews.get(key);

      if (!entry) {
        return {
          isActive: false,
        };
      }

      // Update elapsed time
      entry.progress.elapsedMs = Date.now() - new Date(entry.progress.startedAt).getTime();

      return {
        isActive: true,
        progress: entry.progress,
      };
    }
  );

  // Get ALL active Auto-PR-Reviews (for PR list indicator)
  ipcMain.handle(
    IPC_CHANNELS.GITHUB_AUTO_PR_REVIEW_GET_ALL_ACTIVE,
    async (): Promise<{ reviews: AutoPRReviewProgress[] }> => {
      debugLog('getAllActiveAutoPRReviews handler called');

      const reviews: AutoPRReviewProgress[] = [];
      for (const entry of activeAutoPRReviews.values()) {
        // Update elapsed time
        entry.progress.elapsedMs = Date.now() - new Date(entry.progress.startedAt).getTime();
        reviews.push(entry.progress);
      }

      debugLog('getAllActiveAutoPRReviews returning', { count: reviews.length });
      return { reviews };
    }
  );

  debugLog('AutoFix and Auto-PR-Review handlers registered');
}

// getBackendPath function removed - using subprocess-runner utility instead

/**
 * Preview result for analyze-preview command
 */
export interface AnalyzePreviewResult {
  success: boolean;
  totalIssues: number;
  analyzedIssues: number;
  alreadyBatched: number;
  proposedBatches: Array<{
    primaryIssue: number;
    issues: Array<{
      issueNumber: number;
      title: string;
      labels: string[];
      similarityToPrimary: number;
    }>;
    issueCount: number;
    commonThemes: string[];
    validated: boolean;
    confidence: number;
    reasoning: string;
    theme: string;
  }>;
  singleIssues: Array<{
    issueNumber: number;
    title: string;
    labels: string[];
  }>;
  message: string;
  error?: string;
}

/**
 * Get batches from disk
 */
function getBatches(project: Project): IssueBatch[] {
  const batchesDir = path.join(getGitHubDir(project), 'batches');

  // Use try/catch instead of existsSync to avoid TOCTOU race condition
  let files: string[];
  try {
    files = fs.readdirSync(batchesDir);
  } catch {
    // Directory doesn't exist or can't be read
    return [];
  }

  const batches: IssueBatch[] = [];

  for (const file of files) {
    if (file.startsWith('batch_') && file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(batchesDir, file), 'utf-8'));
        batches.push({
          batchId: data.batch_id,
          repo: data.repo,
          primaryIssue: data.primary_issue,
          issues: data.issues.map((i: Record<string, unknown>) => ({
            issueNumber: i.issue_number,
            title: i.title,
            similarityToPrimary: i.similarity_to_primary,
          })),
          commonThemes: data.common_themes ?? [],
          status: data.status,
          specId: data.spec_id,
          prNumber: data.pr_number,
          error: data.error,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });
      } catch {
        // Skip invalid files
      }
    }
  }

  return batches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
