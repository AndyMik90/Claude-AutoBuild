import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
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
  GitAvailability,
  IPCResult
} from '../../shared/types';

export interface PluginAPI {
  // Plugin Management
  getPlugins: () => Promise<IPCResult<Plugin[]>>;
  installPlugin: (options: PluginInstallOptions) => Promise<PluginInstallResult>;
  uninstallPlugin: (pluginId: string) => Promise<IPCResult>;

  // Plugin Updates
  checkPluginUpdates: (pluginId: string, token?: string) => Promise<IPCResult<PluginUpdateCheck>>;
  applyPluginUpdates: (options: PluginUpdateOptions) => Promise<IPCResult<PluginUpdateResult>>;
  getPluginFileDiff: (pluginId: string, filePath: string) => Promise<IPCResult<string | null>>;

  // Plugin Backup & Rollback
  listPluginBackups: (pluginId: string) => Promise<IPCResult<PluginBackup[]>>;
  rollbackPlugin: (pluginId: string, backupPath: string) => Promise<IPCResult<PluginUpdateResult>>;

  // GitHub Validation (for plugin installation)
  validateGitHubToken: (token: string) => Promise<GitHubTokenValidation>;
  checkGitHubRepoAccess: (owner: string, repo: string, token?: string) => Promise<GitHubRepoAccess>;
  checkGitAvailability: () => Promise<GitAvailability>;

  // Plugin Event Listeners
  onPluginInstallProgress: (callback: (progress: PluginInstallProgress) => void) => () => void;
}

export const createPluginAPI = (): PluginAPI => ({
  // Plugin Management
  getPlugins: (): Promise<IPCResult<Plugin[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIST),

  installPlugin: (options: PluginInstallOptions): Promise<PluginInstallResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_INSTALL, options),

  uninstallPlugin: (pluginId: string): Promise<IPCResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_UNINSTALL, pluginId),

  // Plugin Updates
  checkPluginUpdates: (pluginId: string, token?: string): Promise<IPCResult<PluginUpdateCheck>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_CHECK_UPDATES, pluginId, token),

  applyPluginUpdates: (options: PluginUpdateOptions): Promise<IPCResult<PluginUpdateResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_APPLY_UPDATES, options),

  getPluginFileDiff: (pluginId: string, filePath: string): Promise<IPCResult<string | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_FILE_DIFF, pluginId, filePath),

  // Plugin Backup & Rollback
  listPluginBackups: (pluginId: string): Promise<IPCResult<PluginBackup[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIST_BACKUPS, pluginId),

  rollbackPlugin: (pluginId: string, backupPath: string): Promise<IPCResult<PluginUpdateResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_ROLLBACK, pluginId, backupPath),

  // GitHub Validation
  validateGitHubToken: (token: string): Promise<GitHubTokenValidation> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_VALIDATE_GITHUB_TOKEN, token),

  checkGitHubRepoAccess: (owner: string, repo: string, token?: string): Promise<GitHubRepoAccess> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_CHECK_GITHUB_REPO_ACCESS, owner, repo, token),

  checkGitAvailability: (): Promise<GitAvailability> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_CHECK_GIT_AVAILABILITY),

  // Plugin Event Listeners
  onPluginInstallProgress: (
    callback: (progress: PluginInstallProgress) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      progress: PluginInstallProgress
    ): void => {
      callback(progress);
    };
    ipcRenderer.on(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, handler);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.PLUGIN_INSTALL_PROGRESS, handler);
    };
  }
});
