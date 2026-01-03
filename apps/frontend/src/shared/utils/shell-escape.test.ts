/**
 * Shell Escape Utilities Tests
 * =============================
 * Unit tests for shell detection and escaping utilities.
 */

import { describe, it, expect } from 'vitest';
import { detectShellType, buildCdCommandForShell } from './shell-escape';

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

describe('buildCdCommandForShell', () => {
  describe('undefined path handling', () => {
    it('should return empty string for undefined path with bash', () => {
      const result = buildCdCommandForShell(undefined, 'bash');
      expect(result).toBe('');
    });

    it('should return empty string for undefined path with powershell', () => {
      const result = buildCdCommandForShell(undefined, 'powershell');
      expect(result).toBe('');
    });

    it('should return empty string for undefined path with cmd', () => {
      const result = buildCdCommandForShell(undefined, 'cmd');
      expect(result).toBe('');
    });

    it('should return empty string for undefined path with zsh', () => {
      const result = buildCdCommandForShell(undefined, 'zsh');
      expect(result).toBe('');
    });

    it('should return empty string for undefined path with fish', () => {
      const result = buildCdCommandForShell(undefined, 'fish');
      expect(result).toBe('');
    });

    it('should return empty string for undefined path with sh', () => {
      const result = buildCdCommandForShell(undefined, 'sh');
      expect(result).toBe('');
    });
  });

  describe('bash shell', () => {
    it('should generate cd command with single quotes', () => {
      const result = buildCdCommandForShell('/home/user', 'bash');
      expect(result).toBe("cd '/home/user' && ");
    });

    it('should escape single quotes with POSIX escaping', () => {
      const result = buildCdCommandForShell("/home/user's folder", 'bash');
      expect(result).toBe("cd '/home/user'\\''s folder' && ");
    });

    it('should handle paths with spaces', () => {
      const result = buildCdCommandForShell('/home/user/my documents', 'bash');
      expect(result).toBe("cd '/home/user/my documents' && ");
    });

    it('should handle paths with special characters', () => {
      const result = buildCdCommandForShell('/home/user/$HOME', 'bash');
      expect(result).toBe("cd '/home/user/$HOME' && ");
    });

    it('should handle Windows-style paths', () => {
      const result = buildCdCommandForShell('C:\\Users\\test', 'bash');
      expect(result).toBe("cd 'C:\\Users\\test' && ");
    });
  });

  describe('zsh shell', () => {
    it('should generate cd command with single quotes', () => {
      const result = buildCdCommandForShell('/home/user', 'zsh');
      expect(result).toBe("cd '/home/user' && ");
    });

    it('should escape single quotes with POSIX escaping', () => {
      const result = buildCdCommandForShell("/home/user's folder", 'zsh');
      expect(result).toBe("cd '/home/user'\\''s folder' && ");
    });

    it('should handle paths with spaces', () => {
      const result = buildCdCommandForShell('/Users/john/My Documents', 'zsh');
      expect(result).toBe("cd '/Users/john/My Documents' && ");
    });
  });

  describe('fish shell', () => {
    it('should generate cd command with single quotes', () => {
      const result = buildCdCommandForShell('/home/user', 'fish');
      expect(result).toBe("cd '/home/user' && ");
    });

    it('should escape single quotes with POSIX escaping', () => {
      const result = buildCdCommandForShell("/home/user's folder", 'fish');
      expect(result).toBe("cd '/home/user'\\''s folder' && ");
    });

    it('should handle paths with special characters', () => {
      const result = buildCdCommandForShell('/home/user/folder (copy)', 'fish');
      expect(result).toBe("cd '/home/user/folder (copy)' && ");
    });
  });

  describe('sh shell (Bourne shell)', () => {
    it('should generate cd command with single quotes', () => {
      const result = buildCdCommandForShell('/home/user', 'sh');
      expect(result).toBe("cd '/home/user' && ");
    });

    it('should escape single quotes with POSIX escaping', () => {
      const result = buildCdCommandForShell("/home/user's folder", 'sh');
      expect(result).toBe("cd '/home/user'\\''s folder' && ");
    });

    it('should handle simple Unix paths', () => {
      const result = buildCdCommandForShell('/usr/local/bin', 'sh');
      expect(result).toBe("cd '/usr/local/bin' && ");
    });
  });

  describe('powershell shell', () => {
    it('should generate Set-Location command with single quotes', () => {
      const result = buildCdCommandForShell('C:\\Users\\test', 'powershell');
      expect(result).toBe("Set-Location 'C:\\Users\\test'; ");
    });

    it('should escape single quotes by doubling them', () => {
      const result = buildCdCommandForShell("C:\\Users\\It's here", 'powershell');
      expect(result).toBe("Set-Location 'C:\\Users\\It''s here'; ");
    });

    it('should handle paths with spaces', () => {
      const result = buildCdCommandForShell('C:\\Program Files\\My App', 'powershell');
      expect(result).toBe("Set-Location 'C:\\Program Files\\My App'; ");
    });

    it('should handle Unix-style paths', () => {
      const result = buildCdCommandForShell('/home/user', 'powershell');
      expect(result).toBe("Set-Location '/home/user'; ");
    });

    it('should prevent variable expansion with single quotes', () => {
      const result = buildCdCommandForShell('C:\\$env:PATH', 'powershell');
      expect(result).toBe("Set-Location 'C:\\$env:PATH'; ");
    });

    it('should prevent command substitution with single quotes', () => {
      const result = buildCdCommandForShell('C:\\$(Get-Date)', 'powershell');
      expect(result).toBe("Set-Location 'C:\\$(Get-Date)'; ");
    });
  });

  describe('cmd shell', () => {
    it('should generate cd /d command with double quotes', () => {
      const result = buildCdCommandForShell('C:\\Users\\test', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\test" & ');
    });

    it('should escape double quotes with caret', () => {
      const result = buildCdCommandForShell('C:\\Users\\"quoted"', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\^"quoted^"" & ');
    });

    it('should escape ampersand with caret', () => {
      const result = buildCdCommandForShell('C:\\Users\\Tom & Jerry', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\Tom ^& Jerry" & ');
    });

    it('should escape pipe with caret', () => {
      const result = buildCdCommandForShell('C:\\Users\\folder|name', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\folder^|name" & ');
    });

    it('should escape redirect characters with caret', () => {
      const result = buildCdCommandForShell('C:\\Users\\a<b>c', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\a^<b^>c" & ');
    });

    it('should escape percent signs by doubling them', () => {
      const result = buildCdCommandForShell('C:\\Users\\100%', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\100%%" & ');
    });

    it('should escape caret by doubling it', () => {
      const result = buildCdCommandForShell('C:\\Users\\test^folder', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\test^^folder" & ');
    });

    it('should handle paths with spaces', () => {
      const result = buildCdCommandForShell('C:\\Program Files', 'cmd');
      expect(result).toBe('cd /d "C:\\Program Files" & ');
    });

    it('should handle complex paths with multiple special characters', () => {
      const result = buildCdCommandForShell('C:\\Users\\Tom & Jerry (50%)', 'cmd');
      expect(result).toBe('cd /d "C:\\Users\\Tom ^& Jerry (50%%)" & ');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string path for bash', () => {
      const result = buildCdCommandForShell('', 'bash');
      expect(result).toBe('');
    });

    it('should handle empty string path for powershell', () => {
      const result = buildCdCommandForShell('', 'powershell');
      expect(result).toBe('');
    });

    it('should handle empty string path for cmd', () => {
      const result = buildCdCommandForShell('', 'cmd');
      expect(result).toBe('');
    });

    it('should handle root path for bash', () => {
      const result = buildCdCommandForShell('/', 'bash');
      expect(result).toBe("cd '/' && ");
    });

    it('should handle drive root for cmd', () => {
      const result = buildCdCommandForShell('C:\\', 'cmd');
      expect(result).toBe('cd /d "C:\\" & ');
    });

    it('should handle drive root for powershell', () => {
      const result = buildCdCommandForShell('C:\\', 'powershell');
      expect(result).toBe("Set-Location 'C:\\'; ");
    });

    it('should handle path with multiple single quotes for bash', () => {
      const result = buildCdCommandForShell("it's John's folder", 'bash');
      expect(result).toBe("cd 'it'\\''s John'\\''s folder' && ");
    });

    it('should handle path with multiple single quotes for powershell', () => {
      const result = buildCdCommandForShell("it's John's folder", 'powershell');
      expect(result).toBe("Set-Location 'it''s John''s folder'; ");
    });
  });
});
