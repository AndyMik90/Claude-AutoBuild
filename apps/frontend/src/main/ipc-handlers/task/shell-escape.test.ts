/**
 * Unit tests for shell-escape utilities.
 * Tests command injection prevention via path escaping.
 */

import { describe, it, expect } from 'vitest';
import { escapePathForShell } from './shell-escape';

describe('escapePathForShell', () => {
  describe('null byte injection prevention', () => {
    it('should reject paths containing null bytes', () => {
      expect(escapePathForShell('/path/with\0null', 'linux')).toBeNull();
      expect(escapePathForShell('C:\\path\\with\0null', 'win32')).toBeNull();
    });

    it('should reject null byte at start of path', () => {
      expect(escapePathForShell('\0/path', 'darwin')).toBeNull();
    });

    it('should reject null byte at end of path', () => {
      expect(escapePathForShell('/path\0', 'linux')).toBeNull();
    });
  });

  describe('newline injection prevention', () => {
    it('should reject paths containing LF newlines', () => {
      expect(escapePathForShell('/path/with\nnewline', 'linux')).toBeNull();
      expect(escapePathForShell('C:\\path\\with\nnewline', 'win32')).toBeNull();
    });

    it('should reject paths containing CR newlines', () => {
      expect(escapePathForShell('/path/with\rnewline', 'darwin')).toBeNull();
      expect(escapePathForShell('C:\\path\\with\rnewline', 'win32')).toBeNull();
    });

    it('should reject paths containing CRLF', () => {
      expect(escapePathForShell('/path/with\r\nnewline', 'linux')).toBeNull();
    });
  });

  describe('Windows platform (win32)', () => {
    it('should reject paths with < character', () => {
      expect(escapePathForShell('C:\\path<file', 'win32')).toBeNull();
    });

    it('should reject paths with > character', () => {
      expect(escapePathForShell('C:\\path>file', 'win32')).toBeNull();
    });

    it('should reject paths with | pipe character', () => {
      expect(escapePathForShell('C:\\path|command', 'win32')).toBeNull();
    });

    it('should reject paths with & ampersand', () => {
      expect(escapePathForShell('C:\\path&command', 'win32')).toBeNull();
    });

    it('should reject paths with ^ caret', () => {
      expect(escapePathForShell('C:\\path^file', 'win32')).toBeNull();
    });

    it('should reject paths with % percent', () => {
      expect(escapePathForShell('C:\\path%VAR%', 'win32')).toBeNull();
    });

    it('should reject paths with ! exclamation', () => {
      expect(escapePathForShell('C:\\path!file', 'win32')).toBeNull();
    });

    it('should reject paths with ` backtick', () => {
      expect(escapePathForShell('C:\\path`command`', 'win32')).toBeNull();
    });

    it('should escape double quotes with double-double quotes', () => {
      expect(escapePathForShell('C:\\path\\"file"', 'win32')).toBe('C:\\path\\""file""');
    });

    it('should pass through safe Windows paths unchanged', () => {
      expect(escapePathForShell('C:\\Users\\name\\project', 'win32')).toBe('C:\\Users\\name\\project');
    });

    it('should allow paths with spaces', () => {
      expect(escapePathForShell('C:\\Program Files\\app', 'win32')).toBe('C:\\Program Files\\app');
    });

    it('should allow paths with parentheses', () => {
      expect(escapePathForShell('C:\\Program Files (x86)\\app', 'win32')).toBe('C:\\Program Files (x86)\\app');
    });
  });

  describe('Unix platforms (linux, darwin)', () => {
    it('should escape single quotes with quote-escape-quote pattern', () => {
      const result = escapePathForShell("/path/with'quote", 'linux');
      expect(result).toBe("/path/with'\\''quote");
    });

    it('should handle multiple single quotes', () => {
      const result = escapePathForShell("it's a 'test'", 'darwin');
      expect(result).toBe("it'\\''s a '\\''test'\\''");
    });

    it('should pass through safe Unix paths unchanged', () => {
      expect(escapePathForShell('/usr/local/bin', 'linux')).toBe('/usr/local/bin');
      expect(escapePathForShell('/Users/name/project', 'darwin')).toBe('/Users/name/project');
    });

    it('should allow paths with spaces', () => {
      expect(escapePathForShell('/path/with spaces/file', 'linux')).toBe('/path/with spaces/file');
    });

    it('should allow paths with special characters (not injection vectors)', () => {
      // These are safe when single-quoted in bash
      expect(escapePathForShell('/path/$var', 'linux')).toBe('/path/$var');
      expect(escapePathForShell('/path/`cmd`', 'darwin')).toBe('/path/`cmd`');
      expect(escapePathForShell('/path/!history', 'linux')).toBe('/path/!history');
    });

    it('should allow paths with glob characters', () => {
      // Safe when single-quoted
      expect(escapePathForShell('/path/*.txt', 'linux')).toBe('/path/*.txt');
      expect(escapePathForShell('/path/[abc]', 'darwin')).toBe('/path/[abc]');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      expect(escapePathForShell('', 'linux')).toBe('');
      expect(escapePathForShell('', 'win32')).toBe('');
    });

    it('should handle path with only quotes', () => {
      expect(escapePathForShell("'''", 'linux')).toBe("'\\'''\\'''\\''");
      expect(escapePathForShell('"""', 'win32')).toBe('""""""');
    });

    it('should handle very long paths', () => {
      const longPath = '/a'.repeat(1000);
      expect(escapePathForShell(longPath, 'linux')).toBe(longPath);
    });

    it('should handle Unicode characters', () => {
      expect(escapePathForShell('/path/日本語/файл', 'linux')).toBe('/path/日本語/файл');
      expect(escapePathForShell('C:\\путь\\文件', 'win32')).toBe('C:\\путь\\文件');
    });

    it('should handle emoji in paths', () => {
      expect(escapePathForShell('/path/📁/file', 'darwin')).toBe('/path/📁/file');
    });
  });

  describe('command injection attack patterns', () => {
    it('should block semicolon command chaining on Windows via newline', () => {
      // Attacker might try: path; malicious_command
      // But semicolons are actually safe on Windows with proper quoting
      // The danger comes from newlines which we block
      expect(escapePathForShell('path\n; malicious', 'win32')).toBeNull();
    });

    it('should block pipe injection on Windows', () => {
      expect(escapePathForShell('path | evil-command', 'win32')).toBeNull();
    });

    it('should block command substitution on Windows', () => {
      expect(escapePathForShell('path & cmd /c evil', 'win32')).toBeNull();
    });

    it('should escape quote escapes on Unix', () => {
      // Attacker might try to break out with: ' ; evil '
      const result = escapePathForShell("' ; evil '", 'linux');
      expect(result).toBe("'\\'' ; evil '\\''");
    });

    it('should block null byte truncation attacks', () => {
      // Attacker might try: /safe/path\0/../../etc/passwd
      expect(escapePathForShell('/safe/path\0/../../etc/passwd', 'linux')).toBeNull();
    });
  });
});
