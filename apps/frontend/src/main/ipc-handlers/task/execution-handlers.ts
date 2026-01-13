import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir, BASE_BRANCHES } from '../../../shared/constants';
import type { IPCResult, TaskStartOptions, TaskStatus, ImageAttachment, WorktreeCleanupResult } from '../../../shared/types';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { spawnSync, execFileSync } from 'child_process';
import { getToolPath } from '../../cli-tool-manager';
import { AgentManager } from '../../agent';
import { fileWatcher } from '../../file-watcher';
import { findTaskAndProject } from './shared';
import { checkGitStatus } from '../../project-initializer';
import { initializeClaudeProfileManager, type ClaudeProfileManager } from '../../claude-profile-manager';
import {
  getPlanPath,
  persistPlanStatus,
  createPlanIfNotExists
} from './plan-file-utils';
import { findTaskWorktree } from '../../worktree-paths';
import { projectStore } from '../../project-store';

/**
 * Atomic file write to prevent TOCTOU race conditions.
 * Writes to a temporary file first, then atomically renames to target.
 * This ensures the target file is never in an inconsistent state.
 */
/**
 * Result of checking a worktree's branch state.
 * Uses discriminated union to distinguish between valid branches, base branches, and errors.
 */
type GetWorktreeBranchResult =
  | { valid: true; branch: string }
  | { valid: false; reason: 'base_branch'; branch: string }
  | { valid: false; reason: 'git_error'; error: Error };

/**
 * Check if a worktree is in a valid git state with a feature branch.
 * Returns a discriminated union to distinguish between:
 * - valid: true with branch name (feature branch)
 * - valid: false, reason: 'base_branch' (orphaned after GitHub merge)
 * - valid: false, reason: 'git_error' (transient git failure - should NOT trigger cleanup)
 *
 * This handles the edge case where a PR was merged via GitHub web UI but the
 * local worktree directory still exists.
 */
