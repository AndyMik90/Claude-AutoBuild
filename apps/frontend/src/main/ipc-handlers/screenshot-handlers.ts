import { ipcMain, desktopCapturer } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import type { ScreenshotSource } from '../../preload/api/screenshot-api';

// Rate limiting: Track last request times per handler
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_GET_SOURCES_REQUESTS = 5;
const MAX_CAPTURE_REQUESTS = 10;

/**
 * Check if request is within rate limit
 */
function checkRateLimit(handlerName: string, maxRequests: number): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(handlerName) || [];

  // Remove requests outside the time window
  const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= maxRequests) {
    return false;
  }

  // Add current request
  recentRequests.push(now);
  rateLimitMap.set(handlerName, recentRequests);
  return true;
}

/**
 * Sanitize window/screen names to prevent XSS
 */
function sanitizeName(name: string): string {
  // Remove any HTML tags and script-like content
  return name
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .trim();
}

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
        // Rate limiting: max 5 requests per minute
        if (!checkRateLimit('getSources', MAX_GET_SOURCES_REQUESTS)) {
          return {
            success: false,
            error: 'Too many requests. Please wait a moment and try again.'
          };
        }

        const sources = await desktopCapturer.getSources({
          types: ['screen', 'window'],
          thumbnailSize: { width: 300, height: 200 }
        });

        const sourcesData: ScreenshotSource[] = sources.map(source => ({
          id: source.id,
          name: sanitizeName(source.name), // Sanitize to prevent XSS
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
        // Rate limiting: max 10 captures per minute
        if (!checkRateLimit('capture', MAX_CAPTURE_REQUESTS)) {
          return {
            success: false,
            error: 'Too many screenshot requests. Please wait a moment and try again.'
          };
        }

        // Validate sourceId format to prevent injection attacks
        // Valid formats: 'screen:0:0', 'window:123:456'
        if (!sourceId || !/^(screen|window):\d+:\d+$/.test(sourceId)) {
          return {
            success: false,
            error: 'Invalid source ID format'
          };
        }

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
