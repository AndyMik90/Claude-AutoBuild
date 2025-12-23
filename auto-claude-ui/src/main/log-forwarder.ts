/**
 * Forward main process console logs to renderer DevTools
 * This allows developers to see backend logs in the browser console
 * Can be enabled/disabled via Settings > Developer > Enable Backend Logging
 */

import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';

// Store whether logging is enabled
let loggingEnabled = false;

export function initializeLogForwarding(getMainWindow: () => BrowserWindow | null): void {
  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Listen for settings changes to enable/disable logging
  ipcMain.on('set-backend-logging', (_, enabled: boolean) => {
    loggingEnabled = enabled;
    originalLog('[LogForwarder] Backend logging', enabled ? 'enabled' : 'disabled');
  });

  // Override console.log
  console.log = (...args: any[]) => {
    originalLog(...args); // Always log to terminal if launched from terminal
    if (loggingEnabled) {
      const window = getMainWindow();
      if (window && !window.isDestroyed()) {
        window.webContents.send('main-process-log', {
          level: 'log',
          args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
        });
      }
    }
  };

  // Override console.warn
  console.warn = (...args: any[]) => {
    originalWarn(...args);
    if (loggingEnabled) {
      const window = getMainWindow();
      if (window && !window.isDestroyed()) {
        window.webContents.send('main-process-log', {
          level: 'warn',
          args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
        });
      }
    }
  };

  // Override console.error
  console.error = (...args: any[]) => {
    originalError(...args);
    if (loggingEnabled) {
      const window = getMainWindow();
      if (window && !window.isDestroyed()) {
        window.webContents.send('main-process-log', {
          level: 'error',
          args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
        });
      }
    }
  };

  originalLog('[LogForwarder] Main process log forwarding initialized (disabled by default)');
}
