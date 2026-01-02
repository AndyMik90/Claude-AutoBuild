import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir } from '../../../shared/constants';
import type { IPCResult, TaskStartOptions, TaskStatus } from '../../../shared/types';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from 'fs';
import { spawnSync } from 'child_process';
import { AgentManager } from '../../agent';
import { fileWatcher } from '../../file-watcher';
import { findTaskAndProject } from './shared';
import { checkGitStatus } from '../../project-initializer';
import { getClaudeProfileManager } from '../../claude-profile-manager';
import {
  getPlanPath,
  persistPlanStatus,
  persistPlanStatusSync,
  createPlanIfNotExists
} from './plan-file-utils';

/**
 * Validates that a path is within a parent directory (prevents path traversal attacks)
 * @param targetPath - The path to validate
 * @param parentPath - The parent directory that targetPath must be within
 * @returns true if targetPath is safely within parentPath
 */
function isPathWithinParent(targetPath: string, parentPath: string): boolean {
  try {
    // Resolve to absolute paths and normalize
    const resolvedTarget = path.resolve(targetPath);
    const resolvedParent = path.resolve(parentPath);

    // For existing paths, use realpath to resolve symlinks
    let realTarget = resolvedTarget;
    let realParent = resolvedParent;

    try {
      if (existsSync(resolvedTarget)) {
        realTarget = realpathSync(resolvedTarget);
      }
      if (existsSync(resolvedParent)) {
        realParent = realpathSync(resolvedParent);
      }
    } catch {
      // If realpath fails, use resolved paths
    }

    // Ensure parent path ends with separator for accurate prefix check
    const parentWithSep = realParent.endsWith(path.sep) ? realParent : realParent + path.sep;

    // Target must start with parent path (or be the parent itself)
    return realTarget === realParent || realTarget.startsWith(parentWithSep);
  } catch {
    return false;
  }
}

/**
 * Validates specId contains only safe characters (alphanumeric, hyphens, underscores)
 */
function isValidSpecId(specId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(specId);
}

/**
 * Helper function to check subtask completion status
 */
function checkSubtasksCompletion(plan: Record<string, unknown> | null): {
  allSubtasks: Array<{ status: string }>;
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
} {
  const allSubtasks = (plan?.phases as Array<{ subtasks?: Array<{ status: string }> }> | undefined)?.flatMap(phase =>
    phase.subtasks || []
  ) || [];
  const completedCount = allSubtasks.filter(s => s.status === 'completed').length;
  const totalCount = allSubtasks.length;
  const allCompleted = totalCount > 0 && completedCount === totalCount;

  return { allSubtasks, completedCount, totalCount, allCompleted };
}

/**
 * Register task execution handlers (start, stop, review, status management, recovery)
 */
