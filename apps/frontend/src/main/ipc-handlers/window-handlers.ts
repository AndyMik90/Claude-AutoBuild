import { ipcMain, BrowserWindow } from 'electron';
import { getWindowManager } from '../index';
import { IPC_CHANNELS } from '../../shared/constants/ipc';

/**
 * Register IPC handlers for window management operations
 * Handles detaching/reattaching projects to/from windows
 */
export function registerWindowHandlers(): void {
  /**
   * Detach a project to a new dedicated window
   */
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_DETACH_PROJECT,
    async (
      _event,
      projectId: string,
      position?: { x: number; y: number }
    ): Promise<{ windowId: string; bounds: Electron.Rectangle }> => {
      console.log(`[window-handlers] Detaching project: ${projectId}`);

      const windowManager = getWindowManager();
      const projectWindow = windowManager.createProjectWindow(projectId, position);

      // Broadcast state change to all windows
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(
          IPC_CHANNELS.WINDOW_PROJECT_DETACHED,
          projectId,
          projectWindow.id.toString()
        );
      });

      return {
        windowId: projectWindow.id.toString(),
        bounds: projectWindow.getBounds()
      };
    }
  );

  /**
   * Reattach a project back to the main window
   */
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_REATTACH_PROJECT,
    async (_event, projectId: string): Promise<{ success: boolean }> => {
      console.log(`[window-handlers] Reattaching project: ${projectId}`);

      const windowManager = getWindowManager();
      const projectWindow = windowManager.getProjectWindow(projectId);

      console.log(`[window-handlers] Project window found:`, projectWindow ? 'yes' : 'no');

      if (projectWindow && !projectWindow.isDestroyed()) {
        console.log(`[window-handlers] Closing project window`);
        projectWindow.close();
      } else {
        console.warn(`[window-handlers] Project window not found or already destroyed`);
      }

      // Broadcast to all windows
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send(IPC_CHANNELS.WINDOW_PROJECT_REATTACHED, projectId);
      });

      // Focus main window after reattaching
      const mainWindow = windowManager.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
      }

      return { success: true };
    }
  );

  /**
   * Get the current window context (main vs project window)
   */
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_GET_CONTEXT,
    async (event): Promise<{
      type: 'main' | 'project';
      projectId?: string;
      windowId: string;
    }> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return { type: 'main', windowId: '' };
      }

      const windowManager = getWindowManager();
      const windowInfo = windowManager.getWindowById(window.id.toString());

      if (!windowInfo) {
        return { type: 'main', windowId: window.id.toString() };
      }

      return {
        type: windowInfo.type,
        projectId: windowInfo.projectId,
        windowId: windowInfo.id
      };
    }
  );

  /**
   * Get main window bounds (for drag detection)
   */
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_GET_MAIN_BOUNDS,
    async (): Promise<Electron.Rectangle | null> => {
      const windowManager = getWindowManager();
      const mainWindow = windowManager.getMainWindow();

      if (mainWindow && !mainWindow.isDestroyed()) {
        return mainWindow.getBounds();
      }

      return null;
    }
  );

  /**
   * Close a project window
   */
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_CLOSE_PROJECT,
    async (_event, projectId: string): Promise<{ success: boolean }> => {
      console.log(`[window-handlers] Closing project window: ${projectId}`);

      const windowManager = getWindowManager();
      const success = windowManager.closeProjectWindow(projectId);

      return { success };
    }
  );
}
