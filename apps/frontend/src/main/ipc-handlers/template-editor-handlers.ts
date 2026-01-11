import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { templateEditorService } from '../template-editor-service';

/**
 * Register all template editor IPC handlers
 */
export function registerTemplateEditorHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Forward template editor events to renderer
  templateEditorService.on('status', (templateId: string, status: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('template-editor:status', templateId, status);
    }
  });

  templateEditorService.on('stream-chunk', (templateId: string, chunk: any) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('template-editor:stream-chunk', templateId, chunk);
    }
  });

  templateEditorService.on('error', (templateId: string, error: string) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('template-editor:error', templateId, error);
    }
  });

  // Initialize template editor with API key
  ipcMain.handle(
    'template-editor:initialize',
    async (_, apiKey: string): Promise<IPCResult> => {
      try {
        templateEditorService.initialize(apiKey);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to initialize template editor'
        };
      }
    }
  );

  // Check if template editor is initialized
  ipcMain.handle(
    'template-editor:check-initialized',
    async (): Promise<IPCResult<boolean>> => {
      return {
        success: true,
        data: templateEditorService.isInitialized()
      };
    }
  );

  // Send message to template editor
  ipcMain.handle(
    'template-editor:send-message',
    async (
      _,
      templateId: string,
      templatePath: string,
      message: string
    ): Promise<IPCResult> => {
      try {
        if (!templateEditorService.isInitialized()) {
          return {
            success: false,
            error: 'Template editor not initialized. Please configure your Anthropic API key in settings.'
          };
        }

        await templateEditorService.sendMessage(templateId, templatePath, message);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to send message'
        };
      }
    }
  );

  // Clear conversation history
  ipcMain.handle(
    'template-editor:clear-history',
    async (_, templateId: string): Promise<IPCResult> => {
      try {
        templateEditorService.clearHistory(templateId);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to clear history'
        };
      }
    }
  );
}
