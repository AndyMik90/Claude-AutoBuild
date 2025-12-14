import { useEffect } from 'react';
import { useTaskStore } from '../stores/task-store';
import { useRoadmapStore } from '../stores/roadmap-store';
import { useRateLimitStore } from '../stores/rate-limit-store';
import type { ImplementationPlan, TaskStatus, RoadmapGenerationStatus, Roadmap, ExecutionProgress, RateLimitInfo, SDKRateLimitInfo } from '../../shared/types';

/**
 * Hook to set up IPC event listeners for task updates
 */
export function useIpcListeners(): void {
  const updateTaskFromPlan = useTaskStore((state) => state.updateTaskFromPlan);
  const updateTaskStatus = useTaskStore((state) => state.updateTaskStatus);
  const updateExecutionProgress = useTaskStore((state) => state.updateExecutionProgress);
  const appendLog = useTaskStore((state) => state.appendLog);
  const setError = useTaskStore((state) => state.setError);

  useEffect(() => {
    // Set up listeners
    const cleanupProgress = window.electronAPI.onTaskProgress(
      (taskId: string, plan: ImplementationPlan) => {
        updateTaskFromPlan(taskId, plan);
      }
    );

    const cleanupError = window.electronAPI.onTaskError(
      (taskId: string, error: string) => {
        setError(`Task ${taskId}: ${error}`);
        appendLog(taskId, `[ERROR] ${error}`);
      }
    );

    const cleanupLog = window.electronAPI.onTaskLog(
      (taskId: string, log: string) => {
        appendLog(taskId, log);
      }
    );

    const cleanupStatus = window.electronAPI.onTaskStatusChange(
      (taskId: string, status: TaskStatus) => {
        updateTaskStatus(taskId, status);
      }
    );

    const cleanupExecutionProgress = window.electronAPI.onTaskExecutionProgress(
      (taskId: string, progress: ExecutionProgress) => {
        updateExecutionProgress(taskId, progress);
      }
    );

    // Roadmap event listeners
    const setGenerationStatus = useRoadmapStore.getState().setGenerationStatus;
    const setRoadmap = useRoadmapStore.getState().setRoadmap;

    const cleanupRoadmapProgress = window.electronAPI.onRoadmapProgress(
      (_projectId: string, status: RoadmapGenerationStatus) => {
        setGenerationStatus(status);
      }
    );

    const cleanupRoadmapComplete = window.electronAPI.onRoadmapComplete(
      (_projectId: string, roadmap: Roadmap) => {
        setRoadmap(roadmap);
        setGenerationStatus({
          phase: 'complete',
          progress: 100,
          message: 'Roadmap ready'
        });
      }
    );

    const cleanupRoadmapError = window.electronAPI.onRoadmapError(
      (_projectId: string, error: string) => {
        setGenerationStatus({
          phase: 'error',
          progress: 0,
          message: 'Generation failed',
          error
        });
      }
    );

    // Terminal rate limit listener
    const showRateLimitModal = useRateLimitStore.getState().showRateLimitModal;
    const cleanupRateLimit = window.electronAPI.onTerminalRateLimit(
      (info: RateLimitInfo) => {
        // Convert detectedAt string to Date if needed
        showRateLimitModal({
          ...info,
          detectedAt: typeof info.detectedAt === 'string'
            ? new Date(info.detectedAt)
            : info.detectedAt
        });
      }
    );

    // SDK rate limit listener (for changelog, tasks, roadmap, ideation)
    const showSDKRateLimitModal = useRateLimitStore.getState().showSDKRateLimitModal;
    const cleanupSDKRateLimit = window.electronAPI.onSDKRateLimit(
      (info: SDKRateLimitInfo) => {
        // Convert detectedAt string to Date if needed
        showSDKRateLimitModal({
          ...info,
          detectedAt: typeof info.detectedAt === 'string'
            ? new Date(info.detectedAt)
            : info.detectedAt
        });
      }
    );

    // Cleanup on unmount
    return () => {
      cleanupProgress();
      cleanupError();
      cleanupLog();
      cleanupStatus();
      cleanupExecutionProgress();
      cleanupRoadmapProgress();
      cleanupRoadmapComplete();
      cleanupRoadmapError();
      cleanupRateLimit();
      cleanupSDKRateLimit();
    };
  }, [updateTaskFromPlan, updateTaskStatus, updateExecutionProgress, appendLog, setError]);
}

/**
 * Hook to manage app settings
 */
export function useAppSettings() {
  const getSettings = async () => {
    const result = await window.electronAPI.getSettings();
    if (result.success && result.data) {
      return result.data;
    }
    return null;
  };

  const saveSettings = async (settings: Parameters<typeof window.electronAPI.saveSettings>[0]) => {
    const result = await window.electronAPI.saveSettings(settings);
    return result.success;
  };

  return { getSettings, saveSettings };
}

/**
 * Hook to get the app version
 */
export function useAppVersion() {
  const getVersion = async () => {
    return window.electronAPI.getAppVersion();
  };

  return { getVersion };
}
