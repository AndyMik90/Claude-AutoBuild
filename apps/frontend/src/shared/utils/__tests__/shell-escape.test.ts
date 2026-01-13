/**
 * Shell Escape Utilities Tests
 *
 * Comprehensive tests for shell escaping functions to prevent command injection.
 * These tests cover POSIX (bash/zsh), PowerShell, and cmd.exe escaping.
 */

import { describe, it, expect } from 'vitest';
import {
  escapeShellArg,
  escapeShellArgPowerShell,
  escapeShellArgWindows,
  escapeShellArgForShell,
  escapeCommandForShell,
  escapeShellPath,
  buildCdCommand,
  buildCdCommandForShell,
  buildPathPrefixForShell,
  isPathSafe,
} from '../shell-escape';

describe('shell-escape', () => {
  describe('escapeShellArg (POSIX/bash)', () => {
    it('should wrap simple strings in single quotes', () => {
      expect(escapeShellArg('hello')).toBe("'hello'");
    });

    it('should handle strings with spaces', () => {
      expect(escapeShellArg('hello world')).toBe("'hello world'");
    });

    it('should escape single quotes correctly', () => {
      // Single quotes are escaped as: '\''
      expect(escapeShellArg("it's")).toBe("'it'\\''s'");
      expect(escapeShellArg("don't")).toBe("'don'\\''t'");
    });

    it('should handle multiple single quotes', () => {
      expect(escapeShellArg("it's a 'test'")).toBe("'it'\\''s a '\\''test'\\'''");
    });

    it('should safely wrap command injection attempts', () => {
      // These should all be safely wrapped in single quotes
      expect(escapeShellArg('$(rm -rf /)')).toBe("'$(rm -rf /)'");
      expect(escapeShellArg('`rm -rf /`')).toBe("'`rm -rf /`'");
      expect(escapeShellArg('; rm -rf /')).toBe("'; rm -rf /'");
      expect(escapeShellArg('&& rm -rf /')).toBe("'&& rm -rf /'");
      expect(escapeShellArg('| rm -rf /')).toBe("'| rm -rf /'");
    });

    it('should handle dollar signs and variables', () => {
      expect(escapeShellArg('$HOME')).toBe("'$HOME'");
      expect(escapeShellArg('${PATH}')).toBe("'${PATH}'");
    });

    it('should handle special characters', () => {
      expect(escapeShellArg('path/to/file')).toBe("'path/to/file'");
      expect(escapeShellArg('C:\\Windows\\System32')).toBe("'C:\\Windows\\System32'");
    });

    it('should handle empty string', () => {
      expect(escapeShellArg('')).toBe("''");
    });

    it('should handle newlines and carriage returns', () => {
      expect(escapeShellArg("line1\nline2")).toBe("'line1\nline2'");
      expect(escapeShellArg("line1\r\nline2")).toBe("'line1\r\nline2'");
    });
  });

  describe('escapeShellArgPowerShell', () => {
    it('should wrap simple strings in single quotes', () => {
      expect(escapeShellArgPowerShell('hello')).toBe("'hello'");
    });

    it('should escape single quotes by doubling them', () => {
      // PowerShell uses '' to escape a single quote within single quotes
      expect(escapeShellArgPowerShell("it's")).toBe("'it''s'");
      expect(escapeShellArgPowerShell("don't")).toBe("'don''t'");
    });

    it('should handle multiple single quotes', () => {
      expect(escapeShellArgPowerShell("it's a 'test'")).toBe("'it''s a ''test'''");
    });

    it('should handle Windows paths', () => {
      expect(escapeShellArgPowerShell('C:\\Program Files\\App')).toBe("'C:\\Program Files\\App'");
    });

    it('should safely handle command injection attempts', () => {
      expect(escapeShellArgPowerShell('$(rm -rf /)')).toBe("'$(rm -rf /)'");
      expect(escapeShellArgPowerShell('; Remove-Item -Recurse')).toBe("'; Remove-Item -Recurse'");
    });

    it('should handle dollar signs (no expansion in single quotes)', () => {
      expect(escapeShellArgPowerShell('$env:PATH')).toBe("'$env:PATH'");
    });
  });

  describe('escapeShellArgWindows (cmd.exe)', () => {
    it('should escape percent signs', () => {
      expect(escapeShellArgWindows('%PATH%')).toBe('%%PATH%%');
      expect(escapeShellArgWindows('100%')).toBe('100%%');
    });

    it('should not modify strings without special characters', () => {
      expect(escapeShellArgWindows('hello')).toBe('hello');
      expect(escapeShellArgWindows('C:\\Windows\\System32')).toBe('C:\\Windows\\System32');
    });

    it('should throw error for strings with double quotes', () => {
      expect(() => escapeShellArgWindows('path"with"quotes')).toThrow(
        'Path contains double quote character which cannot be safely escaped for cmd.exe'
      );
    });

    it('should not modify special chars that are literals inside double quotes', () => {
      // Inside double quotes, &|<>^ are treated as literals
      expect(escapeShellArgWindows('path&with&ampersands')).toBe('path&with&ampersands');
      expect(escapeShellArgWindows('path|with|pipes')).toBe('path|with|pipes');
      expect(escapeShellArgWindows('path<with>angles')).toBe('path<with>angles');
    });
  });

  describe('escapeShellArgForShell', () => {
    const testPath = "it's a test";

    it('should use POSIX escaping for bash', () => {
      expect(escapeShellArgForShell(testPath, 'bash')).toBe("'it'\\''s a test'");
    });

    it('should use POSIX escaping for zsh', () => {
      expect(escapeShellArgForShell(testPath, 'zsh')).toBe("'it'\\''s a test'");
    });

    it('should use PowerShell escaping for powershell', () => {
      expect(escapeShellArgForShell(testPath, 'powershell')).toBe("'it''s a test'");
    });

    it('should use PowerShell escaping for pwsh', () => {
      expect(escapeShellArgForShell(testPath, 'pwsh')).toBe("'it''s a test'");
    });

    it('should use Windows escaping wrapped in double quotes for cmd', () => {
      expect(escapeShellArgForShell('test%path%', 'cmd')).toBe('"test%%path%%"');
    });

    it('should default to POSIX escaping for unknown shell', () => {
      expect(escapeShellArgForShell(testPath, 'unknown')).toBe("'it'\\''s a test'");
    });
  });

  describe('escapeCommandForShell', () => {
    const claudePath = '/usr/bin/claude';
    const windowsClaudePath = 'C:\\Program Files\\Claude\\claude.exe';

    it('should use POSIX escaping for bash', () => {
      expect(escapeCommandForShell(claudePath, 'bash')).toBe("'/usr/bin/claude'");
    });

    it('should use PowerShell call operator (&) for powershell', () => {
      // PowerShell needs & to execute a quoted command
      expect(escapeCommandForShell(windowsClaudePath, 'powershell')).toBe(
        "& 'C:\\Program Files\\Claude\\claude.exe'"
      );
    });

    it('should use PowerShell call operator (&) for pwsh', () => {
      expect(escapeCommandForShell(windowsClaudePath, 'pwsh')).toBe(
        "& 'C:\\Program Files\\Claude\\claude.exe'"
      );
    });

    it('should wrap in double quotes for cmd', () => {
      expect(escapeCommandForShell(windowsClaudePath, 'cmd')).toBe(
        '"C:\\Program Files\\Claude\\claude.exe"'
      );
    });
  });

  describe('escapeShellPath', () => {
    it('should escape paths using POSIX escaping', () => {
      expect(escapeShellPath('/path/to/file')).toBe("'/path/to/file'");
      expect(escapeShellPath("path with spaces")).toBe("'path with spaces'");
    });
  });

  describe('buildCdCommand (deprecated)', () => {
    it('should build cd command for Unix paths', () => {
      // This test may vary based on process.platform
      const result = buildCdCommand('/path/to/dir');
      expect(result).toContain('cd');
      expect(result).toContain('/path/to/dir');
    });

    it('should return empty string for undefined path', () => {
      expect(buildCdCommand(undefined)).toBe('');
    });
  });

  describe('buildCdCommandForShell', () => {
    it('should return empty string for undefined path', () => {
      expect(buildCdCommandForShell(undefined, 'bash')).toBe('');
    });

    it('should use cd with single quotes for bash', () => {
      expect(buildCdCommandForShell('/path/to/dir', 'bash')).toBe("cd '/path/to/dir' && ");
    });

    it('should use cd with single quotes for zsh', () => {
      expect(buildCdCommandForShell('/path/to/dir', 'zsh')).toBe("cd '/path/to/dir' && ");
    });

    it('should use Set-Location with semicolon for powershell', () => {
      expect(buildCdCommandForShell('C:\\Users\\Test', 'powershell')).toBe(
        "Set-Location 'C:\\Users\\Test'; "
      );
    });

    it('should use Set-Location with semicolon for pwsh', () => {
      expect(buildCdCommandForShell('C:\\Users\\Test', 'pwsh')).toBe(
        "Set-Location 'C:\\Users\\Test'; "
      );
    });

    it('should use cd /d with double quotes for cmd', () => {
      expect(buildCdCommandForShell('C:\\Users\\Test', 'cmd')).toBe(
        'cd /d "C:\\Users\\Test" && '
      );
    });

    it('should escape percent signs for cmd', () => {
      expect(buildCdCommandForShell('C:\\100%Complete', 'cmd')).toBe(
        'cd /d "C:\\100%%Complete" && '
      );
    });

    it('should escape single quotes for bash', () => {
      expect(buildCdCommandForShell("/path/with'quote", 'bash')).toBe(
        "cd '/path/with'\\''quote' && "
      );
    });
  });

  describe('buildPathPrefixForShell', () => {
    it('should return empty string for undefined path', () => {
      expect(buildPathPrefixForShell(undefined, 'bash')).toBe('');
    });

    it('should use PATH= with single quotes for bash', () => {
      expect(buildPathPrefixForShell('/usr/bin:/bin', 'bash')).toBe("PATH='/usr/bin:/bin' ");
    });

    it('should convert Windows semicolons to Unix colons for bash', () => {
      expect(buildPathPrefixForShell('C:\\bin;D:\\tools', 'bash')).toBe("PATH='C:\\bin:D:\\tools' ");
    });

    it('should use $env:PATH= for powershell', () => {
      expect(buildPathPrefixForShell('C:\\bin;D:\\tools', 'powershell')).toBe(
        "$env:PATH='C:\\bin;D:\\tools'; "
      );
    });

    it('should preserve Windows semicolons for powershell', () => {
      // PowerShell uses semicolons as PATH separator on Windows
      expect(buildPathPrefixForShell('C:\\bin;D:\\tools', 'pwsh')).toBe(
        "$env:PATH='C:\\bin;D:\\tools'; "
      );
    });

    it('should use set "PATH=" for cmd', () => {
      expect(buildPathPrefixForShell('C:\\bin;D:\\tools', 'cmd')).toBe(
        'set "PATH=C:\\bin;D:\\tools" && '
      );
    });

    it('should escape percent signs for cmd', () => {
      expect(buildPathPrefixForShell('C:\\100%', 'cmd')).toBe('set "PATH=C:\\100%%" && ');
    });
  });

  describe('isPathSafe', () => {
    it('should return true for safe paths', () => {
      expect(isPathSafe('/usr/bin/claude')).toBe(true);
      expect(isPathSafe('C:\\Program Files\\App')).toBe(true);
      expect(isPathSafe('/path/to/file.txt')).toBe(true);
    });

    it('should return false for command substitution attempts', () => {
      expect(isPathSafe('$(rm -rf /)')).toBe(false);
      expect(isPathSafe('`rm -rf /`')).toBe(false);
    });

    it('should return false for pipe operators', () => {
      expect(isPathSafe('/path | rm')).toBe(false);
    });

    it('should return false for command separators', () => {
      expect(isPathSafe('/path; rm -rf /')).toBe(false);
      expect(isPathSafe('/path && rm -rf /')).toBe(false);
      expect(isPathSafe('/path || rm -rf /')).toBe(false);
    });

    it('should return false for redirection operators', () => {
      expect(isPathSafe('/path > /etc/passwd')).toBe(false);
      expect(isPathSafe('/path < /etc/passwd')).toBe(false);
    });

    it('should return false for newlines', () => {
      expect(isPathSafe('/path\nrm -rf /')).toBe(false);
      expect(isPathSafe('/path\r\nrm -rf /')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle Unicode characters', () => {
      expect(escapeShellArg('/path/日本語/file')).toBe("'/path/日本語/file'");
      expect(escapeShellArgPowerShell('/path/日本語/file')).toBe("'/path/日本語/file'");
    });

    it('should handle very long paths', () => {
      const longPath = '/path/' + 'a'.repeat(1000);
      expect(escapeShellArg(longPath)).toBe(`'${longPath}'`);
    });

    it('should handle paths with all kinds of special characters', () => {
      const weirdPath = '/path/with spaces/and-dashes/and_underscores/and.dots';
      expect(escapeShellArg(weirdPath)).toBe(`'${weirdPath}'`);
    });
  });
});
