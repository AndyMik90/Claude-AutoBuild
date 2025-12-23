/**
 * Log API - Main process log forwarding
 */

import { ipcRenderer } from 'electron';

export interface LogAPI {
  onMainProcessLog: (callback: (data: { level: string; args: string[] }) => void) => void;
  setBackendLogging: (enabled: boolean) => void;
}

export const createLogAPI = (): LogAPI => ({
  onMainProcessLog: (callback) => {
    ipcRenderer.on('main-process-log', (_, data) => callback(data));
  },
  setBackendLogging: (enabled: boolean) => {
    ipcRenderer.send('set-backend-logging', enabled);
  }
});
