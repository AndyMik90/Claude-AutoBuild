import { useEffect, useCallback } from 'react';
import { useForgejoStore, investigateForgejoIssue } from '../../../stores/forgejo-store';
import { loadTasks } from '../../../stores/task-store';
import type { ForgejoIssue } from '../../../../shared/types';

export function useForgejoInvestigation(projectId: string | undefined) {
  const {
    investigationStatus,
    lastInvestigationResult,
    setInvestigationStatus,
    setInvestigationResult,
    setError
  } = useForgejoStore();

  // Set up event listeners for investigation progress
  useEffect(() => {
    if (!projectId) return;

    const cleanupProgress = window.electronAPI.forgejo.onForgejoInvestigationProgress(
      (eventProjectId, status) => {
        if (eventProjectId === projectId) {
          setInvestigationStatus(status);
        }
      }
    );

    const cleanupComplete = window.electronAPI.forgejo.onForgejoInvestigationComplete(
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

    const cleanupError = window.electronAPI.forgejo.onForgejoInvestigationError(
      (eventProjectId, data) => {
        if (eventProjectId === projectId) {
          setError(data.error);
          setInvestigationStatus({
            phase: 'error',
            progress: 0,
            message: data.error
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

  const startInvestigation = useCallback((issue: ForgejoIssue, selectedCommentIds: number[]) => {
    if (projectId) {
      // Note: Forgejo investigation doesn't currently support selectedCommentIds in the backend,
      // but we accept them here for API consistency and future implementation
      investigateForgejoIssue(projectId, issue.number);
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
