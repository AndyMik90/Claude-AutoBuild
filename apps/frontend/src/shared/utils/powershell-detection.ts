/**
 * PowerShell Detection Utilities
 * Shared utilities for detecting and locating PowerShell installations
 */

import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Base paths where PowerShell is typically installed on Windows
 */
export const POWERSHELL_BASE_PATHS = [
  'C:\\Program Files\\PowerShell',
  'C:\\Program Files (x86)\\PowerShell'
] as const;

/**
 * Windows PowerShell 5.1 path (legacy)
 */
export const WINDOWS_POWERSHELL_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

/**
 * Scan PowerShell installation directories to find all pwsh.exe installations
 * Returns array of paths sorted by version (highest first)
 */
export function scanPowerShellInstallations(): string[] {
  const foundPaths: Array<{ path: string; version: number }> = [];

  for (const basePath of POWERSHELL_BASE_PATHS) {
    if (!existsSync(basePath)) {
      continue;
    }

    try {
      const entries = readdirSync(basePath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pwshPath = path.join(basePath, entry.name, 'pwsh.exe');
          if (existsSync(pwshPath)) {
            const version = parseInt(entry.name, 10);
            foundPaths.push({ path: pwshPath, version: isNaN(version) ? 0 : version });
          }
        }
      }
    } catch (err) {
      // Directory read failed, continue to next path
      console.warn(`[powershell-detection] Failed to scan ${basePath}:`, err);
    }
  }

  // Sort by version descending (highest first) and return paths
  return foundPaths
    .sort((a, b) => b.version - a.version)
    .map(item => item.path);
}

/**
 * Check if pwsh.exe is available in PATH
 */
export function isPwshInPath(): boolean {
  try {
    execSync('where.exe pwsh.exe', { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

