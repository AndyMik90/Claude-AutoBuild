/**
 * Unit tests for python-detector module
 * Tests parsePythonCommand with various inputs including paths with spaces
 */
import { describe, it, expect } from 'vitest';
import { parsePythonCommand } from '../../main/python-detector';

describe('parsePythonCommand', () => {
  describe('simple commands', () => {
    it('should parse simple python command', () => {
      const [command, args] = parsePythonCommand('python3');
      expect(command).toBe('python3');
      expect(args).toEqual([]);
    });

    it('should parse python command', () => {
      const [command, args] = parsePythonCommand('python');
      expect(command).toBe('python');
      expect(args).toEqual([]);
    });

    it('should parse py -3 command (Windows)', () => {
      const [command, args] = parsePythonCommand('py -3');
      expect(command).toBe('py');
      expect(args).toEqual(['-3']);
    });

    it('should parse py command with multiple args', () => {
      const [command, args] = parsePythonCommand('py -3 -u');
      expect(command).toBe('py');
      expect(args).toEqual(['-3', '-u']);
    });
  });

  describe('Unix file paths', () => {
    it('should preserve Unix path without spaces', () => {
      const [command, args] = parsePythonCommand('/usr/bin/python3');
      expect(command).toBe('/usr/bin/python3');
      expect(args).toEqual([]);
    });

    it('should preserve Unix path with spaces (macOS Application Support)', () => {
      const path = '/Users/user/Library/Application Support/auto-claude-ui/python-venv/bin/python';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });

    it('should preserve path starting with ~', () => {
      const path = '~/Library/Application Support/app/python';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });

    it('should preserve relative path starting with ./', () => {
      const path = './venv/bin/python';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });

    it('should preserve relative path starting with ../', () => {
      const path = '../other-project/venv/bin/python';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });

    it('should preserve path with multiple spaces', () => {
      const path = '/Users/John Doe/My Projects/Python App/venv/bin/python';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });
  });

  describe('Windows file paths', () => {
    it('should preserve Windows path with drive letter', () => {
      const path = 'C:\\Users\\user\\AppData\\python.exe';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });

    it('should preserve Windows path with spaces', () => {
      const path = 'C:\\Program Files\\Python 3.11\\python.exe';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });

    it('should preserve Windows path with forward slashes', () => {
      const path = 'C:/Users/user/AppData/python.exe';
      const [command, args] = parsePythonCommand(path);
      expect(command).toBe(path);
      expect(args).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const [command, args] = parsePythonCommand('');
      expect(command).toBe('');
      expect(args).toEqual([]);
    });

    it('should handle single space', () => {
      const [command, args] = parsePythonCommand(' ');
      expect(command).toBe('');
      expect(args).toEqual([]);
    });
  });
});
