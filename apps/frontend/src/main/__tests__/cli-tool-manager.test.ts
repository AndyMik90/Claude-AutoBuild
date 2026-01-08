/**
 * Unit tests for cli-tool-manager
 * Tests CLI tool detection with focus on NVM path detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import os from 'os';
import { execFileSync, execFile } from 'child_process';
import { app } from 'electron';
import {
  getToolInfo,
  getToolPathAsync,
  clearToolCache,
  getClaudeDetectionPaths,
  sortNvmVersionDirs,
  buildClaudeDetectionResult
} from '../cli-tool-manager';

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn()
  }
}));

// Mock os module
vi.mock('os', () => ({
  default: {
    homedir: vi.fn(() => '/mock/home')
  }
}));

// Mock fs module - need to mock both sync and promises
vi.mock('fs', () => {
  const mockDirent = (
    name: string,
    isDir: boolean
  ): { name: string; isDirectory: () => boolean } => ({
    name,
    isDirectory: () => isDir
  });

  return {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    promises: {}
  };
});

// Mock child_process for execFileSync and execFile (used in validation)
// execFile needs to be promisify-compatible
vi.mock('child_process', () => {
  const mockExecFile = vi.fn((cmd: any, args: any, options: any, callback: any) => {
    // Return a minimal ChildProcess-like object
    const childProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    // If callback is provided, call it asynchronously
    if (typeof callback === 'function') {
      setImmediate(() => callback(null, '', ''));
    }

    return childProcess as any;
  });

  return {
    execFileSync: vi.fn(),
    execFile: mockExecFile
  };
});

// Mock env-utils to avoid PATH augmentation complexity
vi.mock('../env-utils', () => ({
  findExecutable: vi.fn(() => null), // Return null to force platform-specific path checking
  findExecutableAsync: vi.fn(() => Promise.resolve(null)),
  getAugmentedEnv: vi.fn(() => ({ PATH: '' })),
  getAugmentedEnvAsync: vi.fn(() => Promise.resolve({ PATH: '' }))
}));

// Mock homebrew-python utility
vi.mock('../utils/homebrew-python', () => ({
  findHomebrewPython: vi.fn(() => null)
}));

// Mock windows-paths utility
vi.mock('../utils/windows-paths', () => ({
  findWindowsExecutableViaWhere: vi.fn(() => null),
  findWindowsExecutableViaWhereAsync: vi.fn(() => Promise.resolve(null))
}));

describe('cli-tool-manager - Claude CLI NVM detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default platform to Linux
    Object.defineProperty(process, 'platform', {
      value: 'linux',
      writable: true
    });
  });

  afterEach(() => {
    clearToolCache();
  });

  const mockHomeDir = '/mock/home';

  describe('NVM path detection on Unix/Linux/macOS', () => {
    it('should detect Claude CLI in NVM directory when multiple Node versions exist', () => {
      // Mock home directory
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      // Mock NVM directory exists
      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        // NVM versions directory exists
        if (pathStr.includes('.nvm/versions/node')) {
          return true;
        }
        // Claude CLI exists in v22.17.0
        if (pathStr.includes('v22.17.0/bin/claude')) {
          return true;
        }
        return false;
      });

      // Mock Node.js version directories (three versions)
      const mockDirents = [
        { name: 'v20.0.0', isDirectory: () => true },
        { name: 'v22.17.0', isDirectory: () => true },
        { name: 'v18.20.0', isDirectory: () => true },
      ];
      vi.mocked(readdirSync).mockReturnValue(mockDirents as any);

      // Mock execFileSync to simulate successful version check
      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('v22.17.0/bin/claude'); // Should use newest version
      expect(result.version).toBe('1.0.0');
      expect(result.source).toBe('nvm');
      expect(result.message).toContain('Using NVM Claude CLI');
    });

    it('should skip NVM path detection on Windows', () => {
      // Set platform to Windows
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true
      });

      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = getToolInfo('claude');

      // readdirSync should not be called for NVM on Windows
      expect(readdirSync).not.toHaveBeenCalled();
      expect(result.source).toBe('fallback'); // Should fallback since no other paths exist
    });

    it('should handle missing NVM directory gracefully', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      // NVM directory doesn't exist
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getToolInfo('claude');

      // Should not crash, should continue to platform paths
      expect(result).toBeDefined();
      expect(result.found).toBe(false);
    });

    it('should try next version if Claude not found in newest Node version', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      // NVM directory exists
      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return true;
        }
        // Claude only exists in v20.0.0, not in v22.17.0
        if (pathStr.includes('v20.0.0/bin/claude')) {
          return true;
        }
        return false;
      });

      const mockDirents = [
        { name: 'v22.17.0', isDirectory: () => true },
        { name: 'v20.0.0', isDirectory: () => true },
      ];
      vi.mocked(readdirSync).mockReturnValue(mockDirents as any);
      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.5.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('v20.0.0/bin/claude');
    });

    it('should validate Claude CLI before returning NVM path', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) return true;
        if (pathStr.includes('v22.17.0/bin/claude')) return true;
        return false;
      });

      const mockDirents = [
        { name: 'v22.17.0', isDirectory: () => true },
      ];
      vi.mocked(readdirSync).mockReturnValue(mockDirents as any);

      // Mock validation failure
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command not found or invalid');
      });

      const result = getToolInfo('claude');

      // Should not return invalid Claude path, should continue to platform paths
      expect(result.path).not.toContain('v22.17.0/bin/claude');
    });

    it('should use version sorting to prioritize newest Node version', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) return true;
        // Claude exists in all versions
        if (pathStr.includes('/bin/claude')) return true;
        return false;
      });

      // Versions in random order
      const mockDirents = [
        { name: 'v18.20.0', isDirectory: () => true },
        { name: 'v22.17.0', isDirectory: () => true },
        { name: 'v20.5.0', isDirectory: () => true },
      ];
      vi.mocked(readdirSync).mockReturnValue(mockDirents as any);
      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('v22.17.0'); // Highest version
    });
  });

  describe('Platform-specific path detection', () => {
    it('should detect Claude CLI in Windows AppData npm global path', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true
      });

      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('AppData\\Roaming\\npm\\claude.cmd')) {
          return true;
        }
        return false;
      });

      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('AppData\\Roaming\\npm\\claude.cmd');
      expect(result.source).toBe('system-path');
    });

    it('should detect Claude CLI in Unix .local/bin path', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.local/bin/claude')) {
          return true;
        }
        return false;
      });

      vi.mocked(execFileSync).mockReturnValue('claude-code version 2.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('.local/bin/claude');
      expect(result.version).toBe('2.0.0');
    });

    it('should return fallback when Claude CLI not found anywhere', () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getToolInfo('claude');

      expect(result.found).toBe(false);
      expect(result.source).toBe('fallback');
      expect(result.message).toContain('Claude CLI not found');
    });
  });

  describe('User configuration priority', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    // Note: User configuration testing requires mocking the CLIToolManager class instance
    // which is more complex. These would be integration tests rather than unit tests.
  });
});

/**
 * Unit tests for helper functions
 */
