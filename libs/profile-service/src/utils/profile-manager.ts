/**
 * Profile Manager - File I/O for API profiles
 *
 * Handles loading and saving profiles.json from the auto-claude directory.
 * Provides graceful handling for missing or corrupted files.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import type { APIProfile, ProfilesFile } from '../types/profile';

/**
 * Get the path to profiles.json in the auto-claude directory
 */
export function getProfilesFilePath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'auto-claude', 'profiles.json');
}

/**
 * Check if a value is a valid profile object with required fields
 */
function isValidProfile(value: unknown): value is APIProfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const profile = value as Record<string, unknown>;
  return (
    typeof profile.id === 'string' &&
    typeof profile.name === 'string' &&
    typeof profile.baseUrl === 'string' &&
    typeof profile.apiKey === 'string' &&
    typeof profile.createdAt === 'number' &&
    typeof profile.updatedAt === 'number'
  );
}

/**
 * Validate the structure of parsed profiles data
 */
function isValidProfilesFile(data: unknown): data is ProfilesFile {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;

  // Check profiles is an array
  if (!Array.isArray(obj.profiles)) {
    return false;
  }

  // Check each profile has required fields
  for (const profile of obj.profiles) {
    if (!isValidProfile(profile)) {
      return false;
    }
  }

  // Check activeProfileId is string or null
  if (obj.activeProfileId !== null && typeof obj.activeProfileId !== 'string') {
    return false;
  }

  // Check version is a number
  if (typeof obj.version !== 'number') {
    return false;
  }

  return true;
}

/**
 * Default profiles file structure for fallback
 */
function getDefaultProfilesFile(): ProfilesFile {
  return {
    profiles: [],
    activeProfileId: null,
    version: 1
  };
}

/**
 * Load profiles.json from disk
 * Returns default empty profiles file if file doesn't exist or is corrupted
 */
export async function loadProfilesFile(): Promise<ProfilesFile> {
  const filePath = getProfilesFilePath();

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Validate parsed data structure
    if (isValidProfilesFile(data)) {
      return data;
    }

    // Validation failed - return default
    return getDefaultProfilesFile();
  } catch (error) {
    // File doesn't exist or read/parse error - return default
    return getDefaultProfilesFile();
  }
}

/**
 * Save profiles.json to disk
 * Creates the auto-claude directory if it doesn't exist
 */
export async function saveProfilesFile(data: ProfilesFile): Promise<void> {
  const filePath = getProfilesFilePath();
  const dir = path.dirname(filePath);

  // Ensure directory exists
  // mkdir with recursive: true resolves successfully if dir already exists
  await fs.mkdir(dir, { recursive: true });

  // Write file with formatted JSON
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, content, 'utf-8');
}

/**
 * Generate a unique UUID v4 for a new profile
 */
export function generateProfileId(): string {
  // Use crypto.randomUUID() if available (Node.js 16+ and modern browsers)
  // Fall back to hand-rolled implementation for older environments
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback: hand-rolled UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate and set file permissions to user-readable only
 * Returns true if successful, false otherwise
 */
export async function validateFilePermissions(filePath: string): Promise<boolean> {
  try {
    // Set file permissions to user-readable only (0600)
    await fs.chmod(filePath, 0o600);
    return true;
  } catch {
    return false;
  }
}
