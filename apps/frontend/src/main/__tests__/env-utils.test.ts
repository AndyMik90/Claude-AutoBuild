import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { shouldUseShell, getSpawnOptions, getSpawnCommand } from '../env-utils';

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

describe('getSpawnCommand', () => {
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

    it('should quote .cmd files with spaces', () => {
      const cmd = getSpawnCommand('C:\\Users\\First Last\\AppData\\Roaming\\npm\\claude.cmd');
      expect(cmd).toBe('"C:\\Users\\First Last\\AppData\\Roaming\\npm\\claude.cmd"');
    });

    it('should quote .cmd files without spaces too (idempotent)', () => {
      const cmd = getSpawnCommand('C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd');
      expect(cmd).toBe('"C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd"');
    });

    it('should quote .bat files with spaces', () => {
      const cmd = getSpawnCommand('D:\\Program Files (x86)\\scripts\\setup.bat');
      expect(cmd).toBe('"D:\\Program Files (x86)\\scripts\\setup.bat"');
    });

    it('should NOT quote .exe files', () => {
      const cmd = getSpawnCommand('C:\\Program Files\\Git\\cmd\\git.exe');
      expect(cmd).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
    });

    it('should NOT quote extensionless files', () => {
      const cmd = getSpawnCommand('D:\\Git\\bin\\bash');
      expect(cmd).toBe('D:\\Git\\bin\\bash');
    });

    it('should handle uppercase .CMD and .BAT extensions', () => {
      expect(getSpawnCommand('D:\\Tools\\CLAUDE.CMD')).toBe('"D:\\Tools\\CLAUDE.CMD"');
      expect(getSpawnCommand('C:\\Scripts\\SETUP.BAT')).toBe('"C:\\Scripts\\SETUP.BAT"');
    });

    it('should be idempotent - already quoted .cmd files stay quoted', () => {
      const cmd = getSpawnCommand('"C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd"');
      expect(cmd).toBe('"C:\\Users\\admin\\AppData\\Roaming\\npm\\claude.cmd"');
    });

    it('should be idempotent - already quoted .bat files stay quoted', () => {
      const cmd = getSpawnCommand('"D:\\Program Files\\scripts\\setup.bat"');
      expect(cmd).toBe('"D:\\Program Files\\scripts\\setup.bat"');
    });

    it('should be idempotent - double-quoting does not occur', () => {
      const once = getSpawnCommand('C:\\Users\\admin\\npm\\claude.cmd');
      const twice = getSpawnCommand(once);
      expect(once).toBe(twice);
      expect(once).toBe('"C:\\Users\\admin\\npm\\claude.cmd"');
    });

    it('should trim whitespace before processing', () => {
      const cmd = getSpawnCommand('  C:\\Users\\admin\\npm\\claude.cmd  ');
      expect(cmd).toBe('"C:\\Users\\admin\\npm\\claude.cmd"');
    });

    it('should handle already-quoted .cmd with spaces', () => {
      const cmd = getSpawnCommand('"C:\\Users\\First Last\\npm\\claude.cmd"');
      expect(cmd).toBe('"C:\\Users\\First Last\\npm\\claude.cmd"');
    });

    it('should strip quotes from .exe files (defensive: no quotes with shell:false)', () => {
      const cmd = getSpawnCommand('"C:\\Program Files\\Git\\cmd\\git.exe"');
      expect(cmd).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
    });

    it('should strip quotes from extensionless files (defensive: no quotes with shell:false)', () => {
      const cmd = getSpawnCommand('"D:\\Git\\bin\\bash"');
      expect(cmd).toBe('D:\\Git\\bin\\bash');
    });

    it('should strip quotes and trim whitespace from .exe files', () => {
      const cmd = getSpawnCommand('  "C:\\Program Files\\Git\\cmd\\git.exe"  ');
      expect(cmd).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
    });
  });

  describe('Non-Windows platforms', () => {
    it('should NOT quote commands on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });
      expect(getSpawnCommand('/usr/local/bin/claude')).toBe('/usr/local/bin/claude');
      expect(getSpawnCommand('/opt/homebrew/bin/claude.cmd')).toBe('/opt/homebrew/bin/claude.cmd');
    });

    it('should NOT quote commands on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      expect(getSpawnCommand('/usr/bin/claude')).toBe('/usr/bin/claude');
      expect(getSpawnCommand('/home/user/.local/bin/claude.bat')).toBe('/home/user/.local/bin/claude.bat');
    });

    it('should trim whitespace on macOS', () => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        writable: true,
        configurable: true,
      });
      expect(getSpawnCommand('  /usr/local/bin/claude  ')).toBe('/usr/local/bin/claude');
      expect(getSpawnCommand('\t/opt/homebrew/bin/claude\t')).toBe('/opt/homebrew/bin/claude');
    });

    it('should trim whitespace on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        writable: true,
        configurable: true,
      });
      expect(getSpawnCommand('  /usr/bin/claude  ')).toBe('/usr/bin/claude');
      expect(getSpawnCommand('\t/home/user/.local/bin/claude\t')).toBe('/home/user/.local/bin/claude');
    });
  });
});

describe('shouldUseShell with quoted paths', () => {
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

    it('should detect .cmd files in quoted paths', () => {
      expect(shouldUseShell('"C:\\Users\\admin\\npm\\claude.cmd"')).toBe(true);
      expect(shouldUseShell('"D:\\Tools\\CLAUDE.CMD"')).toBe(true);
    });

    it('should detect .bat files in quoted paths', () => {
      expect(shouldUseShell('"C:\\Scripts\\setup.bat"')).toBe(true);
      expect(shouldUseShell('"D:\\Program Files\\script.BAT"')).toBe(true);
    });

    it('should NOT detect .exe files in quoted paths', () => {
      expect(shouldUseShell('"C:\\Program Files\\git.exe"')).toBe(false);
    });

    it('should handle whitespace around quoted paths', () => {
      expect(shouldUseShell('  "C:\\Users\\admin\\npm\\claude.cmd"  ')).toBe(true);
    });
  });
});