function getWorktreeBranch(worktreePath: string): GetWorktreeBranchResult {
  try {
    const branch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: worktreePath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000
    }).trim();

    // Skip if on a base branch (orphaned after GitHub merge)
    // Allow any feature branch pattern (auto-claude/*, feature/*, etc.)
    // Use case-insensitive comparison for robustness
    if (BASE_BRANCHES.includes(branch.toLowerCase() as typeof BASE_BRANCHES[number])) {
      return { valid: false, reason: 'base_branch', branch };
    }
    return { valid: true, branch };
  } catch (error) {
    // Git command failed - could be transient (lock file, disk I/O) - do NOT treat as orphaned
    console.warn(`[getWorktreeBranch] Failed to get branch for worktree at ${worktreePath}:`, error);
    return { valid: false, reason: 'git_error', error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * Remove a worktree directory using git worktree remove with retry logic.
 * Falls back to direct directory deletion if git command fails.
 */
async function removeWorktreeWithRetry(
  projectPath: string,
  worktreePath: string,
  maxRetries = 3
): Promise<WorktreeCleanupResult> {
  let removed = false;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries && !removed; attempt++) {
    try {
      execFileSync(getToolPath('git'), ['worktree', 'remove', '--force', worktreePath], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000
      });
      removed = true;
      console.warn(`[removeWorktreeWithRetry] Worktree removed: ${worktreePath}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        console.warn(`[removeWorktreeWithRetry] Retry ${attempt}/${maxRetries} - waiting before retry...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  if (!removed && lastError) {
    const errorMessage = lastError.message || String(lastError);
    // Check for "not a working tree" error - directory exists but isn't registered with git
    if (errorMessage.includes('not a working tree') || errorMessage.includes('is not a valid working tree')) {
      console.warn(`[removeWorktreeWithRetry] Directory exists but isn't a git worktree - deleting directly`);
      try {
        rmSync(worktreePath, { recursive: true, force: true });
        removed = true;
        console.warn(`[removeWorktreeWithRetry] Directory deleted: ${worktreePath}`);
        pruneWorktrees(projectPath);
      } catch (rmError) {
        return {
          success: false,
          canSkipCleanup: true,
          worktreePath,
          error: `Cannot delete worktree directory: ${rmError instanceof Error ? rmError.message : String(rmError)}`
        };
      }
    }
    if (!removed) {
      return {
        success: false,
        canSkipCleanup: true,
        worktreePath,
        error: `Cannot delete worktree: ${errorMessage}`
      };
    }
  }

  return { success: true };
}

/**
 * Prune stale worktree references (best-effort, logs errors for debugging).
 */
function pruneWorktrees(projectPath: string): void {
  try {
    execFileSync(getToolPath('git'), ['worktree', 'prune'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 30000
    });
  } catch (e) {
    console.debug('[pruneWorktrees] Prune failed (non-blocking):', e);
  }
}

/**
 * Delete a git branch (best-effort, logs warning on failure).
 */
function deleteBranch(projectPath: string, branch: string): void {
  try {
    execFileSync(getToolPath('git'), ['branch', '-D', branch], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 30000
    });
    console.warn(`[deleteBranch] Branch deleted: ${branch}`);
  } catch {
    console.warn(`[deleteBranch] Could not delete branch ${branch} (may not exist or be checked out elsewhere)`);
  }
}

/**
 * Clean up an orphaned worktree (no valid auto-claude/* branch).
 * This handles the edge case where a PR was merged via GitHub web UI.
 * Returns WorktreeCleanupResult to allow caller to handle failures appropriately.
 */
function cleanupOrphanedWorktree(
  projectPath: string,
  worktreePath: string,
  expectedBranch: string
): WorktreeCleanupResult {
  try {
    // Try git worktree remove first, fall back to direct deletion
    try {
      execFileSync(getToolPath('git'), ['worktree', 'remove', '--force', worktreePath], {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 30000
      });
      console.warn(`[cleanupOrphanedWorktree] Orphaned worktree removed: ${worktreePath}`);
    } catch (gitRemoveError) {
      console.warn(`[cleanupOrphanedWorktree] 'git worktree remove' failed, falling back to directory deletion. Error:`, gitRemoveError);
      try {
        rmSync(worktreePath, { recursive: true, force: true });
        // Verify the directory was actually deleted
        if (!existsSync(worktreePath)) {
          console.warn(`[cleanupOrphanedWorktree] Orphaned worktree directory deleted: ${worktreePath}`);
        } else {
          console.error(`[cleanupOrphanedWorktree] Directory still exists after rmSync: ${worktreePath}`);
          return {
            success: false,
            canSkipCleanup: true,
            worktreePath,
            error: `Failed to delete worktree directory: ${worktreePath}. Files may be in use.`
          };
        }
      } catch (rmError) {
        console.error(`[cleanupOrphanedWorktree] rmSync failed:`, rmError);
        return {
          success: false,
          canSkipCleanup: true,
          worktreePath,
          error: `Cannot delete worktree directory: ${rmError instanceof Error ? rmError.message : String(rmError)}`
        };
      }
    }

    // Directory was successfully removed (all failure paths return early above)
    // Now safe to delete the branch and prune stale worktree references
    deleteBranch(projectPath, expectedBranch);
    pruneWorktrees(projectPath);

    console.warn(`[cleanupOrphanedWorktree] Orphaned worktree cleanup completed`);
    return { success: true };
  } catch (cleanupError) {
    console.error(`[cleanupOrphanedWorktree] Failed to cleanup orphaned worktree:`, cleanupError);
    return {
      success: false,
      canSkipCleanup: true,
      worktreePath,
      error: `Cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
    };
  }
}

/**
 * Clean up a valid worktree with user-confirmed force cleanup.
 * Uses retry logic for Windows file locks.
 */
async function cleanupValidWorktree(
  projectPath: string,
  worktreePath: string,
  branch: string
): Promise<WorktreeCleanupResult> {
  try {
    const result = await removeWorktreeWithRetry(projectPath, worktreePath);
    if (!result.success) {
      return result;
    }

    // Delete the branch
    deleteBranch(projectPath, branch);
    console.warn(`[cleanupValidWorktree] Worktree cleanup completed successfully`);
    return { success: true };
  } catch (cleanupError) {
    return {
      success: false,
      canSkipCleanup: true,
      worktreePath,
      error: `Failed to cleanup worktree: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}\n\nYou can skip cleanup and mark the task as done. The worktree will remain for manual deletion.`
    };
  }
}

function atomicWriteFileSync(filePath: string, content: string): void {
  const tempPath = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tempPath, content, 'utf-8');
    renameSync(tempPath, filePath);
  } catch (error) {
    // Clean up temp file if rename failed
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Safe file read that handles missing files without TOCTOU issues.
 * Returns null if file doesn't exist or can't be read.
 */
function safeReadFileSync(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    // ENOENT (file not found) is expected, other errors should be logged
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error(`[safeReadFileSync] Error reading ${filePath}:`, error);
    }
    return null;
  }
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
 * Helper function to ensure profile manager is initialized.
 * Returns a discriminated union for type-safe error handling.
 *
 * @returns Success with profile manager, or failure with error message
 */
async function ensureProfileManagerInitialized(): Promise<
  | { success: true; profileManager: ClaudeProfileManager }
  | { success: false; error: string }
> {
  try {
    const profileManager = await initializeClaudeProfileManager();
    return { success: true, profileManager };
  } catch (error) {
    console.error('[ensureProfileManagerInitialized] Failed to initialize:', error);
    // Include actual error details for debugging while providing actionable guidance
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to initialize profile manager. Please check file permissions and disk space. (${errorMessage})`
    };
  }
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
    async (_, taskId: string, _options?: TaskStartOptions) => {
      console.warn('[TASK_START] Received request for taskId:', taskId);
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        console.warn('[TASK_START] No main window found');
        return;
      }

      // Ensure profile manager is initialized before checking auth
      // This prevents race condition where auth check runs before profile data loads from disk
      const initResult = await ensureProfileManagerInitialized();
      if (!initResult.success) {
        mainWindow.webContents.send(
          IPC_CHANNELS.TASK_ERROR,
          taskId,
          initResult.error
        );
        return;
      }
      const profileManager = initResult.profileManager;

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
            baseBranch,
            useWorktree: task.metadata?.useWorktree
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
            baseBranch,
            useWorktree: task.metadata?.useWorktree
          }
        );
      }

      // Notify status change IMMEDIATELY (don't wait for file write)
      // This provides instant UI feedback while file persistence happens in background
      const ipcSentAt = Date.now();
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'in_progress'
      );

      const DEBUG = process.env.DEBUG === 'true';
      if (DEBUG) {
        console.log(`[TASK_START] IPC sent immediately for task ${taskId}, deferring file persistence`);
      }

      // CRITICAL: Persist status to implementation_plan.json to prevent status flip-flop
      // When getTasks() is called (on refresh), it reads status from the plan file.
      // Without persisting here, the old status (e.g., 'human_review') would override
      // the in-memory 'in_progress' status, causing the task to flip back and forth.
      // Uses shared utility for consistency with agent-events-handlers.ts
      // NOTE: This is now async and non-blocking for better UI responsiveness
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
      setImmediate(async () => {
        const persistStart = Date.now();
        try {
          const persisted = await persistPlanStatus(planPath, 'in_progress', project.id);
          if (persisted) {
            console.warn('[TASK_START] Updated plan status to: in_progress');
          }
          if (DEBUG) {
            const delay = persistStart - ipcSentAt;
            const duration = Date.now() - persistStart;
            console.log(`[TASK_START] File persistence: delayed ${delay}ms after IPC, completed in ${duration}ms`);
          }
        } catch (err) {
          console.error('[TASK_START] Failed to persist plan status:', err);
        }
      });
      // Note: Plan file may not exist yet for new tasks - that's fine (persistPlanStatus handles ENOENT)
    }
  );

  /**
   * Stop a task
   */
  ipcMain.on(IPC_CHANNELS.TASK_STOP, (_, taskId: string) => {
    const DEBUG = process.env.DEBUG === 'true';

    agentManager.killTask(taskId);
    fileWatcher.unwatch(taskId);

    // Notify status change IMMEDIATELY for instant UI feedback
    const ipcSentAt = Date.now();
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(
        IPC_CHANNELS.TASK_STATUS_CHANGE,
        taskId,
        'backlog'
      );
    }

    if (DEBUG) {
      console.log(`[TASK_STOP] IPC sent immediately for task ${taskId}, deferring file persistence`);
    }

    // Find task and project to update the plan file (async, non-blocking)
    const { task, project } = findTaskAndProject(taskId);

    if (task && project) {
      // Persist status to implementation_plan.json to prevent status flip-flop on refresh
      // Uses shared utility for consistency with agent-events-handlers.ts
      // NOTE: This is now async and non-blocking for better UI responsiveness
      const planPath = getPlanPath(project, task);
      setImmediate(async () => {
        const persistStart = Date.now();
        try {
          const persisted = await persistPlanStatus(planPath, 'backlog', project.id);
          if (persisted) {
            console.warn('[TASK_STOP] Updated plan status to backlog');
          }
          if (DEBUG) {
            const delay = persistStart - ipcSentAt;
            const duration = Date.now() - persistStart;
            console.log(`[TASK_STOP] File persistence: delayed ${delay}ms after IPC, completed in ${duration}ms`);
          }
        } catch (err) {
          console.error('[TASK_STOP] Failed to persist plan status:', err);
        }
      });
      // Note: File not found is expected for tasks without a plan file (persistPlanStatus handles ENOENT)
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
      feedback?: string,
      images?: ImageAttachment[]
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
      const worktreePath = findTaskWorktree(project.path, task.specId);
      const worktreeSpecDir = worktreePath ? path.join(worktreePath, specsBaseDir, task.specId) : null;
      const hasWorktree = worktreePath !== null;

      if (approved) {
        // Write approval to QA report
        const qaReportPath = path.join(specDir, AUTO_BUILD_PATHS.QA_REPORT);
        try {
          writeFileSync(
            qaReportPath,
            `# QA Review\n\nStatus: APPROVED\n\nReviewed at: ${new Date().toISOString()}\n`
          );
        } catch (error) {
          console.error('[TASK_REVIEW] Failed to write QA report:', error);
          return { success: false, error: 'Failed to write QA report file' };
        }

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
          // IMPORTANT: Exclude .auto-claude directory to preserve specs and worktree data
          const cleanResult = spawnSync('git', ['clean', '-fd', '-e', '.auto-claude'], {
            cwd: project.path,
            encoding: 'utf-8',
            stdio: 'pipe'
          });
          if (cleanResult.status === 0) {
            console.log('[TASK_REVIEW] Cleaned untracked files in main (excluding .auto-claude)');
          }

          console.log('[TASK_REVIEW] Main branch restored to pre-merge state');
        }

        // Write feedback for QA fixer - write to WORKTREE spec dir if it exists
        // The QA process runs in the worktree where the build and implementation_plan.json are
        const targetSpecDir = hasWorktree && worktreeSpecDir ? worktreeSpecDir : specDir;
        const fixRequestPath = path.join(targetSpecDir, 'QA_FIX_REQUEST.md');

        console.warn('[TASK_REVIEW] Writing QA fix request to:', fixRequestPath);
        console.warn('[TASK_REVIEW] hasWorktree:', hasWorktree, 'worktreePath:', worktreePath);

        // Process images if provided
        let imageReferences = '';
        if (images && images.length > 0) {
          const imagesDir = path.join(targetSpecDir, 'feedback_images');
          try {
            if (!existsSync(imagesDir)) {
              mkdirSync(imagesDir, { recursive: true });
            }
            const savedImages: string[] = [];
            for (const image of images) {
              try {
                if (!image.data) {
                  console.warn('[TASK_REVIEW] Skipping image with no data:', image.filename);
                  continue;
                }
                // Server-side MIME type validation (defense in depth - frontend also validates)
                // Reject missing mimeType to prevent bypass attacks
                const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'];
                if (!image.mimeType || !ALLOWED_MIME_TYPES.includes(image.mimeType)) {
                  console.warn('[TASK_REVIEW] Skipping image with missing or disallowed MIME type:', image.mimeType);
                  continue;
                }
                // Sanitize filename to prevent path traversal attacks
                const sanitizedFilename = path.basename(image.filename);
                if (!sanitizedFilename || sanitizedFilename === '.' || sanitizedFilename === '..') {
                  console.warn('[TASK_REVIEW] Skipping image with invalid filename:', image.filename);
                  continue;
                }
                // Remove data URL prefix if present (e.g., "data:image/png;base64," or "data:image/svg+xml;base64,")
                const base64Data = image.data.replace(/^data:image\/[^;]+;base64,/, '');
                const imageBuffer = Buffer.from(base64Data, 'base64');
                const imagePath = path.join(imagesDir, sanitizedFilename);
                // Verify the resolved path is within the images directory (defense in depth)
                const resolvedPath = path.resolve(imagePath);
                const resolvedImagesDir = path.resolve(imagesDir);
                if (!resolvedPath.startsWith(resolvedImagesDir + path.sep)) {
                  console.warn('[TASK_REVIEW] Skipping image with path outside target directory:', image.filename);
                  continue;
                }
                writeFileSync(imagePath, imageBuffer);
                savedImages.push(`feedback_images/${sanitizedFilename}`);
                console.log('[TASK_REVIEW] Saved image:', sanitizedFilename);
              } catch (imgError) {
                console.error('[TASK_REVIEW] Failed to save image:', image.filename, imgError);
              }
            }
            if (savedImages.length > 0) {
              imageReferences = '\n\n## Reference Images\n\n' +
                savedImages.map(imgPath => `![Feedback Image](${imgPath})`).join('\n\n');
            }
          } catch (dirError) {
            console.error('[TASK_REVIEW] Failed to create images directory:', dirError);
          }
        }

        try {
          writeFileSync(
            fixRequestPath,
            `# QA Fix Request\n\nStatus: REJECTED\n\n## Feedback\n\n${feedback || 'No feedback provided'}${imageReferences}\n\nCreated at: ${new Date().toISOString()}\n`
          );
        } catch (error) {
          console.error('[TASK_REVIEW] Failed to write QA fix request:', error);
          return { success: false, error: 'Failed to write QA fix request file' };
        }

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
   * Options:
   * - forceCleanup: When setting to 'done' with a worktree present, delete the worktree first
   * - skipCleanup: When setting to 'done', skip worktree cleanup entirely (for when files are locked)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_UPDATE_STATUS,
    async (
      _,
      taskId: string,
      status: TaskStatus,
      options?: { forceCleanup?: boolean; skipCleanup?: boolean }
    ): Promise<IPCResult & { worktreeExists?: boolean; worktreePath?: string; canSkipCleanup?: boolean }> => {
      // Find task and project first (needed for worktree check)
      const { task, project } = findTaskAndProject(taskId);

      if (!task || !project) {
        return { success: false, error: 'Task not found' };
      }

      // Validate status transition - 'done' can only be set through merge handler
      // UNLESS there's no worktree (limbo state - already merged/discarded or failed)
      // OR forceCleanup is requested (user confirmed they want to delete the worktree)
      // OR skipCleanup is requested (user wants to mark done without cleanup)
      // OR the worktree is in an invalid state (orphaned after GitHub PR merge)
      if (status === 'done') {
        // Stop file watcher BEFORE any cleanup operations to release file handles
        // This prevents file-locking issues on Windows where chokidar holds handles open
        fileWatcher.unwatch(taskId);

        // If skipCleanup is requested, skip all worktree operations
        if (options?.skipCleanup) {
          console.warn(`[TASK_UPDATE_STATUS] Skipping worktree cleanup for task ${taskId} (user requested)`);
          // Fall through to status update - don't check or cleanup worktree
        } else {
        // Check if worktree exists (task.specId matches worktree folder name)
        const worktreePath = findTaskWorktree(project.path, task.specId);
        const hasWorktree = worktreePath !== null;

        if (hasWorktree) {
          // Check if the worktree is in a valid git state with an auto-claude/* branch
          const branchResult = getWorktreeBranch(worktreePath);

          if (!branchResult.valid && branchResult.reason === 'git_error') {
            // Git error (transient failure like lock file, disk I/O) - do NOT auto-cleanup
            // This prevents accidentally deleting a valid worktree with uncommitted changes
            console.warn(`[TASK_UPDATE_STATUS] Git error checking worktree for task ${taskId}. Not auto-cleaning to avoid data loss.`);
            return {
              success: false,
              error: `Cannot verify worktree state: ${branchResult.error.message}. Please check if git is working correctly and try again.`
            };
          } else if (!branchResult.valid && branchResult.reason === 'base_branch') {
            // Orphaned worktree (e.g., after GitHub PR merge) - clean up automatically
            console.warn(`[TASK_UPDATE_STATUS] Orphaned worktree detected for task ${taskId} (on base branch ${branchResult.branch}). Auto-cleaning...`);
            const expectedBranch = `auto-claude/${task.specId}`;
            const cleanupResult = cleanupOrphanedWorktree(project.path, worktreePath, expectedBranch);
            if (!cleanupResult.success) {
              // Orphaned cleanup failed - return error so UI can show "Skip Cleanup" option
              // This prevents silent accumulation of orphaned directories that can cause
              // "already exists" errors on future task creations
              console.warn(`[TASK_UPDATE_STATUS] Orphaned worktree cleanup failed: ${cleanupResult.error}`);
              return cleanupResult;
            }
          } else if (branchResult.valid && options?.forceCleanup) {
            // Valid worktree exists and user confirmed cleanup
            console.warn(`[TASK_UPDATE_STATUS] Cleaning up worktree for task ${taskId} (user confirmed)`);
            const cleanupResult = await cleanupValidWorktree(project.path, worktreePath, branchResult.branch);
            if (!cleanupResult.success) {
              return cleanupResult;
            }
          } else if (branchResult.valid) {
            // Valid worktree exists but no forceCleanup - return special response for UI
            console.warn(`[TASK_UPDATE_STATUS] Worktree exists for task ${taskId}. Requesting user confirmation.`);
            return {
              success: false,
              worktreeExists: true,
              worktreePath: worktreePath,
              error: "A worktree still exists for this task. Would you like to delete it and mark the task as complete?"
            };
          }
        } else {
          // No worktree - allow marking as done (limbo state recovery)
          console.warn(`[TASK_UPDATE_STATUS] Allowing status 'done' for task ${taskId} (no worktree found - limbo state)`);
        }
        } // end of else block for !skipCleanup
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
        const persisted = await persistPlanStatus(planPath, status, project.id);

        if (!persisted) {
          // If no implementation plan exists yet, create a basic one
          await createPlanIfNotExists(planPath, task, status);
          // Invalidate cache after creating new plan
          projectStore.invalidateTasksCache(project.id);
        }

        // Auto-stop task when status changes AWAY from 'in_progress' and process IS running
        // This handles the case where user drags a running task back to Planning/backlog
        if (status !== 'in_progress' && agentManager.isRunning(taskId)) {
          console.warn('[TASK_UPDATE_STATUS] Stopping task due to status change away from in_progress:', taskId);
          agentManager.killTask(taskId);
          fileWatcher.unwatch(taskId);
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
          // Ensure profile manager is initialized to prevent race condition
          const initResult = await ensureProfileManagerInitialized();
          if (!initResult.success) {
            if (mainWindow) {
              mainWindow.webContents.send(
                IPC_CHANNELS.TASK_ERROR,
                taskId,
                initResult.error
              );
            }
            return { success: false, error: initResult.error };
          }
          const profileManager = initResult.profileManager;
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
                baseBranch: baseBranchForUpdate,
                useWorktree: task.metadata?.useWorktree
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
                baseBranch: baseBranchForUpdate,
                useWorktree: task.metadata?.useWorktree
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

      // Get the spec directory - use task.specsPath if available (handles worktree vs main)
      // This is critical: task might exist in worktree, and getTasks() prefers worktree version.
      // If we write to main project but task is in worktree, the worktree's old status takes precedence on refresh.
      const specDir = task.specsPath || path.join(
        project.path,
        getSpecsDir(project.autoBuildPath),
        task.specId
      );

      // Update implementation_plan.json
      const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);
      console.log(`[Recovery] Writing to plan file at: ${planPath} (task location: ${task.location || 'main'})`);

      // Also update the OTHER location if task exists in both main and worktree
      // This ensures consistency regardless of which version getTasks() prefers
      const specsBaseDir = getSpecsDir(project.autoBuildPath);
      const mainSpecDir = path.join(project.path, specsBaseDir, task.specId);
      const worktreePath = findTaskWorktree(project.path, task.specId);
      const worktreeSpecDir = worktreePath ? path.join(worktreePath, specsBaseDir, task.specId) : null;

      // Collect all plan file paths that need updating
      const planPathsToUpdate: string[] = [planPath];
      if (mainSpecDir !== specDir && existsSync(path.join(mainSpecDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN))) {
        planPathsToUpdate.push(path.join(mainSpecDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN));
      }
      if (worktreeSpecDir && worktreeSpecDir !== specDir && existsSync(path.join(worktreeSpecDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN))) {
        planPathsToUpdate.push(path.join(worktreeSpecDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN));
      }
      console.log(`[Recovery] Will update ${planPathsToUpdate.length} plan file(s):`, planPathsToUpdate);

      try {
        // Read the plan to analyze subtask progress
        // Using safe read to avoid TOCTOU race conditions
        let plan: Record<string, unknown> | null = null;
        const planContent = safeReadFileSync(planPath);
        if (planContent) {
          try {
            plan = JSON.parse(planContent);
          } catch (parseError) {
            console.error('[Recovery] Failed to parse plan file as JSON:', parseError);
            return {
              success: false,
              error: 'Plan file contains invalid JSON. The file may be corrupted.'
            };
          }
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

            // Write to ALL plan file locations to ensure consistency
            const planContent = JSON.stringify(plan, null, 2);
            let writeSucceededForComplete = false;
            for (const pathToUpdate of planPathsToUpdate) {
              try {
                atomicWriteFileSync(pathToUpdate, planContent);
                console.log(`[Recovery] Successfully wrote to: ${pathToUpdate}`);
                writeSucceededForComplete = true;
              } catch (writeError) {
                console.error(`[Recovery] Failed to write plan file at ${pathToUpdate}:`, writeError);
                // Continue trying other paths
              }
            }

            if (!writeSucceededForComplete) {
              return {
                success: false,
                error: 'Failed to write plan file during recovery (all locations failed)'
              };
            }

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

          // Write to ALL plan file locations to ensure consistency
          const planContent = JSON.stringify(plan, null, 2);
          let writeSucceeded = false;
          for (const pathToUpdate of planPathsToUpdate) {
            try {
              atomicWriteFileSync(pathToUpdate, planContent);
              console.log(`[Recovery] Successfully wrote to: ${pathToUpdate}`);
              writeSucceeded = true;
            } catch (writeError) {
              console.error(`[Recovery] Failed to write plan file at ${pathToUpdate}:`, writeError);
            }
          }
          if (!writeSucceeded) {
            return {
              success: false,
              error: 'Failed to write plan file during recovery'
            };
          }
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
          // Ensure profile manager is initialized to prevent race condition
          const initResult = await ensureProfileManagerInitialized();
          if (!initResult.success) {
            // Recovery succeeded but we can't restart without profile manager
            return {
              success: true,
              data: {
                taskId,
                recovered: true,
                newStatus,
                message: `Task recovered but cannot restart: ${initResult.error}`,
                autoRestarted: false
              }
            };
          }
          const profileManager = initResult.profileManager;
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

            // Update plan status for restart - write to ALL locations
            if (plan) {
              plan.status = 'in_progress';
              plan.planStatus = 'in_progress';
              const restartPlanContent = JSON.stringify(plan, null, 2);
              for (const pathToUpdate of planPathsToUpdate) {
                try {
                  atomicWriteFileSync(pathToUpdate, restartPlanContent);
                  console.log(`[Recovery] Wrote restart status to: ${pathToUpdate}`);
                } catch (writeError) {
                  console.error(`[Recovery] Failed to write plan file for restart at ${pathToUpdate}:`, writeError);
                  // Continue with restart attempt even if file write fails
                  // The plan status will be updated by the agent when it starts
                }
              }
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
                  baseBranch: baseBranchForRecovery,
                  useWorktree: task.metadata?.useWorktree
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
}
