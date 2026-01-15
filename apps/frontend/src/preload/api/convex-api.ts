/**
 * Convex Service API
 *
 * Provides typesafe IPC communication for Convex service management.
 */

import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';

export interface ConvexStatus {
  available: boolean;
  running: boolean;
  url?: string;
  envConfigured: boolean;
}

export interface ConvexStartResult {
  url?: string;
  message: string;
}

export interface ConvexStopResult {
  message: string;
}

export const convexAPI = {
  /**
   * Get the Convex URLs from environment or .env.local file
   * Returns both the Convex URL (for client connection) and Site URL (for auth actions)
   */
  getUrl: (): Promise<{ success: boolean; data?: { convexUrl: string; siteUrl: string }; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVEX_GET_URL),

  /**
   * Get the current status of the Convex service
   */
  getStatus: (): Promise<{ success: boolean; data?: ConvexStatus; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVEX_GET_STATUS),

  /**
   * Start the Convex dev server
   */
  startDev: (): Promise<{ success: boolean; data?: ConvexStartResult; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVEX_START_DEV),

  /**
   * Stop the Convex dev server
   */
  stopDev: (): Promise<{ success: boolean; data?: ConvexStopResult; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVEX_STOP_DEV),

  /**
   * Get available Convex deployments
   */
  getDeployments: (): Promise<{ success: boolean; data?: string[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVEX_GET_DEPLOYMENTS)
};
