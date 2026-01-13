/**
 * Integration tests for Task Queue Flow
 * Tests end-to-end queue behavior: task exit → queue check → next task start
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directories
const TEST_DIR = '/tmp/queue-flow-test';
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
const USER_DATA_PATH = path.join(TEST_DIR, 'userData');

// Mock Electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return USER_DATA_PATH;
      return TEST_DIR;
    })
  }
}));

// Mock @electron-toolkit/utils
vi.mock('@electron-toolkit/utils', () => ({
  is: {
    dev: true,
    windows: process.platform === 'win32',
    macos: process.platform === 'darwin',
    linux: process.platform === 'linux'
  }
}));

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(USER_DATA_PATH, { recursive: true });
  mkdirSync(path.join(USER_DATA_PATH, 'store'), { recursive: true });
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_PATH, '.auto-claude'), { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_PATH, '.auto-claude', 'specs'), { recursive: true });
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Mock AgentManager
class MockAgentManager extends EventEmitter {
  public runningTasks = new Map<string, any>();

  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  getRunningTasks(): string[] {
    return Array.from(this.runningTasks.keys());
  }

  async startTaskExecution(
    taskId: string,
    projectPath: string,
    specId: string,
    options: any = {}
  ): Promise<void> {
    if (this.runningTasks.has(taskId)) {
      throw new Error(`Task ${taskId} is already running`);
    }

    // Add to running tasks
    this.runningTasks.set(taskId, {
      startedAt: Date.now(),
      ...options
    });

    // Simulate task starting
    await new Promise(resolve => setTimeout(resolve, 10));

    // Emit that the task has started
    this.emit('execution-progress', taskId, {
      phase: 'planning',
      phaseProgress: 0,
      overallProgress: 0,
      sequenceNumber: 0
    });
  }

  killTask(taskId: string): boolean {
    this.runningTasks.delete(taskId);
    this.emit('exit', taskId, null, 'task-execution');
    return true;
  }

  async killAll(): Promise<void> {
    this.runningTasks.clear();
  }
}

// Helper to create a test task
function createTestTask(overrides: Partial<any> = {}): any {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    specId: 'spec-1',
    projectId: 'project-1',
    title: 'Test Task',
    description: 'Test description',
    status: 'backlog',
    subtasks: [],
    logs: [],
    metadata: {
      priority: 'medium'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

// Helper to create a test project
function createTestProject(overrides: Partial<any> = {}): any {
  return {
    id: 'project-1',
    path: TEST_PROJECT_PATH,
    name: 'test-project',
    settings: {
      queueConfig: {
        enabled: false,
        maxConcurrent: 1
      }
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('Task Queue Flow Integration Tests', () => {
  let taskQueueManager: any;
  let mockAgentManager: MockAgentManager;
  let projectStore: any;
  let emitter: EventEmitter;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.resetModules();
    vi.clearAllMocks();

    // Create mocks
    mockAgentManager = new MockAgentManager();
    emitter = new EventEmitter();

    // Import after mocks are set up
    const { ProjectStore } = await import('../../main/project-store');
    const { TaskQueueManager } = await import('../../main/task-queue-manager');

    // Create instances
    projectStore = new ProjectStore();
    taskQueueManager = new TaskQueueManager(mockAgentManager as any, emitter);

    // Add test project
    projectStore.addProject(TEST_PROJECT_PATH);
  });

  afterEach(async () => {
    if (taskQueueManager) {
      await taskQueueManager.stop();
    }
    if (mockAgentManager) {
      await mockAgentManager.killAll();
    }
    cleanupTestDirs();
  });

  describe('Basic queue flow', () => {
    it('should start a task when queue is enabled and slots available', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      // Add a backlog task
      const task = createTestTask({ status: 'backlog' });
      projectStore.setTask('project-1', task);

      // Manually trigger queue
      await taskQueueManager.triggerQueue('project-1');

      // Give time for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // Task should be running
      expect(mockAgentManager.isRunning(task.id)).toBe(true);
    });

    it('should not start tasks when queue is disabled', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: false,
          maxConcurrent: 1
        }
      });

      const task = createTestTask({ status: 'backlog' });
      projectStore.setTask('project-1', task);

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockAgentManager.isRunning(task.id)).toBe(false);
    });

    it('should not exceed maxConcurrent limit', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 2
        }
      });

      // Add 3 backlog tasks
      const task1 = createTestTask({ id: 'task-1', status: 'backlog' });
      const task2 = createTestTask({ id: 'task-2', status: 'backlog' });
      const task3 = createTestTask({ id: 'task-3', status: 'backlog' });
      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task2);
      projectStore.setTask('project-1', task3);

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 200));

      // Only 2 tasks should be running (maxConcurrent)
      const runningCount = mockAgentManager.getRunningTasks().length;
      expect(runningCount).toBeLessThanOrEqual(2);
    });
  });

  describe('Task exit triggers next task', () => {
    it('should start next task when a running task completes', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      // Add 2 backlog tasks
      const task1 = createTestTask({ id: 'task-1', status: 'backlog' });
      const task2 = createTestTask({ id: 'task-2', status: 'backlog' });
      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task2);

      // Manually start first task
      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockAgentManager.isRunning('task-1')).toBe(true);
      expect(mockAgentManager.isRunning('task-2')).toBe(false);

      // Simulate task-1 completing
      mockAgentManager.killTask('task-1');

      // Wait for queue check and next task start
      await new Promise(resolve => setTimeout(resolve, 200));

      // task-2 should now be running
      expect(mockAgentManager.isRunning('task-1')).toBe(false);
      expect(mockAgentManager.isRunning('task-2')).toBe(true);
    });

    it('should not start next task if queue becomes disabled', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      const task1 = createTestTask({ id: 'task-1', status: 'backlog' });
      const task2 = createTestTask({ id: 'task-2', status: 'backlog' });
      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task2);

      // Start first task
      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Disable queue
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: false,
          maxConcurrent: 1
        }
      });

      // Complete task-1
      mockAgentManager.killTask('task-1');
      await new Promise(resolve => setTimeout(resolve, 200));

      // task-2 should NOT be started (queue disabled)
      expect(mockAgentManager.isRunning('task-2')).toBe(false);
    });
  });

  describe('Priority-based ordering', () => {
    it('should start higher priority tasks first', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      // Add tasks with different priorities
      const lowTask = createTestTask({
        id: 'low-task',
        status: 'backlog',
        metadata: { priority: 'low' },
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });
      const urgentTask = createTestTask({
        id: 'urgent-task',
        status: 'backlog',
        metadata: { priority: 'urgent' },
        createdAt: new Date('2024-01-05T00:00:00.000Z') // Newer but higher priority
      });
      const mediumTask = createTestTask({
        id: 'medium-task',
        status: 'backlog',
        metadata: { priority: 'medium' },
        createdAt: new Date('2024-01-03T00:00:00.000Z')
      });

      projectStore.setTask('project-1', lowTask);
      projectStore.setTask('project-1', urgentTask);
      projectStore.setTask('project-1', mediumTask);

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Urgent task should be started first (higher priority wins over date)
      expect(mockAgentManager.isRunning('urgent-task')).toBe(true);
      expect(mockAgentManager.isRunning('low-task')).toBe(false);
      expect(mockAgentManager.isRunning('medium-task')).toBe(false);
    });

    it('should use FIFO ordering within same priority', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      // Add tasks with same priority but different dates
      const task1 = createTestTask({
        id: 'task-1',
        status: 'backlog',
        metadata: { priority: 'medium' },
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });
      const task2 = createTestTask({
        id: 'task-2',
        status: 'backlog',
        metadata: { priority: 'medium' },
        createdAt: new Date('2024-01-02T00:00:00.000Z')
      });
      const task3 = createTestTask({
        id: 'task-3',
        status: 'backlog',
        metadata: { priority: 'medium' },
        createdAt: new Date('2024-01-03T00:00:00.000Z')
      });

      projectStore.setTask('project-1', task2);
      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task3);

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // task-1 (oldest) should be started first
      expect(mockAgentManager.isRunning('task-1')).toBe(true);
    });
  });

  describe('Race condition prevention', () => {
    it('should serialize queue operations per project', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      const task1 = createTestTask({ id: 'task-1', status: 'backlog' });
      const task2 = createTestTask({ id: 'task-2', status: 'backlog' });
      const task3 = createTestTask({ id: 'task-3', status: 'backlog' });
      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task2);
      projectStore.setTask('project-1', task3);

      // Trigger queue multiple times rapidly (simulating race condition)
      const triggers = [
        taskQueueManager.triggerQueue('project-1'),
        taskQueueManager.triggerQueue('project-1'),
        taskQueueManager.triggerQueue('project-1')
      ];

      await Promise.all(triggers);
      await new Promise(resolve => setTimeout(resolve, 200));

      // Only 1 task should be running (serialized, maxConcurrent=1)
      const runningCount = mockAgentManager.getRunningTasks().length;
      expect(runningCount).toBe(1);
    });

    it('should use in-memory process count for canStartMoreTasks', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 2
        }
      });

      // Add tasks
      const task1 = createTestTask({ id: 'task-1', status: 'backlog' });
      const task2 = createTestTask({ id: 'task-2', status: 'backlog' });
      const task3 = createTestTask({ id: 'task-3', status: 'backlog' });
      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task2);
      projectStore.setTask('project-1', task3);

      // Start tasks (will start 2 due to maxConcurrent=2)
      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 150));

      const runningTaskIds = mockAgentManager.getRunningTasks();

      // canStartMoreTasks should use in-memory count, not task status
      // Since we started 2 tasks and maxConcurrent=2, should return false
      const canStart = taskQueueManager.canStartMoreTasks('project-1');
      expect(canStart).toBe(false);
      expect(runningTaskIds.length).toBe(2);
    });
  });

  describe('Graceful shutdown', () => {
    it('should prevent new tasks during shutdown', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      const task = createTestTask({ status: 'backlog' });
      projectStore.setTask('project-1', task);

      // Stop the queue manager
      await taskQueueManager.stop();

      // Try to trigger queue (should be ignored)
      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockAgentManager.isRunning(task.id)).toBe(false);
    });

    it('should wait for in-flight operations before completing shutdown', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      let operationCompleted = false;

      // Add a task to the processing queue
      const projectId = 'project-1';
      const entry = {
        promise: new Promise<void>(resolve => {
          setTimeout(() => {
            operationCompleted = true;
            resolve();
          }, 100);
        }),
        lastUpdated: Date.now(),
        depth: 1
      };
      (taskQueueManager as any).processingQueue.set(projectId, entry);

      // Start shutdown (should wait for promise)
      const stopStart = Date.now();
      await taskQueueManager.stop();
      const stopDuration = Date.now() - stopStart;

      // Should have waited for the operation to complete
      expect(operationCompleted).toBe(true);
      expect(stopDuration).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty project gracefully', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      // No tasks
      const canStart = taskQueueManager.canStartMoreTasks('project-1');
      expect(canStart).toBe(false); // No backlog

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not crash, just no tasks started
      expect(mockAgentManager.getRunningTasks().length).toBe(0);
    });

    it('should handle task already running', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      const task = createTestTask({ status: 'backlog' });
      projectStore.setTask('project-1', task);

      // Manually mark task as running
      (mockAgentManager.runningTasks as any).add(task.id);

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not start (already running check)
      // Only one entry in runningTasks (the manually added one)
      expect(mockAgentManager.getRunningTasks().length).toBe(1);
    });

    it('should handle invalid date strings in createdAt', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      const task1 = createTestTask({
        id: 'task-1',
        status: 'backlog',
        createdAt: 'invalid-date' as any
      });
      const task2 = createTestTask({
        id: 'task-2',
        status: 'backlog',
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });

      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task2);

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // task-2 (valid date) should be started, task-1 (invalid) skipped
      expect(mockAgentManager.isRunning('task-2')).toBe(true);
      expect(mockAgentManager.isRunning('task-1')).toBe(false);
    });

    it('should handle mixed Date and string createdAt types', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      const task1 = createTestTask({
        id: 'task-1',
        status: 'backlog',
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });
      const task2 = createTestTask({
        id: 'task-2',
        status: 'backlog',
        createdAt: '2024-01-02T00:00:00.000Z' as any
      });

      projectStore.setTask('project-1', task1);
      projectStore.setTask('project-1', task2);

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should handle both types correctly
      expect(mockAgentManager.getRunningTasks().length).toBe(1);
    });
  });

  describe('Queue status updates', () => {
    it('should emit queue-status-update when starting tasks', async () => {
      const project = projectStore.getProject('project-1');
      projectStore.updateProjectSettings('project-1', {
        queueConfig: {
          enabled: true,
          maxConcurrent: 1
        }
      });

      const task = createTestTask({ status: 'backlog' });
      projectStore.setTask('project-1', task);

      const statusUpdateSpy = vi.spyOn(emitter, 'emit');

      await taskQueueManager.triggerQueue('project-1');
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(statusUpdateSpy).toHaveBeenCalledWith(
        'queue-status-update',
        'project-1',
        expect.objectContaining({
          enabled: true,
          maxConcurrent: 1
        })
      );
    });
  });
});
