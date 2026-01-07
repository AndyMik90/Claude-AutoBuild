/**
 * Unit tests for cli-tool-manager
 * Tests CLI tool detection with focus on NVM path detection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readdirSync } from 'fs';
import os from 'os';
import { execFileSync } from 'child_process';
import { app } from 'electron';
import {
  getToolInfo,
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
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  execFile: vi.fn()
}));

// Mock env-utils to avoid PATH augmentation complexity
vi.mock('../env-utils', () => ({
  findExecutable: vi.fn(() => null), // Return null to force platform-specific path checking
  getAugmentedEnv: vi.fn(() => ({ PATH: '' }))
}));

// Mock homebrew-python utility
vi.mock('../utils/homebrew-python', () => ({
  findHomebrewPython: vi.fn(() => null)
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

      // Mock readdirSync to return Node version directories
      vi.mocked(readdirSync).mockImplementation((filePath, options) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return [
            { name: 'v20.11.0', isDirectory: () => true },
            { name: 'v22.17.0', isDirectory: () => true }
          ] as any;
        }
        return [] as any;
      });

      // Mock execFileSync to return version for validation
      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('v22.17.0');
      expect(result.path).toContain('bin/claude');
      expect(result.source).toBe('nvm');
    });

    it('should try multiple NVM Node versions until finding Claude CLI', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return true;
        }
        // Only v24.12.0 has Claude CLI
        if (pathStr.includes('v24.12.0/bin/claude')) {
          return true;
        }
        return false;
      });

      vi.mocked(readdirSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return [
            { name: 'v18.20.0', isDirectory: () => true },
            { name: 'v20.11.0', isDirectory: () => true },
            { name: 'v24.12.0', isDirectory: () => true }
          ] as any;
        }
        return [] as any;
      });

      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('v24.12.0');
      expect(result.source).toBe('nvm');
    });

    it('should skip non-version directories in NVM (e.g., does not start with "v")', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return true;
        }
        // Only the correctly named version has Claude
        if (pathStr.includes('v22.17.0/bin/claude')) {
          return true;
        }
        return false;
      });

      vi.mocked(readdirSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return [
            { name: 'current', isDirectory: () => true }, // Should be skipped
            { name: 'system', isDirectory: () => true }, // Should be skipped
            { name: 'v22.17.0', isDirectory: () => true } // Should be checked
          ] as any;
        }
        return [] as any;
      });

      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.path).toContain('v22.17.0');
    });

    it('should not check NVM paths on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true
      });

      vi.mocked(os.homedir).mockReturnValue('C:\\Users\\test');

      // Even if NVM directory exists on Windows, should not check it
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = getToolInfo('claude');

      // Should not be found from NVM on Windows
      expect(result.source).not.toBe('nvm');
    });

    it('should handle missing NVM directory gracefully', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      // NVM directory does not exist
      vi.mocked(existsSync).mockReturnValue(false);

      const result = getToolInfo('claude');

      // Should not find via NVM
      expect(result.source).not.toBe('nvm');
      expect(result.found).toBe(false);
    });

    it('should handle readdirSync errors gracefully', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const result = getToolInfo('claude');

      // Should not crash, should fall back to other detection methods
      expect(result.source).not.toBe('nvm');
    });

    it('should validate Claude CLI before returning NVM path', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return true;
        }
        if (pathStr.includes('v22.17.0/bin/claude')) {
          return true;
        }
        return false;
      });

      vi.mocked(readdirSync).mockImplementation(() => {
        return [{ name: 'v22.17.0', isDirectory: () => true }] as any;
      });

      // Mock validation failure (execFileSync throws)
      vi.mocked(execFileSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      const result = getToolInfo('claude');

      // Should not return unvalidated path
      expect(result.found).toBe(false);
      expect(result.source).not.toBe('nvm');
    });

    it('should handle NVM directory with no version subdirectories', () => {
      vi.mocked(os.homedir).mockReturnValue(mockHomeDir);

      vi.mocked(existsSync).mockImplementation((filePath) => {
        return String(filePath).includes('.nvm/versions/node');
      });

      // Empty NVM directory
      vi.mocked(readdirSync).mockReturnValue([]);

      const result = getToolInfo('claude');

      expect(result.source).not.toBe('nvm');
    });
  });

  describe('NVM on macOS', () => {
    it('should detect Claude CLI via NVM on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true
      });

      vi.mocked(os.homedir).mockReturnValue('/Users/test');

      vi.mocked(existsSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('.nvm/versions/node')) {
          return true;
        }
        if (pathStr.includes('v22.17.0/bin/claude')) {
          return true;
        }
        return false;
      });

      vi.mocked(readdirSync).mockImplementation(() => {
        return [{ name: 'v22.17.0', isDirectory: () => true }] as any;
      });

      vi.mocked(execFileSync).mockReturnValue('claude-code version 1.0.0\n');

      const result = getToolInfo('claude');

      expect(result.found).toBe(true);
      expect(result.source).toBe('nvm');
      expect(result.path).toContain('v22.17.0');
    });
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
        { name: 'v20.11.0', isDirectory: () => true }
      ];

      const sorted = sortNvmVersionDirs(entries);

      expect(sorted).toEqual(['v22.17.0', 'v20.11.0', 'v18.20.0']);
    });

    it('should filter out non-version directories', () => {
      const entries = [
        { name: 'v20.11.0', isDirectory: () => true },
        { name: '.DS_Store', isDirectory: () => false },
        { name: 'node_modules', isDirectory: () => true },
        { name: 'current', isDirectory: () => true },
        { name: 'v22.17.0', isDirectory: () => true }
      ];

      const sorted = sortNvmVersionDirs(entries);

      expect(sorted).toEqual(['v22.17.0', 'v20.11.0']);
      expect(sorted).not.toContain('.DS_Store');
      expect(sorted).not.toContain('node_modules');
      expect(sorted).not.toContain('current');
    });

    it('should return empty array when no valid versions', () => {
      const entries = [
        { name: 'current', isDirectory: () => true },
        { name: 'system', isDirectory: () => true }
      ];

      const sorted = sortNvmVersionDirs(entries);

      expect(sorted).toEqual([]);
    });

    it('should handle single entry', () => {
      const entries = [{ name: 'v20.11.0', isDirectory: () => true }];

      const sorted = sortNvmVersionDirs(entries);

      expect(sorted).toEqual(['v20.11.0']);
    });

    it('should handle empty array', () => {
      const sorted = sortNvmVersionDirs([]);

      expect(sorted).toEqual([]);
    });
  });

  describe('buildClaudeDetectionResult', () => {
    it('should return null when validation fails', () => {
      const result = buildClaudeDetectionResult(
        '/path/to/claude',
        { valid: false, message: 'Invalid CLI' },
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