describe('cli-tool-manager - Helper Functions', () => {
  describe('getClaudeDetectionPaths', () => {
    it('should return homebrew paths on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true
      });

      const paths = getClaudeDetectionPaths('/Users/test');

      expect(paths.homebrewPaths).toContain('/opt/homebrew/bin/claude');
      expect(paths.homebrewPaths).toContain('/usr/local/bin/claude');
    });

    it('should return Windows paths on win32', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true
      });

      const paths = getClaudeDetectionPaths('C:\\Users\\test');

      // Windows paths should include AppData and Program Files
      expect(paths.platformPaths.some(p => p.includes('AppData'))).toBe(true);
      expect(paths.platformPaths.some(p => p.includes('Program Files'))).toBe(true);
    });

    it('should return Unix paths on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true
      });

      const paths = getClaudeDetectionPaths('/home/test');

      expect(paths.platformPaths.some(p => p.includes('.local/bin/claude'))).toBe(true);
      expect(paths.platformPaths.some(p => p.includes('bin/claude'))).toBe(true);
    });

    it('should return correct NVM versions directory', () => {
      const paths = getClaudeDetectionPaths('/home/test');

      expect(paths.nvmVersionsDir).toBe('/home/test/.nvm/versions/node');
    });
  });

  describe('sortNvmVersionDirs', () => {
    it('should sort versions in descending order (newest first)', () => {
      const entries = [
        { name: 'v18.20.0', isDirectory: () => true },
        { name: 'v22.17.0', isDirectory: () => true },
        { name: 'v20.5.0', isDirectory: () => true },
      ];

      const sorted = sortNvmVersionDirs(entries);

      expect(sorted).toEqual(['v22.17.0', 'v20.5.0', 'v18.20.0']);
    });

    it('should filter out non-version directories', () => {
      const entries = [
        { name: 'v20.0.0', isDirectory: () => true },
        { name: 'current', isDirectory: () => true },
        { name: '.DS_Store', isDirectory: () => false },
        { name: 'system', isDirectory: () => true },
      ];

      const sorted = sortNvmVersionDirs(entries);

      expect(sorted).toEqual(['v20.0.0']);
      expect(sorted).not.toContain('current');
      expect(sorted).not.toContain('system');
    });

    it('should handle malformed version strings', () => {
      const entries = [
        { name: 'v22.17.0', isDirectory: () => true },
        { name: 'v20.abc.1', isDirectory: () => true }, // Invalid version
        { name: 'v18.20.0', isDirectory: () => true },
      ];

      const sorted = sortNvmVersionDirs(entries);

      // Should filter out malformed versions
      expect(sorted).toContain('v22.17.0');
      expect(sorted).toContain('v18.20.0');
      expect(sorted).not.toContain('v20.abc.1');
    });

    it('should handle patch version comparison correctly', () => {
      const entries = [
        { name: 'v20.0.1', isDirectory: () => true },
        { name: 'v20.0.10', isDirectory: () => true },
        { name: 'v20.0.2', isDirectory: () => true },
      ];

      const sorted = sortNvmVersionDirs(entries);

      expect(sorted).toEqual(['v20.0.10', 'v20.0.2', 'v20.0.1']);
    });
  });

  describe('buildClaudeDetectionResult', () => {
    it('should return null when validation fails', () => {
      const result = buildClaudeDetectionResult(
        '/path/to/claude',
        { valid: false, message: 'Not valid' },
        'nvm',
        'Found via NVM'
      );

      expect(result).toBeNull();
    });

    it('should return proper result when validation succeeds', () => {
      const result = buildClaudeDetectionResult(
        '/path/to/claude',
        { valid: true, version: '1.0.0', message: 'Valid' },
        'nvm',
        'Found via NVM'
      );

      expect(result).not.toBeNull();
      expect(result?.found).toBe(true);
      expect(result?.path).toBe('/path/to/claude');
      expect(result?.version).toBe('1.0.0');
      expect(result?.source).toBe('nvm');
      expect(result?.message).toContain('Found via NVM');
      expect(result?.message).toContain('/path/to/claude');
    });

    it('should include path in message', () => {
      const result = buildClaudeDetectionResult(
        '/home/user/.nvm/versions/node/v22.17.0/bin/claude',
        { valid: true, version: '2.0.0', message: 'OK' },
        'nvm',
        'Detected Claude CLI'
      );

      expect(result?.message).toContain('Detected Claude CLI');
      expect(result?.message).toContain('/home/user/.nvm/versions/node/v22.17.0/bin/claude');
    });
  });
});

