/**
 * Profile Storage Module
 * Handles persistence of profile data to disk
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
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
 * Parse and migrate profile data from JSON.
 * Handles version migration and date parsing.
 * Shared helper used by both sync and async loaders.
 */
function parseAndMigrateProfileData(data: Record<string, unknown>): ProfileStoreData | null {
  // Handle version migration
  if (data.version === 1) {
    // Migrate v1 to v2: add usage and rateLimitEvents fields
    data.version = STORE_VERSION;
    data.autoSwitch = DEFAULT_AUTO_SWITCH_SETTINGS;
  }

  if (data.version === STORE_VERSION) {
    // Parse dates
    const profiles = data.profiles as ClaudeProfile[];
    data.profiles = profiles.map((p: ClaudeProfile) => ({
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
    return data as unknown as ProfileStoreData;
  }

  return null;
}

/**
 * Load profiles from disk
 */
export function loadProfileStore(storePath: string): ProfileStoreData | null {
  try {
    if (existsSync(storePath)) {
      const content = readFileSync(storePath, 'utf-8');
      const data = JSON.parse(content);
      return parseAndMigrateProfileData(data);
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
    // Read file directly - avoid TOCTOU race condition by not checking existence first
    // If file doesn't exist, readFile will throw ENOENT which we handle below
    const content = await readFile(storePath, 'utf-8');
    const data = JSON.parse(content);
    return parseAndMigrateProfileData(data);
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
