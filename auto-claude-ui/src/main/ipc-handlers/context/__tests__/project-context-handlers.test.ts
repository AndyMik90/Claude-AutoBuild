/**
 * Unit tests for project-context-handlers
 * Tests the CONTEXT_REFRESH_INDEX handler uses correct Python path
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

// Test directories - use os.tmpdir() for portability
const TEST_DIR = path.join(tmpdir(), 'project-context-handlers-test');
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');

// Mock spawn to capture calls
const mockStdout = new EventEmitter();
const mockStderr = new EventEmitter();
const mockProcess = Object.assign(new EventEmitter(), {
  stdout: mockStdout,
  stderr: mockStderr,
  pid: 12345,
  killed: false,
  kill: vi.fn(() => {
    mockProcess.killed = true;
    return true;
  })
});

const mockSpawn = vi.fn(() => mockProcess);

vi.mock('child_process', () => ({
  spawn: mockSpawn
}));

// Mock pythonEnvManager singleton - this is the key fix we're testing
const mockGetPythonPath = vi.fn();
vi.mock('../../../python-env-manager', () => ({
  pythonEnvManager: {
    getPythonPath: mockGetPythonPath
  }
}));

// Mock electron
vi.mock('electron', () => {
  const mockIpcMain = new (class extends EventEmitter {
    private handlers: Map<string, Function> = new Map();

    handle(channel: string, handler: Function): void {
      this.handlers.set(channel, handler);
    }

    removeHandler(channel: string): void {
      this.handlers.delete(channel);
    }

    async invokeHandler(channel: string, event: unknown, ...args: unknown[]): Promise<unknown> {
      const handler = this.handlers.get(channel);
      if (handler) {
        return handler(event, ...args);
      }
      throw new Error(`No handler for channel: ${channel}`);
    }
  })();

  return {
    ipcMain: mockIpcMain,
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return path.join(TEST_DIR, 'userData');
        return TEST_DIR;
      })
    }
  };
});

// Mock project store
vi.mock('../../../project-store', () => ({
  projectStore: {
    getProject: vi.fn((id: string) => {
      if (id === 'test-project-id') {
        return {
          id: 'test-project-id',
          name: 'test-project',
          path: TEST_PROJECT_PATH,
          autoBuildPath: '.auto-claude'
        };
      }
      return null;
    })
  }
}));

// Mock utils
vi.mock('../utils', () => ({
  getAutoBuildSourcePath: vi.fn(() => path.join(TEST_DIR, 'auto-claude-source'))
}));

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  mkdirSync(path.join(TEST_DIR, 'auto-claude-source'), { recursive: true });
  mkdirSync(path.join(TEST_DIR, 'userData'), { recursive: true });

  // Create mock analyzer.py
  writeFileSync(
    path.join(TEST_DIR, 'auto-claude-source', 'analyzer.py'),
    '# Mock analyzer'
  );
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('project-context-handlers', () => {
  let ipcMain: {
    invokeHandler: (channel: string, event: unknown, ...args: unknown[]) => Promise<unknown>;
  };

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();

    // Reset mock process state
    mockProcess.killed = false;
    mockProcess.removeAllListeners();
    mockStdout.removeAllListeners();
    mockStderr.removeAllListeners();

    // Get mocked ipcMain
    const electron = await import('electron');
    ipcMain = electron.ipcMain as unknown as typeof ipcMain;

    // Reset modules to re-register handlers
    vi.resetModules();
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('CONTEXT_REFRESH_INDEX handler', () => {
    it('should use pythonEnvManager.getPythonPath() instead of hardcoded python', async () => {
      // Setup: Mock pythonEnvManager to return a specific path
      const expectedPythonPath = '/path/to/venv/bin/python';
      mockGetPythonPath.mockReturnValue(expectedPythonPath);

      // Register handlers
      const { registerProjectContextHandlers } = await import('../project-context-handlers');
      registerProjectContextHandlers(() => null);

      // Simulate the spawn completing successfully
      setTimeout(() => {
        mockProcess.emit('close', 0);
      }, 10);

      // Invoke the handler
      await ipcMain.invokeHandler('context:refreshIndex', {}, 'test-project-id');

      // Verify: spawn was called with the venv Python path, NOT 'python'
      expect(mockSpawn).toHaveBeenCalled();
      const spawnCall = mockSpawn.mock.calls[0];
      expect(spawnCall[0]).toBe(expectedPythonPath);
      expect(spawnCall[0]).not.toBe('python');
      expect(spawnCall[0]).not.toBe('python3');
    });

    it('should return error when Python environment is not ready', async () => {
      // Setup: Mock pythonEnvManager to return null (not initialized)
      mockGetPythonPath.mockReturnValue(null);

      // Register handlers
      const { registerProjectContextHandlers } = await import('../project-context-handlers');
      registerProjectContextHandlers(() => null);

      // Invoke the handler
      const result = await ipcMain.invokeHandler('context:refreshIndex', {}, 'test-project-id');

      // Verify: Returns error about Python not being ready
      expect(result).toEqual({
        success: false,
        error: 'Python environment not ready. Please wait for initialization.'
      });

      // Verify: spawn was NOT called
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should return error for non-existent project', async () => {
      mockGetPythonPath.mockReturnValue('/path/to/python');

      // Register handlers
      const { registerProjectContextHandlers } = await import('../project-context-handlers');
      registerProjectContextHandlers(() => null);

      // Invoke with non-existent project ID
      const result = await ipcMain.invokeHandler('context:refreshIndex', {}, 'nonexistent-id');

      expect(result).toEqual({
        success: false,
        error: 'Project not found'
      });
    });
  });
});
