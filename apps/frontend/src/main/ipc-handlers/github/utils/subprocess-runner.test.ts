
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPythonSubprocess } from './subprocess-runner';
import * as childProcess from 'child_process';
import EventEmitter from 'events';

// Mock child_process with importOriginal to preserve all exports
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(),
    exec: vi.fn(),
  };
});

// Mock parsePythonCommand
vi.mock('../../../python-detector', () => ({
  parsePythonCommand: vi.fn((path) => {
    // specific behavior for spaced paths can be mocked here or overwridden in tests
    if (path.includes(' ')) {
        return [path, []]; // Simple pass-through for test
    }
    return [path, []];
  }),
}));

import { parsePythonCommand } from '../../../python-detector';

describe('runPythonSubprocess', () => {
  let mockSpawn: any;
  let mockChildProcess: any;

  beforeEach(() => {
    mockSpawn = vi.mocked(childProcess.spawn);
    mockChildProcess = new EventEmitter();
    mockChildProcess.stdout = new EventEmitter();
    mockChildProcess.stderr = new EventEmitter();
    mockChildProcess.kill = vi.fn();
    mockSpawn.mockReturnValue(mockChildProcess);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle python path with spaces', async () => {
    // Arrange
    const pythonPath = '/path/with spaces/python';
    const mockArgs = ['-c', 'print("hello")'];

    // Mock parsePythonCommand to return the path split logic if needed,
    // or just rely on the mock above.
    // Let's make sure our mock enables the scenario we want.
    vi.mocked(parsePythonCommand).mockReturnValue(['/path/with spaces/python', []]);

    // Act
    runPythonSubprocess({
      pythonPath,
      args: mockArgs,
      cwd: '/tmp',
    });

    // Assert
    expect(parsePythonCommand).toHaveBeenCalledWith(pythonPath);
    expect(mockSpawn).toHaveBeenCalledWith(
      '/path/with spaces/python',
      expect.arrayContaining(mockArgs),
      expect.any(Object)
    );
  });

  it('should pass user arguments AFTER python arguments', async () => {
    // Arrange
    const pythonPath = 'python';
    const pythonBaseArgs = ['-u', '-X', 'utf8'];
    const userArgs = ['script.py', '--verbose'];

    // Setup mock to simulate what parsePythonCommand would return for a standard python path
    vi.mocked(parsePythonCommand).mockReturnValue(['python', pythonBaseArgs]);

    // Act
    runPythonSubprocess({
      pythonPath,
      args: userArgs,
      cwd: '/tmp',
    });

    // Assert
    // The critical check: verify the ORDER of arguments in the second parameter of spawn
    // expect call to be: spawn('python', ['-u', '-X', 'utf8', 'script.py', '--verbose'], ...)
    const expectedArgs = [...pythonBaseArgs, ...userArgs];

    expect(mockSpawn).toHaveBeenCalledWith(
      expect.any(String),
      expectedArgs, // Exact array match verifies order
      expect.any(Object)
    );
  });

  describe('environment handling', () => {
    it('should use caller-provided env directly when options.env is set', () => {
      // Arrange
      const customEnv = {
        PATH: '/custom/path',
        PYTHONPATH: '/custom/pythonpath',
        ANTHROPIC_AUTH_TOKEN: 'custom-token',
      };
      vi.mocked(parsePythonCommand).mockReturnValue(['python', []]);

      // Act
      runPythonSubprocess({
        pythonPath: 'python',
        args: ['script.py'],
        cwd: '/tmp',
        env: customEnv,
      });

      // Assert - should use the exact env provided
      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: customEnv,
        })
      );
    });

    it('should create fallback env when options.env is not provided', () => {
      // Arrange
      const originalEnv = process.env;
      try {
        process.env = {
          PATH: '/usr/bin',
          HOME: '/home/user',
          USER: 'testuser',
          SHELL: '/bin/bash',
          LANG: 'en_US.UTF-8',
          CLAUDE_CODE_OAUTH_TOKEN: 'oauth-token',
          ANTHROPIC_API_KEY: 'api-key',
          SENSITIVE_VAR: 'should-not-leak',
        };

        vi.mocked(parsePythonCommand).mockReturnValue(['python', []]);

        // Act
        runPythonSubprocess({
          pythonPath: 'python',
          args: ['script.py'],
          cwd: '/tmp',
          // No env provided - should use fallback
        });

        // Assert - should only include safe vars
        const spawnCall = mockSpawn.mock.calls[0];
        const envArg = spawnCall[2].env;

        // Safe vars should be included
        expect(envArg.PATH).toBe('/usr/bin');
        expect(envArg.HOME).toBe('/home/user');
        expect(envArg.USER).toBe('testuser');

        // CLAUDE_ and ANTHROPIC_ prefixed vars should be included
        expect(envArg.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-token');
        expect(envArg.ANTHROPIC_API_KEY).toBe('api-key');

        // Sensitive vars should NOT be included
        expect(envArg.SENSITIVE_VAR).toBeUndefined();
      } finally {
        // Restore - always runs even if assertions fail
        process.env = originalEnv;
      }
    });

    it('fallback env should include platform-specific vars on Windows', () => {
      // Arrange
      const originalEnv = process.env;
      try {
        process.env = {
          PATH: 'C:\\Windows\\System32',
          SYSTEMROOT: 'C:\\Windows',
          COMSPEC: 'C:\\Windows\\System32\\cmd.exe',
          PATHEXT: '.COM;.EXE;.BAT',
          WINDIR: 'C:\\Windows',
          USERPROFILE: 'C:\\Users\\test',
          APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
          LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
        };

        vi.mocked(parsePythonCommand).mockReturnValue(['python', []]);

        // Act
        runPythonSubprocess({
          pythonPath: 'python',
          args: ['script.py'],
          cwd: '/tmp',
          // No env provided - should use fallback
        });

        // Assert - Windows-specific vars should be included
        const spawnCall = mockSpawn.mock.calls[0];
        const envArg = spawnCall[2].env;

        expect(envArg.SYSTEMROOT).toBe('C:\\Windows');
        expect(envArg.COMSPEC).toBe('C:\\Windows\\System32\\cmd.exe');
        expect(envArg.PATHEXT).toBe('.COM;.EXE;.BAT');
        expect(envArg.USERPROFILE).toBe('C:\\Users\\test');
        expect(envArg.APPDATA).toBe('C:\\Users\\test\\AppData\\Roaming');
      } finally {
        // Restore - always runs even if assertions fail
        process.env = originalEnv;
      }
    });
  });
});
