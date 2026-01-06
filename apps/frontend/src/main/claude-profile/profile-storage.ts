/**
 * Profile Storage Module
 * Handles persistence of profile data to disk
 */

import { existsSync, readFileSync, writeFileSync, constants } from 'fs';
import { readFile, access } from 'fs/promises';
import type { ClaudeProfile, ClaudeAutoSwitchSettings } from '../../shared/types';

export const STORE_VERSION = 3;  // Bumped for encrypted token storage

/**
 * Default auto-switch settings
 */
export const DEFAULT_AUTO_SWITCH_SETTINGS: ClaudeAutoSwitchSettings = {
  enabled: false,
  proactiveSwapEnabled: false,  // Proactive monitoring disabled by default
  sessionThreshold: 95,  // Consider switching at 95% session usage
  weeklyThreshold: 99,   // Consider switching at 99% weekly usage
  autoSwitchOnRateLimit: false,  // Prompt user by default
  usageCheckInterval: 30000  // Check every 30s when enabled (0 = disabled)
};

/**
 * Internal storage format for Claude profiles
 */
export interface ProfileStoreData {
  version: number;
  profiles: ClaudeProfile[];
  activeProfileId: string;
  autoSwitch?: ClaudeAutoSwitchSettings;
}

/**
 * Load profiles from disk
 */
export function loadProfileStore(storePath: string): ProfileStoreData | null {
  try {
    if (existsSync(storePath)) {
      const content = readFileSync(storePath, 'utf-8');
      const data = JSON.parse(content);

      // Handle version migration
      if (data.version === 1) {
        // Migrate v1 to v2: add usage and rateLimitEvents fields
        data.version = STORE_VERSION;
        data.autoSwitch = DEFAULT_AUTO_SWITCH_SETTINGS;
      }

      if (data.version === STORE_VERSION) {
        // Parse dates
        data.profiles = data.profiles.map((p: ClaudeProfile) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          lastUsedAt: p.lastUsedAt ? new Date(p.lastUsedAt) : undefined,
          usage: p.usage ? {
            ...p.usage,
            lastUpdated: new Date(p.usage.lastUpdated)
          } : undefined,
          rateLimitEvents: p.rateLimitEvents?.map(e => ({
            ...e,
            hitAt: new Date(e.hitAt),
            resetAt: new Date(e.resetAt)
          }))
        }));
        return data;
      }
    }
  } catch (error) {
    console.error('[ProfileStorage] Error loading profiles:', error);
  }

  return null;
}

/**
 * Load profiles from disk (async, non-blocking)
 * Use this version for initialization to avoid blocking the main process.
 */
export async function loadProfileStoreAsync(storePath: string): Promise<ProfileStoreData | null> {
  try {
    // Check if file exists using async access()
    await access(storePath, constants.F_OK);

    // Read file asynchronously
    const content = await readFile(storePath, 'utf-8');
    const data = JSON.parse(content);

    // Handle version migration
    if (data.version === 1) {
      // Migrate v1 to v2: add usage and rateLimitEvents fields
      data.version = STORE_VERSION;
      data.autoSwitch = DEFAULT_AUTO_SWITCH_SETTINGS;
    }

    if (data.version === STORE_VERSION) {
      // Parse dates
      data.profiles = data.profiles.map((p: ClaudeProfile) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        lastUsedAt: p.lastUsedAt ? new Date(p.lastUsedAt) : undefined,
        usage: p.usage ? {
          ...p.usage,
          lastUpdated: new Date(p.usage.lastUpdated)
        } : undefined,
        rateLimitEvents: p.rateLimitEvents?.map(e => ({
          ...e,
          hitAt: new Date(e.hitAt),
          resetAt: new Date(e.resetAt)
        }))
      }));
      return data;
    }
  } catch (error) {
    // ENOENT is expected if file doesn't exist yet
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[ProfileStorage] Error loading profiles:', error);
    }
  }

  return null;
}

/**
 * Save profiles to disk
 */
export function saveProfileStore(storePath: string, data: ProfileStoreData): void {
  try {
    writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('[ProfileStorage] Error saving profiles:', error);
  }
}
