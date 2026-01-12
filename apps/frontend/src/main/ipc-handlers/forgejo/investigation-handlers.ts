/**
 * Forgejo issue investigation IPC handlers
 */

import path from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir } from '../../../shared/constants';
import type { ForgejoInvestigationResult, ForgejoInvestigationStatus, Project, TaskMetadata } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { AgentManager } from '../../agent';
import { getForgejoConfig, forgejoFetch, debugLog } from './utils';
import type { ForgejoAPIIssue, ForgejoAPIComment } from './types';
import { withSpecNumberLock } from '../../utils/spec-number-lock';
import { labelMatchesWholeWord } from '../shared/label-utils';

/**
 * Send investigation progress update to renderer
 */
function sendProgress(
  mainWindow: BrowserWindow,
  projectId: string,
  status: ForgejoInvestigationStatus
): void {
  mainWindow.webContents.send(
    IPC_CHANNELS.FORGEJO_INVESTIGATION_PROGRESS,
    projectId,
    status
  );
}

/**
 * Send investigation error to renderer
 */
function sendError(
  mainWindow: BrowserWindow,
  projectId: string,
  issueNumber: number,
  error: string
): void {
  mainWindow.webContents.send(
    IPC_CHANNELS.FORGEJO_INVESTIGATION_ERROR,
    projectId,
    { issueNumber, error }
  );
}

/**
 * Send investigation completion to renderer
 */
function sendComplete(
  mainWindow: BrowserWindow,
  projectId: string,
  result: ForgejoInvestigationResult
): void {
  mainWindow.webContents.send(
    IPC_CHANNELS.FORGEJO_INVESTIGATION_COMPLETE,
    projectId,
    result
  );
}

/**
 * Create a slug from a title
 */
function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Determine task category based on Forgejo issue labels
 */
function determineCategoryFromLabels(labels: string[]): 'feature' | 'bug_fix' | 'refactoring' | 'documentation' | 'security' | 'performance' | 'ui_ux' | 'infrastructure' | 'testing' {
  const lowerLabels = labels.map(l => l.toLowerCase());

  if (lowerLabels.some(l => l.includes('bug') || l.includes('defect') || l.includes('error') || l.includes('fix'))) {
    return 'bug_fix';
  }

  if (lowerLabels.some(l => l.includes('security') || l.includes('vulnerability') || l.includes('cve'))) {
    return 'security';
  }

  if (lowerLabels.some(l => l.includes('performance') || l.includes('optimization') || l.includes('speed'))) {
    return 'performance';
  }

  if (lowerLabels.some(l => l.includes('ui') || l.includes('ux') || l.includes('design') || l.includes('styling'))) {
    return 'ui_ux';
  }

  if (lowerLabels.some(l =>
    l.includes('infrastructure') ||
    l.includes('devops') ||
    l.includes('deployment') ||
    labelMatchesWholeWord(l, 'ci') ||
    labelMatchesWholeWord(l, 'cd')
  )) {
    return 'infrastructure';
  }

  if (lowerLabels.some(l => l.includes('test') || l.includes('testing') || l.includes('qa'))) {
    return 'testing';
  }

  if (lowerLabels.some(l => l.includes('refactor') || l.includes('cleanup') || l.includes('maintenance') || l.includes('chore') || l.includes('tech-debt') || l.includes('technical debt'))) {
    return 'refactoring';
  }

  if (lowerLabels.some(l => l.includes('documentation') || l.includes('docs'))) {
    return 'documentation';
  }

  return 'feature';
}

/**
 * Create a new spec directory and initial files for a Forgejo issue
 */
async function createSpecForForgejoIssue(
  project: Project,
  issueNumber: number,
  issueTitle: string,
  taskDescription: string,
  forgejoUrl: string,
  labels: string[] = [],
  baseBranch?: string
): Promise<{ specId: string; specDir: string; taskDescription: string; metadata: TaskMetadata }> {
  const specsBaseDir = getSpecsDir(project.autoBuildPath);
  const specsDir = path.join(project.path, specsBaseDir);

  if (!existsSync(specsDir)) {
    mkdirSync(specsDir, { recursive: true });
  }

  return await withSpecNumberLock(project.path, async (lock) => {
    const specNumber = lock.getNextSpecNumber(project.autoBuildPath);
    const slugifiedTitle = slugifyTitle(issueTitle);
    const specId = `${String(specNumber).padStart(3, '0')}-${slugifiedTitle}`;

    const specDir = path.join(specsDir, specId);
    mkdirSync(specDir, { recursive: true });

    const now = new Date().toISOString();

    // implementation_plan.json
    const implementationPlan = {
      feature: issueTitle,
      description: taskDescription,
      created_at: now,
      updated_at: now,
      status: 'pending',
      phases: []
    };
    writeFileSync(
      path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN),
      JSON.stringify(implementationPlan, null, 2)
    );

    // requirements.json
    const requirements = {
      task_description: taskDescription,
      workflow_type: 'feature'
    };
    writeFileSync(
      path.join(specDir, AUTO_BUILD_PATHS.REQUIREMENTS),
      JSON.stringify(requirements, null, 2)
    );

    const category = determineCategoryFromLabels(labels);

    // task_metadata.json
    const metadata: TaskMetadata = {
      sourceType: 'forgejo',
      forgejoIssueNumber: issueNumber,
      forgejoUrl,
      category,
      ...(baseBranch && { baseBranch })
    };
    writeFileSync(
      path.join(specDir, 'task_metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    return {
      specId,
      specDir,
      taskDescription,
      metadata
    };
  });
}

