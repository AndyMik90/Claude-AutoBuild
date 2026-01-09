import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { shouldUseShell, getSpawnOptions } from '../env-utils';

describe('shouldUseShell', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original platform after each test
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  describe('Windows platform', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        writable: true,
        configurable: true,
      });
    });

    it('should return true for .cmd files', () => {
      expect(shouldUseShell('D:\\Program Files\\nodejs\\claude.cmd')).toBe(true);
      expect(shouldUseShell('C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd')).toBe(true);
    });

    it('should return true for .bat files', () => {
      expect(shouldUseShell('C:\\batch\\script.bat')).toBe(true);
    });

    it('should return true for .CMD (uppercase)', () => {
      expect(shouldUseShell('D:\\Tools\\CLAUDE.CMD')).toBe(true);
    });

    it('should return true for .BAT (uppercase)', () => {
      expect(shouldUseShell('C:\\Scripts\\SETUP.BAT')).toBe(true);
    });

    it('should return false for .exe files', () => {
      expect(shouldUseShell('C:\\Windows\\System32\\git.exe')).toBe(false);
    });

    it('should return false for extensionless files', () => {
      expect(shouldUseShell('D:\\Git\\bin\\bash')).toBe(false);
    });

    it('should handle paths with spaces and special characters', () => {
      expect(shouldUseShell('D:\\Program Files (x86)\\tool.cmd')).toBe(true);
      expect(shouldUseShell('D:\\Path&Name\\tool.cmd')).toBe(true);
      expect(shouldUseShell('D:\\Program Files (x86)\\tool.exe')).toBe(false);
    });
  });

  describe('Non-Windows platforms', () => {
    it('should return false on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });
      expect(shouldUseShell('/usr/local/bin/claude')).toBe(false);
      expect(shouldUseShell('/opt/homebrew/bin/claude.cmd')).toBe(false);
    });

    it('should return false on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      expect(shouldUseShell('/usr/bin/claude')).toBe(false);
      expect(shouldUseShell('/home/user/.local/bin/claude.bat')).toBe(false);
    });
  });
});

describe('getSpawnOptions', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    // Restore original platform after each test
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  it('should set shell: true for .cmd files on Windows', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });

    const opts = getSpawnOptions('D:\\nodejs\\claude.cmd', {
      cwd: 'D:\\project',
      env: { PATH: 'C:\\Windows' },
    });

    expect(opts).toEqual({
      cwd: 'D:\\project',
      env: { PATH: 'C:\\Windows' },
      shell: true,
    });
  });

  it('should set shell: false for .exe files on Windows', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });

    const opts = getSpawnOptions('C:\\Windows\\git.exe', {
      cwd: 'D:\\project',
    });

    expect(opts).toEqual({
      cwd: 'D:\\project',
      shell: false,
    });
  });

  it('should preserve all base options including stdio', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });

    const opts = getSpawnOptions('D:\\tool.cmd', {
      cwd: 'D:\\project',
      env: { FOO: 'bar' },
      timeout: 5000,
      windowsHide: true,
      stdio: 'inherit',
    });

    expect(opts).toEqual({
      cwd: 'D:\\project',
      env: { FOO: 'bar' },
      timeout: 5000,
      windowsHide: true,
      stdio: 'inherit',
      shell: true,
    });
  });

  it('should handle empty base options', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });

    const opts = getSpawnOptions('D:\\tool.cmd');

    expect(opts).toEqual({
      shell: true,
    });
  });

  it('should set shell: false on non-Windows platforms', () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      writable: true,
      configurable: true,
    });

    const opts = getSpawnOptions('/usr/local/bin/claude', {
      cwd: '/project',
    });

    expect(opts).toEqual({
      cwd: '/project',
      shell: false,
    });
  });

  it('should handle .bat files on Windows', () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      writable: true,
      configurable: true,
    });

    const opts = getSpawnOptions('C:\\scripts\\setup.bat', {
      cwd: 'D:\\project',
    });

    expect(opts).toEqual({
      cwd: 'D:\\project',
      shell: true,
    });
  });
});
