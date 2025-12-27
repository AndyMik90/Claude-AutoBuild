/**
 * Version management utilities
 */

import { app } from 'electron';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { UpdateMetadata } from './types';

/**
 * Get the current app/framework version from package.json
 *
 * Uses app.getVersion() (from package.json) as the base version.
 */
export function getBundledVersion(): string {
  return app.getVersion();
}

/**
 * Get the effective version - accounts for source updates
 *
 * Returns the updated source version if an update has been applied,
 * otherwise returns the bundled version.
 */
export function getEffectiveVersion(): string {
  const isDebug = process.env.DEBUG === 'true';

  // Build list of paths to check for update metadata
  const metadataPaths: string[] = [];

  if (app.isPackaged) {
    // Production: check userData override path
    metadataPaths.push(
      path.join(app.getPath('userData'), 'auto-claude-source', '.update-metadata.json')
    );
  } else {
    // Development: check the actual source paths where updates are written
    const possibleSourcePaths = [
      // Apps structure: apps/backend
      path.join(app.getAppPath(), '..', 'backend'),
      path.join(process.cwd(), 'apps', 'backend'),
      path.resolve(__dirname, '..', '..', '..', 'backend')
    ];

    for (const sourcePath of possibleSourcePaths) {
      metadataPaths.push(path.join(sourcePath, '.update-metadata.json'));
    }
  }

  if (isDebug) {
    console.log('[Version] Checking metadata paths:', metadataPaths);
  }

  // Check each path for metadata
  for (const metadataPath of metadataPaths) {
    const exists = existsSync(metadataPath);
    if (isDebug) {
      console.log(`[Version] Checking ${metadataPath}: ${exists ? 'EXISTS' : 'not found'}`);
    }
    if (exists) {
      try {
        const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as UpdateMetadata;
        if (metadata.version) {
          if (isDebug) {
            console.log(`[Version] Found metadata version: ${metadata.version}`);
          }
          return metadata.version;
        }
      } catch (e) {
        if (isDebug) {
          console.log(`[Version] Error reading metadata: ${e}`);
        }
        // Continue to next path
      }
    }
  }

  const bundledVersion = app.getVersion();
  if (isDebug) {
    console.log(`[Version] No metadata found, using bundled version: ${bundledVersion}`);
  }
  return bundledVersion;
}

/**
 * Parse version from GitHub release tag
 * Handles tags like "v1.2.0", "1.2.0", "v1.2.0-beta"
 */
export function parseVersionFromTag(tag: string): string {
  // Remove leading 'v' if present
  return tag.replace(/^v/, '');
}

/**
 * Parse a version string into its components
 * Handles versions like "2.7.2", "2.7.2-beta.6", "2.7.2-alpha.1"
 * 
 * @returns { base: number[], prerelease: { type: string, num: number } | null }
 */
function parseVersion(version: string): { 
  base: number[]; 
  prerelease: { type: string; num: number } | null 
} {
  // Split into base version and prerelease suffix
  // e.g., "2.7.2-beta.6" -> ["2.7.2", "beta.6"]
  const [baseStr, prereleaseStr] = version.split('-');
  
  // Parse base version numbers
  const base = baseStr.split('.').map(n => parseInt(n, 10) || 0);
  
  // Parse prerelease if present
  let prerelease: { type: string; num: number } | null = null;
  if (prereleaseStr) {
    // Handle formats like "beta.6", "alpha.1", "rc.2"
    const match = prereleaseStr.match(/^([a-zA-Z]+)\.?(\d*)$/);
    if (match) {
      prerelease = {
        type: match[1].toLowerCase(),
        num: parseInt(match[2], 10) || 0
      };
    }
  }
  
  return { base, prerelease };
}

/**
 * Compare semantic versions with proper pre-release support
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 * 
 * Pre-release ordering:
 * - alpha < beta < rc < stable (no prerelease)
 * - 2.7.2-beta.1 < 2.7.2-beta.2 < 2.7.2 (stable)
 * - 2.7.1 < 2.7.2-beta.1 < 2.7.2
 */
export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  
  // Compare base versions first
  const maxLen = Math.max(parsedA.base.length, parsedB.base.length);
  for (let i = 0; i < maxLen; i++) {
    const numA = parsedA.base[i] || 0;
    const numB = parsedB.base[i] || 0;
    
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  
  // Base versions are equal, compare prereleases
  // No prerelease = stable = higher than any prerelease of same base
  if (!parsedA.prerelease && !parsedB.prerelease) return 0;
  if (!parsedA.prerelease && parsedB.prerelease) return 1;  // a is stable, b is prerelease
  if (parsedA.prerelease && !parsedB.prerelease) return -1; // a is prerelease, b is stable
  
  // Both have prereleases - compare type then number
  const prereleaseOrder: Record<string, number> = { alpha: 0, beta: 1, rc: 2 };
  const typeA = prereleaseOrder[parsedA.prerelease!.type] ?? 1;
  const typeB = prereleaseOrder[parsedB.prerelease!.type] ?? 1;
  
  if (typeA > typeB) return 1;
  if (typeA < typeB) return -1;
  
  // Same prerelease type, compare numbers
  if (parsedA.prerelease!.num > parsedB.prerelease!.num) return 1;
  if (parsedA.prerelease!.num < parsedB.prerelease!.num) return -1;
  
  return 0;
}
