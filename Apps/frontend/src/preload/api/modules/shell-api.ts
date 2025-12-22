import { IPC_CHANNELS } from '../../../shared/constants';
import { invokeIpc } from './ipc-utils';

/**
 * Shell Operations API
 */
export interface ShellAPI {
  openExternal: (url: string) => Promise<void>;
}

/**
 * Creates the Shell Operations API implementation
 */
export const createShellAPI = (): ShellAPI => ({
  openExternal: (url: string): Promise<void> =>
    invokeIpc(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url)
});
