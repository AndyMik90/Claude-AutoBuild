/**
 * Task metadata handlers
 *
 * Handles reading and writing task_metadata.json files for per-task configuration
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from '../../../shared/constants/ipc';
import type { IPCResult } from '../../../shared/types/ipc';
import { findTaskAndProject } from './shared';

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

        // Determine the correct spec directory
        let specDir: string;
        if (task.worktreePath) {
          // Task is in worktree - use worktree spec dir
          specDir = path.join(
            task.worktreePath,
            '.auto-claude',
            'specs',
            task.specId
          );
        } else {
          // Task is in main project
          specDir = path.join(
            project.path,
            '.auto-claude',
            'specs',
            task.specId
          );
        }

        const metadataPath = path.join(specDir, 'task_metadata.json');

        // Check if file exists
        if (!fs.existsSync(metadataPath)) {
          // Return empty metadata if file doesn't exist
          return {
            success: true,
            data: {
              sourceType: 'manual',
              category: task.category || 'feature'
            }
          };
        }

        // Read and parse metadata
        const metadataContent = fs.readFileSync(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent);

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

        // Determine the correct spec directory
        let specDir: string;
        if (task.worktreePath) {
          // Task is in worktree - use worktree spec dir
          specDir = path.join(
            task.worktreePath,
            '.auto-claude',
            'specs',
            task.specId
          );
        } else {
          // Task is in main project
          specDir = path.join(
            project.path,
            '.auto-claude',
            'specs',
            task.specId
          );
        }

        const metadataPath = path.join(specDir, 'task_metadata.json');

        // Ensure directory exists
        fs.mkdirSync(specDir, { recursive: true });

        // Write metadata
        fs.writeFileSync(
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
