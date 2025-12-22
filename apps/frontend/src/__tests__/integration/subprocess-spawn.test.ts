/**
 * Integration tests for subprocess spawning
 * Tests AgentManager spawning Python processes correctly
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

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockProcess)
}));

// Mock claude-profile-manager to bypass auth checks in tests
vi.mock('../../main/claude-profile-manager', () => ({
  getClaudeProfileManager: () => ({
    hasValidAuth: () => true,
    getActiveProfile: () => ({ profileId: 'default', profileName: 'Default' })
  })
}));

// Auto-claude source path (for getAutoBuildSourcePath to find)
const AUTO_CLAUDE_SOURCE = path.join(TEST_DIR, 'auto-claude-source');

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });

  // Create auto-claude source directory that getAutoBuildSourcePath looks for
  mkdirSync(AUTO_CLAUDE_SOURCE, { recursive: true });

  // Create requirements.txt file (used as marker by getAutoBuildSourcePath)
  writeFileSync(path.join(AUTO_CLAUDE_SOURCE, 'requirements.txt'), '# Mock requirements');

  // Create runners subdirectory (where spec_runner.py lives after restructure)
  mkdirSync(path.join(AUTO_CLAUDE_SOURCE, 'runners'), { recursive: true });

  // Create mock spec_runner.py in runners/ subdirectory
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
      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test task description');

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
    });

    it('should spawn Python process for task execution', async () => {
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      manager.startTaskExecution('task-1', TEST_PROJECT_PATH, 'spec-001');

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
    });

    it('should spawn Python process for QA process', async () => {
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      manager.startQAProcess('task-1', TEST_PROJECT_PATH, 'spec-001');

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
    });

    it('should accept parallel options without affecting spawn args', async () => {
      // Note: --parallel was removed from run.py CLI - parallel execution is handled internally by the agent
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      manager.startTaskExecution('task-1', TEST_PROJECT_PATH, 'spec-001', {
        parallel: true,
        workers: 4
      });

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

      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      // Simulate stdout data
      mockStdout.emit('data', Buffer.from('Test log output'));

      expect(logHandler).toHaveBeenCalledWith('task-1', 'Test log output');
    });

    it('should emit log events from stderr', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      const logHandler = vi.fn();
      manager.on('log', logHandler);

      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      // Simulate stderr data (Python progress output often goes here)
      mockStderr.emit('data', Buffer.from('Progress: 50%'));

      expect(logHandler).toHaveBeenCalledWith('task-1', 'Progress: 50%');
    });

    it('should emit exit event when process exits', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      const exitHandler = vi.fn();
      manager.on('exit', exitHandler);

      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

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

      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

      // Simulate process error
      mockProcess.emit('error', new Error('Spawn failed'));

      expect(errorHandler).toHaveBeenCalledWith('task-1', 'Spawn failed');
    });

    it('should kill task and remove from tracking', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

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

      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 1');
      expect(manager.getRunningTasks()).toContain('task-1');

      manager.startTaskExecution('task-2', TEST_PROJECT_PATH, 'spec-001');
      expect(manager.getRunningTasks()).toHaveLength(2);
    });

    it('should use configured Python path', async () => {
      const { spawn } = await import('child_process');
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure('/custom/python3', AUTO_CLAUDE_SOURCE);

      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test');

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
      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 1');
      manager.startTaskExecution('task-2', TEST_PROJECT_PATH, 'spec-001');

      await manager.killAll();

      expect(manager.getRunningTasks()).toHaveLength(0);
    });

    it('should kill existing process when starting new one for same task', async () => {
      const { AgentManager } = await import('../../main/agent');

      const manager = new AgentManager();
      manager.configure(undefined, AUTO_CLAUDE_SOURCE);
      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 1');

      // Start another process for same task
      manager.startSpecCreation('task-1', TEST_PROJECT_PATH, 'Test 2');

      // Should have killed the first one
      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });
});
