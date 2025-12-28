import { IPC_CHANNELS } from '../../../shared/constants';
import { invokeIpc } from './ipc-utils';

/**
 * IDE types supported for opening folders
 */
export type IDEType = 'cursor' | 'vscode' | 'finder';

/**
 * Shell Operations API
 */
export interface ShellAPI {
  openExternal: (url: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
  openInIde: (path: string, ide?: IDEType) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Creates the Shell Operations API implementation
 */
export const createShellAPI = (): ShellAPI => ({
  openExternal: (url: string): Promise<void> =>
    invokeIpc(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, url),
  openPath: (path: string): Promise<void> =>
    invokeIpc(IPC_CHANNELS.SHELL_OPEN_PATH, path),
  openInIde: (path: string, ide?: IDEType): Promise<{ success: boolean; error?: string }> =>
    invokeIpc(IPC_CHANNELS.SHELL_OPEN_IN_IDE, path, ide)
});
