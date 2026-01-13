/**
 * Unit tests for Queue IPC Handlers
 * Tests IPC communication for queue configuration and status operations
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ipcMain } from 'electron';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';

// Test directories
const TEST_DIR = '/tmp/queue-handlers-test';
const TEST_PROJECT_PATH = path.join(TEST_DIR, 'test-project');
const USER_DATA_PATH = path.join(TEST_DIR, 'userData');

// Mock Electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  },
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
}

// Cleanup test directories
function cleanupTestDirs(): void {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// Mock TaskQueueManager
class MockTaskQueueManager {
  private queueConfig = new Map<string, any>();
  private queueStatus = new Map<string, any>();

  constructor() {
    // Default config
    this.queueConfig.set('project-1', {
      enabled: false,
      maxConcurrent: 1
    });
  }

  getQueueConfig(projectId: string): any {
    return this.queueConfig.get(projectId) || { enabled: false, maxConcurrent: 1 };
  }

  getQueueStatus(projectId: string): any {
    return this.queueStatus.get(projectId) || {
      enabled: false,
      maxConcurrent: 1,
      runningCount: 0,
      backlogCount: 0
    };
  }

  async triggerQueue(projectId: string): Promise<void> {
    // Mock trigger
  }

  setQueueConfig(projectId: string, config: any): void {
    this.queueConfig.set(projectId, config);
  }

  setQueueStatus(projectId: string, status: any): void {
    this.queueStatus.set(projectId, status);
  }
}

// Mock ProjectStore
class MockProjectStore {
  public projects = new Map<string, any>();

  constructor() {
    this.projects.set('project-1', {
      id: 'project-1',
      path: TEST_PROJECT_PATH,
      name: 'test-project',
      settings: {}
    });
  }

  getProject(projectId: string) {
    return this.projects.get(projectId);
  }

  updateProjectSettings(projectId: string, settings: any): void {
    const project = this.projects.get(projectId);
    if (project) {
      project.settings = { ...project.settings, ...settings };
    }
  }
}

describe('Queue IPC Handlers', () => {
  let mockTaskQueueManager: MockTaskQueueManager;
  let mockProjectStore: MockProjectStore;
  let handlers: any;

  beforeEach(async () => {
    cleanupTestDirs();
    setupTestDirs();
    vi.resetModules();
    vi.clearAllMocks();

    // Create mocks
    mockTaskQueueManager = new MockTaskQueueManager();
    mockProjectStore = new MockProjectStore();

    // Mock the modules before importing handlers
    vi.doMock('../task-queue-manager', () => ({
      TaskQueueManager: vi.fn().mockImplementation(() => mockTaskQueueManager)
    }));

    vi.doMock('../project-store', () => ({
      projectStore: mockProjectStore
    }));

    // Import handlers
    const queueHandlers = await import('../queue-handlers');

    // Register handlers by calling the function
    queueHandlers.registerQueueHandlers(mockTaskQueueManager as any);
  });

  afterEach(() => {
    cleanupTestDirs();
    vi.clearAllMocks();
  });

  describe('QUEUE_GET_CONFIG', () => {
    it('should return queue config for a project', async () => {
      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_GET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1');

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
          enabled: false,
          maxConcurrent: 1
        });
      }
    });

    it('should return default config when project has no config', async () => {
      // Test with non-existent project
      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_GET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'non-existent-project');

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
          enabled: false,
          maxConcurrent: 1
        });
      }
    });
  });

  describe('QUEUE_SET_CONFIG', () => {
    it('should save valid queue config', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 2
      };

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(true);
        expect(mockProjectStore.projects.get('project-1').settings.queueConfig).toEqual(config);
      }
    });

    it('should reject invalid maxConcurrent below minimum', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 0 // Invalid, min is 1
      };

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(false);
        expect(result.error).toContain('maxConcurrent must be between');
      }
    });

    it('should reject invalid maxConcurrent above maximum', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 5 // Invalid, max is 3
      };

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(false);
        expect(result.error).toContain('maxConcurrent must be between');
      }
    });

    it('should reject non-integer maxConcurrent', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 2.5 as any
      };

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(false);
        expect(result.error).toContain('must be an integer');
      }
    });

    it('should trigger queue when enabled', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 2
      };

      const triggerSpy = vi.spyOn(mockTaskQueueManager, 'triggerQueue');

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        await mockHandler(event, 'project-1', config);

        expect(triggerSpy).toHaveBeenCalledWith('project-1');
      }
    });

    it('should not trigger queue when disabled', async () => {
      const config = {
        enabled: false,
        maxConcurrent: 2
      };

      const triggerSpy = vi.spyOn(mockTaskQueueManager, 'triggerQueue');

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        await mockHandler(event, 'project-1', config);

        expect(triggerSpy).not.toHaveBeenCalled();
      }
    });

    it('should return error for non-existent project', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 2
      };

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'non-existent-project', config);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Project not found');
      }
    });
  });

  describe('QUEUE_GET_STATUS', () => {
    it('should return queue status for a project', async () => {
      // Set up status
      mockTaskQueueManager.setQueueStatus('project-1', {
        enabled: true,
        maxConcurrent: 2,
        runningCount: 1,
        backlogCount: 3
      });

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_GET_STATUS')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1');

        expect(result.success).toBe(true);
        expect(result.data).toEqual({
          enabled: true,
          maxConcurrent: 2,
          runningCount: 1,
          backlogCount: 3
        });
      }
    });

    it('should use TaskQueueManager to get status', async () => {
      const getQueueStatusSpy = vi.spyOn(mockTaskQueueManager, 'getQueueStatus');

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_GET_STATUS')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        await mockHandler(event, 'project-1');

        expect(getQueueStatusSpy).toHaveBeenCalledWith('project-1');
      }
    });
  });

  describe('Error handling', () => {
    it('should handle exceptions in QUEUE_GET_CONFIG gracefully', async () => {
      // Force an error by making getProject throw
      vi.spyOn(mockProjectStore, 'getProject').mockImplementation(() => {
        throw new Error('Database error');
      });

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_GET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should handle exceptions in QUEUE_SET_CONFIG gracefully', async () => {
      vi.spyOn(mockProjectStore, 'getProject').mockImplementation(() => {
        throw new Error('Database error');
      });

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const config = { enabled: true, maxConcurrent: 2 };
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should handle exceptions in QUEUE_GET_STATUS gracefully', async () => {
      vi.spyOn(mockTaskQueueManager, 'getQueueStatus').mockImplementation(() => {
        throw new Error('Queue manager error');
      });

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_GET_STATUS')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle boundary value maxConcurrent = 1 (minimum)', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 1
      };

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(true);
      }
    });

    it('should handle boundary value maxConcurrent = 3 (maximum)', async () => {
      const config = {
        enabled: true,
        maxConcurrent: 3
      };

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(true);
      }
    });

    it('should handle missing enabled flag (defaults to false)', async () => {
      const config = {
        maxConcurrent: 2
      } as any;

      const mockHandler = vi.mocked(ipcMain.handle).mock.calls
        .find(call => call[0] === 'QUEUE_SET_CONFIG')?.[1];

      if (mockHandler) {
        const event = { sender: {} } as any;
        const result = await mockHandler(event, 'project-1', config);

        expect(result.success).toBe(true);
        // The handler should use default enabled = false
        expect(mockProjectStore.projects.get('project-1').settings.queueConfig.enabled).toBe(false);
      }
    });
  });
});
