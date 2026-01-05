/**
 * Profile Utilities Module
 * Helper functions for profile operations
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, readdirSync, mkdirSync } from 'fs';
import type { ClaudeProfile } from '../../shared/types';

/**
 * Default Claude config directory
 */
export const DEFAULT_CLAUDE_CONFIG_DIR = join(homedir(), '.claude');

/**
 * Default profiles directory for additional accounts
 */
export const CLAUDE_PROFILES_DIR = join(homedir(), '.claude-profiles');

/**
 * Generate a unique ID for a new profile
 */
export function generateProfileId(name: string, existingProfiles: ClaudeProfile[]): string {
  const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let id = baseId;
  let counter = 1;

  while (existingProfiles.some(p => p.id === id)) {
    id = `${baseId}-${counter}`;
    counter++;
  }

  return id;
}

/**
 * Create a new profile directory and initialize it
 */
export async function createProfileDirectory(profileName: string): Promise<string> {
  // Ensure profiles directory exists
  if (!existsSync(CLAUDE_PROFILES_DIR)) {
    mkdirSync(CLAUDE_PROFILES_DIR, { recursive: true });
  }

  // Create directory for this profile
  const sanitizedName = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const profileDir = join(CLAUDE_PROFILES_DIR, sanitizedName);

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  return profileDir;
}

/**
 * Check if a profile has valid authentication
 * (checks if the config directory has credential files or OAuth account info)
 */
export function isProfileAuthenticated(profile: ClaudeProfile): boolean {
  const configDir = profile.configDir;
  if (!configDir || !existsSync(configDir)) {
    return false;
  }

  // Check for .claude.json with OAuth account info (modern Claude Code CLI)
  // This is how Claude Code CLI stores OAuth authentication since v1.0
  const claudeJsonPath = join(configDir, '.claude.json');
  if (existsSync(claudeJsonPath)) {
    try {
      const content = readFileSync(claudeJsonPath, 'utf-8');
      const data = JSON.parse(content);
      // Check for oauthAccount which indicates successful OAuth authentication
      if (data && typeof data === 'object' && (data.oauthAccount?.accountUuid || data.oauthAccount?.emailAddress)) {
        return true;
      }
    } catch (error) {
      // Log parse errors for debugging, but fall through to legacy checks
      console.warn(`[profile-utils] Failed to read or parse ${claudeJsonPath}:`, error);
    }
  }

  // Legacy: Claude stores auth in .claude/credentials or similar files
  // Check for common auth indicators
  const possibleAuthFiles = [
    join(configDir, 'credentials'),
    join(configDir, 'credentials.json'),
    join(configDir, '.credentials'),
    join(configDir, 'settings.json'),  // Often contains auth tokens
  ];

  for (const authFile of possibleAuthFiles) {
    if (existsSync(authFile)) {
      try {
        const content = readFileSync(authFile, 'utf-8');
        // Check if file has actual content (not just empty or placeholder)
        if (content.length > 10) {
          return true;
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  // Also check if there are any session files (indicates authenticated usage)
  const projectsDir = join(configDir, 'projects');
  if (existsSync(projectsDir)) {
    try {
      const projects = readdirSync(projectsDir);
      if (projects.length > 0) {
        return true;
      }
    } catch {
      // Ignore read errors
    }
  }

  return false;
}

/**
 * Check if a profile has a valid OAuth token.
 * Token is valid for 1 year from creation.
 */
export function hasValidToken(profile: ClaudeProfile): boolean {
  if (!profile?.oauthToken) {
    return false;
  }

  // Check if token is expired (1 year validity)
  if (profile.tokenCreatedAt) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (new Date(profile.tokenCreatedAt) < oneYearAgo) {
      console.warn('[ProfileUtils] Token expired for profile:', profile.name);
      return false;
    }
  }

  return true;
}

/**
 * Expand ~ in path to home directory
 */
export function expandHomePath(path: string): string {
  if (path && path.startsWith('~')) {
    const home = homedir();
    return path.replace(/^~/, home);
  }
  return path;
}
