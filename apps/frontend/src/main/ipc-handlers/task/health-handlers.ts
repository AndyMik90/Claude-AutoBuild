/**
 * Task Health Check IPC Handlers
 *
 * Implements health detection for tasks, identifying issues like:
 * - Stuck tasks (in_progress but no process running)
 * - Failed tasks (error status or failed phase)
 * - Failed subtasks
 * - QA rejected
 * - Missing spec files
 * - Corrupted plan files
 * - No progress
 *
 * See ACS-241: https://linear.app/stillknotknown/issue/ACS-241
 */

import { ipcMain } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS, getSpecsDir } from '../../../shared/constants';
import type {
  IPCResult,
  Task,
  TaskHealthCheckResult,
  HealthIssue,
  RecoveryAction
} from '../../../shared/types';
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { AgentManager } from '../../agent';
import { projectStore } from '../../project-store';

/**
 * Check if task is stuck (in_progress but not running)
 */
function checkStuckTask(task: Task, agentManager: AgentManager): HealthIssue | null {
  // Don't flag as stuck if the task has a failed phase (that's handled by checkFailedTask)
  if (task.status === 'in_progress' &&
      !agentManager.isRunning(task.id) &&
      task.executionProgress?.phase !== 'failed') {
    return {
      type: 'stuck',
      severity: 'error',
      message: 'Task is marked as in_progress but no process is running',
      details: 'The task may have crashed or the process was killed externally'
    };
  }
  return null;
}

/**
 * Check if task has failed status or phase
 */
function checkFailedTask(task: Task): HealthIssue | null {
  // Status is error
  if (task.status === 'error') {
    return {
      type: 'failed',
      severity: 'error',
      message: 'Task execution failed',
      details: task.errorInfo?.key ? `Error: ${task.errorInfo.key}` : undefined
    };
  }

  // Check execution progress for failed phase
  if (task.executionProgress?.phase === 'failed') {
    return {
      type: 'failed',
      severity: 'error',
      message: 'Task execution failed',
      details: task.executionProgress.message || 'Phase failed'
    };
  }

  return null;
}

/**
 * Check for failed subtasks
 */
function checkFailedSubtasks(task: Task): HealthIssue | null {
  const failedSubtasks = task.subtasks?.filter(s => s.status === 'failed') ?? [];

  if (failedSubtasks.length > 0) {
    return {
      type: 'failed_subtasks',
      severity: 'error',
      message: `${failedSubtasks.length} subtask(s) failed`,
      details: failedSubtasks.map(s => s.title).join(', ')
    };
  }

  return null;
}

/**
 * Check if QA rejected the task
 */
function checkQARejected(specDir: string): HealthIssue | null {
  const qaReportPath = path.join(specDir, AUTO_BUILD_PATHS.QA_REPORT);

  if (existsSync(qaReportPath)) {
    try {
      const content = readFileSync(qaReportPath, 'utf-8');
      // Check for rejected status in QA report
      if (content.includes('REJECTED') || content.includes('FAILED')) {
        return {
          type: 'qa_rejected',
          severity: 'warning',
          message: 'QA review rejected the task',
          details: 'See QA_FIX_REQUEST.md for required fixes'
        };
      }
    } catch {
      // Can't read QA report, ignore
    }
  }

  return null;
}

/**
 * Check if spec.md file exists
 */
function checkMissingSpec(specDir: string): HealthIssue | null {
  const specPath = path.join(specDir, AUTO_BUILD_PATHS.SPEC_FILE);

  if (!existsSync(specPath)) {
    return {
      type: 'missing_artifact',
      severity: 'error',
      message: 'spec.md file is missing',
      details: `Expected at: ${specPath}`
    };
  }

  return null;
}

/**
 * Check if implementation plan is corrupted
 */
function checkCorruptedPlan(specDir: string): HealthIssue | null {
  const planPath = path.join(specDir, AUTO_BUILD_PATHS.IMPLEMENTATION_PLAN);

  if (existsSync(planPath)) {
    try {
      const content = readFileSync(planPath, 'utf-8');
      JSON.parse(content); // Will throw if invalid JSON
    } catch {
      return {
        type: 'corrupted',
        severity: 'error',
        message: 'implementation_plan.json exists but contains invalid JSON',
        details: 'File may be corrupted or partially written'
      };
    }
  }

  return null;
}

/**
 * Check if task has no progress despite being in_progress
 */
