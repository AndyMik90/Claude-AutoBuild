/**
 * WSL (Windows Subsystem for Linux) path utilities
 *
 * Provides functions to detect, parse, and translate paths between
 * Windows UNC format (\\wsl$\...) and Linux format (/home/...).
 */

/**
 * Pattern to match WSL UNC paths:
 * - \\wsl$\<distro>\<path>
 * - \\wsl.localhost\<distro>\<path>
 *
 * Groups:
 * 1. Distro name (e.g., "Ubuntu", "Ubuntu-22.04")
 * 2. Linux path without leading slash (e.g., "home/user/project")
 */
const WSL_UNC_PATTERN = /^\\\\wsl(?:\$|\.localhost)\\([^\\]+)\\?(.*)$/i;

/**
 * Alternative pattern for forward-slash WSL paths (some file dialogs return this)
 * - //wsl$/<distro>/<path>
 * - //wsl.localhost/<distro>/<path>
 */
const WSL_FORWARD_SLASH_PATTERN = /^\/\/wsl(?:\$|\.localhost)\/([^/]+)\/?(.*)$/i;

/**
 * Check if a path is in the WSL filesystem
 *
 * @param filepath - Path to check (Windows or forward-slash format)
 * @returns true if the path is a WSL UNC path
 *
 * @example
 * isWSLPath('\\\\wsl$\\Ubuntu\\home\\user') // true
 * isWSLPath('//wsl$/Ubuntu/home/user') // true
 * isWSLPath('C:\\Users\\user') // false
 */
export function isWSLPath(filepath: string): boolean {
  if (!filepath) return false;
  return WSL_UNC_PATTERN.test(filepath) || WSL_FORWARD_SLASH_PATTERN.test(filepath);
}

/**
 * Extract the WSL distribution name from a WSL path
 *
 * @param filepath - WSL UNC path
 * @returns Distribution name or null if not a WSL path
 *
 * @example
 * getWSLDistroFromPath('\\\\wsl$\\Ubuntu-22.04\\home\\user') // 'Ubuntu-22.04'
 * getWSLDistroFromPath('C:\\Users\\user') // null
 */
export function getWSLDistroFromPath(filepath: string): string | null {
  if (!filepath) return null;

  let match = filepath.match(WSL_UNC_PATTERN);
  if (match) return match[1];

  match = filepath.match(WSL_FORWARD_SLASH_PATTERN);
  if (match) return match[1];

  return null;
}

/**
 * Convert a Windows WSL UNC path to a Linux path
 *
 * @param windowsPath - Windows UNC path (\\wsl$\distro\path or //wsl$/distro/path)
 * @returns Linux path (/path) or original path if not a WSL path
 *
 * @example
 * windowsToWSLPath('\\\\wsl$\\Ubuntu\\home\\user\\project') // '/home/user/project'
 * windowsToWSLPath('//wsl$/Ubuntu/home/user/project') // '/home/user/project'
 * windowsToWSLPath('C:\\Users\\user') // 'C:\\Users\\user' (unchanged)
 */
export function windowsToWSLPath(windowsPath: string): string {
  if (!windowsPath) return windowsPath;

  // Try backslash pattern first
  let match = windowsPath.match(WSL_UNC_PATTERN);
  if (match) {
    const linuxPath = match[2].replace(/\\/g, '/');
    return linuxPath ? `/${linuxPath}` : '/';
  }

  // Try forward-slash pattern
  match = windowsPath.match(WSL_FORWARD_SLASH_PATTERN);
  if (match) {
    const linuxPath = match[2];
    return linuxPath ? `/${linuxPath}` : '/';
  }

  // Not a WSL path, return unchanged
  return windowsPath;
}

/**
 * Convert a Linux path to a Windows WSL UNC path
 *
 * @param linuxPath - Linux path (e.g., /home/user/project)
 * @param distro - WSL distribution name (e.g., "Ubuntu")
 * @returns Windows UNC path (\\wsl$\distro\path)
 *
 * @example
 * wslToWindowsPath('/home/user/project', 'Ubuntu') // '\\\\wsl$\\Ubuntu\\home\\user\\project'
 */
export function wslToWindowsPath(linuxPath: string, distro: string): string {
  if (!linuxPath || !distro) {
    throw new Error('Both linuxPath and distro are required');
  }

  // Remove leading slash and convert to Windows path separators
  const windowsSubPath = linuxPath.replace(/^\//, '').replace(/\//g, '\\');

  return `\\\\wsl$\\${distro}\\${windowsSubPath}`;
}

/**
 * Normalize a path that might be a WSL path
 * Converts forward-slash WSL paths to backslash format for consistency
 *
 * @param filepath - Path to normalize
 * @returns Normalized path with consistent format
 */
export function normalizeWSLPath(filepath: string): string {
  if (!filepath) return filepath;

  // If it's a forward-slash WSL path, convert to backslash
  const match = filepath.match(WSL_FORWARD_SLASH_PATTERN);
  if (match) {
    const distro = match[1];
    const subPath = match[2].replace(/\//g, '\\');
    return `\\\\wsl$\\${distro}\\${subPath}`;
  }

  return filepath;
}

/**
 * Get WSL context information for a path
 *
 * @param filepath - Path to analyze
 * @returns Object with WSL context or null values if not a WSL path
 */
export function getWSLContext(filepath: string): {
  isWSL: boolean;
  distro: string | null;
  linuxPath: string | null;
  windowsPath: string;
} {
  const isWSL = isWSLPath(filepath);

  if (!isWSL) {
    return {
      isWSL: false,
      distro: null,
      linuxPath: null,
      windowsPath: filepath,
    };
  }

  const distro = getWSLDistroFromPath(filepath);
  const linuxPath = windowsToWSLPath(filepath);
  const windowsPath = normalizeWSLPath(filepath);

  return {
    isWSL: true,
    distro,
    linuxPath,
    windowsPath,
  };
}
