/**
 * Update status checking utilities
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import { getBundledVersion, compareVersions } from './version-manager';
import { UpdateMetadata } from './types';

/**
 * Check if there's a pending source update that requires restart
 */
export function hasPendingSourceUpdate(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  const overridePath = path.join(app.getPath('userData'), 'auto-claude-source');
  const metadataPath = path.join(overridePath, '.update-metadata.json');

  if (!existsSync(metadataPath)) {
    return false;
  }

  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8')) as UpdateMetadata;
    const bundledVersion = getBundledVersion();
    return compareVersions(metadata.version, bundledVersion) > 0;
  } catch {
    return false;
  }
}

/**
 * Get update metadata if available
 */
export function getUpdateMetadata(): UpdateMetadata | null {
  const overridePath = path.join(app.getPath('userData'), 'auto-claude-source');
  const metadataPath = path.join(overridePath, '.update-metadata.json');

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(metadataPath, 'utf-8')) as UpdateMetadata;
  } catch {
    return null;
  }
}
