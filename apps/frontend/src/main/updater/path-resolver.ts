/**
 * Path resolution utilities for Auto Claude updater
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * Get the path to the bundled backend source
 */
export function getBundledSourcePath(): string {
  // In production, use app resources
  // In development, use the repo's apps/backend folder
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend');
  }

  // Development mode - look for backend in various locations
  const possiblePaths = [
    // Starting from current working directory (most reliable for npm run dev)
    path.join(process.cwd(), 'apps', 'backend'),
    // From frontend folder to backend folder
    path.join(process.cwd(), '..', 'backend'),
    // From out/main to apps/backend (electron-vite output structure)
    path.join(__dirname, '..', '..', '..', 'apps', 'backend'),
    // New structure: apps/frontend -> apps/backend
    path.join(app.getAppPath(), '..', 'backend'),
    path.join(app.getAppPath(), '..', '..', 'apps', 'backend')
  ];

  for (const p of possiblePaths) {
    const normalized = path.resolve(p);
    // Validate it's a proper backend source (must have runners/spec_runner.py)
    const markerPath = path.join(normalized, 'runners', 'spec_runner.py');

    if (existsSync(normalized) && existsSync(markerPath)) {
      // HIGH PRIORITY FIX: In dev mode, skip paths that look like packaged apps
      if (!app.isPackaged) {
        const isPackagedAppPath =
          normalized.includes('/Applications/') ||
          normalized.includes('/Contents/Resources/') ||
          normalized.includes('\\Program Files\\') ||
          normalized.includes('\\WindowsApps\\');

        if (isPackagedAppPath) {
          console.log('[path-resolver] Skipping packaged app path candidate:', normalized);
          continue; // Try next path
        }
      }

      console.log(`[path-resolver] Found backend at: ${normalized}`);
      return normalized;
    }
  }

  // Fallback - warn if this path is also invalid
  const fallback = path.join(app.getAppPath(), '..', 'backend');
  const fallbackMarker = path.join(fallback, 'runners', 'spec_runner.py');
  if (!existsSync(fallbackMarker)) {
    console.warn(
      `[path-resolver] No valid backend source found in development paths, fallback "${fallback}" may be invalid`
    );
  }
  return fallback;
}

/**
 * Get the path for storing downloaded updates
 */
export function getUpdateCachePath(): string {
  return path.join(app.getPath('userData'), 'auto-claude-updates');
}

/**
 * Get the effective source path (considers override from updates and settings)
 */
export function getEffectiveSourcePath(): string {
  // First, check user settings for configured autoBuildPath
  // BUT: In dev mode, ignore settings that point to packaged app locations
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (settings.autoBuildPath && existsSync(settings.autoBuildPath)) {
        // Validate it's a proper backend source (must have runners/spec_runner.py)
        const markerPath = path.join(settings.autoBuildPath, 'runners', 'spec_runner.py');

        if (existsSync(markerPath)) {
          // CRITICAL FIX: In development mode, ignore paths that point to packaged apps
          if (!app.isPackaged) {
            const normalizedPath = path.resolve(settings.autoBuildPath);
            const isPackagedAppPath =
              normalizedPath.includes('/Applications/') ||
              normalizedPath.includes('/Contents/Resources/') ||
              normalizedPath.includes('\\Program Files\\') ||
              normalizedPath.includes('\\WindowsApps\\');

            if (isPackagedAppPath) {
              console.log('[path-resolver] Ignoring packaged app path in dev mode:', normalizedPath);
              // Fall through to getBundledSourcePath()
            } else {
              // Return normalized path for consistency
              return normalizedPath;
            }
          } else {
            // Return normalized path for consistency
            return path.resolve(settings.autoBuildPath);
          }
        } else {
          // Invalid path - log warning and fall through to auto-detection
          console.warn(
            `[path-resolver] Configured autoBuildPath "${settings.autoBuildPath}" is missing runners/spec_runner.py, falling back to bundled source`
          );
        }
      }
    }
  } catch {
    // Ignore settings read errors
  }

  if (app.isPackaged) {
    // Check for user-updated source first
    const overridePath = path.join(app.getPath('userData'), 'backend-source');
    const overrideMarker = path.join(overridePath, 'runners', 'spec_runner.py');
    if (existsSync(overridePath) && existsSync(overrideMarker)) {
      return overridePath;
    }
  }

  return getBundledSourcePath();
}

/**
 * Get the path where updates should be installed
 */
export function getUpdateTargetPath(): string {
  if (app.isPackaged) {
    // For packaged apps, store in userData as a source override
    return path.join(app.getPath('userData'), 'backend-source');
  } else {
    // In development, update the actual source
    return getBundledSourcePath();
  }
}
