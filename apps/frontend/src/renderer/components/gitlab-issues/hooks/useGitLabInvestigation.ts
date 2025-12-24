import { useEffect, useCallback } from 'react';
import { useGitLabStore, investigateGitLabIssue } from '../../../stores/gitlab-store';
import { loadTasks } from '../../../stores/task-store';
import type { GitLabIssue } from '../../../../shared/types';

/**
 * Manages GitLab issue investigation state and actions for a specific project.
 *
 * Subscribes to investigation progress, completion, and error events scoped to the provided `projectId`,
 * updates the global store with status and results, and exposes functions to start and reset an investigation.
 *
 * @returns An object with:
 *  - `investigationStatus` — the current investigation phase, progress, and message.
 *  - `lastInvestigationResult` — the most recent investigation result object (success, taskId, etc.).
 *  - `startInvestigation` — a function `(issue: GitLabIssue, selectedNoteIds: number[]) => void` that begins an investigation for the given issue.
 *  - `resetInvestigationStatus` — a function `() => void` that resets the investigation status to idle.
 */
export function useGitLabInvestigation(projectId: string | undefined) {
  const {
    investigationStatus,
    lastInvestigationResult,
    setInvestigationStatus,
    setInvestigationResult,
    setError
  } = useGitLabStore();

  // Set up event listeners for investigation progress
  useEffect(() => {
    if (!projectId) return;

    const cleanupProgress = window.electronAPI.onGitLabInvestigationProgress(
      (eventProjectId, status) => {
        if (eventProjectId === projectId) {
          setInvestigationStatus(status);
        }
      }
    );

    const cleanupComplete = window.electronAPI.onGitLabInvestigationComplete(
      (eventProjectId, result) => {
        if (eventProjectId === projectId) {
          setInvestigationResult(result);
          // Refresh the task store so the new task appears on the Kanban board
          if (result.success && result.taskId) {
            loadTasks(projectId);
          }
        }
      }
    );

    const cleanupError = window.electronAPI.onGitLabInvestigationError(
      (eventProjectId, error) => {
        if (eventProjectId === projectId) {
          setError(error);
          setInvestigationStatus({
            phase: 'error',
            progress: 0,
            message: error
          });
        }
      }
    );

    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
    };
  }, [projectId, setInvestigationStatus, setInvestigationResult, setError]);

  const startInvestigation = useCallback((issue: GitLabIssue, selectedNoteIds: number[]) => {
    if (projectId) {
      investigateGitLabIssue(projectId, issue.iid, selectedNoteIds);
    }
  }, [projectId]);

  const resetInvestigationStatus = useCallback(() => {
    setInvestigationStatus({ phase: 'idle', progress: 0, message: '' });
  }, [setInvestigationStatus]);

  return {
    investigationStatus,
    lastInvestigationResult,
    startInvestigation,
    resetInvestigationStatus
  };
}