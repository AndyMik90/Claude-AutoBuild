/**
 * Queue IPC Handlers
 *
 * Handles IPC communication for queue configuration and status operations.
 * These handlers bridge the renderer process queue store with the main process
 * TaskQueueManager.
 */

import { ipcMain } from 'electron';
import { TaskQueueManager } from '../task-queue-manager';
import { projectStore } from '../project-store';
import { QUEUE_MIN_CONCURRENT, QUEUE_MAX_CONCURRENT } from '../../shared/constants/task';
import type { QueueConfig, QueueStatus } from '../../shared/types';

/**
 * Register queue-related IPC handlers
 */
export function registerQueueHandlers(taskQueueManager: TaskQueueManager): void {
  console.log('[IPC] Registering queue handlers...');
  /**
   * Get queue configuration for a project
   */
  ipcMain.handle('getQueueConfig', async (_event, projectId: string) => {
    try {
      const project = projectStore.getProject(projectId);
      if (!project?.settings.queueConfig) {
        return {
          success: true,
          data: { enabled: false, maxConcurrent: QUEUE_MIN_CONCURRENT }
        };
      }
      return {
        success: true,
        data: project.settings.queueConfig
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get queue config'
      };
    }
  });

  /**
   * Set queue configuration for a project
   */
  ipcMain.handle('setQueueConfig', async (_event, projectId: string, config: QueueConfig) => {
    try {
      const project = projectStore.getProject(projectId);
      if (!project) {
        return {
          success: false,
          error: 'Project not found'
        };
      }

      // Validate maxConcurrent is between MIN and MAX
      if (config.maxConcurrent < QUEUE_MIN_CONCURRENT || config.maxConcurrent > QUEUE_MAX_CONCURRENT) {
        return {
          success: false,
          error: `maxConcurrent must be between ${QUEUE_MIN_CONCURRENT} and ${QUEUE_MAX_CONCURRENT}`
        };
      }

      // Update project settings
      projectStore.updateProjectSettings(projectId, {
        queueConfig: config
      });

      // Trigger queue if enabled (starts tasks from backlog)
      if (config.enabled) {
        // Trigger asynchronously, don't wait for it
        taskQueueManager.triggerQueue(projectId).catch((error) => {
          console.error('[IPC] Failed to trigger queue:', error);
        });
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set queue config'
      };
    }
  });

  /**
   * Get queue status for a project (includes running/backlog counts)
   */
  ipcMain.handle('getQueueStatus', async (_event, projectId: string) => {
    try {
      const status = taskQueueManager.getQueueStatus(projectId);
      return {
        success: true,
        data: status
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get queue status'
      };
    }
  });

  console.log('[IPC] Queue handlers registered successfully');
}
