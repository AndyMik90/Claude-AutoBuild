/**
 * Plugin Handlers
 *
 * IPC handlers for plugin operations including:
 * - Listing installed plugins
 * - Installing plugins from GitHub or local paths
 * - Uninstalling plugins
 * - Checking for updates
 * - Detecting boilerplate projects
 * - Getting plugin context for task creation
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
  BoilerplateDetectionResult,
  PluginContext,
  PluginUpdateCheck,
  PluginUpdateOptions,
  PluginUpdateResult,
  GitHubTokenValidation,
  GitHubRepoAccess,
  GitAvailability
} from '../../shared/types';
import { getPluginManager } from '../plugin/PluginManager';
import { getGitHubAuth } from '../plugin/GitHubAuth';

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
   * Install a plugin from GitHub or local path
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_INSTALL,
    async (_, options: PluginInstallOptions): Promise<IPCResult<PluginInstallResult>> => {
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
              data: {
                success: false,
                error: gitAvailability.error || 'Git is not available'
              }
            };
          }

          // Validate GitHub URL
          const parsed = gitHubAuth.parseGitHubUrl(source);
          if (!parsed) {
            return {
              success: false,
              data: {
                success: false,
                error: 'Invalid GitHub URL format. Expected: https://github.com/owner/repo or git@github.com:owner/repo.git'
              }
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
                data: {
                  success: false,
                  error: tokenValidation.error || 'Invalid GitHub token'
                }
              };
            }

            // Check repository access
            const repoAccess = await gitHubAuth.checkRepoAccess(token, parsed.owner, parsed.repo);
            if (!repoAccess.hasAccess) {
              return {
                success: false,
                data: {
                  success: false,
                  error: repoAccess.error || 'Cannot access repository'
                }
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
              data: {
                success: false,
                error: cloneResult.error || 'Failed to clone repository'
              }
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

          return { success: result.success, data: result };
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

          return { success: result.success, data: result };
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
          data: { success: false, error: message }
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
   * Note: Full implementation of UpdateEngine is in a later subtask
   * For now, this returns a basic check result
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_CHECK_UPDATES,
    async (_, pluginId: string): Promise<IPCResult<PluginUpdateCheck>> => {
      try {
        const plugin = pluginManager.getPlugin(pluginId);
        if (!plugin) {
          return { success: false, error: 'Plugin not found' };
        }

        // Basic update check - full implementation comes in Phase 7
        const updateCheck: PluginUpdateCheck = {
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
          }
        };

        return { success: true, data: updateCheck };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to check updates:', message);
        return { success: false, error: message };
      }
    }
  );

  /**
   * Apply plugin updates
   * Note: Full implementation of UpdateEngine is in a later subtask
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_APPLY_UPDATES,
    async (_, options: PluginUpdateOptions): Promise<IPCResult<PluginUpdateResult>> => {
      try {
        const plugin = pluginManager.getPlugin(options.pluginId);
        if (!plugin) {
          return { success: false, error: 'Plugin not found' };
        }

        // Placeholder - full implementation comes in Phase 7
        const result: PluginUpdateResult = {
          success: true,
          appliedFiles: [],
          skippedFiles: options.selectedFiles
        };

        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to apply updates:', message);
        return { success: false, error: message };
      }
    }
  );

  // ============================================
  // Boilerplate Detection
  // ============================================

  /**
   * Detect if a project is a boilerplate project
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_DETECT_BOILERPLATE,
    async (_, projectPath: string): Promise<IPCResult<BoilerplateDetectionResult>> => {
      try {
        const result = pluginManager.detectBoilerplate(projectPath);
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to detect boilerplate:', message);
        return { success: false, error: message };
      }
    }
  );

  // ============================================
  // Plugin Context
  // ============================================

  /**
   * Get plugin context for task creation
   */
  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_GET_CONTEXT,
    async (_, pluginId: string): Promise<IPCResult<PluginContext | null>> => {
      try {
        const context = pluginManager.getPluginContext(pluginId);
        return { success: true, data: context };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[plugin-handlers] Failed to get plugin context:', message);
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
    'plugin:validateGitHubToken',
    async (_, token: string): Promise<IPCResult<GitHubTokenValidation>> => {
      try {
        const result = await gitHubAuth.validateToken(token);
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  /**
   * Check GitHub repository access
   */
  ipcMain.handle(
    'plugin:checkGitHubRepoAccess',
    async (_, token: string, url: string): Promise<IPCResult<GitHubRepoAccess>> => {
      try {
        const parsed = gitHubAuth.parseGitHubUrl(url);
        if (!parsed) {
          return {
            success: false,
            error: 'Invalid GitHub URL format'
          };
        }
        const result = await gitHubAuth.checkRepoAccess(token, parsed.owner, parsed.repo);
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  /**
   * Check git availability
   */
  ipcMain.handle(
    'plugin:checkGitAvailability',
    async (): Promise<IPCResult<GitAvailability>> => {
      try {
        const result = await gitHubAuth.checkGitAvailability();
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return { success: false, error: message };
      }
    }
  );

  console.warn('[plugin-handlers] All handlers registered successfully');
}
