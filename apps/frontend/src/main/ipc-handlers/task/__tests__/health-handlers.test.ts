/**
 * Tests for task health check IPC handlers
 *
 * Tests TASK_HEALTH_CHECK handler with support for:
 * - Detecting stuck tasks (in_progress but no process running)
 * - Detecting failed tasks (error status or failed phase)
 * - Detecting failed subtasks
 * - Detecting QA rejected tasks
 * - Detecting missing spec files
 * - Detecting corrupted plan files
 * - Detecting tasks with no progress
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { rimraf } from 'rimraf';
import type { Task } from '@shared/types/task';

// Mock electron before importing
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}));

// Mock project store
const mockGetProjects = vi.fn();
const mockGetTasks = vi.fn();

vi.mock('../project-store', () => ({
  projectStore: {
    getProjects: () => mockGetProjects(),
    getTasks: () => mockGetTasks()
  }
}));

// Mock AgentManager
const mockIsRunning = vi.fn();

vi.mock('../../agent/agent-manager', () => ({
  AgentManager: vi.fn().mockImplementation(() => ({
    isRunning: (taskId: string) => mockIsRunning(taskId)
  }))
}));

import { ipcMain } from 'electron';
import { IPC_CHANNELS, AUTO_BUILD_PATHS } from '../../shared/constants';
import { registerTaskHealthHandlers } from './health-handlers';
import type { AgentManager } from '../../agent';
import type { TaskHealthCheckResult } from '@shared/types/task';

// Test directory setup
const TEST_PROJECT_PATH = '/tmp/test-health-check-project';
const TEST_SPECS_DIR = join(TEST_PROJECT_PATH, '.auto-claude', 'specs');

/**
 * Gets the health check handler function
 */
function getHealthCheckHandler() {
  const calls = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const healthCheckCall = calls.find(
    (call) => call[0] === IPC_CHANNELS.TASK_HEALTH_CHECK
  );
  return healthCheckCall?.[1];
}

/**
 * Creates a mock task with optional overrides
 */
function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-1',
    projectId: 'project-1',
    specId: '001-test-task',
    title: 'Test Task',
    description: 'Test task description',
    status: 'backlog',
    subtasks: [],
    logs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    specsPath: join(TEST_SPECS_DIR, '001-test-task'),
    ...overrides
  };
}

/**
 * Sets up a test spec directory with files
 */
function setupTestSpecDir(specId: string, files: Record<string, string>) {
  const specDir = join(TEST_SPECS_DIR, specId);
  mkdirSync(specDir, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(specDir, filename), content, 'utf-8');
  }
}

/**
 * Cleans up test directory
 */
function cleanupTestDir() {
  if (existsSync(TEST_PROJECT_PATH)) {
    rimraf.sync(TEST_PROJECT_PATH);
  }
}

