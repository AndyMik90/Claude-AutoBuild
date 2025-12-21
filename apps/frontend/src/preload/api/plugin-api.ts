import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type {
  Plugin,
  PluginInstallOptions,
  PluginInstallResult,
  PluginUpdateCheck,
  PluginUpdateOptions,
  PluginUpdateResult,
  PluginContext,
  BoilerplateDetectionResult,
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
  checkPluginUpdates: (pluginId: string) => Promise<IPCResult<PluginUpdateCheck>>;
  applyPluginUpdates: (options: PluginUpdateOptions) => Promise<IPCResult<PluginUpdateResult>>;

  // Boilerplate Detection
  detectBoilerplate: (projectPath: string) => Promise<IPCResult<BoilerplateDetectionResult>>;

  // Plugin Context (for task injection)
  getPluginContext: (projectId: string) => Promise<IPCResult<PluginContext>>;

  // GitHub Validation (for plugin installation)
  validateGitHubToken: (token: string) => Promise<GitHubTokenValidation>;
  checkGitHubRepoAccess: (owner: string, repo: string, token?: string) => Promise<GitHubRepoAccess>;
  checkGitAvailability: () => Promise<GitAvailability>;
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
  checkPluginUpdates: (pluginId: string): Promise<IPCResult<PluginUpdateCheck>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_CHECK_UPDATES, pluginId),

  applyPluginUpdates: (options: PluginUpdateOptions): Promise<IPCResult<PluginUpdateResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_APPLY_UPDATES, options),

  // Boilerplate Detection
  detectBoilerplate: (projectPath: string): Promise<IPCResult<BoilerplateDetectionResult>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_DETECT_BOILERPLATE, projectPath),

  // Plugin Context
  getPluginContext: (projectId: string): Promise<IPCResult<PluginContext>> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_CONTEXT, projectId),

  // GitHub Validation
  validateGitHubToken: (token: string): Promise<GitHubTokenValidation> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_VALIDATE_GITHUB_TOKEN, token),

  checkGitHubRepoAccess: (owner: string, repo: string, token?: string): Promise<GitHubRepoAccess> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_CHECK_GITHUB_REPO_ACCESS, owner, repo, token),

  checkGitAvailability: (): Promise<GitAvailability> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_CHECK_GIT_AVAILABILITY)
});
