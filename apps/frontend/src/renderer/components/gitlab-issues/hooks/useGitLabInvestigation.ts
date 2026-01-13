import { useEffect, useCallback } from 'react';
import { useGitLabStore, investigateGitLabIssue } from '../../../stores/gitlab-store';
import { loadTasks } from '../../../stores/task-store';
import type { GitLabIssue } from '../../../../shared/types';

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
