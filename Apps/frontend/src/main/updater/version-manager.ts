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
      path.join(app.getAppPath(), '..', 'auto-claude'),
      path.join(app.getAppPath(), '..', '..', 'auto-claude'),
      path.join(process.cwd(), 'auto-claude'),
      path.join(process.cwd(), '..', 'auto-claude')
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
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}
