/**
 * Forward main process console logs to renderer DevTools
 * This allows developers to see backend logs in the browser console
 */

import { BrowserWindow } from 'electron';

export function initializeLogForwarding(getMainWindow: () => BrowserWindow | null): void {
  // Store original console methods
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  // Override console.log
  console.log = (...args: any[]) => {
    originalLog(...args); // Still log to terminal if launched from terminal
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('main-process-log', {
        level: 'log',
        args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
      });
    }
  };

  // Override console.warn
  console.warn = (...args: any[]) => {
    originalWarn(...args);
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('main-process-log', {
        level: 'warn',
        args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
      });
    }
  };

  // Override console.error
  console.error = (...args: any[]) => {
    originalError(...args);
    const window = getMainWindow();
    if (window && !window.isDestroyed()) {
      window.webContents.send('main-process-log', {
        level: 'error',
        args: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg))
      });
    }
  };

  console.log('[LogForwarder] Main process log forwarding initialized');
}
