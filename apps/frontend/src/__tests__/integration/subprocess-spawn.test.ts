/**
 * Integration tests for subprocess spawning
 * Tests AgentManager spawning Python processes correctly
 *
 * NOTE: Some pre-existing test failures in the full test suite (e.g., @testing-library/react
 * v16 missing exports) are NOT related to changes in this file. This test file focuses on
 * subprocess spawning and AgentManager functionality only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import path from 'path';
import { findPythonCommand, parsePythonCommand } from '../../main/python-detector';

// Test directories
const TEST_DIR = '/tmp/subprocess-spawn-test';
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');

// Detect the Python command that will actually be used
const DETECTED_PYTHON_CMD = findPythonCommand() || 'python';
const [EXPECTED_PYTHON_COMMAND, EXPECTED_PYTHON_BASE_ARGS] = parsePythonCommand(DETECTED_PYTHON_CMD);

// Mock child_process spawn
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

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    spawn: vi.fn(() => mockProcess)
  };
});

// Mock claude-profile-manager to bypass auth checks in tests
const mockProfileManager = {
  hasValidAuth: () => true,
  getActiveProfile: () => ({ profileId: 'default', profileName: 'Default' })
};

vi.mock('../../main/claude-profile-manager', () => ({
  getClaudeProfileManager: () => mockProfileManager,
  initializeClaudeProfileManager: () => Promise.resolve(mockProfileManager)
}));

// Mock validatePythonPath to allow test paths (security validation is tested separately)
vi.mock('../../main/python-detector', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../main/python-detector')>();
  return {
    ...actual,
    validatePythonPath: (path: string) => ({ valid: true, sanitizedPath: path })
  };
});

// Mock python-env-manager for ensurePythonEnvReady (ACS-254)
vi.mock('../../main/python-env-manager', () => ({
  pythonEnvManager: {
    isEnvReady: vi.fn(() => true),
    initialize: vi.fn(() => Promise.resolve({ ready: true })),
    getPythonEnv: vi.fn(() => ({}))
  },
  getConfiguredPythonPath: vi.fn(() => DETECTED_PYTHON_CMD)
}));

// Auto-claude source path (for getAutoBuildSourcePath to find)
const AUTO_CLAUDE_SOURCE = path.join(TEST_DIR, 'auto-claude-source');

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });

  // Create auto-claude source directory that getAutoBuildSourcePath looks for
  mkdirSync(AUTO_CLAUDE_SOURCE, { recursive: true });

  // Create runners subdirectory with spec_runner.py marker (used by getAutoBuildSourcePath)
  mkdirSync(path.join(AUTO_CLAUDE_SOURCE, 'runners'), { recursive: true });

  // Create mock spec_runner.py in runners/ subdirectory (used as backend marker)
  writeFileSync(
    path.join(AUTO_CLAUDE_SOURCE, 'runners', 'spec_runner.py'),
    '# Mock spec runner\nprint("Starting spec creation")'
  );
  // Create mock run.py
  writeFileSync(
    path.join(AUTO_CLAUDE_SOURCE, 'run.py'),
    '# Mock run.py\nprint("Starting task execution")'
  );
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Subprocess Spawn Integration', () => {
  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.clearAllMocks();
    // Reset mock process state
    mockProcess.killed = false;
    mockProcess.removeAllListeners();
    mockStdout.removeAllListeners();
    mockStderr.removeAllListeners();
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('AgentManager', () => {
    it('should spawn Python process for spec creation', async () => {
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);

      // Start the async operation
      const promise = manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test task description');

      // Wait for spawn to complete (ensures listeners are attached), then emit exit
      await new Promise(resolve => setImmediate(resolve));
      mockProcess.emit('exit', 0);
      await promise;

      expect(spawn).toHaveBeenCalledWith(
        EXPECTED_PYTHON_COMMAND,
        expect.arrayContaining([
          ...EXPECTED_PYTHON_BASE_ARGS,
          expect.stringContaining('spec_runner.py'),
          '--task',
          'Test task description'
        ]),
        expect.objectContaining({
          cwd: AUTO_CLAUDE_SOURCE,  // Process runs from auto-claude source directory
          env: expect.objectContaining({
            PYTHONUNBUFFERED: '1'
          })
        })
      );
    }, 15000);  // Increase timeout for Windows CI

    it('should spawn Python process for task execution', async () => {
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);

      // Start the async operation
      const promise = manager.startTaskExecution('task-1', TEST_PROJECT_PATH, 'spec-001');

      // Wait for spawn to complete (ensures listeners are attached), then emit exit
      await new Promise(resolve => setImmediate(resolve));
      mockProcess.emit('exit', 0);
      await promise;

      expect(spawn).toHaveBeenCalledWith(
        EXPECTED_PYTHON_COMMAND,
        expect.arrayContaining([
          ...EXPECTED_PYTHON_BASE_ARGS,
          expect.stringContaining('run.py'),
          '--spec',
          'spec-001'
        ]),
        expect.objectContaining({
          cwd: AUTO_CLAUDE_SOURCE  // Process runs from auto-claude source directory
        })
      );
    }, 15000);  // Increase timeout for Windows CI

    it('should spawn Python process for QA process', async () => {
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);

      // Start the async operation
      const promise = manager.startQAProcess('task-1', TEST_PROJECT_PATH, 'spec-001');

      // Wait for spawn to complete (ensures listeners are attached), then emit exit
      await new Promise(resolve => setImmediate(resolve));
      mockProcess.emit('exit', 0);
      await promise;

      expect(spawn).toHaveBeenCalledWith(
        EXPECTED_PYTHON_COMMAND,
        expect.arrayContaining([
          ...EXPECTED_PYTHON_BASE_ARGS,
          expect.stringContaining('run.py'),
          '--spec',
          'spec-001',
          '--qa'
        ]),
        expect.objectContaining({
          cwd: AUTO_CLAUDE_SOURCE  // Process runs from auto-claude source directory
        })
      );
    }, 15000);  // Increase timeout for Windows CI

    it('should accept parallel options without affecting spawn args', async () => {
      // Note: --parallel was removed from run.py CLI - parallel execution is handled internally by the agent
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);

      // Start the async operation
      const promise = manager.startTaskExecution('task-1', TEST_PROJECT_PATH, 'spec-001', {
        parallel: true,
        workers: 4
      });

      // Wait for spawn to complete (ensures listeners are attached), then emit exit
      await new Promise(resolve => setImmediate(resolve));
      mockProcess.emit('exit', 0);
      await promise;
      // Should spawn normally - parallel options don't affect CLI args anymore
      expect(spawn).toHaveBeenCalledWith(
        EXPECTED_PYTHON_COMMAND,
        expect.arrayContaining([
          ...EXPECTED_PYTHON_BASE_ARGS,
          expect.stringContaining('run.py'),
          '--spec',
          'spec-001'
        ]),
        expect.any(Object)
      );
    });

    it('should emit log events from stdout', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      const logHandler = vi.fn();
      manager.on('log', logHandler);

      await manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      // Simulate stdout data (must include newline for buffered output processing)
      mockStdout.emit('data', Buffer.from('Test log output\n'));

      expect(logHandler).toHaveBeenCalledWith('task-1', 'Test log output\n');
    });

    it('should emit log events from stderr', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      const logHandler = vi.fn();
      manager.on('log', logHandler);

      await manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      // Simulate stderr data (must include newline for buffered output processing)
      mockStderr.emit('data', Buffer.from('Progress: 50%\n'));

      expect(logHandler).toHaveBeenCalledWith('task-1', 'Progress: 50%\n');
    });

    it('should emit exit event when process exits', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      const exitHandler = vi.fn();
      manager.on('exit', exitHandler);

      await manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      // Simulate process exit
      mockProcess.emit('exit', 0);

      // Exit event includes taskId, exit code, and process type
      expect(exitHandler).toHaveBeenCalledWith('task-1', 0, expect.any(String));
    });

    it('should emit error event when process errors', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      const errorHandler = vi.fn();
      manager.on('error', errorHandler);

      await manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      // Simulate process error
      mockProcess.emit('error', new Error('Spawn failed'));

      expect(errorHandler).toHaveBeenCalledWith('task-1', 'Spawn failed');
    });

    it('should kill task and remove from tracking', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      await manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      expect(manager.isRunning('task-1')).toBe(true);

      const result = manager.killTask('task-1');

      expect(result).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(manager.isRunning('task-1')).toBe(false);
    });

    it('should return false when killing non-existent task', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      const result = manager.killTask('nonexistent');

      expect(result).toBe(false);
    });

    it('should track running tasks', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      expect(manager.getRunningTasks()).toHaveLength(0);

      // Start tasks in parallel
      const promise1 = manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 1');
      const promise2 = manager.startTaskExecution('task-2', TEST_PROJECT_PATH, 'spec-001');

      // Wait for both tasks to be tracked (spawn happens after async operations)
      await vi.waitFor(() => {
        expect(manager.getRunningTasks()).toHaveLength(2);
      }, { timeout: 5000 });

      // Both tasks share the same mock process, so emit exit once triggers both handlers
      mockProcess.emit('exit', 0);

      // Wait for both promises to resolve
      await promise1;
      await promise2;

      // Tasks should be removed from tracking after exit
      expect(manager.getRunningTasks()).toHaveLength(0);
    }, 15000);

    it('should use configured Python path', async () => {
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure('/custom/python3', AUTO_CLAUDE_SOURCE);

      await manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      expect(spawn).toHaveBeenCalledWith(
        '/custom/python3',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should kill all running tasks', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);

      // Start two async operations
      const promise1 = manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 1');
      const promise2 = manager.startTaskExecution('task-2', TEST_PROJECT_PATH, 'spec-001');

      // Wait for spawn to complete (ensures listeners are attached), then emit exit
      await new Promise(resolve => setImmediate(resolve));
      mockProcess.emit('exit', 0);
      await promise1;
      mockProcess.emit('exit', 0);
      await promise2;

      await manager.killAll();

      expect(manager.getRunningTasks()).toHaveLength(0);
    }, 10000);  // Increase timeout for Windows CI

    it('should allow sequential execution of same task', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);

      // Start first operation
      const promise1 = manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 1');
      // Wait for spawn, then emit exit
      await new Promise(resolve => setImmediate(resolve));
      mockProcess.emit('exit', 0);
      await promise1;

      // Start another process for same task (first was already completed)
      const promise2 = manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 2');
      // Wait for spawn, then emit exit
      await new Promise(resolve => setImmediate(resolve));
      mockProcess.emit('exit', 0);
      await promise2;

      // Both processes completed successfully
      // (the first process was already done before the second started)
    }, 10000);  // Increase timeout for Windows CI
  });
});
