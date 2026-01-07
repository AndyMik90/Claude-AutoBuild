/**
 * Debug API for renderer process
 *
 * Provides access to debugging features:
 * - Get debug info for bug reports
 * - Open logs folder
 * - Copy debug info to clipboard
 * - List log files
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import { invokeIpc } from './ipc-utils';

export interface DebugInfo {
  systemInfo: Record<string, string>;
  recentErrors: string[];
  logsPath: string;
  debugReport: string;
}

export interface LogFileInfo {
  name: string;
  path: string;
  size: number;
  modified: string;
}

export interface DebugResult {
  success: boolean;
  error?: string;
}

/**
 * Debug API interface exposed to renderer
 */
export interface DebugAPI {
  getDebugInfo: () => Promise<DebugInfo>;
  openLogsFolder: () => Promise<DebugResult>;
  copyDebugInfo: () => Promise<DebugResult>;
  getRecentErrors: (maxCount?: number) => Promise<string[]>;
  listLogFiles: () => Promise<LogFileInfo[]>;
}

/**
 * Creates the Debug API implementation
 */
export const createDebugAPI = (): DebugAPI => ({
  getDebugInfo: (): Promise<DebugInfo> =>
    invokeIpc(IPC_CHANNELS.DEBUG_GET_INFO),

  openLogsFolder: (): Promise<DebugResult> =>
    invokeIpc(IPC_CHANNELS.DEBUG_OPEN_LOGS_FOLDER),

  copyDebugInfo: (): Promise<DebugResult> =>
    invokeIpc(IPC_CHANNELS.DEBUG_COPY_DEBUG_INFO),

  getRecentErrors: (maxCount?: number): Promise<string[]> =>
    invokeIpc(IPC_CHANNELS.DEBUG_GET_RECENT_ERRORS, maxCount),

  listLogFiles: (): Promise<LogFileInfo[]> =>
    invokeIpc(IPC_CHANNELS.DEBUG_LIST_LOG_FILES)
});