/**
 * Unit tests for Claude CLI Windows where.exe detection
 */
describe('cli-tool-manager - Claude CLI Windows where.exe detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true
    });
  });

  afterEach(() => {
    clearToolCache();
  });

  it('should detect Claude CLI via where.exe when not in PATH', async () => {
    // Set platform to Windows
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true
    });

    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    // Mock findExecutable returns null (not in PATH)
    const envUtils = await import('../env-utils');
    vi.mocked(envUtils.findExecutable).mockReturnValue(null);

    // Mock where.exe finds it in nvm-windows location
    const windowsPaths = await import('../utils/windows-paths');
    vi.mocked(windowsPaths.findWindowsExecutableViaWhere).mockReturnValue(
      'D:\\Program Files\\nvm4w\\nodejs\\claude.cmd'
    );

    // Mock file system checks
    vi.mocked(existsSync).mockImplementation((filePath) => {
      const pathStr = String(filePath);
      if (pathStr.includes('nvm4w\\nodejs\\claude.cmd')) {
        return true;
      }
      return false;
    });

    // Mock validation success
    vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

    const result = getToolInfo('claude');

    expect(result.found).toBe(true);
    expect(result.path).toContain('nvm4w\\nodejs\\claude.cmd');
    expect(result.source).toBe('system-path');
    expect(result.message).toContain('Using Windows Claude CLI');
  });

  it('should skip where.exe on non-Windows platforms', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      writable: true
    });

    const windowsPaths = await import('../utils/windows-paths');
    vi.mocked(windowsPaths.findWindowsExecutableViaWhere).mockReturnValue(null);

    // Mock other detection methods to fail
    vi.mocked(existsSync).mockReturnValue(false);

    getToolInfo('claude');

    // where.exe should not be called on macOS
    expect(windowsPaths.findWindowsExecutableViaWhere).not.toHaveBeenCalled();
  });

  it('should validate Claude CLI before returning where.exe path', async () => {
    // Set platform to Windows
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true
    });

    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    const envUtils = await import('../env-utils');
    vi.mocked(envUtils.findExecutable).mockReturnValue(null);

    const windowsPaths = await import('../utils/windows-paths');
    vi.mocked(windowsPaths.findWindowsExecutableViaWhere).mockReturnValue(
      'D:\\Tools\\claude.cmd'
    );

    // Mock file system to return false for all paths except where.exe result
    vi.mocked(existsSync).mockImplementation((filePath) => {
      const pathStr = String(filePath);
      if (pathStr.includes('D:\\Tools\\claude.cmd')) {
        return true;
      }
      return false;
    });

    // Mock validation failure (executable doesn't respond correctly)
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error('Command failed');
    });

    const result = getToolInfo('claude');

    // Should not return the unvalidated path, fallback to not found
    expect(result.found).toBe(false);
    expect(result.source).toBe('fallback');
  });

  it('should fallback to platform paths if where.exe fails', async () => {
    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    const envUtils = await import('../env-utils');
    vi.mocked(envUtils.findExecutable).mockReturnValue(null);

    const windowsPaths = await import('../utils/windows-paths');
    vi.mocked(windowsPaths.findWindowsExecutableViaWhere).mockReturnValue(null);

    // Mock platform path exists (AppData npm global)
    vi.mocked(existsSync).mockImplementation((filePath) => {
      const pathStr = String(filePath);
      if (pathStr.includes('AppData\\Roaming\\npm\\claude.cmd')) {
        return true;
      }
      return false;
    });

    vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

    const result = getToolInfo('claude');

    expect(result.found).toBe(true);
    expect(result.path).toContain('AppData\\Roaming\\npm\\claude.cmd');
  });

  it('should handle where.exe returning multiple paths (uses first one)', async () => {
    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    const envUtils = await import('../env-utils');
    vi.mocked(envUtils.findExecutable).mockReturnValue(null);

    const windowsPaths = await import('../utils/windows-paths');
    // where.exe returns first path (highest priority)
    vi.mocked(windowsPaths.findWindowsExecutableViaWhere).mockReturnValue(
      'D:\\Program Files\\nvm4w\\nodejs\\claude.cmd'
    );

    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

    const result = getToolInfo('claude');

    expect(result.found).toBe(true);
    expect(result.path).toBe('D:\\Program Files\\nvm4w\\nodejs\\claude.cmd');
  });

  it('should handle where.exe execution errors gracefully', async () => {
    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    const envUtils = await import('../env-utils');
    vi.mocked(envUtils.findExecutable).mockReturnValue(null);

    const windowsPaths = await import('../utils/windows-paths');
    // Simulate where.exe error (returns null as designed)
    vi.mocked(windowsPaths.findWindowsExecutableViaWhere).mockReturnValue(null);

    vi.mocked(existsSync).mockReturnValue(false);

    // Should not crash, should continue to next detection method
    const result = getToolInfo('claude');

    expect(result).toBeDefined();
    expect(result.found).toBe(false);
    expect(result.source).toBe('fallback');
  });
});

