import { ipcRenderer } from 'electron';

/**
 * Utility type for IPC event listener cleanup function
 */
export type IpcListenerCleanup = () => void;

/**
 * Creates a typed IPC event listener with automatic cleanup
 *
 * @param channel - The IPC channel to listen on
 * @param callback - The callback function to execute when event is received
 * @returns Cleanup function to remove the listener
 */
export function createIpcListener<T extends unknown[]>(
  channel: string,
  callback: (...args: T) => void
): IpcListenerCleanup {
  const handler = (_event: Electron.IpcRendererEvent, ...args: T): void => {
    callback(...args);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

/**
 * Invokes an IPC method with typed return value
 *
 * @param channel - The IPC channel to invoke
 * @param args - Arguments to pass to the IPC handler
 * @returns Promise with the typed result
 */
export function invokeIpc<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args);
}

/**
 * Sends an IPC message without expecting a response
 *
 * @param channel - The IPC channel to send to
 * @param args - Arguments to pass to the IPC handler
 */
export function sendIpc(channel: string, ...args: unknown[]): void {
  ipcRenderer.send(channel, ...args);
}
