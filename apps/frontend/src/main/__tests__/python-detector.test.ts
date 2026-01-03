import { parsePythonCommand, validatePythonPath } from '../python-detector';

describe('parsePythonCommand', () => {
  describe('paths with spaces', () => {
    it('should preserve paths with spaces when they contain path separators', () => {
      const [cmd, args] = parsePythonCommand('/Users/user/Library/Application Support/MyApp/venv/bin/python');
      expect(cmd).toBe('/Users/user/Library/Application Support/MyApp/venv/bin/python');
      expect(args).toEqual([]);
    });

    it('should preserve Windows paths with spaces', () => {
      const [cmd, args] = parsePythonCommand('C:\\Program Files\\Python310\\python.exe');
      expect(cmd).toBe('C:\\Program Files\\Python310\\python.exe');
      expect(args).toEqual([]);
    });

    it('should preserve macOS Application Support paths', () => {
      const [cmd, args] = parsePythonCommand('/Users/testuser/Library/Application Support/Auto-Claude/python-venv/bin/python3');
      expect(cmd).toBe('/Users/testuser/Library/Application Support/Auto-Claude/python-venv/bin/python3');
      expect(args).toEqual([]);
    });

    it('should preserve paths with multiple spaces', () => {
      const [cmd, args] = parsePythonCommand('/path/with  multiple   spaces/python3');
      expect(cmd).toBe('/path/with  multiple   spaces/python3');
      expect(args).toEqual([]);
    });
  });

  describe('simple commands', () => {
    it('should split "py -3" into command and args', () => {
      const [cmd, args] = parsePythonCommand('py -3');
      expect(cmd).toBe('py');
      expect(args).toEqual(['-3']);
    });

    it('should handle plain python command', () => {
      const [cmd, args] = parsePythonCommand('python3');
      expect(cmd).toBe('python3');
      expect(args).toEqual([]);
    });

    it('should handle python with version', () => {
      const [cmd, args] = parsePythonCommand('python');
      expect(cmd).toBe('python');
      expect(args).toEqual([]);
    });
  });

  describe('quoted paths', () => {
    it('should strip double quotes from paths', () => {
      const [cmd, args] = parsePythonCommand('"/path/to/python"');
      expect(cmd).toBe('/path/to/python');
      expect(args).toEqual([]);
    });

    it('should strip single quotes from paths', () => {
      const [cmd, args] = parsePythonCommand("'/path/to/python'");
      expect(cmd).toBe('/path/to/python');
      expect(args).toEqual([]);
    });

    it('should handle quoted paths with spaces', () => {
      const [cmd, args] = parsePythonCommand('"/Users/user/My Apps/venv/bin/python"');
      expect(cmd).toBe('/Users/user/My Apps/venv/bin/python');
      expect(args).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('should throw on empty string', () => {
      expect(() => parsePythonCommand('')).toThrow('Python command cannot be empty');
    });

    it('should throw on whitespace-only string', () => {
      expect(() => parsePythonCommand('   ')).toThrow('Python command cannot be empty');
    });

    it('should throw on empty quoted string', () => {
      expect(() => parsePythonCommand('""')).toThrow('Python command cannot be empty');
    });

    it('should handle path with trailing spaces', () => {
      const [cmd, args] = parsePythonCommand('/path/to/python   ');
      expect(cmd).toBe('/path/to/python');
      expect(args).toEqual([]);
    });

    it('should handle path with leading spaces', () => {
      const [cmd, args] = parsePythonCommand('   /path/to/python');
      expect(cmd).toBe('/path/to/python');
      expect(args).toEqual([]);
    });
  });
});

describe('validatePythonPath', () => {
  describe('shell metacharacter rejection', () => {
    it('should reject paths with command substitution $()', () => {
      const result = validatePythonPath('/path/$(whoami)/python');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('dangerous shell metacharacters');
    });

    it('should reject paths with backticks', () => {
      const result = validatePythonPath('/path/`id`/python');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('dangerous shell metacharacters');
    });

    it('should reject paths with semicolons', () => {
      const result = validatePythonPath('/path/python; rm -rf /');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('dangerous shell metacharacters');
    });

    it('should reject paths with pipes', () => {
      const result = validatePythonPath('/path/python | cat');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('dangerous shell metacharacters');
    });

    it('should reject paths with newlines', () => {
      const result = validatePythonPath('/path/python\nrm -rf /');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('dangerous shell metacharacters');
    });
  });

  describe('path traversal rejection', () => {
    it('should reject paths with directory traversal', () => {
      const result = validatePythonPath('/usr/bin/../../../etc/passwd');
      expect(result.valid).toBe(false);
      // Path traversal is caught by allowlist check (normalized path won't match patterns)
      expect(result.reason).toContain('does not match allowed Python locations');
    });
  });

  describe('empty/invalid input', () => {
    it('should reject empty string', () => {
      const result = validatePythonPath('');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('empty or invalid');
    });

    it('should reject null-like values', () => {
      const result = validatePythonPath(null as unknown as string);
      expect(result.valid).toBe(false);
    });
  });
});
