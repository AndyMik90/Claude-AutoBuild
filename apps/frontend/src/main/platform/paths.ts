/**
 * Platform-Specific Path Resolvers
 *
 * Handles detection of tool paths across platforms.
 * Each tool has a dedicated resolver function.
 */

import * as path from 'path';
import * as os from 'os';
import { existsSync } from 'fs';
import { isWindows, isMacOS, getHomebrewPath, joinPaths, getExecutableExtension } from './index';

/**
 * Resolve Claude CLI executable path
 *
 * Searches in platform-specific installation directories:
 * - Windows: Program Files, AppData, npm
 * - macOS: Homebrew, /usr/local/bin
 * - Linux: ~/.local/bin, /usr/bin
 */
export function getClaudeExecutablePath(): string[] {
  const homeDir = os.homedir();
  const paths: string[] = [];

  if (isWindows()) {
    paths.push(
      joinPaths(homeDir, 'AppData', 'Local', 'Programs', 'claude', `claude${getExecutableExtension()}`),
      joinPaths(homeDir, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
      joinPaths(homeDir, '.local', 'bin', `claude${getExecutableExtension()}`),
      joinPaths('C:', 'Program Files', 'Claude', `claude${getExecutableExtension()}`),
      joinPaths('C:', 'Program Files (x86)', 'Claude', `claude${getExecutableExtension()}`)
    );
  } else {
    paths.push(
      joinPaths(homeDir, '.local', 'bin', 'claude'),
      joinPaths(homeDir, 'bin', 'claude')
    );
  }

  return paths;
}

/**
 * Resolve Python executable path
 *
 * Returns platform-specific command variations:
 * - Windows: py -3, python, python3, py
 * - Unix: python3, python
 */
export function getPythonCommands(): string[] {
  if (isWindows()) {
    return ['py -3', 'python', 'python3', 'py'];
  }
  return ['python3', 'python'];
}

/**
 * Resolve Python installation paths
 */
export function getPythonPaths(): string[] {
  const homeDir = os.homedir();
  const paths: string[] = [];

  if (isWindows()) {
    paths.push(
      joinPaths(homeDir, 'AppData', 'Local', 'Programs', 'Python'),
      joinPaths(process.env.ProgramFiles || 'C:\\Program Files', 'Python3*'),
      joinPaths(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Python3*')
    );
  } else if (isMacOS()) {
    const brewPath = getHomebrewPath();
    if (brewPath) {
      paths.push(brewPath);
    }
  }

  return paths;
}

/**
 * Resolve Git executable path
 */
export function getGitExecutablePath(): string {
  if (isWindows()) {
    // Git for Windows installs to standard locations
    const candidates = [
      joinPaths('C:\\Program Files', 'Git', 'bin', 'git.exe'),
      joinPaths('C:\\Program Files (x86)', 'Git', 'bin', 'git.exe'),
      joinPaths(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'bin', 'git.exe')
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return 'git';
}

/**
 * Resolve Node.js executable path
 */
export function getNodeExecutablePath(): string {
  if (isWindows()) {
    return 'node.exe';
  }
  return 'node';
}

/**
 * Resolve npm executable path
 */
export function getNpmExecutablePath(): string {
  if (isWindows()) {
    return 'npm.cmd';
  }
  return 'npm';
}

/**
 * Get all Windows shell paths for terminal selection
 *
 * Returns a map of shell types to their possible installation paths.
 * Only applies to Windows; returns empty object for other platforms.
 */
export function getWindowsShellPaths(): Record<string, string[]> {
  if (!isWindows()) {
    return {};
  }

  const homeDir = os.homedir();
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';

  return {
    powershell: [
      path.join('C:', 'Program Files', 'PowerShell', '7', 'pwsh.exe'),
      path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    ],
    windowsterminal: [
      path.join('C:\\Program Files', 'WindowsApps', 'Microsoft.WindowsTerminal_*', 'WindowsTerminal.exe')
    ],
    cmd: [
      path.join(systemRoot, 'System32', 'cmd.exe')
    ],
    gitbash: [
      path.join('C:', 'Program Files', 'Git', 'bin', 'bash.exe'),
      path.join('C:', 'Program Files (x86)', 'Git', 'bin', 'bash.exe')
    ],
    cygwin: [
      path.join('C:', 'cygwin64', 'bin', 'bash.exe')
    ],
    msys2: [
      path.join('C:', 'msys64', 'usr', 'bin', 'bash.exe')
    ],
    wsl: [
      path.join(systemRoot, 'System32', 'wsl.exe')
    ]
  };
}

/**
 * Expand Windows environment variables in a path
 *
 * Replaces patterns like %PROGRAMFILES% with actual values.
 * Only applies to Windows; returns original path for other platforms.
 */
export function expandWindowsEnvVars(pathPattern: string): string {
  if (!isWindows()) {
    return pathPattern;
  }

  const envVars: Record<string, string | undefined> = {
    '%PROGRAMFILES%': process.env.ProgramFiles || 'C:\\Program Files',
    '%PROGRAMFILES(X86)%': process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    '%LOCALAPPDATA%': process.env.LOCALAPPDATA || '',
    '%APPDATA%': process.env.APPDATA || '',
    '%USERPROFILE%': process.env.USERPROFILE || os.homedir(),
    '%SYSTEMROOT%': process.env.SystemRoot || 'C:\\Windows',
    '%TEMP%': process.env.TEMP || process.env.TMP || '',
    '%TMP%': process.env.TMP || process.env.TEMP || ''
  };

  let expanded = pathPattern;
  for (const [pattern, value] of Object.entries(envVars)) {
    expanded = expanded.replace(new RegExp(pattern, 'gi'), value || '');
  }

  return expanded;
}

/**
 * Get Windows-specific installation paths for a tool
 *
 * @param toolName - Name of the tool (e.g., 'claude', 'python')
 * @param subPath - Optional subdirectory within Program Files
 */
export function getWindowsToolPath(toolName: string, subPath?: string): string[] {
  if (!isWindows()) {
    return [];
  }

  const homeDir = os.homedir();
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const appData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

  const paths: string[] = [];

  // Program Files locations
  if (subPath) {
    paths.push(
      path.join(programFiles, subPath),
      path.join(programFilesX86, subPath)
    );
  } else {
    paths.push(
      path.join(programFiles, toolName),
      path.join(programFilesX86, toolName)
    );
  }

  // AppData location
  paths.push(path.join(appData, toolName));

  // Roaming AppData (for npm)
  const roamingAppData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
  paths.push(path.join(roamingAppData, 'npm'));

  return paths;
}
