/**
 * Task metadata handlers
 *
 * Handles reading and writing task_metadata.json files for per-task configuration
 */
import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IPC_CHANNELS } from '../../../shared/constants/ipc';
import type { IPCResult } from '../../../shared/types/ipc';
import { findTaskAndProject, getSpecDir } from './shared';

/**
 * Register task metadata IPC handlers
 */
export function registerTaskMetadataHandlers(): void {
  // Get task metadata
  ipcMain.handle(
    IPC_CHANNELS.TASK_GET_METADATA,
    async (_event, taskId: string): Promise<IPCResult<any>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task) {
          return { success: false, error: 'Task not found' };
        }

        const specDir = getSpecDir(task, project);
        const metadataPath = path.join(specDir, 'task_metadata.json');

        // Check if file exists and read metadata
        let metadata: any;
        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          metadata = JSON.parse(metadataContent);
        } catch (err: any) {
          if (err.code === 'ENOENT') {
            // Return empty metadata if file doesn't exist
            return {
              success: true,
              data: {
                sourceType: 'manual',
                category: task.category || 'feature'
              }
            };
          }
          throw err;
        }

        return {
          success: true,
          data: metadata
        };
      } catch (error) {
        console.error('[TASK_GET_METADATA] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read task metadata'
        };
      }
    }
  );

  // Update task metadata
  ipcMain.handle(
    IPC_CHANNELS.TASK_UPDATE_METADATA,
    async (_event, taskId: string, metadata: any): Promise<IPCResult<void>> => {
      try {
        const { task, project } = findTaskAndProject(taskId);
        if (!task) {
          return { success: false, error: 'Task not found' };
        }

        const specDir = getSpecDir(task, project);
        const metadataPath = path.join(specDir, 'task_metadata.json');

        // Ensure directory exists
        await fs.mkdir(specDir, { recursive: true });

        // Write metadata
        await fs.writeFile(
          metadataPath,
          JSON.stringify(metadata, null, 2),
          'utf-8'
        );

        console.log('[TASK_UPDATE_METADATA] Updated metadata for task:', taskId);

        return { success: true };
      } catch (error) {
        console.error('[TASK_UPDATE_METADATA] Error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to write task metadata'
        };
      }
    }
  );
}
