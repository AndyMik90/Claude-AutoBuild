import type { BrowserWindow } from 'electron';
import path from 'path';
import { existsSync } from 'fs';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir } from '../../shared/constants';
import type {
  SDKRateLimitInfo,
  Task,
  TaskStatus,
  Project,
  ImplementationPlan
} from '../../shared/types';
import { AgentManager } from '../agent';
import type { ProcessType, ExecutionProgressData } from '../agent';
import { titleGenerator } from '../title-generator';
import { fileWatcher } from '../file-watcher';
import { projectStore } from '../project-store';
import { notificationService } from '../notification-service';
import { persistPlanStatusSync, getPlanPath } from './task/plan-file-utils';
import { findTaskWorktree } from '../worktree-paths';


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
      // Send final plan state to renderer BEFORE unwatching
      // This ensures the renderer has the final subtask data (fixes 0/0 subtask bug)
      const finalPlan = fileWatcher.getCurrentPlan(taskId);
      if (finalPlan) {
        mainWindow.webContents.send(IPC_CHANNELS.TASK_PROGRESS, taskId, finalPlan);
      }

      fileWatcher.unwatch(taskId);

      if (processType === 'spec-creation') {
        console.warn(`[Task ${taskId}] Spec creation completed with code ${code}`);
        return;
      }

      let task: Task | undefined;
      let project: Project | undefined;

      try {
        const projects = projectStore.getProjects();

        // IMPORTANT: Invalidate cache for all projects to ensure we get fresh data
        // This prevents race conditions where cached task data has stale status
        for (const p of projects) {
          projectStore.invalidateTasksCache(p.id);
        }

        for (const p of projects) {
          const tasks = projectStore.getTasks(p.id);
          task = tasks.find((t) => t.id === taskId || t.specId === taskId);
          if (task) {
            project = p;
            break;
          }
        }

        if (task && project) {
          const taskTitle = task.title || task.specId;
          const mainPlanPath = getPlanPath(project, task);
          const projectId = project.id; // Capture for closure

          // Capture task values for closure
          const taskSpecId = task.specId;
          const projectPath = project.path;
          const autoBuildPath = project.autoBuildPath;

          // Use shared utility for persisting status (prevents race conditions)
          // Persist to both main project AND worktree (if exists) for consistency
          const persistStatus = (status: TaskStatus) => {
            // Persist to main project
            const mainPersisted = persistPlanStatusSync(mainPlanPath, status, projectId);
            if (mainPersisted) {
              console.warn(`[Task ${taskId}] Persisted status to main plan: ${status}`);
            }

            // Also persist to worktree if it exists
            const worktreePath = findTaskWorktree(projectPath, taskSpecId);
            if (worktreePath) {
              const specsBaseDir = getSpecsDir(autoBuildPath);
              const worktreePlanPath = path.join(
                worktreePath,
                specsBaseDir,
                taskSpecId,
                AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN
              );
              if (existsSync(worktreePlanPath)) {
                const worktreePersisted = persistPlanStatusSync(worktreePlanPath, status, projectId);
                if (worktreePersisted) {
                  console.warn(`[Task ${taskId}] Persisted status to worktree plan: ${status}`);
                }
              }
            }
          };

          if (code === 0) {
            notificationService.notifyReviewNeeded(taskTitle, project.id, taskId);
            
            // Fallback: Ensure status is updated even if COMPLETE phase event was missed
            // This prevents tasks from getting stuck in ai_review status
            // Uses inverted logic to also handle tasks with no subtasks (treats them as complete)
            const isActiveStatus = task.status === 'in_progress' || task.status === 'ai_review';
            const hasIncompleteSubtasks = task.subtasks && task.subtasks.length > 0 && 
              task.subtasks.some((s) => s.status !== 'completed');
            
            if (isActiveStatus && !hasIncompleteSubtasks) {
              console.warn(`[Task ${taskId}] Fallback: Moving to human_review (process exited successfully)`);
              persistStatus('human_review');
              mainWindow.webContents.send(
                IPC_CHANNELS.TASK_STATUS_CHANGE,
                taskId,
                'human_review' as TaskStatus
              );
            }
          } else {
            notificationService.notifyTaskFailed(taskTitle, project.id, taskId);
            persistStatus('human_review');
            mainWindow.webContents.send(
              IPC_CHANNELS.TASK_STATUS_CHANGE,
              taskId,
              'human_review' as TaskStatus
            );
          }
        }
      } catch (error) {
        console.error(`[Task ${taskId}] Exit handler error:`, error);
      }
    }
  });

  agentManager.on('execution-progress', (taskId: string, progress: ExecutionProgressData) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_EXECUTION_PROGRESS, taskId, progress);

      const phaseToStatus: Record<string, TaskStatus | null> = {
        'idle': null,
        'planning': 'in_progress',
        'coding': 'in_progress',
        'qa_review': 'ai_review',
        'qa_fixing': 'ai_review',
        'complete': 'human_review',
        'failed': 'human_review'
      };

      const newStatus = phaseToStatus[progress.phase];
      if (newStatus) {
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_STATUS_CHANGE,
          taskId,
          newStatus
        );

        // CRITICAL: Persist status to plan file(s) to prevent flip-flop on task list refresh
        // When getTasks() is called, it reads status from the plan file. Without persisting,
        // the status in the file might differ from the UI, causing inconsistent state.
        // Uses shared utility with locking to prevent race conditions.
        // IMPORTANT: We persist to BOTH main project AND worktree (if exists) to ensure
        // consistency, since getTasks() prefers the worktree version.
        try {
          const projects = projectStore.getProjects();
          for (const p of projects) {
            const tasks = projectStore.getTasks(p.id);
            const task = tasks.find((t) => t.id === taskId || t.specId === taskId);
            if (task) {
              // Persist to main project plan file
              const mainPlanPath = getPlanPath(p, task);
              persistPlanStatusSync(mainPlanPath, newStatus, p.id);

              // Also persist to worktree plan file if it exists
              // This ensures consistency since getTasks() prefers worktree version
              const worktreePath = findTaskWorktree(p.path, task.specId);
              if (worktreePath) {
                const specsBaseDir = getSpecsDir(p.autoBuildPath);
                const worktreePlanPath = path.join(
                  worktreePath,
                  specsBaseDir,
                  task.specId,
                  AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN
                );
                if (existsSync(worktreePlanPath)) {
                  persistPlanStatusSync(worktreePlanPath, newStatus, p.id);
                }
              }
              break;
            }
          }
        } catch (err) {
          // Ignore persistence errors - UI will still work, just might flip on refresh
          console.warn('[execution-progress] Could not persist status:', err);
        }
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
