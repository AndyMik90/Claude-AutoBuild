/**
 * Filesystem utility functions for checking write permissions.
 *
 * Provides reliable detection of read-only filesystems commonly found
 * in AppImage, snap, and flatpak deployments.
 */

import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';

/**
 * Check if a directory path is writable.
 *
 * Uses actual write test for reliability instead of just checking permissions,
 * which can be unreliable on some filesystems.
 *
 * @param dirPath - Directory path to check
 * @returns true if writable, false otherwise
 *
 * @example
 * ```typescript
 * if (isWritablePath('/tmp/.mount_app/resources')) {
 *   // This will return false - AppImage mount is read-only
 * }
 * ```
 */
export function isWritablePath(dirPath: string): boolean {
  // Ensure directory exists first
  if (!existsSync(dirPath)) {
    try {
      mkdirSync(dirPath, { recursive: true });
    } catch {
      return false;
    }
  }

  try {
    // Try to create a test file with timestamp + random suffix to prevent collisions
    const testFile = path.join(dirPath, `.write-test-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    writeFileSync(testFile, 'test', { flag: 'w' });
    unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file path is within a read-only mount.
 *
 * Detects common read-only mount patterns:
 * - AppImage: /tmp/.mount_*
 * - Snap: /snap/*/current/
 * - Flatpak: /.var/app/
 *
 * @param filePath - File path to check
 * @returns true if path appears to be in a read-only mount
 *
 * @example
 * ```typescript
 * isReadOnlyPath('/tmp/.mount_autocla5qgnK/resources/app.asar');
 * // Returns: true (AppImage mount detected)
 * ```
 */
export function isReadOnlyPath(filePath: string): boolean {
  // Check for AppImage mount
  if (filePath.startsWith('/tmp/.mount_')) {
    return true;
  }

  // Check for snap mount
  if (filePath.includes('/snap/') && filePath.includes('/current/')) {
    return true;
  }

  // Check for flatpak
  if (filePath.includes('/.var/app/')) {
    return true;
  }

  // Actual write test as final check
  const dirPath = path.dirname(filePath);
  return !isWritablePath(dirPath);
}
