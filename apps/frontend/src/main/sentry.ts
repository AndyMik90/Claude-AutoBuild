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
  PRODUCTION_TRACE_SAMPLE_RATE,
  type SentryErrorEvent
} from '../shared/utils/sentry-privacy';

// In-memory state for current setting (updated via IPC when user toggles)
let sentryEnabledState = true;

/**
 * Get Sentry DSN from environment variable
 *
 * For local development/testing:
 *   - Add SENTRY_DSN to your .env file, or
 *   - Run: SENTRY_DSN=your-dsn npm start
 *
 * For CI/CD releases:
 *   - Set SENTRY_DSN as a GitHub Actions secret
 *
 * For forks:
 *   - Without SENTRY_DSN, Sentry is disabled (safe for forks)
 */
function getSentryDsn(): string {
  return process.env.SENTRY_DSN || '';
}

// Cache the DSN so renderer can access it via IPC
let cachedDsn: string = '';

/**
 * Initialize Sentry for the main process
 * Called early in app startup, before window creation
 */
export function initSentryMain(): void {
  // Get DSN from environment variable
  cachedDsn = getSentryDsn();

  // Read initial setting from disk synchronously
  const savedSettings = readSettingsFile();
  const settings = { ...DEFAULT_APP_SETTINGS, ...savedSettings };
  sentryEnabledState = settings.sentryEnabled ?? true;

  // Check if we have a DSN - if not, Sentry is effectively disabled
  const hasDsn = cachedDsn.length > 0;
  const shouldEnable = hasDsn && (app.isPackaged || process.env.SENTRY_DEV === 'true');

  if (!hasDsn) {
    console.log('[Sentry] No SENTRY_DSN configured - error reporting disabled');
    console.log('[Sentry] To enable: set SENTRY_DSN environment variable');
  }

  Sentry.init({
    dsn: cachedDsn,
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

    // Only enable if we have a DSN and are in production (or SENTRY_DEV is set)
    enabled: shouldEnable,
  });

  // Listen for settings changes from renderer process
  ipcMain.on(IPC_CHANNELS.SENTRY_STATE_CHANGED, (_event, enabled: boolean) => {
    sentryEnabledState = enabled;
    console.log(`[Sentry] Error reporting ${enabled ? 'enabled' : 'disabled'} (via IPC)`);
  });

  // IPC handler for renderer to get the DSN
  ipcMain.handle(IPC_CHANNELS.GET_SENTRY_DSN, () => {
    return cachedDsn;
  });

  if (hasDsn) {
    console.log(`[Sentry] Main process initialized (enabled: ${sentryEnabledState}, packaged: ${app.isPackaged})`);
  }
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
