/**
 * Shared IPC communication utilities for GitHub handlers
 *
 * Provides consistent patterns for sending progress, error, and completion messages
 * to the renderer process.
 */

import type { BrowserWindow } from 'electron';

/**
 * Generic progress sender factory
 */
export function createProgressSender<T>(
  mainWindow: BrowserWindow,
  channel: string,
  projectId: string
) {
  return (status: T): void => {
    mainWindow.webContents.send(channel, projectId, status);
  };
}

/**
 * Generic error sender factory
 */
export function createErrorSender(
  mainWindow: BrowserWindow,
  channel: string,
  projectId: string
) {
  return (error: string | { error: string; [key: string]: unknown }): void => {
    const errorPayload = typeof error === 'string' ? { error } : error;
    mainWindow.webContents.send(channel, projectId, errorPayload);
  };
}

/**
 * Generic completion sender factory
 */
export function createCompleteSender<T>(
  mainWindow: BrowserWindow,
  channel: string,
  projectId: string
) {
  return (result: T): void => {
    mainWindow.webContents.send(channel, projectId, result);
  };
}

/**
 * Create all three senders at once for a feature
 */
export function createIPCCommunicators<TProgress, TComplete>(
  mainWindow: BrowserWindow,
  channels: {
    progress: string;
    error: string;
    complete: string;
  },
  projectId: string
) {
  return {
    sendProgress: createProgressSender<TProgress>(mainWindow, channels.progress, projectId),
    sendError: createErrorSender(mainWindow, channels.error, projectId),
    sendComplete: createCompleteSender<TComplete>(mainWindow, channels.complete, projectId),
  };
}
