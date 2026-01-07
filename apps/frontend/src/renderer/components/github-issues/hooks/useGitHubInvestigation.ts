import { useEffect, useCallback } from 'react';
import {
  useInvestigationStore,
  useIssuesStore,
  investigateGitHubIssue
} from '../../../stores/github';
import { loadTasks } from '../../../stores/task-store';
import type { GitHubIssue } from '../../../../shared/types';

export function useGitHubInvestigation(projectId: string | undefined) {
  const {
    investigationStatus,
    lastInvestigationResult,
    setInvestigationStatus,
    setInvestigationResult
  } = useInvestigationStore();

  const { setError } = useIssuesStore();

  // Set up event listeners for investigation progress
  useEffect(() => {
    if (!projectId) return;

    const cleanupProgress = window.electronAPI.onGitHubInvestigationProgress(
      (eventProjectId, status) => {
        if (eventProjectId === projectId) {
          setInvestigationStatus(status);
        }
      }
    );

    const cleanupComplete = window.electronAPI.onGitHubInvestigationComplete(
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

    const cleanupError = window.electronAPI.onGitHubInvestigationError(
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

  const startInvestigation = useCallback((issue: GitHubIssue, selectedCommentIds: number[]) => {
    if (projectId) {
      investigateGitHubIssue(projectId, issue.number, selectedCommentIds);
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
