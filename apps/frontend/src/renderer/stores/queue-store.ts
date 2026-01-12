/**
 * Queue Store - Task queueing state management
 *
 * Manages the automatic task queueing feature that allows tasks to be
 * automatically started from Planning to In Progress when slots are available.
 *
 * Queue Configuration:
 * - enabled: Whether auto-start is enabled for the project
 * - maxConcurrent: Maximum number of tasks allowed in In Progress (1-3)
 * - runningCount: Current number of tasks in In Progress
 *
 * The queue automatically starts the next backlog task when a task completes
 * and the running count is below maxConcurrent.
 */

import { create } from 'zustand';
import type { QueueConfig, QueueStatus } from '../../shared/types';
import { debugLog, debugError } from '../../shared/utils/debug-logger';

interface QueueState {
  /** Map of projectId to queue config */
  configs: Record<string, QueueConfig>;
  /** Current status for each project */
  statuses: Record<string, QueueStatus>;

  // Actions
  setQueueConfig: (projectId: string, config: QueueConfig) => void;
  getQueueConfig: (projectId: string) => QueueConfig | undefined;
  setQueueStatus: (projectId: string, status: QueueStatus) => void;
  getQueueStatus: (projectId: string) => QueueStatus | undefined;
  updateRunningCount: (projectId: string, count: number) => void;
  updateBacklogCount: (projectId: string, count: number) => void;
  clearProject: (projectId: string) => void;
}

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  enabled: false,
  maxConcurrent: 1
};

/**
 * Create the queue store
 */
export const useQueueStore = create<QueueState>((set, get) => ({
  configs: {},
  statuses: {},

  setQueueConfig: (projectId, config) =>
    set((state) => ({
      configs: {
        ...state.configs,
        [projectId]: config
      }
    })),

  getQueueConfig: (projectId) => {
    return get().configs[projectId];
  },

  setQueueStatus: (projectId, status) =>
    set((state) => ({
      statuses: {
        ...state.statuses,
        [projectId]: status
      }
    })),

  getQueueStatus: (projectId) => {
    return get().statuses[projectId];
  },

  updateRunningCount: (projectId, count) =>
    set((state) => {
      const currentStatus = state.statuses[projectId];
      if (!currentStatus) {
        debugLog('[QueueStore] updateRunningCount called for unknown projectId:', projectId);
        return state;
      }

      return {
        statuses: {
          ...state.statuses,
          [projectId]: {
            ...currentStatus,
            runningCount: count
          }
        }
      };
    }),

  updateBacklogCount: (projectId, count) =>
    set((state) => {
      const currentStatus = state.statuses[projectId];
      if (!currentStatus) {
        debugLog('[QueueStore] updateBacklogCount called for unknown projectId:', projectId);
        return state;
      }

      return {
        statuses: {
          ...state.statuses,
          [projectId]: {
            ...currentStatus,
            backlogCount: count
          }
        }
      };
    }),

  clearProject: (projectId) =>
    set((state) => {
      const newConfigs = { ...state.configs };
      const newStatuses = { ...state.statuses };
      delete newConfigs[projectId];
      delete newStatuses[projectId];
      return { configs: newConfigs, statuses: newStatuses };
    })
}));

/**
 * Load queue configuration for a project
 */
export async function loadQueueConfig(projectId: string): Promise<QueueConfig | null> {
  try {
    const result = await window.electronAPI.getQueueConfig(projectId);
    if (result.success && result.data) {
      const store = useQueueStore.getState();
      store.setQueueConfig(projectId, result.data);
      return result.data;
    }
    return null;
  } catch (error) {
    debugError('[QueueStore] Failed to load queue config:', error);
    return null;
  }
}

/**
 * Save queue configuration for a project
 */
export async function saveQueueConfig(projectId: string, config: QueueConfig): Promise<boolean> {
  try {
    const result = await window.electronAPI.setQueueConfig(projectId, config);
    if (result.success) {
      const store = useQueueStore.getState();
      store.setQueueConfig(projectId, config);
      return true;
    }
    return false;
  } catch (error) {
    debugError('[QueueStore] Failed to save queue config:', error);
    return false;
  }
}

/**
 * Fetch current queue status for a project via IPC
 */
export async function fetchQueueStatus(projectId: string): Promise<QueueStatus | null> {
  try {
    const result = await window.electronAPI.getQueueStatus(projectId);
    if (result.success && result.data) {
      const store = useQueueStore.getState();
      store.setQueueStatus(projectId, result.data);
      return result.data;
    }
    return null;
  } catch (error) {
    debugError('[QueueStore] Failed to get queue status:', error);
    return null;
  }
}
