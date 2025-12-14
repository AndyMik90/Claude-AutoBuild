/**
 * Shared progress calculation utilities
 * Used by both main and renderer processes
 */
import type { Subtask, SubtaskStatus } from './types';

/**
 * Calculate progress percentage from subtasks
 * @param subtasks Array of subtasks with status
 * @returns Progress percentage (0-100)
 */
export function calculateProgress(subtasks: { status: string }[]): number {
  if (subtasks.length === 0) return 0;
  const completed = subtasks.filter((c) => c.status === 'completed').length;
  return Math.round((completed / subtasks.length) * 100);
}

/**
 * Count subtasks by status
 * @param subtasks Array of subtasks
 * @returns Object with counts per status
 */
export function countSubtasksByStatus(subtasks: Subtask[]): Record<SubtaskStatus, number> {
  return {
    pending: subtasks.filter((c) => c.status === 'pending').length,
    in_progress: subtasks.filter((c) => c.status === 'in_progress').length,
    completed: subtasks.filter((c) => c.status === 'completed').length,
    failed: subtasks.filter((c) => c.status === 'failed').length
  };
}

/**
 * Determine overall status from subtask statuses
 * @param subtasks Array of subtasks
 * @returns Overall status string
 */
export function determineOverallStatus(
  subtasks: { status: string }[]
): 'not_started' | 'in_progress' | 'completed' | 'failed' {
  if (subtasks.length === 0) return 'not_started';

  const hasCompleted = subtasks.some((c) => c.status === 'completed');
  const hasFailed = subtasks.some((c) => c.status === 'failed');
  const hasInProgress = subtasks.some((c) => c.status === 'in_progress');
  const allCompleted = subtasks.every((c) => c.status === 'completed');
  const allPending = subtasks.every((c) => c.status === 'pending');

  if (allCompleted) return 'completed';
  if (hasFailed) return 'failed';
  if (hasInProgress || hasCompleted) return 'in_progress';
  if (allPending) return 'not_started';

  return 'in_progress';
}

/**
 * Format progress as display string
 * @param completed Number of completed subtasks
 * @param total Total number of subtasks
 * @returns Formatted string like "3/5 subtasks"
 */
export function formatProgressString(completed: number, total: number): string {
  if (total === 0) return 'No subtasks';
  return `${completed}/${total} subtasks`;
}

/**
 * Calculate estimated remaining time based on progress
 * @param startTime Start time of the task
 * @param progress Current progress percentage (0-100)
 * @returns Estimated remaining time in milliseconds, or null if cannot estimate
 */
export function estimateRemainingTime(
  startTime: Date,
  progress: number
): number | null {
  if (progress <= 0 || progress >= 100) return null;

  const elapsed = Date.now() - startTime.getTime();
  const estimatedTotal = (elapsed / progress) * 100;
  const remaining = estimatedTotal - elapsed;

  return Math.max(0, Math.round(remaining));
}
