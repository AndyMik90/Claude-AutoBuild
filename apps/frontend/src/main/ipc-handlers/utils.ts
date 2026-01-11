/**
 * Shared utilities for IPC handlers
 */

import type { BrowserWindow } from "electron";

/**
 * Track recently warned channels to prevent log spam
 * When a renderer frame is disposed, we log once per channel instead of flooding logs
 */
const recentlyWarnedChannels = new Set<string>();
const WARN_COOLDOWN_MS = 5000; // Clear warnings every 5 seconds

setInterval(() => {
  recentlyWarnedChannels.clear();
}, WARN_COOLDOWN_MS);

/**
 * Safely send IPC message to renderer with frame disposal checks
 *
 * This prevents "Render frame was disposed" errors that occur when:
 * 1. Multiple agents are running and producing output
 * 2. The main process tries to send data to renderer windows via webContents.send()
 * 3. The renderer frame has been disposed/gone, but the main process hasn't detected this
 *
 * @param getMainWindow - Function to get the main window reference
 * @param channel - IPC channel to send on
 * @param args - Arguments to send to the renderer
 * @returns true if message was sent, false if window was destroyed or not available
 *
 * @example
 * ```ts
 * // Instead of:
 * mainWindow.webContents.send(IPC_CHANNELS.TASK_LOG, taskId, log);
 *
 * // Use:
 * safeSendToRenderer(getMainWindow, IPC_CHANNELS.TASK_LOG, taskId, log);
 * ```
 */
export function safeSendToRenderer(
  getMainWindow: () => BrowserWindow | null,
  channel: string,
  ...args: unknown[]
): boolean {
  try {
    const mainWindow = getMainWindow();

    if (!mainWindow) {
      return false;
    }

    // Check if window or webContents is destroyed
    // isDestroyed() returns true if the window has been closed and destroyed
    if (mainWindow.isDestroyed()) {
      if (!recentlyWarnedChannels.has(channel)) {
        console.warn(`[safeSendToRenderer] Skipping send to destroyed window: ${channel}`);
        recentlyWarnedChannels.add(channel);
      }
      return false;
    }

    // Check if webContents is destroyed (can happen independently of window)
    if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
      if (!recentlyWarnedChannels.has(channel)) {
        console.warn(`[safeSendToRenderer] Skipping send to destroyed webContents: ${channel}`);
        recentlyWarnedChannels.add(channel);
      }
      return false;
    }

    // All checks passed - safe to send
    mainWindow.webContents.send(channel, ...args);
    return true;
  } catch (error) {
    // Catch any disposal errors that might occur between our checks and the actual send
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Only log disposal errors once per channel to avoid log spam
    if (errorMessage.includes("disposed") || errorMessage.includes("destroyed")) {
      if (!recentlyWarnedChannels.has(channel)) {
        console.warn(`[safeSendToRenderer] Frame disposed, skipping send: ${channel}`);
        recentlyWarnedChannels.add(channel);
      }
    } else {
      console.error(`[safeSendToRenderer] Error sending to renderer:`, error);
    }
    return false;
  }
}

/**
 * Parse .env file into key-value object
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex > 0) {
      const key = trimmed.substring(0, equalsIndex).trim();
      let value = trimmed.substring(equalsIndex + 1).trim();
      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      result[key] = value;
    }
  }
  return result;
}
