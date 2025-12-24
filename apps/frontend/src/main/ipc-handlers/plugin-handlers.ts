/**
 * Plugin Handlers
 *
 * IPC handlers for plugin operations including:
 * - Listing installed plugins
 * - Installing plugins from GitHub or local paths
 * - Uninstalling plugins
 * - Checking for updates
 */

import { ipcMain } from 'electron';
import path from 'path';
import type { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  IPCResult,
  Plugin,
  PluginInstallOptions,
  PluginInstallResult,
  PluginInstallProgress,
  PluginUpdateCheck,
  PluginUpdateOptions,
  PluginUpdateResult,
  PluginBackup,
  GitHubTokenValidation,
  GitHubRepoAccess,
  GitAvailability
} from '../../shared/types';
import { getPluginManager } from '../plugin/PluginManager';
import { getGitHubAuth } from '../plugin/GitHubAuth';
import { getUpdateEngine } from '../plugin/UpdateEngine';

/**
 * Register all plugin-related IPC handlers
 *
 * @param getMainWindow - Function that returns the main BrowserWindow instance
 */
export function registerPluginHandlers(
  getMainWindow: () => BrowserWindow | null
): void {
  const pluginManager = getPluginManager();
  const gitHubAuth = getGitHubAuth();

  // ============================================
  // Plugin List Operations
  // ============================================

  /**
   * Get list of all installed plugins
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_LIST,
    async (): Promise<IPCResult<Plugin[]>> => {
      try {
        // Ensure plugin manager is initialized
        if (!pluginManager.isInitialized()) {
          await pluginManager.initialize();
        }

        const plugins = pluginManager.getPlugins();
        return { success: true, data: plugins };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to list plugins:', message);
        return { success: false, error: message };
      }
    }
  );

  // ============================================
  // Plugin Installation
  // ============================================

  /**
   * Install a plugin from GitHub or local path.
   * Returns PluginInstallResult directly (not wrapped in IPCResult).
   * Progress updates are sent via PLUGIN_INSTALL_PROGRESS events.
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_INSTALL,
    async (_, options: PluginInstallOptions): Promise<PluginInstallResult> => {
      try {
        const mainWindow = getMainWindow();
        const { source, sourceType, token } = options;

        // Set up progress reporting
        const reportProgress = (progress: PluginInstallProgress): void => {
          if (mainWindow) {
            mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, progress);
          }
        };

        if (sourceType === 'github') {
          // Check git availability first
          const gitAvailability = await gitHubAuth.checkGitAvailability();
          if (!gitAvailability.available || !gitAvailability.meetsMinimum) {
            return {
              success: false,
              error: gitAvailability.error || 'Git is not available'
            };
          }

          // Validate GitHub URL
          const parsed = gitHubAuth.parseGitHubUrl(source);
          if (!parsed) {
            return {
              success: false,
              error: 'Invalid GitHub URL format. Expected: https://github.com/owner/repo or git@github.com:owner/repo.git'
            };
          }

          // Validate token if provided
          if (token) {
            reportProgress({
              stage: 'validating',
              percent: 5,
              message: 'Validating GitHub token...'
            });

            const tokenValidation = await gitHubAuth.validateToken(token);
            if (!tokenValidation.valid) {
              return {
                success: false,
                error: tokenValidation.error || 'Invalid GitHub token'
              };
            }

            // Check repository access
            const repoAccess = await gitHubAuth.checkRepoAccess(token, parsed.owner, parsed.repo);
            if (!repoAccess.hasAccess) {
              return {
                success: false,
                error: repoAccess.error || 'Cannot access repository'
              };
            }
          }

          // Set up progress callback for clone operation
          gitHubAuth.setProgressCallback(reportProgress);

          // Clone the repository
          const pluginsDir = pluginManager.getPluginsDir();
          const repoName = parsed.repo.replace(/\.git$/, '');
          const localPath = path.join(pluginsDir, repoName);

          const cloneResult = await gitHubAuth.clonePrivateRepo(
            source,
            token || '',
            localPath
          );

          if (!cloneResult.success) {
            return {
              success: false,
              error: cloneResult.error || 'Failed to clone repository'
            };
          }

          // Register the cloned plugin
          reportProgress({
            stage: 'registering',
            percent: 90,
            message: 'Registering plugin...'
          });

          const result = await pluginManager.registerClonedPlugin(
            cloneResult.path,
            source,
            'github'
          );

          if (result.success) {
            reportProgress({
              stage: 'complete',
              percent: 100,
              message: 'Plugin installed successfully'
            });
          }

          return result;
        } else {
          // Local path installation
          reportProgress({
            stage: 'validating',
            percent: 10,
            message: 'Validating local path...'
          });

          reportProgress({
            stage: 'copying',
            percent: 50,
            message: 'Copying plugin files...'
          });

          // Register from local path (creates a copy by default)
          const result = await pluginManager.registerLocalPlugin(source, false);

          if (result.success) {
            reportProgress({
              stage: 'complete',
              percent: 100,
              message: 'Plugin installed successfully'
            });
          } else {
            reportProgress({
              stage: 'error',
              percent: 0,
              message: result.error || 'Installation failed'
            });
          }

          return result;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to install plugin:', message);

        // Report error
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, {
            stage: 'error',
            percent: 0,
            message
          } as PluginInstallProgress);
        }

        return {
          success: false,
          error: message
        };
      }
    }
  );

  // ============================================
  // Plugin Uninstallation
  // ============================================

  /**
   * Uninstall a plugin
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_UNINSTALL,
    async (_, pluginId: string): Promise<IPCResult<boolean>> => {
      try {
        const success = await pluginManager.unregisterPlugin(pluginId);
        if (success) {
          return { success: true, data: true };
        }
        return { success: false, error: 'Failed to uninstall plugin' };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to uninstall plugin:', message);
        return { success: false, error: message };
      }
    }
  );

  // ============================================
  // Plugin Updates
  // ============================================

  /**
   * Check for plugin updates
   * Uses UpdateEngine to fetch latest from remote and detect conflicts
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_CHECK_UPDATES,
    async (_, pluginId: string, token?: string): Promise<IPCResult<PluginUpdateCheck>> => {
      try {
        const plugin = pluginManager.getPlugin(pluginId);
        if (!plugin) {
          return { success: false, error: 'Plugin not found' };
        }

        // Only GitHub plugins support update checking
        if (plugin.sourceType !== 'github') {
          return {
            success: true,
            data: {
              pluginId: plugin.id,
              hasUpdate: false,
              currentVersion: plugin.version,
              categories: [],
              summary: {
                totalFiles: 0,
                addedFiles: 0,
                modifiedFiles: 0,
                deletedFiles: 0,
                conflictFiles: 0
              },
              error: 'Only GitHub plugins support update checking'
            }
          };
        }

        // Use UpdateEngine to check for updates
        const updateEngine = getUpdateEngine();
        const updateCheck = await updateEngine.checkForUpdates(pluginId, token);

        return { success: true, data: updateCheck };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to check updates:', message);
        return { success: false, error: message };
      }
    }
  );

  /**
   * Apply selected plugin updates with optional backup
   * Uses UpdateEngine for safe update application with rollback capability
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_APPLY_UPDATES,
    async (_, options: PluginUpdateOptions): Promise<IPCResult<PluginUpdateResult>> => {
      try {
        const plugin = pluginManager.getPlugin(options.pluginId);
        if (!plugin) {
          return { success: false, error: 'Plugin not found' };
        }

        // Use UpdateEngine to apply updates
        const updateEngine = getUpdateEngine();
        const result = await updateEngine.applyUpdates(options);

        // If update succeeded, refresh the plugin list to get updated metadata
        if (result.success) {
          await pluginManager.refresh();
        }

        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to apply updates:', message);
        return { success: false, error: message };
      }
    }
  );

  // ============================================
  // GitHub Validation Helpers
  // ============================================

  /**
   * Validate a GitHub token
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_VALIDATE_GITHUB_TOKEN,
    async (_, token: string): Promise<GitHubTokenValidation> => {
      try {
        const result = await gitHubAuth.validateToken(token);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { valid: false, error: message };
      }
    }
  );

  /**
   * Check GitHub repository access
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_CHECK_GITHUB_REPO_ACCESS,
    async (_, owner: string, repo: string, token?: string): Promise<GitHubRepoAccess> => {
      try {
        const result = await gitHubAuth.checkRepoAccess(token || '', owner, repo);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { hasAccess: false, owner, repo, isPrivate: false, error: message };
      }
    }
  );

  /**
   * Check git availability
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_CHECK_GIT_AVAILABILITY,
    async (): Promise<GitAvailability> => {
      try {
        const result = await gitHubAuth.checkGitAvailability();
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { available: false, meetsMinimum: false, minimumRequired: '2.1.0', error: message };
      }
    }
  );

  // ============================================
  // Plugin File Diff Operations
  // ============================================

  /**
   * Get unified diff for a specific file in a plugin update
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_GET_FILE_DIFF,
    async (_, pluginId: string, filePath: string): Promise<IPCResult<string | null>> => {
      try {
        const updateEngine = getUpdateEngine();
        const diff = await updateEngine.getFileDiff(pluginId, filePath);
        return { success: true, data: diff ?? null };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to get file diff:', message);
        return { success: false, error: message };
      }
    }
  );

  // ============================================
  // Plugin Backup & Rollback Operations
  // ============================================

  /**
   * List available backups for a plugin
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_LIST_BACKUPS,
    async (_, pluginId: string): Promise<IPCResult<PluginBackup[]>> => {
      try {
        const updateEngine = getUpdateEngine();
        const backups = updateEngine.listBackups(pluginId);
        return { success: true, data: backups };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to list backups:', message);
        return { success: false, error: message };
      }
    }
  );

  /**
   * Rollback a plugin to a previous backup
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_ROLLBACK,
    async (_, pluginId: string, backupPath: string): Promise<IPCResult<PluginUpdateResult>> => {
      try {
        const updateEngine = getUpdateEngine();
        const result = await updateEngine.rollback(pluginId, backupPath);

        // If rollback succeeded, refresh the plugin list to get restored metadata
        if (result.success) {
          await pluginManager.refresh();
        }

        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to rollback plugin:', message);
        return { success: false, error: message };
      }
    }
  );

  console.warn('[plugin-handlers] All handlers registered successfully');
}
