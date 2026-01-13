/**
 * Unit tests for Task Queue Manager
 * Tests automatic task scheduling from backlog to in_progress
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directories
const TEST_DIR = '/tmp/task-queue-manager-test';
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
const USER_DATA_PATH = path.join(TEST_DIR, 'userData');

// Mock Electron before importing
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

// Test data
function createMockTask(overrides: Partial<any> = {}): any {
  return {
    id: 'task-1',
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
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides
  };
}

function createMockProject(overrides: Partial<any> = {}): any {
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
    ...overrides
  };
}

// Mock ProjectStore
class MockProjectStore {
  public projects = new Map<string, any>();
  public tasks = new Map<string, any[]>();

  constructor() {
    const project = createMockProject();
    this.projects.set(project.id, project);
    this.tasks.set(project.id, [createMockTask()]);
  }

  getProject(projectId: string) {
    return this.projects.get(projectId);
  }

  getTasks(projectId: string) {
    return this.tasks.get(projectId) || [];
  }

  updateProjectSettings(projectId: string, settings: Partial<any>): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.settings = { ...project.settings, ...settings };
    }
  }

  setTask(projectId: string, task: any): void {
    const tasks = this.tasks.get(projectId) || [];
    const index = tasks.findIndex(t => t.id === task.id);
    if (index >= 0) {
      tasks[index] = task;
    } else {
      tasks.push(task);
    }
    this.tasks.set(projectId, tasks);
  }
}

// Mock AgentManager
class MockAgentManager extends EventEmitter {
  public runningTasks = new Set<string>();

  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId);
  }

  getRunningTasks(): string[] {
    return Array.from(this.runningTasks);
  }

  async startTaskExecution(
    taskId: string,
    projectPath: string,
    specId: string,
    options: any = {}
  ): Promise<void> {
    // Simulate successful start
    this.runningTasks.add(taskId);

    // Simulate async task starting
    await new Promise(resolve => setTimeout(resolve, 10));

    // Emit exit event after a delay (simulating task completion)
    setTimeout(() => {
      this.runningTasks.delete(taskId);
      this.emit('exit', taskId, 0, 'task-execution');
    }, 50);
  }

  killAll(): Promise<void> {
    this.runningTasks.clear();
    return Promise.resolve();
  }
}

// Setup test directories
function setupTestDirs(): void {
  mkdirSync(USER_DATA_PATH, { recursive: true });
  mkdirSync(path.join(USER_DATA_PATH, 'store'), { recursive: true });
  mkdirSync(TEST_PROJECT_PATH, { recursive: true });
  mkdirSync(path.join(TEST_PROJECT_PATH, '.auto-claude'), { recursive: true });
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('TaskQueueManager', () => {
  let taskQueueManager: any;
  let mockAgentManager: MockAgentManager;
  let mockProjectStore: MockProjectStore;
  let emitter: EventEmitter;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.resetModules();

    // Create mocks
    mockAgentManager = new MockAgentManager();
    mockProjectStore = new MockProjectStore();
    emitter = new EventEmitter();

    // Import after mocks are set up
    const { TaskQueueManager } = await import('../task-queue-manager');

    // Create instance with mocked dependencies via constructor injection
    // We need to patch the projectStore import
    const originalModule = await import('../project-store');
    vi.doMock('../project-store', () => ({
      projectStore: mockProjectStore
    }));

    taskQueueManager = new TaskQueueManager(mockAgentManager as any, emitter);

    // Replace internal projectStore reference
    (taskQueueManager as any)['projectStore'] = mockProjectStore;
  });

  afterEach(async () => {
    if (taskQueueManager) {
      await taskQueueManager.stop();
    }
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('isValidQueueConcurrent', () => {
    it('should return true for valid integer values within range', async () => {
      const result = (taskQueueManager as any).isValidQueueConcurrent(1);
      expect(result).toBe(true);

      const result2 = (taskQueueManager as any).isValidQueueConcurrent(2);
      expect(result2).toBe(true);

      const result3 = (taskQueueManager as any).isValidQueueConcurrent(3);
      expect(result3).toBe(true);
    });

    it('should return false for values below min', async () => {
      const result = (taskQueueManager as any).isValidQueueConcurrent(0);
      expect(result).toBe(false);
    });

    it('should return false for values above max', async () => {
      const result = (taskQueueManager as any).isValidQueueConcurrent(4);
      expect(result).toBe(false);
    });

    it('should return false for non-integer values', async () => {
      const result = (taskQueueManager as any).isValidQueueConcurrent(1.5);
      expect(result).toBe(false);
    });

    it('should return false for non-number values', async () => {
      const result = (taskQueueManager as any).isValidQueueConcurrent('1' as any);
      expect(result).toBe(false);
    });

    it('should return false for null', async () => {
      const result = (taskQueueManager as any).isValidQueueConcurrent(null);
      expect(result).toBe(false);
    });

    it('should return false for undefined', async () => {
      const result = (taskQueueManager as any).isValidQueueConcurrent(undefined);
      expect(result).toBe(false);
    });
  });

  describe('getQueueConfig', () => {
    it('should return default config when project has no queue config', async () => {
      const project = createMockProject({ settings: {} });
      mockProjectStore.projects.set('project-1', project);

      const config = taskQueueManager.getQueueConfig('project-1');

      expect(config).toEqual({
        enabled: false,
        maxConcurrent: 1
      });
    });

    it('should return project config when valid', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const config = taskQueueManager.getQueueConfig('project-1');

      expect(config).toEqual({
        enabled: true,
        maxConcurrent: 2
      });
    });

    it('should fallback to min for invalid maxConcurrent', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 5 // Invalid, max is 3
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const config = taskQueueManager.getQueueConfig('project-1');

      expect(config.maxConcurrent).toBe(1); // Falls back to QUEUE_MIN_CONCURRENT
    });

    it('should fallback to min for non-integer maxConcurrent', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2.5 as any
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const config = taskQueueManager.getQueueConfig('project-1');

      expect(config.maxConcurrent).toBe(1);
    });

    it('should handle missing enabled flag', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: undefined as any,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const config = taskQueueManager.getQueueConfig('project-1');

      expect(config.enabled).toBe(false);
    });
  });

  describe('getQueueStatus', () => {
    it('should count in_progress tasks correctly', async () => {
      const tasks = [
        createMockTask({ id: 'task-1', status: 'backlog' }),
        createMockTask({ id: 'task-2', status: 'in_progress' }),
        createMockTask({ id: 'task-3', status: 'in_progress' }),
        createMockTask({ id: 'task-4', status: 'backlog' })
      ];
      mockProjectStore.tasks.set('project-1', tasks);

      const status = taskQueueManager.getQueueStatus('project-1');

      expect(status.runningCount).toBe(2);
      expect(status.backlogCount).toBe(2);
    });

    it('should return queue config values in status', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 3
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const status = taskQueueManager.getQueueStatus('project-1');

      expect(status.enabled).toBe(true);
      expect(status.maxConcurrent).toBe(3);
    });
  });

  describe('canStartMoreTasks', () => {
    it('should return false when queue is disabled', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: false,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const result = taskQueueManager.canStartMoreTasks('project-1');

      expect(result).toBe(false);
    });

    it('should return false when at max concurrent', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const tasks = [
        createMockTask({ id: 'task-1', status: 'backlog' }),
        createMockTask({ id: 'task-2', status: 'in_progress' }),
        createMockTask({ id: 'task-3', status: 'in_progress' })
      ];
      mockProjectStore.tasks.set('project-1', tasks);

      // Mock running tasks
      mockAgentManager.runningTasks.add('task-2');
      mockAgentManager.runningTasks.add('task-3');

      const result = taskQueueManager.canStartMoreTasks('project-1');

      expect(result).toBe(false);
    });

    it('should return false when no backlog tasks', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const tasks = [
        createMockTask({ id: 'task-1', status: 'in_progress' })
      ];
      mockProjectStore.tasks.set('project-1', tasks);

      mockAgentManager.runningTasks.add('task-1');

      const result = taskQueueManager.canStartMoreTasks('project-1');

      expect(result).toBe(false);
    });

    it('should return true when under max concurrent and has backlog', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const tasks = [
        createMockTask({ id: 'task-1', status: 'backlog' }),
        createMockTask({ id: 'task-2', status: 'in_progress' })
      ];
      mockProjectStore.tasks.set('project-1', tasks);

      mockAgentManager.runningTasks.add('task-2');

      const result = taskQueueManager.canStartMoreTasks('project-1');

      expect(result).toBe(true);
    });
  });

  describe('getPriorityWeight', () => {
    it('should return correct weight for each priority', async () => {
      const urgentTask = createMockTask({ metadata: { priority: 'urgent' } });
      const highTask = createMockTask({ metadata: { priority: 'high' } });
      const mediumTask = createMockTask({ metadata: { priority: 'medium' } });
      const lowTask = createMockTask({ metadata: { priority: 'low' } });
      const noPriorityTask = createMockTask({ metadata: {} });

      expect((taskQueueManager as any).getPriorityWeight(urgentTask)).toBe(4);
      expect((taskQueueManager as any).getPriorityWeight(highTask)).toBe(3);
      expect((taskQueueManager as any).getPriorityWeight(mediumTask)).toBe(2);
      expect((taskQueueManager as any).getPriorityWeight(lowTask)).toBe(1);
      expect((taskQueueManager as any).getPriorityWeight(noPriorityTask)).toBe(0);
    });
  });

  describe('pruneProcessingQueue', () => {
    it('should remove stale entries based on age', async () => {
      const projectId = 'project-1';

      // Manually add a stale entry
      const staleEntry = {
        promise: Promise.resolve(),
        lastUpdated: Date.now() - (6 * 60 * 1000), // 6 minutes ago
        depth: 1
      };
      (taskQueueManager as any).processingQueue.set(projectId, staleEntry);

      (taskQueueManager as any).pruneProcessingQueue();

      expect((taskQueueManager as any).processingQueue.has(projectId)).toBe(false);
    });

    it('should not remove recent entries', async () => {
      const projectId = 'project-1';

      // Add a recent entry
      const recentEntry = {
        promise: Promise.resolve(),
        lastUpdated: Date.now() - (1 * 60 * 1000), // 1 minute ago
        depth: 1
      };
      (taskQueueManager as any).processingQueue.set(projectId, recentEntry);

      (taskQueueManager as any).pruneProcessingQueue();

      expect((taskQueueManager as any).processingQueue.has(projectId)).toBe(true);
    });

    it('should not prune based on depth - only age', async () => {
      const projectId = 'project-1';

      // Add an entry at max depth but recent
      const maxDepthEntry = {
        promise: new Promise(() => {}), // Never resolves
        lastUpdated: Date.now() - 1000, // 1 second ago
        depth: 50 // At MAX_QUEUE_DEPTH
      };
      (taskQueueManager as any).processingQueue.set(projectId, maxDepthEntry);

      (taskQueueManager as any).pruneProcessingQueue();

      // Should NOT be pruned because it's recent (age-based pruning only)
      expect((taskQueueManager as any).processingQueue.has(projectId)).toBe(true);
    });
  });

  describe('triggerQueue', () => {
    it('should not trigger when queue is disabled', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: false,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const startSpy = vi.spyOn(taskQueueManager as any, 'triggerNextTask');

      await taskQueueManager.triggerQueue('project-1');

      expect(startSpy).not.toHaveBeenCalled();
    });

    it('should not trigger when shutting down', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      // Set shutting down flag
      (taskQueueManager as any).shuttingDown = true;

      const startSpy = vi.spyOn(taskQueueManager as any, 'triggerNextTask');

      await taskQueueManager.triggerQueue('project-1');

      expect(startSpy).not.toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should set shuttingDown flag', async () => {
      expect((taskQueueManager as any).shuttingDown).toBe(false);

      await taskQueueManager.stop();

      expect((taskQueueManager as any).shuttingDown).toBe(true);
    });

    it('should wait for pending promises before returning', async () => {
      const projectId = 'project-1';

      // Add a pending promise that takes time to resolve
      let resolved = false;
      const pendingPromise = new Promise<void>(resolve => {
        setTimeout(() => {
          resolved = true;
          resolve();
        }, 100);
      });

      const entry = {
        promise: pendingPromise,
        lastUpdated: Date.now(),
        depth: 1
      };
      (taskQueueManager as any).processingQueue.set(projectId, entry);

      const stopPromise = taskQueueManager.stop();

      // Should not be stopped yet
      expect(resolved).toBe(false);

      await stopPromise;

      // Now it should be resolved
      expect(resolved).toBe(true);
      expect((taskQueueManager as any).shuttingDown).toBe(true);
    });

    it('should clear prune interval', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      await taskQueueManager.stop();

      // The interval should be cleared (set to null)
      expect((taskQueueManager as any).pruneInterval).toBeNull();
    });
  });

  describe('handleTaskExit', () => {
    it('should skip queue processing during shutdown', async () => {
      const projectId = 'project-1';
      const project = createMockProject({
        id: projectId,
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set(projectId, project);

      const task = createMockTask({ id: 'task-1', status: 'in_progress' });
      mockProjectStore.tasks.set(projectId, [task]);

      // Set shutting down flag
      (taskQueueManager as any).shuttingDown = true;

      const canStartSpy = vi.spyOn(taskQueueManager, 'canStartMoreTasks');

      await (taskQueueManager as any).handleTaskExit('task-1', 0, 'task-execution');

      expect(canStartSpy).not.toHaveBeenCalled();
    });

    it('should skip when task or project not found', async () => {
      const canStartSpy = vi.spyOn(taskQueueManager, 'canStartMoreTasks');

      await (taskQueueManager as any).handleTaskExit('non-existent-task', 0, 'task-execution');

      expect(canStartSpy).not.toHaveBeenCalled();
    });
  });

  describe('triggerNextTask - date handling', () => {
    it('should handle Date objects for createdAt', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const task1 = createMockTask({
        id: 'task-1',
        status: 'backlog',
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });
      const task2 = createMockTask({
        id: 'task-2',
        status: 'backlog',
        createdAt: new Date('2024-01-02T00:00:00.000Z')
      });
      mockProjectStore.tasks.set('project-1', [task1, task2]);

      // Should pick task-1 (earlier date)
      const result = await (taskQueueManager as any).triggerNextTask('project-1');

      expect(result).toBe(true);
      expect(mockAgentManager.runningTasks.has('task-1')).toBe(true);
    });

    it('should handle string dates for createdAt', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const task1 = createMockTask({
        id: 'task-1',
        status: 'backlog',
        createdAt: '2024-01-01T00:00:00.000Z' as any
      });
      const task2 = createMockTask({
        id: 'task-2',
        status: 'backlog',
        createdAt: '2024-01-02T00:00:00.000Z' as any
      });
      mockProjectStore.tasks.set('project-1', [task1, task2]);

      // Should pick task-1 (earlier date)
      const result = await (taskQueueManager as any).triggerNextTask('project-1');

      expect(result).toBe(true);
      expect(mockAgentManager.runningTasks.has('task-1')).toBe(true);
    });

    it('should substitute POSITIVE_INFINITY for invalid dates', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const task1 = createMockTask({
        id: 'task-1',
        status: 'backlog',
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });
      const task2 = createMockTask({
        id: 'task-2',
        status: 'backlog',
        createdAt: 'invalid-date' as any
      });
      mockProjectStore.tasks.set('project-1', [task1, task2]);

      // Should pick task-1 (task-2 has invalid date, pushed to end)
      const result = await (taskQueueManager as any).triggerNextTask('project-1');

      expect(result).toBe(true);
      expect(mockAgentManager.runningTasks.has('task-1')).toBe(true);
    });
  });

  describe('triggerNextTask - priority sorting', () => {
    it('should sort by priority first, then by date', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      // Create tasks with different priorities and dates
      // Urgent task (oldest) - should be first
      const taskUrgentOld = createMockTask({
        id: 'urgent-old',
        status: 'backlog',
        metadata: { priority: 'urgent' },
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });
      // Urgent task (newer) - should be second
      const taskUrgentNew = createMockTask({
        id: 'urgent-new',
        status: 'backlog',
        metadata: { priority: 'urgent' },
        createdAt: new Date('2024-01-05T00:00:00.000Z')
      });
      // High priority - should be after urgent tasks
      const taskHigh = createMockTask({
        id: 'high',
        status: 'backlog',
        metadata: { priority: 'high' },
        createdAt: new Date('2024-01-02T00:00:00.000Z')
      });
      // Medium priority - should be last
      const taskMedium = createMockTask({
        id: 'medium',
        status: 'backlog',
        metadata: { priority: 'medium' },
        createdAt: new Date('2024-01-01T00:00:00.000Z')
      });

      mockProjectStore.tasks.set('project-1', [
        taskHigh,
        taskMedium,
        taskUrgentNew,
        taskUrgentOld
      ]);

      // Should pick urgent-old (highest priority, oldest)
      const result = await (taskQueueManager as any).triggerNextTask('project-1');

      expect(result).toBe(true);
      expect(mockAgentManager.runningTasks.has('urgent-old')).toBe(true);
    });
  });

  describe('triggerNextTask - already running check', () => {
    it('should return false if task is already running', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const task = createMockTask({ id: 'task-1', status: 'backlog' });
      mockProjectStore.tasks.set('project-1', [task]);

      // Mark task as already running
      mockAgentManager.runningTasks.add('task-1');

      const result = await (taskQueueManager as any).triggerNextTask('project-1');

      expect(result).toBe(false);
      expect(mockAgentManager.runningTasks.has('task-1')).toBe(true); // Still running
    });
  });

  describe('emitQueueStatusUpdate', () => {
    it('should emit queue-status-update event', async () => {
      const project = createMockProject({
        settings: {
          queueConfig: {
            enabled: true,
            maxConcurrent: 2
          }
        }
      });
      mockProjectStore.projects.set('project-1', project);

      const emitSpy = vi.spyOn(emitter, 'emit');

      (taskQueueManager as any).emitQueueStatusUpdate('project-1');

      expect(emitSpy).toHaveBeenCalledWith('queue-status-update', 'project-1', expect.objectContaining({
        enabled: true,
        maxConcurrent: 2
      }));
    });
  });
});