describe('health-handlers - TASK_HEALTH_CHECK', () => {
  let mockAgentManager: AgentManager;
  let handler: (event: unknown, projectId: string) => Promise<unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    cleanupTestDir();

    // Create test project directory structure
    mkdirSync(TEST_SPECS_DIR, { recursive: true });

    // Mock project
    mockGetProjects.mockReturnValue([
      {
        id: 'project-1',
        path: TEST_PROJECT_PATH,
        autoBuildPath: '.auto-claude',
        name: 'Test Project'
      }
    ]);

    // Create mock agent manager
    mockAgentManager = {
      isRunning: (taskId: string) => mockIsRunning(taskId)
    } as unknown as AgentManager;

    // Register handlers and get the health check handler
    registerTaskHealthHandlers(mockAgentManager);
    handler = getHealthCheckHandler()!;
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('when no tasks exist', () => {
    it('should return empty array', async () => {
      mockGetTasks.mockReturnValue([]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('when all tasks are healthy', () => {
    beforeEach(() => {
      const healthyTask = createMockTask({
        id: 'task-healthy',
        specId: '001-healthy',
        status: 'done',
        subtasks: [
          { id: 'sub-1', title: 'Subtask 1', status: 'completed' }
        ],
        specsPath: join(TEST_SPECS_DIR, '001-healthy')
      });

      setupTestSpecDir('001-healthy', {
        'spec.md': '# Healthy Task\n\nThis is a healthy task.',
        'implementation_plan.json': JSON.stringify({
          feature: 'Healthy Feature',
          workflow_type: 'feature',
          tasks: []
        })
      });

      mockGetTasks.mockReturnValue([healthyTask]);
      mockIsRunning.mockReturnValue(false);
    });

    it('should return empty array (no unhealthy tasks)', async () => {
      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('stuck task detection', () => {
    it('should detect stuck task (in_progress but no process running)', async () => {
      const stuckTask = createMockTask({
        id: 'task-stuck',
        specId: '002-stuck',
        status: 'in_progress',
        specsPath: join(TEST_SPECS_DIR, '002-stuck'),
        executionProgress: {
          phase: 'coding',
          overallProgress: 50,
          currentSubtask: 'Implementing feature'
        }
      });

      setupTestSpecDir('002-stuck', {
        'spec.md': '# Stuck Task',
        'implementation_plan.json': JSON.stringify({ feature: 'Stuck', tasks: [] })
      });

      mockGetTasks.mockReturnValue([stuckTask]);
      mockIsRunning.mockReturnValue(false); // No process running

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].taskId).toBe('task-stuck');
      expect(result.data[0].issues).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('stuck');
      expect(result.data[0].issues[0].severity).toBe('error');
      expect(result.data[0].recoveryActions).toHaveLength(1);
      expect(result.data[0].recoveryActions[0].actionType).toBe('recover_stuck');
    });

    it('should not flag task as stuck if process is running', async () => {
      const runningTask = createMockTask({
        id: 'task-running',
        specId: '003-running',
        status: 'in_progress',
        specsPath: join(TEST_SPECS_DIR, '003-running'),
        executionProgress: {
          phase: 'coding',
          overallProgress: 50
        }
      });

      setupTestSpecDir('003-running', {
        'spec.md': '# Running Task',
        'implementation_plan.json': JSON.stringify({ feature: 'Running', tasks: [] })
      });

      mockGetTasks.mockReturnValue([runningTask]);
      mockIsRunning.mockReturnValue(true); // Process IS running

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      // Should return empty since task is not stuck (process is running)
      expect(result.data).toHaveLength(0);
    });
  });

  describe('failed task detection', () => {
    it('should detect task with error status', async () => {
      const failedTask = createMockTask({
        id: 'task-failed',
        specId: '004-failed',
        status: 'error',
        specsPath: join(TEST_SPECS_DIR, '004-failed'),
        errorInfo: {
          key: 'errors:task.executionFailed',
          meta: { error: 'Agent crashed' }
        }
      });

      setupTestSpecDir('004-failed', {
        'spec.md': '# Failed Task'
      });

      mockGetTasks.mockReturnValue([failedTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('failed');
    });

    it('should detect task with failed phase in executionProgress', async () => {
      const phaseFailedTask = createMockTask({
        id: 'task-phase-failed',
        specId: '005-phase-failed',
        status: 'in_progress',
        specsPath: join(TEST_SPECS_DIR, '005-phase-failed'),
        executionProgress: {
          phase: 'failed',
          overallProgress: 25,
          message: 'Build compilation failed'
        }
      });

      setupTestSpecDir('005-phase-failed', {
        'spec.md': '# Phase Failed Task'
      });

      mockGetTasks.mockReturnValue([phaseFailedTask]);
      mockIsRunning.mockReturnValue(false);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('failed');
      expect(result.data[0].issues[0].details).toBe('Build compilation failed');
    });
  });

  describe('failed subtasks detection', () => {
    it('should detect task with failed subtasks', async () => {
      const taskWithFailedSubtasks = createMockTask({
        id: 'task-failed-subtasks',
        specId: '006-failed-subtasks',
        status: 'human_review',
        specsPath: join(TEST_SPECS_DIR, '006-failed-subtasks'),
        subtasks: [
          { id: 'sub-1', title: 'Completed subtask', status: 'completed' },
          { id: 'sub-2', title: 'Failed subtask', status: 'failed' },
          { id: 'sub-3', title: 'Another failed subtask', status: 'failed' }
        ]
      });

      setupTestSpecDir('006-failed-subtasks', {
        'spec.md': '# Task with Failed Subtasks'
      });

      mockGetTasks.mockReturnValue([taskWithFailedSubtasks]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('failed_subtasks');
      expect(result.data[0].issues[0].message).toContain('2 subtask(s) failed');
      expect(result.data[0].issues[0].details).toContain('Failed subtask');
    });
  });

  describe('QA rejected detection', () => {
    it('should detect QA rejected task by reading qa_report.md', async () => {
      const qaRejectedTask = createMockTask({
        id: 'task-qa-rejected',
        specId: '007-qa-rejected',
        status: 'human_review',
        specsPath: join(TEST_SPECS_DIR, '007-qa-rejected')
      });

      setupTestSpecDir('007-qa-rejected', {
        'spec.md': '# QA Rejected Task',
        'qa_report.md': '# QA Report\n\nStatus: REJECTED\n\nCritical issues found.'
      });

      mockGetTasks.mockReturnValue([qaRejectedTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('qa_rejected');
      expect(result.data[0].issues[0].severity).toBe('warning');
    });

    it('should detect QA rejected task with FAILED status', async () => {
      const qaFailedTask = createMockTask({
        id: 'task-qa-failed',
        specId: '008-qa-failed',
        status: 'human_review',
        specsPath: join(TEST_SPECS_DIR, '008-qa-failed')
      });

      setupTestSpecDir('008-qa-failed', {
        'spec.md': '# QA Failed Task',
        'qa_report.md': '# QA Report\n\nStatus: FAILED\n\nTests failed.'
      });

      mockGetTasks.mockReturnValue([qaFailedTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('qa_rejected');
    });
  });

  describe('missing spec file detection', () => {
    it('should detect task with missing spec.md', async () => {
      const missingSpecTask = createMockTask({
        id: 'task-missing-spec',
        specId: '009-missing-spec',
        status: 'backlog',
        specsPath: join(TEST_SPECS_DIR, '009-missing-spec')
      });

      // Create spec directory but no spec.md
      mkdirSync(join(TEST_SPECS_DIR, '009-missing-spec'), { recursive: true });

      mockGetTasks.mockReturnValue([missingSpecTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('missing_artifact');
      expect(result.data[0].issues[0].message).toBe('spec.md file is missing');
    });
  });

  describe('corrupted plan file detection', () => {
    it('should detect task with corrupted implementation_plan.json', async () => {
      const corruptedPlanTask = createMockTask({
        id: 'task-corrupted-plan',
        specId: '010-corrupted-plan',
        status: 'backlog',
        specsPath: join(TEST_SPECS_DIR, '010-corrupted-plan')
      });

      setupTestSpecDir('010-corrupted-plan', {
        'spec.md': '# Task with Corrupted Plan',
        'implementation_plan.json': '{ invalid json here'
      });

      mockGetTasks.mockReturnValue([corruptedPlanTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].issues[0].type).toBe('corrupted');
      expect(result.data[0].issues[0].message).toBe('implementation_plan.json exists but contains invalid JSON');
    });
  });

  describe('no progress detection', () => {
    it('should detect in_progress task with no execution progress', async () => {
      const noProgressTask = createMockTask({
        id: 'task-no-progress',
        specId: '011-no-progress',
        status: 'in_progress',
        specsPath: join(TEST_SPECS_DIR, '011-no-progress'),
        executionProgress: undefined
      });

      setupTestSpecDir('011-no-progress', {
        'spec.md': '# Task with No Progress'
      });

      mockGetTasks.mockReturnValue([noProgressTask]);
      mockIsRunning.mockReturnValue(false);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2); // stuck + no_progress
      expect(result.data[0].issues.some(i => i.type === 'no_progress')).toBe(true);
    });

    it('should detect in_progress task with empty execution progress', async () => {
      const emptyProgressTask = createMockTask({
        id: 'task-empty-progress',
        specId: '012-empty-progress',
        status: 'in_progress',
        specsPath: join(TEST_SPECS_DIR, '012-empty-progress'),
        executionProgress: {
          phase: undefined,
          overallProgress: 0,
          currentSubtask: undefined,
          startedAt: undefined
        }
      });

      setupTestSpecDir('012-empty-progress', {
        'spec.md': '# Task with Empty Progress'
      });

      mockGetTasks.mockReturnValue([emptyProgressTask]);
      mockIsRunning.mockReturnValue(false);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].issues.some(i => i.type === 'no_progress')).toBe(true);
    });
  });

  describe('multiple issues on same task', () => {
    it('should detect all issues on a task with multiple problems', async () => {
      const multiIssueTask = createMockTask({
        id: 'task-multi-issue',
        specId: '013-multi-issue',
        status: 'in_progress',
        specsPath: join(TEST_SPECS_DIR, '013-multi-issue'),
        subtasks: [
          { id: 'sub-1', title: 'Failed subtask', status: 'failed' }
        ]
      });

      // Create spec directory with QA rejection but no plan file
      mkdirSync(join(TEST_SPECS_DIR, '013-multi-issue'), { recursive: true });
      writeFileSync(
        join(TEST_SPECS_DIR, '013-multi-issue', 'qa_report.md'),
        'Status: REJECTED',
        'utf-8'
      );

      mockGetTasks.mockReturnValue([multiIssueTask]);
      mockIsRunning.mockReturnValue(false);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      // Should have: stuck, failed_subtasks, qa_rejected, missing_spec
      expect(result.data[0].issues.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('error handling', () => {
    it('should return error when project not found', async () => {
      mockGetTasks.mockReturnValue([]);

      const result = await handler(null, 'nonexistent-project') as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toContain('Project not found');
    });

    it('should handle file system errors gracefully', async () => {
      const badPathTask = createMockTask({
        id: 'task-bad-path',
        specId: '../invalid-path',
        status: 'backlog',
        specsPath: '/invalid/path/that/does/not/exist'
      });

      mockGetTasks.mockReturnValue([badPathTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      // Should still succeed but possibly detect missing spec
      expect(result.success).toBe(true);
    });
  });

  describe('recovery actions', () => {
    it('should provide recover_stuck action for stuck tasks', async () => {
      const stuckTask = createMockTask({
        id: 'task-stuck-recovery',
        specId: '014-stuck-recovery',
        status: 'in_progress',
        specsPath: join(TEST_SPECS_DIR, '014-stuck-recovery')
      });

      setupTestSpecDir('014-stuck-recovery', {
        'spec.md': '# Stuck Task'
      });

      mockGetTasks.mockReturnValue([stuckTask]);
      mockIsRunning.mockReturnValue(false);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data[0].recoveryActions).toBeDefined();
      expect(result.data[0].recoveryActions.some(a => a.actionType === 'recover_stuck')).toBe(true);
    });

    it('should provide view_logs action for failed tasks', async () => {
      const failedTask = createMockTask({
        id: 'task-failed-recovery',
        specId: '015-failed-recovery',
        status: 'error',
        specsPath: join(TEST_SPECS_DIR, '015-failed-recovery')
      });

      setupTestSpecDir('015-failed-recovery', {
        'spec.md': '# Failed Task'
      });

      mockGetTasks.mockReturnValue([failedTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data[0].recoveryActions.some(a => a.actionType === 'view_logs')).toBe(true);
    });

    it('should provide discard_task action for missing artifacts', async () => {
      const missingSpecTask = createMockTask({
        id: 'task-discard',
        specId: '016-discard',
        status: 'backlog',
        specsPath: join(TEST_SPECS_DIR, '016-discard')
      });

      mkdirSync(join(TEST_SPECS_DIR, '016-discard'), { recursive: true });

      mockGetTasks.mockReturnValue([missingSpecTask]);

      const result = await handler(null, 'project-1') as { success: boolean; data: TaskHealthCheckResult[] };

      expect(result.success).toBe(true);
      expect(result.data[0].recoveryActions.some(a => a.actionType === 'discard_task')).toBe(true);
    });
  });
});
