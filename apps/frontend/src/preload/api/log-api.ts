/**
 * Log API - Main process log forwarding
 */

import { ipcRenderer } from 'electron';

export interface LogAPI {
  onMainProcessLog: (callback: (data: { level: string; args: string[] }) => void) => () => void;
  setBackendLogging: (enabled: boolean) => void;
}

export const createLogAPI = (): LogAPI => ({
  onMainProcessLog: (callback) => {
    const handler = (_: unknown, data: { level: string; args: string[] }) => callback(data);
    ipcRenderer.on('main-process-log', handler);
    return () => {
      ipcRenderer.removeListener('main-process-log', handler);
    };
  },
  setBackendLogging: (enabled: boolean) => {
    ipcRenderer.send('set-backend-logging', enabled);
  }
});
