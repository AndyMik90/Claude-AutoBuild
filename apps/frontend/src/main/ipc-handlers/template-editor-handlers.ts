import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, APIProfile, AppSettings } from '../../shared/types';
import { templateEditorService } from '../template-editor-service';
import { loadProfilesFile } from '../utils/profile-manager';
import { readSettingsFile } from '../settings-utils';

/**
 * Get the active API profile or create one from global settings
 * Returns null if no profile or API key is available
 */
async function getActiveProfile(): Promise<APIProfile | null> {
  // Try to get active API profile
  const profilesFile = await loadProfilesFile();
  if (profilesFile.activeProfileId) {
    const activeProfile = profilesFile.profiles.find(p => p.id === profilesFile.activeProfileId);
    if (activeProfile) {
      return activeProfile;
    }
  }

  // Fallback to global Anthropic API key from settings
  const settingsData = readSettingsFile();
  const settings = settingsData as AppSettings | undefined;

  if (settings?.globalAnthropicApiKey) {
    // Create a temporary profile from global settings
    return {
      id: 'temp-anthropic',
      name: 'Default Anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: settings.globalAnthropicApiKey,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  return null;
}

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

  // Check if API profile or API key is available
  ipcMain.handle(
    'template-editor:check-initialized',
    async (): Promise<IPCResult<boolean>> => {
      const profile = await getActiveProfile();
      return {
        success: true,
        data: profile !== null
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
        // Auto-initialize with active profile if not already initialized
        if (!templateEditorService.isInitialized()) {
          const profile = await getActiveProfile();
          if (!profile) {
            return {
              success: false,
              error: 'No API profile configured. Please set up an API profile or add your Anthropic API key in settings.'
            };
          }
          templateEditorService.initialize(profile);
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
