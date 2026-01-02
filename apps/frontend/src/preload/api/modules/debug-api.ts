/**
 * Debug API for renderer process
 *
 * Provides access to debugging features:
 * - Get debug info for bug reports
 * - Open logs folder
 * - Copy debug info to clipboard
 * - List log files
 * - Stream logs from backend, IPC, and frontend
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import { invokeIpc, createIpcListener, sendIpc } from './ipc-utils';

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

export interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  source: 'backend' | 'ipc' | 'frontend';
  message: string;
  context?: Record<string, any>;
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
  testInvokeChannel: (channel: string, params?: unknown) => Promise<unknown>;

  // Log streaming methods
  getRecentLogs: (source: 'backend' | 'ipc' | 'frontend', limit?: number) => Promise<LogEntry[]>;
  onBackendLog: (callback: (log: LogEntry) => void) => () => void;
  onIpcLog: (callback: (log: LogEntry) => void) => () => void;
  onFrontendLog: (callback: (log: LogEntry) => void) => () => void;
  forwardFrontendLog: (log: Omit<LogEntry, 'source'>) => void;
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
    invokeIpc(IPC_CHANNELS.DEBUG_LIST_LOG_FILES),

  testInvokeChannel: (channel: string, params?: unknown): Promise<unknown> =>
    invokeIpc(channel, params),

  // Log streaming methods
  getRecentLogs: (source: 'backend' | 'ipc' | 'frontend', limit: number = 100): Promise<LogEntry[]> =>
    invokeIpc(IPC_CHANNELS.LOGS_GET_RECENT, source, limit),

  onBackendLog: (callback: (log: LogEntry) => void): (() => void) =>
    createIpcListener(IPC_CHANNELS.LOGS_BACKEND_STREAM, callback),

  onIpcLog: (callback: (log: LogEntry) => void): (() => void) =>
    createIpcListener(IPC_CHANNELS.LOGS_IPC_STREAM, callback),

  onFrontendLog: (callback: (log: LogEntry) => void): (() => void) =>
    createIpcListener(IPC_CHANNELS.LOGS_FRONTEND_STREAM, callback),

  forwardFrontendLog: (log: Omit<LogEntry, 'source'>): void => {
    // Send to main process to be broadcast to all windows
    sendIpc('logs:frontend:forward', log);
  }
});
