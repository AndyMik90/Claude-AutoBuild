import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

/**
 * Common paths where Node.js/npm might be installed.
 * These paths are checked when the default PATH doesn't include npm/npx.
 */
const COMMON_NODE_PATHS = {
  darwin: [
    '/usr/local/bin',
    '/opt/homebrew/bin',
    `${os.homedir()}/.nvm/versions/node`, // nvm installations
    `${os.homedir()}/.fnm/node-versions`, // fnm installations
    `${os.homedir()}/.volta/bin`, // volta installations
    `${os.homedir()}/.asdf/shims`, // asdf installations
    '/usr/bin',
  ],
  linux: [
    '/usr/local/bin',
    '/usr/bin',
    `${os.homedir()}/.nvm/versions/node`,
    `${os.homedir()}/.fnm/node-versions`,
    `${os.homedir()}/.volta/bin`,
    `${os.homedir()}/.asdf/shims`,
    `${os.homedir()}/.local/bin`,
  ],
  win32: [
    `${process.env.APPDATA}\\npm`,
    `${process.env.PROGRAMFILES}\\nodejs`,
    `${process.env.LOCALAPPDATA}\\Programs\\nodejs`,
    `${os.homedir()}\\AppData\\Roaming\\nvm`, // nvm-windows
  ],
};

/**
 * Find the directory containing npm/npx executables.
 * This is necessary because Electron apps launched from Finder/Spotlight
 * don't inherit the user's shell PATH modifications.
 *
 * @returns The directory containing npm/npx, or null if not found
 */
export function findNodeBinPath(): string | null {
  const isWindows = process.platform === 'win32';
  const npxName = isWindows ? 'npx.cmd' : 'npx';

  // First, try to find npx in the current PATH
  try {
    const whichCmd = isWindows ? 'where npx' : 'which npx';
    const result = execSync(whichCmd, {
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true,
      encoding: 'utf-8',
    }).trim();

    if (result) {
      // Return the directory containing npx
      const lines = result.split(/\r?\n/);
      const firstResult = lines[0];
      if (firstResult && existsSync(firstResult)) {
        return path.dirname(firstResult);
      }
    }
  } catch {
    // npx not in PATH, continue to check common paths
  }

  // Check common installation paths
  const platform = process.platform as keyof typeof COMMON_NODE_PATHS;
  const commonPaths = COMMON_NODE_PATHS[platform] || [];

  for (const basePath of commonPaths) {
    // Handle version managers (nvm, fnm) that have version subdirectories
    if (basePath.includes('nvm/versions/node') || basePath.includes('fnm/node-versions')) {
      try {
        // Find the most recent Node version directory
        const { readdirSync } = require('fs');
        if (existsSync(basePath)) {
          const versions = readdirSync(basePath)
            .filter((v: string) => v.startsWith('v'))
            .sort()
            .reverse();

          for (const version of versions) {
            const binPath = path.join(basePath, version, 'bin');
            const npxPath = path.join(binPath, npxName);
            if (existsSync(npxPath)) {
              return binPath;
            }
          }
        }
      } catch {
        // Directory doesn't exist or can't be read
        continue;
      }
    } else {
      // Direct path check
      const npxPath = path.join(basePath, npxName);
      if (existsSync(npxPath)) {
        return basePath;
      }
    }
  }

  return null;
}

/**
 * Get an enhanced PATH environment variable that includes Node.js bin directory.
 * This ensures npm/npx can be found even when Electron doesn't inherit the shell PATH.
 *
 * @returns Enhanced PATH string with Node.js bin directory prepended
 */
export function getEnhancedPath(): string {
  const currentPath = process.env.PATH || '';
  const nodeBinPath = findNodeBinPath();

  if (!nodeBinPath) {
    return currentPath;
  }

  // Check if the path is already included
  const pathSep = process.platform === 'win32' ? ';' : ':';
  const pathParts = currentPath.split(pathSep);

  if (pathParts.includes(nodeBinPath)) {
    return currentPath;
  }

  // Prepend the Node bin path so it takes precedence
  return `${nodeBinPath}${pathSep}${currentPath}`;
}

/**
 * Check if npm/npx is available in the current or enhanced PATH.
 *
 * @returns true if npx is available, false otherwise
 */
export function isNodeAvailable(): boolean {
  const isWindows = process.platform === 'win32';

  try {
    execSync(isWindows ? 'npx --version' : 'npx --version', {
      stdio: 'pipe',
      timeout: 5000,
      windowsHide: true,
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
      },
    });
    return true;
  } catch {
    return false;
  }
}
