import { ipcMain, desktopCapturer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type { ScreenshotSource } from '../../preload/api/screenshot-api';

/**
 * Register screenshot capture IPC handlers
 */
export function registerScreenshotHandlers(): void {
  /**
   * Get available screenshot sources (screens and windows)
   */
  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOT_GET_SOURCES,
    async (): Promise<IPCResult<ScreenshotSource[]>> => {
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 300, height: 200 }
        });

        const sourcesData: ScreenshotSource[] = sources.map(source => ({
          id: source.id,
          name: source.name,
          thumbnail: source.thumbnail.toDataURL()
        }));

        return {
          success: true,
          data: sourcesData
        };
      } catch (error) {
        console.error('Failed to get screenshot sources:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get screenshot sources'
        };
      }
    }
  );

  /**
   * Capture screenshot from a specific source
   */
  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOT_CAPTURE,
    async (_event, sourceId: string): Promise<IPCResult<string>> => {
      try {
        // Get the source with full resolution
        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 1920 * 2, height: 1080 * 2 } // High resolution for retina displays
        });

        const source = sources.find(s => s.id === sourceId);
        if (!source) {
          return {
            success: false,
            error: 'Screenshot source not found'
          };
        }

        // Convert to data URL (base64)
        const dataUrl = source.thumbnail.toDataURL();

        return {
          success: true,
          data: dataUrl
        };
      } catch (error) {
        console.error('Failed to capture screenshot:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to capture screenshot'
        };
      }
    }
  );
}
