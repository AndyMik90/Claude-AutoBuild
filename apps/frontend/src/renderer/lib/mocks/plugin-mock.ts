/**
 * Mock implementation for plugin operations
 */

import type {
  Plugin,
  PluginInstallResult,
  IPCResult,
  PluginUpdateCheck,
  PluginUpdateResult,
  PluginContext,
  BoilerplateDetectionResult,
  GitHubTokenValidation,
  GitHubRepoAccess,
  GitAvailability
} from '../../../shared/types';

export const pluginMock = {
  // Plugin Management
  getPlugins: async (): Promise<IPCResult<Plugin[]>> => ({
    success: true,
    data: []
  }),

  installPlugin: async (): Promise<PluginInstallResult> => ({
    success: false,
    error: 'Plugin installation not available in browser mode'
  }),

  uninstallPlugin: async (): Promise<IPCResult> => ({
    success: false,
    error: 'Plugin uninstallation not available in browser mode'
  }),

  // Plugin Updates
  checkPluginUpdates: async (): Promise<IPCResult<PluginUpdateCheck>> => ({
    success: true
    // data is optional in IPCResult, omitting means no update check result
  }),

  applyPluginUpdates: async (): Promise<IPCResult<PluginUpdateResult>> => ({
    success: false,
    error: 'Plugin updates not available in browser mode'
  }),

  // Boilerplate Detection
  detectBoilerplate: async (): Promise<IPCResult<BoilerplateDetectionResult>> => ({
    success: true,
    data: {
      isBoilerplate: false
    }
  }),

  // Plugin Context
  getPluginContext: async (): Promise<IPCResult<PluginContext>> => ({
    success: true
    // data is optional in IPCResult, omitting means no plugin context
  }),

  // GitHub Validation (for plugin installation)
  validateGitHubToken: async (_token: string): Promise<GitHubTokenValidation> => ({
    valid: false,
    error: 'GitHub token validation not available in browser mode'
  }),

  checkGitHubRepoAccess: async (owner: string, repo: string, _token?: string): Promise<GitHubRepoAccess> => ({
    hasAccess: false,
    owner,
    repo,
    isPrivate: false,
    error: 'GitHub repo access check not available in browser mode'
  }),

  checkGitAvailability: async (): Promise<GitAvailability> => ({
    available: false,
    meetsMinimum: false,
    minimumRequired: '2.1.0',
    error: 'Git availability check not available in browser mode'
  })
};
