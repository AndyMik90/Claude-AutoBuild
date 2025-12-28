/**
 * Mock implementation for settings and app info operations
 */

import { DEFAULT_APP_SETTINGS } from '../../../shared/constants';

export const settingsMock = {
  // Settings
  getSettings: async () => ({
    success: true,
    data: DEFAULT_APP_SETTINGS
  }),

  saveSettings: async () => ({ success: true }),

  // App Info
  getAppVersion: async () => '0.1.0-browser',

  // App Update Operations (mock - no updates in browser mode)
  checkAppUpdate: async () => ({ success: true, data: null }),
  downloadAppUpdate: async () => ({ success: true }),
  installAppUpdate: () => { console.warn('[browser-mock] installAppUpdate called'); },

  // App Update Event Listeners (no-op in browser mode)
  onAppUpdateAvailable: () => () => {},
  onAppUpdateDownloaded: () => () => {},
  onAppUpdateProgress: () => () => {},

  // Shell Operations (limited functionality in browser mode)
  openExternal: async (url: string) => {
    console.warn('[browser-mock] openExternal called with:', url);
    window.open(url, '_blank');
  },
  openPath: async (path: string) => {
    console.warn('[browser-mock] openPath called with:', path);
  },
  openInIde: async (path: string, ide?: string) => {
    console.warn('[browser-mock] openInIde called with:', path, ide);
    return { success: false, error: 'IDE opening not supported in browser mode' };
  }
};
