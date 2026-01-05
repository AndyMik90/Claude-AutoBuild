/**
 * Sentry Error Tracking for Renderer Process
 *
 * Initializes Sentry with:
 * - beforeSend hook that checks settings store (allows mid-session toggle)
 * - Path masking for user privacy (shared with main process)
 * - Function to notify main process when setting changes
 *
 * Privacy Note:
 * - Usernames are masked from all file paths
 * - Project paths remain visible for debugging (this is expected)
 * - Tags, contexts, extra data, and user info are all sanitized
 *
 * DSN Configuration:
 * - DSN is loaded from environment variable via main process IPC
 * - If no DSN is configured, Sentry is disabled (safe for forks)
 *
 * Race Condition Prevention:
 * - We track whether settings have been loaded from disk
 * - Until settings are loaded, we default to NOT sending events
 * - This respects user preference even during early app initialization
 */

import * as Sentry from '@sentry/electron/renderer';
import { useSettingsStore } from '../stores/settings-store';
import {
  processEvent,
  type SentryErrorEvent
} from '../../shared/utils/sentry-privacy';

// Track whether settings have been loaded from disk
// This prevents sending events before we know user's preference
let settingsLoaded = false;

// Track whether Sentry has been initialized
let sentryInitialized = false;

/**
 * Mark settings as loaded
 * Called by settings store after initial load from disk
 */
export function markSettingsLoaded(): void {
  settingsLoaded = true;
  console.log('[Sentry] Settings loaded, error reporting ready');
}

/**
 * Check if settings have been loaded
 */
export function areSettingsLoaded(): boolean {
  return settingsLoaded;
}

/**
 * Initialize Sentry for renderer process
 * Should be called early in renderer startup
 *
 * This is async because we need to fetch the DSN from the main process
 */
export async function initSentryRenderer(): Promise<void> {
  // Check if we're in Electron or browser environment
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  if (!isElectron) {
    console.log('[Sentry] Not in Electron environment, skipping initialization');
    return;
  }

  // Get full Sentry config from main process (DSN + sample rates from env vars)
  let config = { dsn: '', tracesSampleRate: 0, profilesSampleRate: 0 };
  try {
    config = await window.electronAPI.getSentryConfig();
  } catch (error) {
    console.warn('[Sentry] Failed to get config from main process:', error);
  }

  const hasDsn = config.dsn.length > 0;
  if (!hasDsn) {
    console.log('[Sentry] No DSN configured - error reporting disabled in renderer');
    return;
  }

  Sentry.init({
    dsn: config.dsn,

    beforeSend(event: Sentry.ErrorEvent) {
      // Don't send events until settings are loaded
      // This prevents sending events if user had disabled Sentry
      if (!settingsLoaded) {
        console.log('[Sentry] Settings not loaded yet, dropping event');
        return null;
      }

      // Check current setting at send time (allows mid-session toggle)
      try {
        const currentSettings = useSettingsStore.getState().settings;
        const isEnabled = currentSettings.sentryEnabled ?? true;

        if (!isEnabled) {
          return null;
        }
      } catch (error) {
        // If settings store fails, don't send event (be conservative)
        console.error('[Sentry] Failed to read settings, dropping event:', error);
        return null;
      }

      // Process event with shared privacy utility
      return processEvent(event as SentryErrorEvent) as Sentry.ErrorEvent;
    },

    // Sample rates from main process (configured via environment variables)
    tracesSampleRate: config.tracesSampleRate,
    profilesSampleRate: config.profilesSampleRate,

    // Enable in Electron environment when we have a DSN
    enabled: true,
  });

  sentryInitialized = true;
  console.log(`[Sentry] Renderer initialized (traces: ${config.tracesSampleRate}, profiles: ${config.profilesSampleRate})`);
}

/**
 * Check if Sentry has been initialized
 */
export function isSentryInitialized(): boolean {
  return sentryInitialized;
}

/**
 * Notify main process when Sentry setting changes
 * Call this whenever the user toggles the setting in the UI
 */
export function notifySentryStateChanged(enabled: boolean): void {
  console.log(`[Sentry] Notifying main process: ${enabled ? 'enabled' : 'disabled'}`);
  try {
    window.electronAPI?.notifySentryStateChanged?.(enabled);
  } catch (error) {
    console.error('[Sentry] Failed to notify main process:', error);
  }
}

/**
 * Manually capture an exception with Sentry
 * Useful for error boundaries or try/catch blocks
 */
export function captureException(error: Error, context?: Record<string, unknown>): void {
  if (!sentryInitialized) {
    // Sentry not initialized (no DSN configured), just log
    console.error('[Sentry] Not initialized, error not captured:', error);
    return;
  }

  if (context) {
    Sentry.withScope((scope) => {
      scope.setContext('additional', context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}