/**
 * Build issue context with comments
 */
function buildIssueContext(
  issueNumber: number,
  issueTitle: string,
  issueBody: string | undefined,
  labels: string[],
  htmlUrl: string,
  comments: Array<{ body: string; user: { login: string } }>
): string {
  return `
# Forgejo Issue #${issueNumber}: ${issueTitle}

${issueBody || 'No description provided.'}

${comments.length > 0 ? `## Comments (${comments.length}):
${comments.map(c => `**${c.user.login}:** ${c.body}`).join('\n\n')}` : ''}

**Labels:** ${labels.join(', ') || 'None'}
**URL:** ${htmlUrl}
`;
}

/**
 * Build investigation task description
 */
function buildInvestigationTask(
  issueNumber: number,
  issueTitle: string,
  issueContext: string
): string {
  return `Investigate Forgejo Issue #${issueNumber}: ${issueTitle}

${issueContext}

Please analyze this issue and provide:
1. A brief summary of what the issue is about
2. A proposed solution approach
3. The files that would likely need to be modified
4. Estimated complexity (simple/standard/complex)
5. Acceptance criteria for resolving this issue`;
}

/**
 * Investigate a Forgejo issue and create a task
 */
export function registerInvestigateIssue(
  _agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  ipcMain.on(
    IPC_CHANNELS.FORGEJO_INVESTIGATE_ISSUE,
    async (_, projectId: string, issueNumber: number, _selectedCommentIds?: number[]) => {
      debugLog('Forgejo investigation started', { projectId, issueNumber });

      const mainWindow = getMainWindow();
      if (!mainWindow) {
        debugLog('No main window found');
        return;
      }

      const project = projectStore.getProject(projectId);
      if (!project) {
        sendError(mainWindow, projectId, issueNumber, 'Project not found');
        return;
      }

      const config = getForgejoConfig(project);
      if (!config) {
        sendError(mainWindow, projectId, issueNumber, 'No Forgejo token or repository configured');
        return;
      }

      try {
        // Phase 1: Fetching issue details
        sendProgress(mainWindow, projectId, {
          phase: 'fetching',
          issueNumber,
          progress: 10,
          message: 'Fetching issue details...'
        });

        // Fetch the issue
        const issue = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues/${issueNumber}`
        ) as ForgejoAPIIssue;

        debugLog('Fetched issue', { number: issue.number, title: issue.title });

        // Fetch issue comments for more context
        const allComments = await forgejoFetch(
          config.token,
          config.instanceUrl,
          `/repos/${config.owner}/${config.repo}/issues/${issueNumber}/comments`
        ) as ForgejoAPIComment[];

        debugLog('Fetched comments', { count: allComments.length });

        // Build context for the AI investigation
        const labels = (issue.labels || []).map(l => l.name);
        const issueContext = buildIssueContext(
          issue.number,
          issue.title,
          issue.body,
          labels,
          issue.html_url,
          allComments.map(c => ({ body: c.body, user: { login: c.user.login } }))
        );

        // Phase 2: Analyzing issue
        sendProgress(mainWindow, projectId, {
          phase: 'analyzing',
          issueNumber,
          progress: 30,
          message: 'Analyzing issue...'
        });

        // Build task description
        const taskDescription = buildInvestigationTask(
          issue.number,
          issue.title,
          issueContext
        );

        // Phase 3: Creating task
        sendProgress(mainWindow, projectId, {
          phase: 'creating_task',
          issueNumber,
          progress: 70,
          message: 'Creating task from issue...'
        });

        // Create spec directory and files
        const specData = await createSpecForForgejoIssue(
          project,
          issue.number,
          issue.title,
          taskDescription,
          issue.html_url,
          labels,
          project.settings?.mainBranch
        );

        debugLog('Created spec', { specId: specData.specId });

        // Build investigation result
        const investigationResult: ForgejoInvestigationResult = {
          success: true,
          issueNumber,
          analysis: {
            summary: `Task created from Forgejo issue #${issueNumber}: ${issue.title}`,
            proposedSolution: 'Task has been created for AI agent to implement the solution.',
            affectedFiles: [],
            estimatedComplexity: 'standard',
            acceptanceCriteria: [
              `Issue #${issueNumber} requirements are met`,
              'All existing tests pass',
              'New functionality is tested'
            ]
          },
          taskId: specData.specId
        };

        // Phase 4: Complete
        sendProgress(mainWindow, projectId, {
          phase: 'complete',
          issueNumber,
          progress: 100,
          message: 'Task created!'
        });

        sendComplete(mainWindow, projectId, investigationResult);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to investigate issue';
        debugLog('Investigation failed', { error: errorMessage });
        sendError(mainWindow, projectId, issueNumber, errorMessage);
      }
    }
  );
}

/**
 * Register all investigation-related handlers
 */
export function registerInvestigationHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  registerInvestigateIssue(agentManager, getMainWindow);
}
