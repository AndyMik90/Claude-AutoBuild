/**
 * Python Path Utilities
 *
 * Centralized utilities for constructing Python executable paths
 * across different environment types (conda, venv) and platforms.
 */

import path from 'path';

/**
 * Platform abstraction: check if running on Windows.
 * Use this instead of checking process.platform directly.
 */
export function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Platform abstraction: check if running on macOS.
 * Use this instead of checking process.platform directly.
 */
export function isMac(): boolean {
  return process.platform === 'darwin';
}

/**
 * Platform abstraction: check if running on Linux.
 * Use this instead of checking process.platform directly.
 */
export function isLinux(): boolean {
  return process.platform === 'linux';
}

/**
 * Get the path delimiter for the current platform.
 * Use this for joining paths in environment variables like PYTHONPATH.
 * Windows uses ';', Unix-like systems use ':'.
 */
export function getPathDelimiter(): string {
  return isWindows() ? ';' : ':';
}

/**
 * Get the Python executable path within a conda environment.
 * Conda environments have python.exe at the root level on Windows.
 */
export function getCondaPythonPath(envPath: string): string {
  if (process.platform === 'win32') {
    return path.join(envPath, 'python.exe');
  }
  return path.join(envPath, 'bin', 'python');
}

/**
 * Get the Python executable path within a venv.
 * Venvs have python.exe in the Scripts folder on Windows.
 */
export function getVenvPythonPath(venvPath: string): string {
  if (process.platform === 'win32') {
    return path.join(venvPath, 'Scripts', 'python.exe');
  }
  return path.join(venvPath, 'bin', 'python');
}

/**
 * Get the pip executable path within a conda environment.
 * Conda environments have pip.exe at the root level on Windows.
 */
export function getCondaPipPath(envPath: string): string {
  if (process.platform === 'win32') {
    return path.join(envPath, 'pip.exe');
  }
  return path.join(envPath, 'bin', 'pip');
}

/**
 * Get the pip executable path within a venv.
 * Venvs have pip.exe in the Scripts folder on Windows.
 */
export function getVenvPipPath(venvPath: string): string {
  if (process.platform === 'win32') {
    return path.join(venvPath, 'Scripts', 'pip.exe');
  }
  return path.join(venvPath, 'bin', 'pip');
}
