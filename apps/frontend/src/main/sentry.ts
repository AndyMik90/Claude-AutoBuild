/**
 * Sentry Error Tracking for Main Process
 *
 * Initializes Sentry with:
 * - beforeSend hook for mid-session toggle support (no restart needed)
 * - Path masking for user privacy (shared with renderer)
 * - IPC listener for settings changes from renderer
 *
 * Privacy Note:
 * - Usernames are masked from all file paths
 * - Project paths remain visible for debugging (this is expected)
 * - Tags, contexts, extra data, and user info are all sanitized
 */

import * as Sentry from '@sentry/electron/main';
import { app, ipcMain } from 'electron';
import { readSettingsFile } from './settings-utils';
import { DEFAULT_APP_SETTINGS } from '../shared/constants';
import { IPC_CHANNELS } from '../shared/constants/ipc';
import {
  processEvent,
  SENTRY_DSN,
  PRODUCTION_TRACE_SAMPLE_RATE,
  type SentryErrorEvent
} from '../shared/utils/sentry-privacy';

// In-memory state for current setting (updated via IPC when user toggles)
let sentryEnabledState = true;

/**
 * Initialize Sentry for the main process
 * Called early in app startup, before window creation
 */
export function initSentryMain(): void {
  // Read initial setting from disk synchronously
  const savedSettings = readSettingsFile();
  const settings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
  sentryEnabledState = settings.sentryEnabled ?? true;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: app.isPackaged ? 'production' : 'development',
    release: `auto-claude@${app.getVersion()}`,

    beforeSend(event: Sentry.ErrorEvent) {
      if (!sentryEnabledState) {
        return null;
      }
      // Process event with shared privacy utility
      return processEvent(event as SentryErrorEvent) as Sentry.ErrorEvent;
    },

    // Sample rate for performance monitoring (10% in production)
    tracesSampleRate: app.isPackaged ? PRODUCTION_TRACE_SAMPLE_RATE : 0,

    // Only enable in production unless SENTRY_DEV is set
    enabled: app.isPackaged || process.env.SENTRY_DEV === 'true',
  });

  // Listen for settings changes from renderer process
  ipcMain.on(IPC_CHANNELS.SENTRY_STATE_CHANGED, (_event, enabled: boolean) => {
    sentryEnabledState = enabled;
    console.log(`[Sentry] Error reporting ${enabled ? 'enabled' : 'disabled'} (via IPC)`);
  });

  console.log(`[Sentry] Main process initialized (enabled: ${sentryEnabledState}, packaged: ${app.isPackaged})`);
}

/**
 * Get current Sentry enabled state
 */
export function isSentryEnabled(): boolean {
  return sentryEnabledState;
}

/**
 * Set Sentry enabled state programmatically
 */
export function setSentryEnabled(enabled: boolean): void {
  sentryEnabledState = enabled;
  console.log(`[Sentry] Error reporting ${enabled ? 'enabled' : 'disabled'} (programmatic)`);
}
