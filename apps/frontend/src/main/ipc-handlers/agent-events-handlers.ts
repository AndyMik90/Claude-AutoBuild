import type { BrowserWindow } from 'electron';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { IPC_CHANNELS, getSpecsDir, AUTO_BUILD_PATHS } from '../../shared/constants';
import type {
  SDKRateLimitInfo,
  Task,
  TaskStatus,
  Project,
  ImplementationPlan,
  WorktreeSetupResult
} from '../../shared/types';
import { AgentManager } from '../agent';
import type { ProcessType, ExecutionProgressData } from '../agent';
import { titleGenerator } from '../title-generator';
import { fileWatcher } from '../file-watcher';
import { projectStore } from '../project-store';
import { notificationService } from '../notification-service';
import { executeWorktreeSetup, shouldExecuteSetup } from '../worktree-setup';

function atomicWriteJson(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  try {
    writeFileSync(tempPath, JSON.stringify(data, null, 2));
    renameSync(tempPath, filePath);
  } catch (error) {
    try { unlinkSync(tempPath); } catch (_) { void _; }
    throw error;
  }
}

/**
 * Register all agent-events-related IPC handlers
 */
export function registerAgenteventsHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  // ============================================
  // Agent Manager Events → Renderer
  // ============================================

  agentManager.on('log', (taskId: string, log: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOG, taskId, log);
    }
  });

  agentManager.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error);
    }
  });

  // Handle SDK rate limit events from agent manager
  agentManager.on('sdk-rate-limit', (rateLimitInfo: SDKRateLimitInfo) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, rateLimitInfo);
    }
  });

  // Handle SDK rate limit events from title generator
  titleGenerator.on('sdk-rate-limit', (rateLimitInfo: SDKRateLimitInfo) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.CLAUDE_SDK_RATE_LIMIT, rateLimitInfo);
    }
  });

  agentManager.on('exit', (taskId: string, code: number | null, processType: ProcessType) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      // Stop file watcher
      fileWatcher.unwatch(taskId);

      // Determine new status based on process type and exit code
      // Flow: Planning → In Progress → AI Review (QA agent) → Human Review (QA passed)
      let newStatus: TaskStatus;

      if (processType === 'task-execution') {
        // Task execution completed (includes spec_runner → run.py chain)
        // Success (code 0) = QA agent signed off → Human Review
        // Failure = needs human attention → Human Review
        newStatus = 'human_review';
      } else if (processType === 'qa-process') {
        // QA retry process completed
        newStatus = 'human_review';
      } else if (processType === 'spec-creation') {
        // Pure spec creation (shouldn't happen with current flow, but handle it)
        // Stay in backlog/planning
        console.warn(`[Task ${taskId}] Spec creation completed with code ${code}`);
        return;
      } else {
        // Unknown process type
        newStatus = 'human_review';
      }

      // Find task and project for status persistence and notifications
      let task: Task | undefined;
      let project: Project | undefined;

      try {
        const projects = projectStore.getProjects();

        for (const p of projects) {
          const tasks = projectStore.getTasks(p.id);
          task = tasks.find((t) => t.id === taskId || t.specId === taskId);
          if (task) {
            project = p;
            break;
          }
        }

        // Persist status to disk so it survives hot reload
        // This is a backup in case the Python backend didn't sync properly
        if (task && project) {
          const specsBaseDir = getSpecsDir(project.autoBuildPath);
          const specDir = path.join(project.path, specsBaseDir, task.specId);
          const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

          if (existsSync(planPath)) {
            const planContent = readFileSync(planPath, 'utf-8');
            const plan = JSON.parse(planContent);

            // Only update if not already set to a "further along" status
            // (e.g., don't override 'done' with 'human_review')
            const currentStatus = plan.status;
            const shouldUpdate = !currentStatus ||
              currentStatus === 'in_progress' ||
              currentStatus === 'ai_review' ||
              currentStatus === 'backlog' ||
              currentStatus === 'pending';

            if (shouldUpdate) {
              plan.status = newStatus;
              plan.planStatus = 'review';
              plan.updated_at = new Date().toISOString();
              atomicWriteJson(planPath, plan);
              console.warn(`[Task ${taskId}] Persisted status '${newStatus}' to implementation_plan.json`);
            }
          }
        }
      } catch (persistError) {
        console.error(`[Task ${taskId}] Failed to persist status:`, persistError);
      }

      // Send notifications based on task completion status
      if (task && project) {
        const taskTitle = task.title || task.specId;

        if (code === 0) {
          // Task completed successfully - ready for review
          notificationService.notifyReviewNeeded(taskTitle, project.id, taskId);
        } else {
          // Task failed
          notificationService.notifyTaskFailed(taskTitle, project.id, taskId);
        }
      }

      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        newStatus
      );

      if (newStatus === 'human_review' && task && project) {
        const worktreeSetupConfig = project.settings?.worktreeSetup;

        if (shouldExecuteSetup(worktreeSetupConfig)) {
          console.log(`[Task ${taskId}] Executing worktree setup commands...`);

          executeWorktreeSetup({
            projectPath: project.path,
            specId: task.specId,
            config: worktreeSetupConfig!
          }).then((setupResult: WorktreeSetupResult) => {
            console.log(`[Task ${taskId}] Worktree setup completed. Success: ${setupResult.success}`);

            try {
              const specsBaseDir = getSpecsDir(project.autoBuildPath);
              const specDir = path.join(project.path, specsBaseDir, task.specId);
              const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

              if (existsSync(planPath)) {
                const planContent = readFileSync(planPath, 'utf-8');
                const plan = JSON.parse(planContent);
                plan.setupResult = setupResult;
                plan.updated_at = new Date().toISOString();
                atomicWriteJson(planPath, plan);
                console.log(`[Task ${taskId}] Saved setup result to implementation_plan.json`);
              }
            } catch (saveError) {
              console.error(`[Task ${taskId}] Failed to save setup result:`, saveError);
            }

            const currentWindow = getMainWindow();
            if (currentWindow) {
              currentWindow.webContents.send(IPC_CHANNELS.TASK_SETUP_RESULT, taskId, setupResult);
            }
          }).catch((setupError: Error) => {
            console.error(`[Task ${taskId}] Worktree setup failed:`, setupError);

            const errorResult: WorktreeSetupResult = {
              success: false,
              executedAt: new Date().toISOString(),
              commands: [],
              totalDurationMs: 0,
              error: setupError.message
            };

            // Persist error result to disk for consistency with success path
            try {
              const specsBaseDir = getSpecsDir(project.autoBuildPath);
              const specDir = path.join(project.path, specsBaseDir, task.specId);
              const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

              if (existsSync(planPath)) {
                const planContent = readFileSync(planPath, 'utf-8');
                const plan = JSON.parse(planContent);
                plan.setupResult = errorResult;
                plan.updated_at = new Date().toISOString();
                atomicWriteJson(planPath, plan);
                console.log(`[Task ${taskId}] Saved setup error result to implementation_plan.json`);
              }
            } catch (saveError) {
              console.error(`[Task ${taskId}] Failed to save setup error result:`, saveError);
            }

            const currentWindow = getMainWindow();
            if (currentWindow) {
              currentWindow.webContents.send(IPC_CHANNELS.TASK_SETUP_RESULT, taskId, errorResult);
            }
          });
        }
      }
    }
  });

  agentManager.on('execution-progress', (taskId: string, progress: ExecutionProgressData) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, taskId, progress);

      // Auto-move task to AI Review when entering qa_review phase
      if (progress.phase === 'qa_review') {
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_STATUS_CHANGE,
          taskId,
          'ai_review'
        );
      }
    }
  });

  // ============================================
  // File Watcher Events → Renderer
  // ============================================

  fileWatcher.on('progress', (taskId: string, plan: ImplementationPlan) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_PROGRESS, taskId, plan);
    }
  });

  fileWatcher.on('error', (taskId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_ERROR, taskId, error);
    }
  });
}
