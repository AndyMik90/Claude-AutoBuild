/**
 * Log Streaming IPC Handlers
 *
 * Handles log streaming operations:
 * - Streaming backend logs (Python process logs)
 * - Streaming IPC handler logs
 * - Streaming frontend console logs (forwarded via IPC)
 * - Getting recent logs from each source
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import { logger } from '../app-logger';

export interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  source: 'backend' | 'ipc' | 'frontend';
  message: string;
  context?: Record<string, any>;
}

// In-memory log buffers for each source (last 1000 entries)
const MAX_LOG_BUFFER_SIZE = 1000;
const backendLogs: LogEntry[] = [];
const ipcLogs: LogEntry[] = [];
const frontendLogs: LogEntry[] = [];

/**
 * Add a log entry to the appropriate buffer and stream to renderer
 */
function addLog(log: LogEntry, getMainWindow: () => BrowserWindow | null): void {
  let buffer: LogEntry[];
  let streamChannel: string;

  switch (log.source) {
    case 'backend':
      buffer = backendLogs;
      streamChannel = IPC_CHANNELS.LOGS_BACKEND_STREAM;
      break;
    case 'ipc':
      buffer = ipcLogs;
      streamChannel = IPC_CHANNELS.LOGS_IPC_STREAM;
      break;
    case 'frontend':
      buffer = frontendLogs;
      streamChannel = IPC_CHANNELS.LOGS_FRONTEND_STREAM;
      break;
    default:
      return;
  }

  // Add to buffer
  buffer.push(log);

  // Maintain buffer size
  if (buffer.length > MAX_LOG_BUFFER_SIZE) {
    buffer.shift();
  }

  // Stream to renderer
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(streamChannel, log);
  }
}

/**
 * Capture IPC handler logs
 */
export function logIpcEvent(level: LogEntry['level'], message: string, context?: Record<string, any>, getMainWindow?: () => BrowserWindow | null): void {
  const log: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source: 'ipc',
    message,
    context
  };

  if (getMainWindow) {
    addLog(log, getMainWindow);
  } else {
    // Fallback to buffer only
    ipcLogs.push(log);
    if (ipcLogs.length > MAX_LOG_BUFFER_SIZE) {
      ipcLogs.shift();
    }
  }
}

/**
 * Capture backend logs (from Python process stderr/stdout)
 */
export function logBackendOutput(output: string, level: LogEntry['level'], getMainWindow: () => BrowserWindow | null): void {
  const log: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source: 'backend',
    message: output
  };

  addLog(log, getMainWindow);
}

/**
 * Register log streaming IPC handlers
 */
export function registerLogsHandlers(getMainWindow: () => BrowserWindow | null): void {
  // Get recent logs for a source
  ipcMain.handle(IPC_CHANNELS.LOGS_GET_RECENT, async (_, source: 'backend' | 'ipc' | 'frontend', limit: number = 100): Promise<LogEntry[]> => {
    let buffer: LogEntry[];

    switch (source) {
      case 'backend':
        buffer = backendLogs;
        break;
      case 'ipc':
        buffer = ipcLogs;
        break;
      case 'frontend':
        buffer = frontendLogs;
        break;
      default:
        return [];
    }

    // Return last N entries
    return buffer.slice(-limit);
  });

  // Handle frontend logs forwarded from renderer
  ipcMain.on('logs:frontend:forward', (_, log: Omit<LogEntry, 'source'>) => {
    const frontendLog: LogEntry = {
      ...log,
      source: 'frontend'
    };

    addLog(frontendLog, getMainWindow);
  });

  // Log IPC handler registration
  logIpcEvent('info', 'Log streaming IPC handlers registered', undefined, getMainWindow);
  logger.info('Log streaming IPC handlers registered');
}

/**
 * Export log buffer accessors for use in other handlers
 */
export function getBackendLogs(): LogEntry[] {
  return [...backendLogs];
}

export function getIpcLogs(): LogEntry[] {
  return [...ipcLogs];
}

export function getFrontendLogs(): LogEntry[] {
  return [...frontendLogs];
}
