import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';

export interface ScreenshotSource {
  id: string;
  name: string;
  thumbnail: string;
}

export interface ScreenshotAPI {
  getSources: () => Promise<IPCResult<ScreenshotSource[]>>;
  captureScreen: (sourceId: string) => Promise<IPCResult<string>>;
}

export const createScreenshotAPI = (): ScreenshotAPI => ({
  getSources: (): Promise<IPCResult<ScreenshotSource[]>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_GET_SOURCES),

  captureScreen: (sourceId: string): Promise<IPCResult<string>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SCREENSHOT_CAPTURE, sourceId)
});
