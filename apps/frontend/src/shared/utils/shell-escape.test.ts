/**
 * Shell Escape Utilities Tests
 * =============================
 * Unit tests for shell detection and escaping utilities.
 */

import { describe, it, expect } from 'vitest';
import { detectShellType } from './shell-escape';

describe('detectShellType', () => {
  describe('PowerShell detection', () => {
    it('should detect Windows PowerShell 5.1', () => {
      const result = detectShellType('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
      expect(result).toBe('powershell');
    });

    it('should detect PowerShell Core 7+ (pwsh)', () => {
      const result = detectShellType('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
      expect(result).toBe('powershell');
    });

    it('should detect pwsh on Linux/macOS', () => {
      const result = detectShellType('/usr/local/bin/pwsh');
      expect(result).toBe('powershell');
    });

    it('should detect powershell with case insensitivity', () => {
      const result = detectShellType('/usr/bin/PowerShell');
      expect(result).toBe('powershell');
    });
  });

  describe('cmd.exe detection', () => {
    it('should detect Windows Command Prompt', () => {
      const result = detectShellType('C:\\Windows\\System32\\cmd.exe');
      expect(result).toBe('cmd');
    });

    it('should detect cmd without extension', () => {
      const result = detectShellType('cmd');
      expect(result).toBe('cmd');
    });

    it('should detect CMD with case insensitivity', () => {
      const result = detectShellType('C:\\WINDOWS\\SYSTEM32\\CMD.EXE');
      expect(result).toBe('cmd');
    });
  });

  describe('Bash detection', () => {
    it('should detect standard bash path', () => {
      const result = detectShellType('/usr/bin/bash');
      expect(result).toBe('bash');
    });

    it('should detect /bin/bash path', () => {
      const result = detectShellType('/bin/bash');
      expect(result).toBe('bash');
    });

    it('should detect Git Bash on Windows', () => {
      const result = detectShellType('C:\\Program Files\\Git\\bin\\bash.exe');
      expect(result).toBe('bash');
    });

    it('should detect WSL bash', () => {
      const result = detectShellType('/usr/bin/bash');
      expect(result).toBe('bash');
    });

    it('should detect bash with case insensitivity', () => {
      const result = detectShellType('/usr/bin/BASH');
      expect(result).toBe('bash');
    });
  });

  describe('Zsh detection', () => {
    it('should detect standard zsh path', () => {
      const result = detectShellType('/bin/zsh');
      expect(result).toBe('zsh');
    });

    it('should detect /usr/bin/zsh path', () => {
      const result = detectShellType('/usr/bin/zsh');
      expect(result).toBe('zsh');
    });

    it('should detect zsh with case insensitivity', () => {
      const result = detectShellType('/bin/ZSH');
      expect(result).toBe('zsh');
    });
  });

  describe('Fish detection', () => {
    it('should detect standard fish path', () => {
      const result = detectShellType('/usr/local/bin/fish');
      expect(result).toBe('fish');
    });

    it('should detect /usr/bin/fish path', () => {
      const result = detectShellType('/usr/bin/fish');
      expect(result).toBe('fish');
    });

    it('should detect fish with case insensitivity', () => {
      const result = detectShellType('/usr/local/bin/FISH');
      expect(result).toBe('fish');
    });
  });

  describe('Bourne shell (sh) detection', () => {
    it('should detect /bin/sh path', () => {
      const result = detectShellType('/bin/sh');
      expect(result).toBe('sh');
    });

    it('should detect /usr/bin/sh path', () => {
      const result = detectShellType('/usr/bin/sh');
      expect(result).toBe('sh');
    });

    it('should detect sh name only', () => {
      const result = detectShellType('sh');
      expect(result).toBe('sh');
    });

    it('should detect sh with Windows backslash', () => {
      const result = detectShellType('C:\\msys64\\usr\\bin\\sh');
      expect(result).toBe('sh');
    });
  });

  describe('default fallback', () => {
    it('should default to bash for unknown shell', () => {
      const result = detectShellType('/usr/bin/unknown-shell');
      expect(result).toBe('bash');
    });

    it('should default to bash for empty string', () => {
      const result = detectShellType('');
      expect(result).toBe('bash');
    });

    it('should default to bash for random path', () => {
      const result = detectShellType('/some/random/path');
      expect(result).toBe('bash');
    });
  });
});
