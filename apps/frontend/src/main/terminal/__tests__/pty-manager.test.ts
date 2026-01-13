/**
 * PTY Manager Tests
 *
 * Tests for shell detection and PTY process management.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-pty to avoid native module issues in tests
vi.mock('@lydell/node-pty', () => ({
  spawn: vi.fn(),
}));

// Mock fs for existsSync
vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

// Mock settings-utils
vi.mock('../../settings-utils', () => ({
  readSettingsFile: vi.fn(() => null),
}));

// Mock claude-profile-manager
vi.mock('../../claude-profile-manager', () => ({
  getClaudeProfileManager: vi.fn(() => ({
    getActiveProfileEnv: vi.fn(() => ({})),
  })),
}));

import { detectShellType } from '../pty-manager';

describe('pty-manager', () => {
  describe('detectShellType', () => {
    describe('PowerShell Core (pwsh)', () => {
      it('should detect pwsh.exe on Windows', () => {
        expect(detectShellType('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('pwsh');
      });

      it('should detect pwsh without extension', () => {
        expect(detectShellType('/usr/bin/pwsh')).toBe('pwsh');
      });

      it('should detect pwsh with path separator', () => {
        expect(detectShellType('/usr/local/bin/pwsh')).toBe('pwsh');
      });

      it('should handle uppercase PWSH', () => {
        expect(detectShellType('C:\\PWSH.EXE')).toBe('pwsh');
      });
    });

    describe('Windows PowerShell', () => {
      it('should detect powershell.exe', () => {
        expect(detectShellType('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell');
      });

      it('should handle various PowerShell paths', () => {
        expect(detectShellType('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell')).toBe('powershell');
      });
    });

    describe('cmd.exe', () => {
      it('should detect cmd.exe', () => {
        expect(detectShellType('C:\\Windows\\System32\\cmd.exe')).toBe('cmd');
      });

      it('should detect standalone cmd', () => {
        expect(detectShellType('cmd')).toBe('cmd');
      });

      it('should detect cmd with backslash', () => {
        expect(detectShellType('C:\\Windows\\System32\\cmd')).toBe('cmd');
      });

      it('should NOT match paths containing cmd as substring', () => {
        // This was the bug - 'cmdtool' should not match as cmd
        expect(detectShellType('C:\\Programs\\mycmdtool\\bash.exe')).toBe('bash');
      });

      it('should NOT match files like command.exe', () => {
        expect(detectShellType('C:\\Programs\\command.exe')).not.toBe('cmd');
      });
    });

    describe('Bash', () => {
      it('should detect bash.exe on Windows', () => {
        expect(detectShellType('C:\\Program Files\\Git\\bin\\bash.exe')).toBe('bash');
      });

      it('should detect bash on Unix', () => {
        expect(detectShellType('/bin/bash')).toBe('bash');
        expect(detectShellType('/usr/bin/bash')).toBe('bash');
      });

      it('should detect bash ending without extension', () => {
        expect(detectShellType('/bin/bash')).toBe('bash');
      });

      it('should detect MSYS2 bash', () => {
        expect(detectShellType('C:\\msys64\\usr\\bin\\bash.exe')).toBe('bash');
      });

      it('should detect Cygwin bash', () => {
        expect(detectShellType('C:\\cygwin64\\bin\\bash.exe')).toBe('bash');
      });
    });

    describe('Zsh', () => {
      it('should detect zsh on Unix', () => {
        expect(detectShellType('/bin/zsh')).toBe('zsh');
        expect(detectShellType('/usr/bin/zsh')).toBe('zsh');
      });

      it('should detect zsh with path', () => {
        expect(detectShellType('/usr/local/bin/zsh')).toBe('zsh');
      });
    });

    describe('Edge cases and fallbacks', () => {
      it('should handle case-insensitive matching', () => {
        expect(detectShellType('C:\\BASH.EXE')).toBe('bash');
        expect(detectShellType('/BIN/BASH')).toBe('bash');
        expect(detectShellType('C:\\ZSH')).toBe('zsh');
      });

      it('should return unknown for unrecognized Windows shells', () => {
        // Save original platform
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'win32' });

        expect(detectShellType('C:\\some\\random\\shell.exe')).toBe('unknown');

        // Restore platform
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      });

      it('should fallback to bash for unrecognized Unix shells', () => {
        // Save original platform
        const originalPlatform = process.platform;
        Object.defineProperty(process, 'platform', { value: 'darwin' });

        expect(detectShellType('/usr/local/bin/fish')).toBe('bash');

        // Restore platform
        Object.defineProperty(process, 'platform', { value: originalPlatform });
      });

      it('should handle empty string', () => {
        // This depends on platform
        const result = detectShellType('');
        expect(['bash', 'unknown']).toContain(result);
      });
    });

    describe('Complex path scenarios', () => {
      it('should handle paths with spaces', () => {
        expect(detectShellType('C:\\Program Files\\Git\\bin\\bash.exe')).toBe('bash');
        expect(detectShellType('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('pwsh');
      });

      it('should handle mixed forward/back slashes', () => {
        expect(detectShellType('C:/Windows/System32/cmd.exe')).toBe('cmd');
        expect(detectShellType('C:\\Program Files/Git\\bin/bash.exe')).toBe('bash');
      });

      it('should handle WSL paths', () => {
        expect(detectShellType('/mnt/c/Windows/System32/bash.exe')).toBe('bash');
      });
    });

    describe('False positive prevention (precise path boundary matching)', () => {
      // These tests verify that shell names in directory paths don't cause false positives
      // when using endsWith() instead of includes()

      describe('pwsh false positives', () => {
        it('should NOT match pwsh-tools directory as pwsh', () => {
          // /usr/local/pwsh-tools/bash should be bash, not pwsh
          expect(detectShellType('/usr/local/pwsh-tools/bash')).toBe('bash');
        });

        it('should NOT match pwsh in middle of path', () => {
          expect(detectShellType('/home/user/pwsh/bin/zsh')).toBe('zsh');
        });
      });

      describe('powershell false positives', () => {
        it('should NOT match powershell-scripts directory as powershell', () => {
          // /opt/powershell-scripts/zsh should be zsh, not powershell
          expect(detectShellType('/opt/powershell-scripts/zsh')).toBe('zsh');
        });

        it('should NOT match powershell in middle of path', () => {
          expect(detectShellType('/home/user/powershell/modules/bash')).toBe('bash');
        });
      });

      describe('cmd false positives', () => {
        it('should NOT match cmd in username', () => {
          // C:\Users\cmd-admin\Git\bin\bash.exe should be bash
          expect(detectShellType('C:\\Users\\cmd-admin\\Git\\bin\\bash.exe')).toBe('bash');
        });

        it('should NOT match commander directory as cmd', () => {
          // /home/commander/bin/bash should be bash
          expect(detectShellType('/home/commander/bin/bash')).toBe('bash');
        });

        it('should NOT match cmdtools directory as cmd', () => {
          expect(detectShellType('/usr/local/cmdtools/zsh')).toBe('zsh');
        });
      });

      describe('bash false positives', () => {
        it('should NOT match bash-tools directory as bash', () => {
          // /path/to/bash-tools/zsh should be zsh, not bash
          expect(detectShellType('/path/to/bash-tools/zsh')).toBe('zsh');
        });

        it('should NOT match bash_scripts directory as bash', () => {
          expect(detectShellType('/home/user/bash_scripts/pwsh')).toBe('pwsh');
        });
      });

      describe('zsh false positives', () => {
        it('should NOT match zsh-plugin directory as zsh', () => {
          // /path/to/zsh-plugin/bash should be bash, not zsh
          expect(detectShellType('/path/to/zsh-plugin/bash')).toBe('bash');
        });

        it('should NOT match zshrc-backup directory as zsh', () => {
          expect(detectShellType('/home/user/zshrc-backup/pwsh')).toBe('pwsh');
        });
      });

      describe('complex mixed scenarios', () => {
        it('should correctly identify shell even with multiple shell names in path', () => {
          // Path contains pwsh, bash, cmd but ends with zsh
          expect(detectShellType('/pwsh-tools/bash-scripts/cmd-utils/zsh')).toBe('zsh');

          // Path contains all shell names but ends with bash
          expect(detectShellType('/zsh-config/powershell/cmd/bash')).toBe('bash');
        });

        it('should handle Windows paths with shell names in directories', () => {
          expect(detectShellType('C:\\Users\\pwsh-user\\bash-scripts\\Git\\bin\\bash.exe')).toBe('bash');
          expect(detectShellType('C:\\cmd-tools\\powershell\\7\\pwsh.exe')).toBe('pwsh');
        });
      });
    });
  });
});
