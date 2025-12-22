import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  AutoBuildSourceUpdateCheck,
  AutoBuildSourceUpdateProgress,
  IPCResult
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * Auto-Build Source Update API operations
 */
export interface AutoBuildAPI {
  // Operations
  checkAutoBuildSourceUpdate: () => Promise<IPCResult<AutoBuildSourceUpdateCheck>>;
  downloadAutoBuildSourceUpdate: () => void;
  getAutoBuildSourceVersion: () => Promise<IPCResult<string>>;

  // Event Listeners
  onAutoBuildSourceUpdateProgress: (
    callback: (progress: AutoBuildSourceUpdateProgress) => void
  ) => IpcListenerCleanup;
}

/**
 * Creates the Auto-Build Source Update API implementation
 */
export const createAutoBuildAPI = (): AutoBuildAPI => ({
  // Operations
  checkAutoBuildSourceUpdate: (): Promise<IPCResult<AutoBuildSourceUpdateCheck>> =>
    invokeIpc(IPC_CHANNELS.AUTOBUILD_SOURCE_CHECK),

  downloadAutoBuildSourceUpdate: (): void =>
    sendIpc(IPC_CHANNELS.AUTOBUILD_SOURCE_DOWNLOAD),

  getAutoBuildSourceVersion: (): Promise<IPCResult<string>> =>
    invokeIpc(IPC_CHANNELS.AUTOBUILD_SOURCE_VERSION),

  // Event Listeners
  onAutoBuildSourceUpdateProgress: (
    callback: (progress: AutoBuildSourceUpdateProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.AUTOBUILD_SOURCE_PROGRESS, callback)
});