/**
 * Unit tests for async Claude CLI Windows where.exe detection
 */
describe('cli-tool-manager - Claude CLI async Windows where.exe detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true
    });
  });

  afterEach(() => {
    clearToolCache();
  });

  it('should detect Claude CLI via where.exe asynchronously', async () => {
    // Set platform to Windows
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true
    });

    // Clear and reset all mocks
    vi.clearAllMocks();

    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    // Dynamically import and mock modules
    const envUtils = await import('../env-utils');
    vi.mocked(envUtils.findExecutableAsync).mockResolvedValue(null);

    const windowsPaths = await import('../utils/windows-paths');
    const mockWhereAsync = vi.fn().mockResolvedValue(null);
    vi.mocked(windowsPaths.findWindowsExecutableViaWhereAsync).mockImplementation(mockWhereAsync);

    // Mock file system - no platform paths exist
    vi.mocked(existsSync).mockReturnValue(false);

    await getToolPathAsync('claude');

    // Verify where.exe was called on Windows
    expect(mockWhereAsync).toHaveBeenCalledWith('claude', '[Claude CLI]');
  });

  it('should handle async where.exe errors gracefully', async () => {
    vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

    const envUtils = await import('../env-utils');
    vi.mocked(envUtils.findExecutableAsync).mockResolvedValue(null);

    const windowsPaths = await import('../utils/windows-paths');
    vi.mocked(windowsPaths.findWindowsExecutableViaWhereAsync).mockResolvedValue(null);

    vi.mocked(existsSync).mockReturnValue(false);

    // Should not crash
    const result = await getToolPathAsync('claude');

    expect(result).toBe('claude'); // Fallback
  });
});
