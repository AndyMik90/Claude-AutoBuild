/**
 * Queue API - Queue configuration and status
 */

import { ipcRenderer } from 'electron';
import type { QueueConfig, QueueStatus } from '../../shared/types';

export interface QueueAPI {
  getQueueConfig: (projectId: string) => Promise<{ success: boolean; data?: QueueConfig; error?: string }>;
  setQueueConfig: (projectId: string, config: QueueConfig) => Promise<{ success: boolean; error?: string }>;
  getQueueStatus: (projectId: string) => Promise<{ success: boolean; data?: QueueStatus; error?: string }>;
}

export const createQueueAPI = (): QueueAPI => ({
  getQueueConfig: (projectId: string) => ipcRenderer.invoke('getQueueConfig', projectId),

  setQueueConfig: (projectId: string, config: QueueConfig) =>
    ipcRenderer.invoke('setQueueConfig', projectId, config),

  getQueueStatus: (projectId: string) => ipcRenderer.invoke('getQueueStatus', projectId)
});
