/**
 * Filesystem Utilities Module
 *
 * Provides utility functions for filesystem operations with
 * proper support for XDG Base Directory paths and sandboxed
 * environments (AppImage, Flatpak, Snap).
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAppPath, isImmutableEnvironment, getMemoriesDir } from './config-paths';

/**
 * Ensure a directory exists, creating it if necessary
 *
 * @param dirPath - The path to the directory
 * @returns true if directory exists or was created, false on error
 */
export function ensureDir(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error(`[fs-utils] Failed to create directory ${dirPath}:`, error);
    return false;
  }
}

/**
 * Ensure the application data directories exist
 * Creates config, data, cache, and memories directories
 */
export function ensureAppDirectories(): void {
  const dirs = [
    getAppPath('config'),
    getAppPath('data'),
    getAppPath('cache'),
    getMemoriesDir(),
  ];

  for (const dir of dirs) {
    ensureDir(dir);
  }
}

/**
 * Get a writable path for a file
 * If the original path is not writable, falls back to XDG data directory
 *
 * @param originalPath - The preferred path for the file
 * @param filename - The filename (used for fallback path)
 * @returns A writable path for the file
 */
export function getWritablePath(originalPath: string, filename: string): string {
  // Check if we can write to the original path
  const dir = path.dirname(originalPath);

  try {
    if (fs.existsSync(dir)) {
      // Try to write a test file
      const testFile = path.join(dir, `.write-test-${Date.now()}`);
      fs.writeFileSync(testFile, '');
      fs.unlinkSync(testFile);
      return originalPath;
    } else {
      // Try to create the directory
      fs.mkdirSync(dir, { recursive: true });
      return originalPath;
    }
  } catch {
    // Fall back to XDG data directory
    if (isImmutableEnvironment()) {
      const fallbackDir = getAppPath('data');
      ensureDir(fallbackDir);
      console.warn(`[fs-utils] Falling back to XDG path for ${filename}: ${fallbackDir}`);
      return path.join(fallbackDir, filename);
    }
    // Non-immutable environment - just return original and let caller handle error
    return originalPath;
  }
}

/**
 * Safe write file that handles immutable filesystems
 * Falls back to XDG paths if the target is not writable
 *
 * @param filePath - The target file path
 * @param content - The content to write
 * @returns The actual path where the file was written
 */
export function safeWriteFile(filePath: string, content: string): string {
  const filename = path.basename(filePath);
  const writablePath = getWritablePath(filePath, filename);

  fs.writeFileSync(writablePath, content, 'utf-8');
  return writablePath;
}

/**
 * Read a file, checking both original and XDG fallback locations
 *
 * @param originalPath - The expected file path
 * @returns The file content or null if not found
 */
export function safeReadFile(originalPath: string): string | null {
  // Try original path first
  if (fs.existsSync(originalPath)) {
    return fs.readFileSync(originalPath, 'utf-8');
  }

  // Try XDG fallback path
  if (isImmutableEnvironment()) {
    const filename = path.basename(originalPath);
    const fallbackPath = path.join(getAppPath('data'), filename);
    if (fs.existsSync(fallbackPath)) {
      return fs.readFileSync(fallbackPath, 'utf-8');
    }
  }

  return null;
}
