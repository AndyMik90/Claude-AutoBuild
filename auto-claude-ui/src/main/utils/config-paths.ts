/**
 * Configuration path utilities for cross-platform support.
 *
 * Provides XDG Base Directory specification-compliant paths for Linux,
 * with equivalent paths for macOS and Windows. Handles fallback for
 * read-only filesystems (AppImage, snap, flatpak).
 */

import { app } from 'electron';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { isWritablePath } from './fs-utils';

/**
 * Get XDG-compliant config home directory.
 *
 * @returns Platform-specific configuration directory
 *
 * - Linux: $XDG_CONFIG_HOME or ~/.config
 * - macOS: ~/Library/Application Support
 * - Windows: %APPDATA%
 */
export function getXdgConfigHome(): string {
  if (process.platform === 'win32') {
    return process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming');
  }

  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support');
  }

  // Linux/Unix: Follow XDG spec
  return process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
}

/**
 * Get Auto Claude user config directory.
 * Creates directory if it doesn't exist.
 *
 * @returns Path to Auto Claude config directory
 */
export function getAutoClaudeConfigDir(): string {
  const configHome = getXdgConfigHome();
  const autoClaudeDir = path.join(configHome, 'Auto-Claude');

  if (!existsSync(autoClaudeDir)) {
    mkdirSync(autoClaudeDir, { recursive: true });
  }

  return autoClaudeDir;
}

/**
 * Result type for getProjectConfigDir
 */
export interface ProjectConfigDir {
  /** Path to use for configuration storage */
  path: string;
  /** Whether this is global (not project-local) storage */
  isGlobal: boolean;
  /** Reason for using global storage (if applicable) */
  reason?: string;
}

/**
 * Get project-specific config directory with fallback support.
 *
 * Tries project-local directory first. If read-only (e.g., AppImage),
 * falls back to global user config directory.
 *
 * @param projectPath - Path to the project
 * @param autoBuildPath - Auto Claude build path within project
 * @returns Configuration directory info
 *
 * @example
 * ```typescript
 * const configDir = getProjectConfigDir('/path/to/project', '.auto-claude');
 * // Normal: { path: '/path/to/project/.auto-claude', isGlobal: false }
 * // AppImage: { path: '~/.config/Auto-Claude/projects/abc123', isGlobal: true }
 * ```
 */
export function getProjectConfigDir(
  projectPath: string,
  autoBuildPath: string
): ProjectConfigDir {
  const projectConfigPath = path.join(projectPath, autoBuildPath);

  // Check if project directory is writable
  if (isWritablePath(projectConfigPath)) {
    return { path: projectConfigPath, isGlobal: false };
  }

  // Fallback to global config directory
  const globalDir = getAutoClaudeConfigDir();

  // Create unique hash of project path for global storage
  const projectHash = Buffer.from(projectPath)
    .toString('base64')
    .replace(/[/+=]/g, ''); // Make base64 URL-safe and prevent path traversal

  const projectGlobalDir = path.join(globalDir, 'projects', projectHash);

  if (!existsSync(projectGlobalDir)) {
    mkdirSync(projectGlobalDir, { recursive: true });
  }

  return {
    path: projectGlobalDir,
    isGlobal: true,
    reason: 'Project directory is read-only (AppImage, snap, or immutable filesystem)'
  };
}
