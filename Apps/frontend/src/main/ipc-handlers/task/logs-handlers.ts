import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, getSpecsDir } from '../../../shared/constants';
import type { IPCResult, TaskLogs, TaskLogStreamChunk } from '../../../shared/types';
import path from 'path';
import { existsSync } from 'fs';
import { projectStore } from '../../project-store';
import { taskLogService } from '../../task-log-service';

/**
 * Register task logs handlers
 */
export function registerTaskLogsHandlers(getMainWindow: () => BrowserWindow | null): void {
  /**
   * Get task logs from spec directory
   * Returns logs organized by phase (planning, coding, validation)
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LOGS_GET,
    async (_, projectId: string, specId: string): Promise<IPCResult<TaskLogs | null>> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const specsRelPath = getSpecsDir(project.autoBuildPath);
        const specDir = path.join(project.path, specsRelPath, specId);

        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        const logs = taskLogService.loadLogs(specDir, project.path, specsRelPath, specId);
        return { success: true, data: logs };
      } catch (error) {
        console.error('Failed to get task logs:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get task logs'
        };
      }
    }
  );

  /**
   * Start watching a spec for log changes
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LOGS_WATCH,
    async (_, projectId: string, specId: string): Promise<IPCResult> => {
      try {
        const project = projectStore.getProject(projectId);
        if (!project) {
          return { success: false, error: 'Project not found' };
        }

        const specsRelPath = getSpecsDir(project.autoBuildPath);
        const specDir = path.join(project.path, specsRelPath, specId);

        if (!existsSync(specDir)) {
          return { success: false, error: 'Spec directory not found' };
        }

        taskLogService.startWatching(specId, specDir, project.path, specsRelPath);
        return { success: true };
      } catch (error) {
        console.error('Failed to start watching task logs:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start watching'
        };
      }
    }
  );

  /**
   * Stop watching a spec for log changes
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_LOGS_UNWATCH,
    async (_, specId: string): Promise<IPCResult> => {
      try {
        taskLogService.stopWatching(specId);
        return { success: true };
      } catch (error) {
        console.error('Failed to stop watching task logs:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to stop watching'
        };
      }
    }
  );

  /**
   * Setup task log service event forwarding to renderer
   */
  taskLogService.on('logs-changed', (specId: string, logs: TaskLogs) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOGS_CHANGED, specId, logs);
    }
  });

  taskLogService.on('stream-chunk', (specId: string, chunk: TaskLogStreamChunk) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.TASK_LOGS_STREAM, specId, chunk);
    }
  });
}
