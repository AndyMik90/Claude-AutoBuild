import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type { IPCResult } from '../../../shared/types';
import { projectStore } from '../../project-store';

/**
 * Register task archive handlers
 */
export function registerTaskArchiveHandlers(): void {
  /**
   * Archive tasks
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_ARCHIVE,
    async (
      _,
      projectId: string,
      taskIds: string[],
      version?: string
    ): Promise<IPCResult<boolean>> => {
      console.warn('[IPC] TASK_ARCHIVE called with projectId:', projectId, 'taskIds:', taskIds);

      const result = projectStore.archiveTasks(projectId, taskIds, version);

      if (result) {
        console.warn('[IPC] TASK_ARCHIVE success');
        return { success: true, data: true };
      } else {
        console.error('[IPC] TASK_ARCHIVE failed');
        return { success: false, error: 'Failed to archive tasks' };
      }
    }
  );

  /**
   * Unarchive tasks
   */
  ipcMain.handle(
    IPC_CHANNELS.TASK_UNARCHIVE,
    async (_, projectId: string, taskIds: string[]): Promise<IPCResult<boolean>> => {
      console.warn('[IPC] TASK_UNARCHIVE called with projectId:', projectId, 'taskIds:', taskIds);

      const result = projectStore.unarchiveTasks(projectId, taskIds);

      if (result) {
        console.warn('[IPC] TASK_UNARCHIVE success');
        return { success: true, data: true };
      } else {
        console.error('[IPC] TASK_UNARCHIVE failed');
        return { success: false, error: 'Failed to unarchive tasks' };
      }
    }
  );
}
