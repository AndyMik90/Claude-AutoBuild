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
  BoilerplateDetectionResult
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
  })
};