export function registerTaskExecutionHandlers(
  agentManager: AgentManager,
  getMainWindow: () => BrowserWindow | null
): void {
  /**
   * Start a task
   */
  ipcMain.on(
    IPC_CHANNELS.TASK_START,
    (_, taskId: string, _options?: TaskStartOptions) => {
      console.warn('[TASK_START] Received request for taskId:', taskId);
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        console.warn('[TASK_START] No main window found');
        return;
      }

      // Find task and project
      const { task, project } = findTaskAndProject(taskId);

      if (!task || !project) {
        console.warn('[TASK_START] Task or project not found for taskId:', taskId);
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Task or project not found'
        );
        return;
      }

      // Check git status - Auto Claude requires git for worktree-based builds
      const gitStatus = checkGitStatus(project.path);
      if (!gitStatus.isGitRepo) {
        console.warn('[TASK_START] Project is not a git repository:', project.path);
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Git repository required. Please run "git init" in your project directory. Auto Claude uses git worktrees for isolated builds.'
        );
        return;
      }
      if (!gitStatus.hasCommits) {
        console.warn('[TASK_START] Git repository has no commits:', project.path);
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Git repository has no commits. Please make an initial commit first (git add . && git commit -m "Initial commit").'
        );
        return;
      }

      // Check authentication - Claude requires valid auth to run tasks
      const profileManager = getClaudeProfileManager();
      if (!profileManager.hasValidAuth()) {
        console.warn('[TASK_START] No valid authentication for active profile');
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          'Claude authentication required. Please go to Settings > Claude Profiles and authenticate your account, or set an OAuth token.'
        );
        return;
      }

      console.warn('[TASK_START] Found task:', task.specId, 'status:', task.status, 'subtasks:', task.subtasks.length);

      // Start file watcher for this task
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specDir = path.join(
        project.path,
        specsBaseDir,
        task.specId
      );
      fileWatcher.watch(taskId, specDir);

      // Check if spec.md exists (indicates spec creation was already done or in progress)
      const specFilePath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
      const hasSpec = existsSync(specFilePath);

      // Check if this task needs spec creation first (no spec file = not yet created)
      // OR if it has a spec but no implementation plan subtasks (spec created, needs planning/building)
      const needsSpecCreation = !hasSpec;
      const needsImplementation = hasSpec && task.subtasks.length === 0;

      console.warn('[TASK_START] hasSpec:', hasSpec, 'needsSpecCreation:', needsSpecCreation, 'needsImplementation:', needsImplementation);

      // Get base branch: task-level override takes precedence over project settings
      const baseBranch = task.metadata?.baseBranch || project.settings?.mainBranch;

      if (needsSpecCreation) {
        // No spec file - need to run spec_runner.py to create the spec
        const taskDescription = task.description || task.title;
        console.warn('[TASK_START] Starting spec creation for:', task.specId, 'in:', specDir, 'baseBranch:', baseBranch);

        // Start spec creation process - pass the existing spec directory
        // so spec_runner uses it instead of creating a new one
        // Also pass baseBranch so worktrees are created from the correct branch
        agentManager.startSpecCreation(task.specId, project.path, taskDescription, specDir, task.metadata, baseBranch);
      } else if (needsImplementation) {
        // Spec exists but no subtasks - run run.py to create implementation plan and execute
        // Read the spec.md to get the task description
        const _taskDescription = task.description || task.title;
        try {
          readFileSync(specFilePath, 'utf-8');
        } catch {
          // Use default description
        }

        console.warn('[TASK_START] Starting task execution (no subtasks) for:', task.specId);
        // Start task execution which will create the implementation plan
        // Note: No parallel mode for planning phase - parallel only makes sense with multiple subtasks
        agentManager.startTaskExecution(
          taskId,
          project.path,
          task.specId,
          {
            parallel: false,  // Sequential for planning phase
            workers: 1,
            baseBranch
          }
        );
      } else {
        // Task has subtasks, start normal execution
        // Note: Parallel execution is handled internally by the agent, not via CLI flags
        console.warn('[TASK_START] Starting task execution (has subtasks) for:', task.specId);

        agentManager.startTaskExecution(
          taskId,
          project.path,
          task.specId,
          {
            parallel: false,
            workers: 1,
            baseBranch
          }
        );
      }

      // CRITICAL: Persist status to implementation_plan.json to prevent status flip-flop
      // When getTasks() is called (on refresh), it reads status from the plan file.
      // Without persisting here, the old status (e.g., 'human_review') would override
      // the in-memory 'in_progress' status, causing the task to flip back and forth.
      // Uses shared utility for consistency with agent-events-handlers.ts
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
      const persisted = persistPlanStatusSync(planPath, 'in_progress');
      if (persisted) {
        console.warn('[TASK_START] Updated plan status to: in_progress');
      }
      // Note: Plan file may not exist yet for new tasks - that's fine (persistPlanStatusSync handles ENOENT)

      // Notify status change
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'in_progress'
      );
    }
  );

  /**
   * Stop a task
   */
  ipcMain.on(IPC_CHANNELS.TASK_STOP, (_, taskId: string) => {
    agentManager.killTask(taskId);
    fileWatcher.unwatch(taskId);

    // Find task and project to update the plan file
    const { task, project } = findTaskAndProject(taskId);
    
    if (task && project) {
      // Persist status to implementation_plan.json to prevent status flip-flop on refresh
      // Uses shared utility for consistency with agent-events-handlers.ts
      const planPath = getPlanPath(project, task);
      const persisted = persistPlanStatusSync(planPath, 'backlog');
      if (persisted) {
        console.warn('[TASK_STOP] Updated plan status to backlog');
      }
      // Note: File not found is expected for tasks without a plan file (persistPlanStatusSync handles ENOENT)
    }

    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'backlog'
      );
    }
  });

  /**
   * Review a task (approve or reject)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_REVIEW,
    async (
      _,
      taskId: string,
      approved: boolean,
      feedback?: string
    ): Promise<IPCResult> => {
      // Find task and project
      const { task, project } = findTaskAndProject(taskId);

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Check if dev mode is enabled for this project
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specDir = path.join(
        project.path,
        specsBaseDir,
        task.specId
      );

      // Check if worktree exists - QA needs to run in the worktree where the build happened
      const worktreePath = path.join(project.path, '.worktrees', task.specId);
      const worktreeSpecDir = path.join(worktreePath, specsBaseDir, task.specId);
      const hasWorktree = existsSync(worktreePath);

      if (approved) {
        // Write approval to QA report
        const qaReportPath = path.join(specDir, AUTO_BUILD_PATHS.QA_REPORT);
        writeFileSync(
          qaReportPath,
          `# QA Review\n\nStatus: APPROVED\n\nReviewed at: ${new Date().toISOString()}\n`
        );

        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'done'
          );
        }
      } else {
        // Reset and discard all changes from worktree merge in main
        // The worktree still has all changes, so nothing is lost
        if (hasWorktree) {
          // Step 1: Unstage all changes
          const resetResult = spawnSync('git', ['reset', 'HEAD'], {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          if (resetResult.status === 0) {
            console.log('[TASK_REVIEW] Unstaged changes in main');
          }

          // Step 2: Discard all working tree changes (restore to pre-merge state)
          const checkoutResult = spawnSync('git', ['checkout', '--', '.'], {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          if (checkoutResult.status === 0) {
            console.log('[TASK_REVIEW] Discarded working tree changes in main');
          }

          // Step 3: Clean untracked files that came from the merge
          // IMPORTANT: Exclude .auto-claude and .worktrees directories to preserve specs and worktree data
          const cleanResult = spawnSync('git', ['clean', '-fd', '-e', '.auto-claude', '-e', '.worktrees'], {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          if (cleanResult.status === 0) {
            console.log('[TASK_REVIEW] Cleaned untracked files in main (excluding .auto-claude and .worktrees)');
          }

          console.log('[TASK_REVIEW] Main branch restored to pre-merge state');
        }

        // Write feedback for QA fixer - write to WORKTREE spec dir if it exists
        // The QA process runs in the worktree where the build and implementation_plan.json are
        const targetSpecDir = hasWorktree ? worktreeSpecDir : specDir;
        const fixRequestPath = path.join(targetSpecDir, 'QA_FIX_REQUEST.md');

        console.warn('[TASK_REVIEW] Writing QA fix request to:', fixRequestPath);
        console.warn('[TASK_REVIEW] hasWorktree:', hasWorktree, 'worktreePath:', worktreePath);

        writeFileSync(
          fixRequestPath,
          `# QA Fix Request\n\nStatus: REJECTED\n\n## Feedback\n\n${feedback || 'No feedback provided'}\n\nCreated at: ${new Date().toISOString()}\n`
        );

        // Restart QA process - use worktree path if it exists, otherwise main project
        // The QA process needs to run where the implementation_plan.json with completed subtasks is
        const qaProjectPath = hasWorktree ? worktreePath : project.path;
        console.warn('[TASK_REVIEW] Starting QA process with projectPath:', qaProjectPath);
        agentManager.startQAProcess(taskId, qaProjectPath, task.specId);

        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'in_progress'
          );
        }
      }

      return { success: true };
    }
  );

  /**
   * Update task status manually
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_UPDATE_STATUS,
    async (
      _,
      taskId: string,
      status: TaskStatus
    ): Promise<IPCResult> => {
      // Find task and project first (needed for worktree check)
      const { task, project } = findTaskAndProject(taskId);

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Validate status transition - 'done' can only be set through merge handler
      // UNLESS there's no worktree (limbo state - already merged/discarded or failed)
      if (status === 'done') {
        // Check if worktree exists
        const worktreePath = path.join(project.path, '.worktrees', taskId);
        const hasWorktree = existsSync(worktreePath);

        if (hasWorktree) {
          // Worktree exists - must use merge workflow
          console.warn(`[TASK_UPDATE_STATUS] Blocked attempt to set status 'done' directly for task ${taskId}. Use merge workflow instead.`);
          return {
            success: false,
            error: "Cannot set status to 'done' directly. Complete the human review and merge the worktree changes instead."
          };
        } else {
          // No worktree - allow marking as done (limbo state recovery)
          console.log(`[TASK_UPDATE_STATUS] Allowing status 'done' for task ${taskId} (no worktree found - limbo state)`);
        }
      }

      // Validate status transition - 'human_review' requires actual work to have been done
      // This prevents tasks from being incorrectly marked as ready for review when execution failed
      if (status === 'human_review') {
        const specsBaseDirForValidation = getSpecsDir(project.autoBuildPath);
        const specDirForValidation = path.join(
          project.path,
          specsBaseDirForValidation,
          task.specId
        );
        const specFilePath = path.join(specDirForValidation, AUTO_BUILD_PATHS.SPEC_FILE);

        // Check if spec.md exists and has meaningful content (at least 100 chars)
        const MIN_SPEC_CONTENT_LENGTH = 100;
        let specContent = '';
        try {
          if (existsSync(specFilePath)) {
            specContent = readFileSync(specFilePath, 'utf-8');
          }
        } catch {
          // Ignore read errors - treat as empty spec
        }

        if (!specContent || specContent.length < MIN_SPEC_CONTENT_LENGTH) {
          console.warn(`[TASK_UPDATE_STATUS] Blocked attempt to set status 'human_review' for task ${taskId}. No spec has been created yet.`);
          return {
            success: false,
            error: "Cannot move to human review - no spec has been created yet. The task must complete processing before review."
          };
        }
      }

      // Get the spec directory and plan path using shared utility
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const specDir = path.join(project.path, specsBaseDir, task.specId);
      const planPath = getPlanPath(project, task);

      try {
        // Use shared utility for thread-safe plan file updates
        const persisted = await persistPlanStatus(planPath, status);

        if (!persisted) {
          // If no implementation plan exists yet, create a basic one
          await createPlanIfNotExists(planPath, task, status);
        }

        // Auto-stop task when status changes AWAY from 'in_progress' and process IS running
        // This handles the case where user drags a running task back to Planning/backlog
        if (status !== 'in_progress' && agentManager.isRunning(taskId)) {
          console.warn('[TASK_UPDATE_STATUS] Stopping task due to status change away from in_progress:', taskId);
          agentManager.killTask(taskId);
        }

        // Auto-start task when status changes to 'in_progress' and no process is running
        if (status === 'in_progress' && !agentManager.isRunning(taskId)) {
          const mainWindow = getMainWindow();

          // Check git status before auto-starting
          const gitStatusCheck = checkGitStatus(project.path);
          if (!gitStatusCheck.isGitRepo || !gitStatusCheck.hasCommits) {
            console.warn('[TASK_UPDATE_STATUS] Git check failed, cannot auto-start task');
            if (mainWindow) {
              mainWindow.webContents.send(
                IPC_CHANNELS.TASK_ERROR,
                taskId,
                gitStatusCheck.error || 'Git repository with commits required to run tasks.'
              );
            }
            return { success: false, error: gitStatusCheck.error || 'Git repository required' };
          }

          // Check authentication before auto-starting
          const profileManager = getClaudeProfileManager();
          if (!profileManager.hasValidAuth()) {
            console.warn('[TASK_UPDATE_STATUS] No valid authentication for active profile');
            if (mainWindow) {
              mainWindow.webContents.send(
                IPC_CHANNELS.TASK_ERROR,
                taskId,
                'Claude authentication required. Please go to Settings > Claude Profiles and authenticate your account, or set an OAuth token.'
              );
            }
            return { success: false, error: 'Claude authentication required' };
          }

          console.warn('[TASK_UPDATE_STATUS] Auto-starting task:', taskId);

          // Start file watcher for this task
          fileWatcher.watch(taskId, specDir);

          // Check if spec.md exists
          const specFilePath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
          const hasSpec = existsSync(specFilePath);
          const needsSpecCreation = !hasSpec;
          const needsImplementation = hasSpec && task.subtasks.length === 0;

          console.warn('[TASK_UPDATE_STATUS] hasSpec:', hasSpec, 'needsSpecCreation:', needsSpecCreation, 'needsImplementation:', needsImplementation);

          // Get base branch: task-level override takes precedence over project settings
          const baseBranchForUpdate = task.metadata?.baseBranch || project.settings?.mainBranch;

          if (needsSpecCreation) {
            // No spec file - need to run spec_runner.py to create the spec
            const taskDescription = task.description || task.title;
            console.warn('[TASK_UPDATE_STATUS] Starting spec creation for:', task.specId);
            agentManager.startSpecCreation(task.specId, project.path, taskDescription, specDir, task.metadata, baseBranchForUpdate);
          } else if (needsImplementation) {
            // Spec exists but no subtasks - run run.py to create implementation plan and execute
            console.warn('[TASK_UPDATE_STATUS] Starting task execution (no subtasks) for:', task.specId);
            agentManager.startTaskExecution(
              taskId,
              project.path,
              task.specId,
              {
                parallel: false,
                workers: 1,
                baseBranch: baseBranchForUpdate
              }
            );
          } else {
            // Task has subtasks, start normal execution
            // Note: Parallel execution is handled internally by the agent
            console.warn('[TASK_UPDATE_STATUS] Starting task execution (has subtasks) for:', task.specId);
            agentManager.startTaskExecution(
              taskId,
              project.path,
              task.specId,
              {
                parallel: false,
                workers: 1,
                baseBranch: baseBranchForUpdate
              }
            );
          }

          // Notify renderer about status change
          if (mainWindow) {
            mainWindow.webContents.send(
              IPC_CHANNELS.TASK_STATUS_CHANGE,
              taskId,
              'in_progress'
            );
          }
        }

        return { success: true };
      } catch (error) {
        console.error('Failed to update task status:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update task status'
        };
      }
    }
  );

  /**
   * Check if a task is actually running (has active process)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_CHECK_RUNNING,
    async (_, taskId: string): Promise<IPCResult<boolean>> => {
      const isRunning = agentManager.isRunning(taskId);
      return { success: true, data: isRunning };
    }
  );

  /**
   * Recover a stuck task (status says in_progress but no process running)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_RECOVER_STUCK,
    async (
      _,
      taskId: string,
      options?: { targetStatus?: TaskStatus; autoRestart?: boolean }
    ): Promise<IPCResult<{ taskId: string; recovered: boolean; newStatus: TaskStatus; message: string; autoRestarted?: boolean }>> => {
      const targetStatus = options?.targetStatus;
      const autoRestart = options?.autoRestart ?? false;
      // Check if task is actually running
      const isActuallyRunning = agentManager.isRunning(taskId);

      if (isActuallyRunning) {
        return {
          success: false,
          error: 'Task is still running. Stop it first before recovering.',
          data: {
            taskId,
            recovered: false,
            newStatus: 'in_progress' as TaskStatus,
            message: 'Task is still running'
          }
        };
      }

      // Find task and project
      const { task, project } = findTaskAndProject(taskId);

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Get the spec directory
      const autoBuildDir = project.autoBuildPath || '.auto-claude';
      const specDir = path.join(
        project.path,
        autoBuildDir,
        'specs',
        task.specId
      );

      // Update implementation_plan.json
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

      try {
        // Read the plan to analyze subtask progress
        let plan: Record<string, unknown> | null = null;
        if (existsSync(planPath)) {
          const planContent = readFileSync(planPath, 'utf-8');
          plan = JSON.parse(planContent);
        }

        // Determine the target status intelligently based on subtask progress
        // If targetStatus is explicitly provided, use it; otherwise calculate from subtasks
        let newStatus: TaskStatus = targetStatus || 'backlog';

        if (!targetStatus && plan?.phases && Array.isArray(plan.phases)) {
          // Analyze subtask statuses to determine appropriate recovery status
          const { completedCount, totalCount, allCompleted } = checkSubtasksCompletion(plan);

          if (totalCount > 0) {
            if (allCompleted) {
              // All subtasks completed - should go to review (ai_review or human_review based on source)
              // For recovery, human_review is safer as it requires manual verification
              newStatus = 'human_review';
            } else if (completedCount > 0) {
              // Some subtasks completed, some still pending - task is in progress
              newStatus = 'in_progress';
            }
            // else: no subtasks completed, stay with 'backlog'
          }
        }

        if (plan) {
          // Update status
          plan.status = newStatus;
          plan.planStatus = newStatus === 'done' ? 'completed'
            : newStatus === 'in_progress' ? 'in_progress'
            : newStatus === 'ai_review' ? 'review'
            : newStatus === 'human_review' ? 'review'
            : 'pending';
          plan.updated_at = new Date().toISOString();

          // Add recovery note
          plan.recoveryNote = `Task recovered from stuck state at ${new Date().toISOString()}`;

          // Check if task is actually stuck or just completed and waiting for merge
          const { allCompleted } = checkSubtasksCompletion(plan);

          if (allCompleted) {
            console.log('[Recovery] Task is fully complete (all subtasks done), setting to human_review without restart');
            // Don't reset any subtasks - task is done!
            // Just update status in plan file (project store reads from file, no separate update needed)
            plan.status = 'human_review';
            plan.planStatus = 'review';
            writeFileSync(planPath, JSON.stringify(plan, null, 2));

            return {
              success: true,
              data: {
                taskId,
                recovered: true,
                newStatus: 'human_review',
                message: 'Task is complete and ready for review',
                autoRestarted: false
              }
            };
          }

          // Task is not complete - reset only stuck subtasks for retry
          // Keep completed subtasks as-is so run.py can resume from where it left off
          if (plan.phases && Array.isArray(plan.phases)) {
            for (const phase of plan.phases as Array<{ subtasks?: Array<{ status: string; actual_output?: string; started_at?: string; completed_at?: string }> }>) {
              if (phase.subtasks && Array.isArray(phase.subtasks)) {
                for (const subtask of phase.subtasks) {
                  // Reset in_progress subtasks to pending (they were interrupted)
                  // Keep completed subtasks as-is so run.py can resume
                  if (subtask.status === 'in_progress') {
                    const originalStatus = subtask.status;
                    subtask.status = 'pending';
                    // Clear execution data to maintain consistency
                    delete subtask.actual_output;
                    delete subtask.started_at;
                    delete subtask.completed_at;
                    console.log(`[Recovery] Reset stuck subtask: ${originalStatus} -> pending`);
                  }
                  // Also reset failed subtasks so they can be retried
                  if (subtask.status === 'failed') {
                    subtask.status = 'pending';
                    // Clear execution data to maintain consistency
                    delete subtask.actual_output;
                    delete subtask.started_at;
                    delete subtask.completed_at;
                    console.log(`[Recovery] Reset failed subtask for retry`);
                  }
                }
              }
            }
          }

          writeFileSync(planPath, JSON.stringify(plan, null, 2));
        }

        // Stop file watcher if it was watching this task
        fileWatcher.unwatch(taskId);

        // Auto-restart the task if requested
        let autoRestarted = false;
        if (autoRestart && project) {
          // Check git status before auto-restarting
          const gitStatusForRestart = checkGitStatus(project.path);
          if (!gitStatusForRestart.isGitRepo || !gitStatusForRestart.hasCommits) {
            console.warn('[Recovery] Git check failed, cannot auto-restart task');
            // Recovery succeeded but we can't restart without git
            return {
              success: true,
              data: {
                taskId,
                recovered: true,
                newStatus,
                message: `Task recovered but cannot restart: ${gitStatusForRestart.error || 'Git repository with commits required.'}`,
                autoRestarted: false
              }
            };
          }

          // Check authentication before auto-restarting
          const profileManager = getClaudeProfileManager();
          if (!profileManager.hasValidAuth()) {
            console.warn('[Recovery] Auth check failed, cannot auto-restart task');
            // Recovery succeeded but we can't restart without auth
            return {
              success: true,
              data: {
                taskId,
                recovered: true,
                newStatus,
                message: 'Task recovered but cannot restart: Claude authentication required. Please go to Settings > Claude Profiles and authenticate your account.',
                autoRestarted: false
              }
            };
          }

          try {
            // Set status to in_progress for the restart
            newStatus = 'in_progress';

            // Update plan status for restart
            if (plan) {
              plan.status = 'in_progress';
              plan.planStatus = 'in_progress';
              writeFileSync(planPath, JSON.stringify(plan, null, 2));
            }

            // Start the task execution
            // Start file watcher for this task
            const specsBaseDir = getSpecsDir(project.autoBuildPath);
            const specDirForWatcher = path.join(project.path, specsBaseDir, task.specId);
            fileWatcher.watch(taskId, specDirForWatcher);

            // Check if spec.md exists to determine whether to run spec creation or task execution
            const specFilePath = path.join(specDirForWatcher, AUTO_BUILD_PATHS.SPEC_FILE);
            const hasSpec = existsSync(specFilePath);
            const needsSpecCreation = !hasSpec;

            // Get base branch: task-level override takes precedence over project settings
            const baseBranchForRecovery = task.metadata?.baseBranch || project.settings?.mainBranch;

            if (needsSpecCreation) {
              // No spec file - need to run spec_runner.py to create the spec
              const taskDescription = task.description || task.title;
              console.warn(`[Recovery] Starting spec creation for: ${task.specId}`);
              agentManager.startSpecCreation(task.specId, project.path, taskDescription, specDirForWatcher, task.metadata, baseBranchForRecovery);
            } else {
              // Spec exists - run task execution
              console.warn(`[Recovery] Starting task execution for: ${task.specId}`);
              agentManager.startTaskExecution(
                taskId,
                project.path,
                task.specId,
                {
                  parallel: false,
                  workers: 1,
                  baseBranch: baseBranchForRecovery
                }
              );
            }

            autoRestarted = true;
            console.warn(`[Recovery] Auto-restarted task ${taskId}`);
          } catch (restartError) {
            console.error('Failed to auto-restart task after recovery:', restartError);
            // Recovery succeeded but restart failed - still report success
          }
        }

        // Notify renderer of status change
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            newStatus
          );
        }

        return {
          success: true,
          data: {
            taskId,
            recovered: true,
            newStatus,
            message: autoRestarted
              ? 'Task recovered and restarted successfully'
              : `Task recovered successfully and moved to ${newStatus}`,
            autoRestarted
          }
        };
      } catch (error) {
        console.error('Failed to recover stuck task:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to recover task'
        };
      }
    }
  );

  /**
   * Approve plan without starting execution
   * Updates review_state.json and plan status to allow future execution
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_APPROVE_PLAN,
    async (_, taskId: string): Promise<IPCResult<{ taskId: string; approved: boolean }>> => {
      console.log('[TASK_APPROVE_PLAN] Approving plan for taskId:', taskId);

      try {
        const { task, project } = findTaskAndProject(taskId);

        if (!task || !project) {
          return {
            success: false,
            error: 'Task or project not found'
          };
        }

        // Check if task is currently running
        if (agentManager.isRunning(taskId)) {
          return {
            success: false,
            error: 'Cannot approve plan while task is running.'
          };
        }

        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specDir = path.join(project.path, specsBaseDir, task.specId);
        const specPath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);
        const reviewStatePath = path.join(specDir, 'review_state.json');
        const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

        // Check if spec exists
        if (!existsSync(specPath)) {
          return {
            success: false,
            error: 'Spec file not found. Cannot approve a plan without a spec.'
          };
        }

        // Calculate current spec hash
        const crypto = await import('crypto');
        const specContent = readFileSync(specPath, 'utf-8');
        const specHash = crypto.createHash('md5').update(specContent).digest('hex');

        // Update review_state.json
        const reviewState = {
          approved: true,
          approved_by: 'user',
          approved_at: new Date().toISOString(),
          feedback: [],
          spec_hash: specHash,
          review_count: 1
        };

        // Try to preserve existing review_count (read atomically without separate existence check)
        try {
          const existing = JSON.parse(readFileSync(reviewStatePath, 'utf-8'));
          reviewState.review_count = (existing.review_count || 0) + 1;
        } catch {
          // File doesn't exist or parse error - use default review_count of 1
        }

        writeFileSync(reviewStatePath, JSON.stringify(reviewState, null, 2));
        console.log('[TASK_APPROVE_PLAN] Updated review_state.json');

        // Update implementation_plan.json status (read atomically without separate existence check)
        try {
          const plan = JSON.parse(readFileSync(planPath, 'utf-8'));
          // Move from human_review/review to backlog/pending (ready for start)
          plan.status = 'backlog';
          plan.planStatus = 'pending';
          plan.updated_at = new Date().toISOString();
          writeFileSync(planPath, JSON.stringify(plan, null, 2));
          console.log('[TASK_APPROVE_PLAN] Updated implementation_plan.json status to backlog/pending');
        } catch (e) {
          // File doesn't exist or other error - skip plan update
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            console.warn('[TASK_APPROVE_PLAN] Could not update plan status:', e);
          }
        }

        // Notify renderer of status change
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'backlog'
          );
        }

        return {
          success: true,
          data: {
            taskId,
            approved: true
          }
        };
      } catch (error) {
        console.error('Failed to approve plan:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to approve plan'
        };
      }
    }
  );

  /**
   * Recreate task - delete spec directory and re-run spec creation
   * Preserves task description/title from metadata
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_RECREATE,
    async (_, taskId: string): Promise<IPCResult<{ taskId: string; recreated: boolean }>> => {
      console.log('[TASK_RECREATE] Recreating task:', taskId);

      try {
        const { task, project } = findTaskAndProject(taskId);

        if (!task || !project) {
          return {
            success: false,
            error: 'Task or project not found'
          };
        }

        // Check if a process is currently running for this task
        if (agentManager.isRunning(taskId)) {
          return {
            success: false,
            error: 'Cannot recreate task while it is running. Please stop the task first.'
          };
        }

        // Validate specId to prevent path traversal attacks
        if (!isValidSpecId(task.specId)) {
          console.error('[TASK_RECREATE] Invalid specId detected:', task.specId);
          return {
            success: false,
            error: 'Invalid spec ID format'
          };
        }

        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const specDir = path.join(project.path, specsBaseDir, task.specId);

        // Validate specDir is within project path (defense in depth)
        if (!isPathWithinParent(specDir, project.path)) {
          console.error('[TASK_RECREATE] Path traversal attempt detected:', specDir);
          return {
            success: false,
            error: 'Invalid spec directory path'
          };
        }

        // Preserve task description before deleting
        const taskDescription = task.description || task.title;
        const taskMetadata = task.metadata || {};

        // Check for worktree and clean it up if it exists
        const worktreesDir = path.join(project.path, '.worktrees', task.specId);
        // Validate worktree path is within project
        if (existsSync(worktreesDir) && isPathWithinParent(worktreesDir, project.path)) {
          console.log('[TASK_RECREATE] Cleaning up worktree:', worktreesDir);
          try {
            // Use git worktree remove
            spawnSync('git', ['worktree', 'remove', '--force', worktreesDir], {
              cwd: project.path,
              encoding: 'utf-8'
            });
          } catch (e) {
            console.warn('[TASK_RECREATE] Could not remove worktree:', e);
          }
        }

        // Delete spec directory contents but keep the directory
        if (existsSync(specDir)) {
          console.log('[TASK_RECREATE] Clearing spec directory:', specDir);
          const fs = await import('fs');
          const entries = fs.readdirSync(specDir);
          for (const entry of entries) {
            const entryPath = path.join(specDir, entry);
            // Validate each entry path before deletion (defense in depth)
            if (!isPathWithinParent(entryPath, specDir)) {
              console.warn('[TASK_RECREATE] Skipping suspicious path:', entryPath);
              continue;
            }
            try {
              const stat = fs.statSync(entryPath);
              if (stat.isDirectory()) {
                fs.rmSync(entryPath, { recursive: true, force: true });
              } else {
                fs.unlinkSync(entryPath);
              }
            } catch (e) {
              console.warn('[TASK_RECREATE] Could not delete:', entryPath, e);
            }
          }
        } else {
          // Create spec directory if it doesn't exist
          mkdirSync(specDir, { recursive: true });
        }

        // Create minimal task_metadata.json to preserve the task
        const metadataPath = path.join(specDir, 'task_metadata.json');
        const newMetadata = {
          ...taskMetadata,
          recreatedAt: new Date().toISOString(),
          recreatedFrom: taskId
        };
        writeFileSync(metadataPath, JSON.stringify(newMetadata, null, 2));

        // Create requirements.json with preserved description
        const requirementsPath = path.join(specDir, 'requirements.json');
        const requirements = {
          task: taskDescription,
          workflow: taskMetadata.category || 'feature',
          created_at: new Date().toISOString(),
          recreated: true
        };
        writeFileSync(requirementsPath, JSON.stringify(requirements, null, 2));

        // Stop file watcher for this task
        fileWatcher.unwatch(taskId);

        // Notify renderer of status change (back to backlog/needs spec creation)
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(
            IPC_CHANNELS.TASK_STATUS_CHANGE,
            taskId,
            'backlog'
          );
        }

        console.log('[TASK_RECREATE] Task recreated successfully:', taskId);

        return {
          success: true,
          data: {
            taskId,
            recreated: true
          }
        };
      } catch (error) {
        console.error('Failed to recreate task:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to recreate task'
        };
      }
    }
  );
}