function checkNoProgress(task: Task): HealthIssue | null {
  if (task.status === 'in_progress' && !task.executionProgress) {
    return {
      type: 'no_progress',
      severity: 'warning',
      message: 'Task is in_progress but has no execution progress data',
      details: 'Task may not have started properly'
    };
  }

  // Check if executionProgress is empty
  if (task.status === 'in_progress' && task.executionProgress) {
    const { phase, overallProgress, currentSubtask, startedAt } = task.executionProgress;
    if (!phase && overallProgress === 0 && !currentSubtask && !startedAt) {
      return {
        type: 'no_progress',
        severity: 'warning',
        message: 'Task is in_progress but execution progress is empty',
        details: 'Task may have stalled during initialization'
      };
    }
  }

  return null;
}

/**
 * Build recovery actions for a task based on its issues
 */
function buildRecoveryActions(task: Task, issues: HealthIssue[]): RecoveryAction[] {
  const actions: RecoveryAction[] = [];
  const hasStuck = issues.some(i => i.type === 'stuck');
  const hasQARejected = issues.some(i => i.type === 'qa_rejected');
  const hasFailed = issues.some(i => i.type === 'failed' || i.type === 'failed_subtasks');
  const hasMissingSpec = issues.some(i => i.type === 'missing_artifact' && i.message.includes('spec.md'));
  const hasCorrupted = issues.some(i => i.type === 'corrupted' || (i.type === 'missing_artifact' && !i.message.includes('spec.md')));

  if (hasStuck) {
    actions.push({
      label: 'Recover',
      actionType: 'recover_stuck',
      variant: 'warning'
    });
  }

  if (hasFailed) {
    actions.push({
      label: 'View Logs',
      actionType: 'view_logs',
      variant: 'outline'
    });
  }

  if (hasQARejected) {
    actions.push({
      label: 'View QA Report',
      actionType: 'view_qa_report',
      variant: 'outline'
    });
  }

  // For missing spec.md, offer to recreate from task context
  if (hasMissingSpec) {
    actions.push({
      label: 'Recreate Spec',
      actionType: 'recreate_spec',
      variant: 'default'
    });
  }

  // For corrupted or other missing artifacts, offer discard
  if (hasCorrupted) {
    actions.push({
      label: 'Discard Task',
      actionType: 'discard_task',
      variant: 'destructive'
    });
  }

  return actions;
}

/**
 * Run all health checks on a task
 */
function runHealthChecks(
  task: Task,
  specDir: string,
  agentManager: AgentManager
): HealthIssue[] {
  const issues: HealthIssue[] = [];

  // Check 1: Failed task (higher priority - check before stuck)
  const failedIssue = checkFailedTask(task);
  if (failedIssue) issues.push(failedIssue);

  // Check 2: Stuck task (in_progress but not running)
  const stuckIssue = checkStuckTask(task, agentManager);
  if (stuckIssue) issues.push(stuckIssue);

  // Check 3: Failed subtasks
  const subtasksIssue = checkFailedSubtasks(task);
  if (subtasksIssue) issues.push(subtasksIssue);

  // Check 4: QA rejected
  const qaIssue = checkQARejected(specDir);
  if (qaIssue) issues.push(qaIssue);

  // Check 5: Missing spec (on-disk check)
  const specIssue = checkMissingSpec(specDir);
  if (specIssue) issues.push(specIssue);

  // Check 6: Corrupted plan (on-disk check)
  const planIssue = checkCorruptedPlan(specDir);
  if (planIssue) issues.push(planIssue);

  // Check 7: No progress
  const progressIssue = checkNoProgress(task);
  if (progressIssue) issues.push(progressIssue);

  return issues;
}

/**
 * Register task health check handlers
 */
export function registerTaskHealthHandlers(agentManager: AgentManager): void {
  /**
   * TASK_HEALTH_CHECK handler
   * Returns unhealthy tasks for a project (issues.length > 0)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_HEALTH_CHECK,
    async (_, projectId: string): Promise<IPCResult<TaskHealthCheckResult[]>> => {
      try {
        const project = projectStore.getProjects().find(p => p.id === projectId);

        if (!project) {
          return {
            success: false,
            error: `Project not found: ${projectId}`
          };
        }

        const tasks = projectStore.getTasks(projectId);
        const specsBaseDir = getSpecsDir(project.autoBuildPath);
        const results: TaskHealthCheckResult[] = [];

        for (const task of tasks) {
          const specDir = path.join(project.path, specsBaseDir, task.specId);
          const issues = runHealthChecks(task, specDir, agentManager);

          // Build recovery actions
          const recoveryActions = buildRecoveryActions(task, issues);

          // Only include unhealthy tasks
          if (issues.length > 0) {
            results.push({
              taskId: task.id,
              title: task.title,
              status: task.status,
              isHealthy: false,
              issues,
              recoveryActions
            });
          }
        }

        return {
          success: true,
          data: results
        };
      } catch (error) {
        console.error('[TASK_HEALTH_CHECK] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Health check failed'
        };
      }
    }
  );
}
