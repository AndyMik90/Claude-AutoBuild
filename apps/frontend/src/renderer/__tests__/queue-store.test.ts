/**
 * Unit tests for Queue Store
 * Tests Zustand store for queue state management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useQueueStore, DEFAULT_QUEUE_CONFIG, saveQueueConfig, loadQueueConfig, getQueueStatus } from '../stores/queue-store';
import type { QueueConfig, QueueStatus } from '../../shared/types';

// Helper to create test queue config
function createTestQueueConfig(overrides: Partial<QueueConfig> = {}): QueueConfig {
  return {
    enabled: false,
    maxConcurrent: 1,
    ...overrides
  };
}

// Helper to create test queue status
function createTestQueueStatus(overrides: Partial<QueueStatus> = {}): QueueStatus {
  return {
    enabled: false,
    maxConcurrent: 1,
    runningCount: 0,
    backlogCount: 0,
    ...overrides
  };
}

describe('Queue Store', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useQueueStore.setState({
      configs: {},
      statuses: {}
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('DEFAULT_QUEUE_CONFIG', () => {
    it('should have default values', () => {
      expect(DEFAULT_QUEUE_CONFIG.enabled).toBe(false);
      expect(DEFAULT_QUEUE_CONFIG.maxConcurrent).toBe(1);
    });
  });

  describe('setQueueConfig', () => {
    it('should set queue config for a project', () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });

      useQueueStore.getState().setQueueConfig(projectId, config);

      expect(useQueueStore.getState().configs[projectId]).toEqual(config);
    });

    it('should replace existing config for same project', () => {
      const projectId = 'project-1';
      const initialConfig = createTestQueueConfig({ enabled: false, maxConcurrent: 1 });
      const newConfig = createTestQueueConfig({ enabled: true, maxConcurrent: 3 });

      useQueueStore.getState().setQueueConfig(projectId, initialConfig);
      useQueueStore.getState().setQueueConfig(projectId, newConfig);

      expect(useQueueStore.getState().configs[projectId]).toEqual(newConfig);
    });

    it('should not affect configs for other projects', () => {
      const config1 = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });
      const config2 = createTestQueueConfig({ enabled: false, maxConcurrent: 1 });

      useQueueStore.getState().setQueueConfig('project-1', config1);
      useQueueStore.getState().setQueueConfig('project-2', config2);

      expect(useQueueStore.getState().configs['project-1']).toEqual(config1);
      expect(useQueueStore.getState().configs['project-2']).toEqual(config2);
    });
  });

  describe('getQueueConfig', () => {
    it('should return undefined for non-existent project', () => {
      const config = useQueueStore.getState().getQueueConfig('non-existent');

      expect(config).toBeUndefined();
    });

    it('should return config for existing project', () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });

      useQueueStore.getState().setQueueConfig(projectId, config);
      const retrieved = useQueueStore.getState().getQueueConfig(projectId);

      expect(retrieved).toEqual(config);
    });
  });

  describe('setQueueStatus', () => {
    it('should set queue status for a project', () => {
      const projectId = 'project-1';
      const status = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 2,
        runningCount: 1,
        backlogCount: 5
      });

      useQueueStore.getState().setQueueStatus(projectId, status);

      expect(useQueueStore.getState().statuses[projectId]).toEqual(status);
    });

    it('should replace existing status for same project', () => {
      const projectId = 'project-1';
      const initialStatus = createTestQueueStatus({ runningCount: 0 });
      const newStatus = createTestQueueStatus({ runningCount: 2 });

      useQueueStore.getState().setQueueStatus(projectId, initialStatus);
      useQueueStore.getState().setQueueStatus(projectId, newStatus);

      expect(useQueueStore.getState().statuses[projectId]).toEqual(newStatus);
    });

    it('should not affect statuses for other projects', () => {
      const status1 = createTestQueueStatus({ runningCount: 1 });
      const status2 = createTestQueueStatus({ runningCount: 2 });

      useQueueStore.getState().setQueueStatus('project-1', status1);
      useQueueStore.getState().setQueueStatus('project-2', status2);

      expect(useQueueStore.getState().statuses['project-1'].runningCount).toBe(1);
      expect(useQueueStore.getState().statuses['project-2'].runningCount).toBe(2);
    });
  });

  describe('getQueueStatus', () => {
    it('should return undefined for non-existent project', () => {
      const status = useQueueStore.getState().getQueueStatus('non-existent');

      expect(status).toBeUndefined();
    });

    it('should return status for existing project', () => {
      const projectId = 'project-1';
      const status = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 3,
        runningCount: 2,
        backlogCount: 5
      });

      useQueueStore.getState().setQueueStatus(projectId, status);
      const retrieved = useQueueStore.getState().getQueueStatus(projectId);

      expect(retrieved).toEqual(status);
    });
  });

  describe('updateRunningCount', () => {
    it('should update running count for existing status', () => {
      const projectId = 'project-1';
      const initialStatus = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 2,
        runningCount: 1,
        backlogCount: 5
      });

      useQueueStore.getState().setQueueStatus(projectId, initialStatus);
      useQueueStore.getState().updateRunningCount(projectId, 2);

      expect(useQueueStore.getState().statuses[projectId].runningCount).toBe(2);
      expect(useQueueStore.getState().statuses[projectId].backlogCount).toBe(5); // unchanged
    });

    it('should not update if status does not exist', () => {
      useQueueStore.getState().updateRunningCount('non-existent', 5);

      expect(useQueueStore.getState().statuses['non-existent']).toBeUndefined();
    });

    it('should handle zero running count', () => {
      const projectId = 'project-1';
      const initialStatus = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 2,
        runningCount: 2,
        backlogCount: 3
      });

      useQueueStore.getState().setQueueStatus(projectId, initialStatus);
      useQueueStore.getState().updateRunningCount(projectId, 0);

      expect(useQueueStore.getState().statuses[projectId].runningCount).toBe(0);
    });
  });

  describe('updateBacklogCount', () => {
    it('should update backlog count for existing status', () => {
      const projectId = 'project-1';
      const initialStatus = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 2,
        runningCount: 1,
        backlogCount: 5
      });

      useQueueStore.getState().setQueueStatus(projectId, initialStatus);
      useQueueStore.getState().updateBacklogCount(projectId, 10);

      expect(useQueueStore.getState().statuses[projectId].backlogCount).toBe(10);
      expect(useQueueStore.getState().statuses[projectId].runningCount).toBe(1); // unchanged
    });

    it('should not update if status does not exist', () => {
      useQueueStore.getState().updateBacklogCount('non-existent', 5);

      expect(useQueueStore.getState().statuses['non-existent']).toBeUndefined();
    });

    it('should handle zero backlog count', () => {
      const projectId = 'project-1';
      const initialStatus = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 2,
        runningCount: 1,
        backlogCount: 5
      });

      useQueueStore.getState().setQueueStatus(projectId, initialStatus);
      useQueueStore.getState().updateBacklogCount(projectId, 0);

      expect(useQueueStore.getState().statuses[projectId].backlogCount).toBe(0);
    });
  });

  describe('clearProject', () => {
    it('should remove config and status for a project', () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true });
      const status = createTestQueueStatus({ runningCount: 1 });

      useQueueStore.getState().setQueueConfig(projectId, config);
      useQueueStore.getState().setQueueStatus(projectId, status);
      useQueueStore.getState().clearProject(projectId);

      expect(useQueueStore.getState().configs[projectId]).toBeUndefined();
      expect(useQueueStore.getState().statuses[projectId]).toBeUndefined();
    });

    it('should not affect other projects', () => {
      const config1 = createTestQueueConfig({ enabled: true });
      const config2 = createTestQueueConfig({ enabled: false });
      const status1 = createTestQueueStatus({ runningCount: 1 });
      const status2 = createTestQueueStatus({ runningCount: 2 });

      useQueueStore.getState().setQueueConfig('project-1', config1);
      useQueueStore.getState().setQueueStatus('project-1', status1);
      useQueueStore.getState().setQueueConfig('project-2', config2);
      useQueueStore.getState().setQueueStatus('project-2', status2);

      useQueueStore.getState().clearProject('project-1');

      expect(useQueueStore.getState().configs['project-1']).toBeUndefined();
      expect(useQueueStore.getState().statuses['project-1']).toBeUndefined();
      expect(useQueueStore.getState().configs['project-2']).toEqual(config2);
      expect(useQueueStore.getState().statuses['project-2']).toEqual(status2);
    });

    it('should handle clearing non-existent project', () => {
      // Should not throw
      expect(() => {
        useQueueStore.getState().clearProject('non-existent');
      }).not.toThrow();
    });
  });

  describe('saveQueueConfig', () => {
    beforeEach(() => {
      // Mock window.electronAPI
      global.window = {
        electronAPI: {
          setQueueConfig: vi.fn()
        }
      } as any;
    });

    it('should call IPC with correct params', async () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });
      const mockSetQueueConfig = vi.mocked(window.electronAPI.setQueueConfig).mockResolvedValue({
        success: true
      });

      const result = await saveQueueConfig(projectId, config);

      expect(mockSetQueueConfig).toHaveBeenCalledWith(projectId, config);
      expect(result).toBe(true);
    });

    it('should update store state on success', async () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });
      vi.mocked(window.electronAPI.setQueueConfig).mockResolvedValue({
        success: true
      });

      await saveQueueConfig(projectId, config);

      expect(useQueueStore.getState().configs[projectId]).toEqual(config);
    });

    it('should not update store state on failure', async () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });
      vi.mocked(window.electronAPI.setQueueConfig).mockResolvedValue({
        success: false,
        error: 'Failed to save'
      });

      await saveQueueConfig(projectId, config);

      expect(useQueueStore.getState().configs[projectId]).toBeUndefined();
    });

    it('should handle errors gracefully', async () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });
      vi.mocked(window.electronAPI.setQueueConfig).mockRejectedValue(new Error('Network error'));

      const result = await saveQueueConfig(projectId, config);

      expect(result).toBe(false);
    });
  });

  describe('loadQueueConfig', () => {
    beforeEach(() => {
      // Mock window.electronAPI
      global.window = {
        electronAPI: {
          getQueueConfig: vi.fn()
        }
      } as any;
    });

    it('should call IPC with correct params', async () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });
      const mockGetQueueConfig = vi.mocked(window.electronAPI.getQueueConfig).mockResolvedValue({
        success: true,
        data: config
      });

      const result = await loadQueueConfig(projectId);

      expect(mockGetQueueConfig).toHaveBeenCalledWith(projectId);
      expect(result).toEqual(config);
    });

    it('should update store state on success', async () => {
      const projectId = 'project-1';
      const config = createTestQueueConfig({ enabled: true, maxConcurrent: 2 });
      vi.mocked(window.electronAPI.getQueueConfig).mockResolvedValue({
        success: true,
        data: config
      });

      await loadQueueConfig(projectId);

      expect(useQueueStore.getState().configs[projectId]).toEqual(config);
    });

    it('should return null on failure', async () => {
      const projectId = 'project-1';
      vi.mocked(window.electronAPI.getQueueConfig).mockResolvedValue({
        success: false,
        error: 'Not found'
      });

      const result = await loadQueueConfig(projectId);

      expect(result).toBeNull();
    });

    it('should return null when no data returned', async () => {
      const projectId = 'project-1';
      vi.mocked(window.electronAPI.getQueueConfig).mockResolvedValue({
        success: true
      });

      const result = await loadQueueConfig(projectId);

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const projectId = 'project-1';
      vi.mocked(window.electronAPI.getQueueConfig).mockRejectedValue(new Error('Network error'));

      const result = await loadQueueConfig(projectId);

      expect(result).toBeNull();
    });
  });

  describe('getQueueStatus', () => {
    beforeEach(() => {
      // Mock window.electronAPI
      global.window = {
        electronAPI: {
          getQueueStatus: vi.fn()
        }
      } as any;
    });

    it('should call IPC with correct params', async () => {
      const projectId = 'project-1';
      const status = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 2,
        runningCount: 1,
        backlogCount: 5
      });
      const mockGetQueueStatus = vi.mocked(window.electronAPI.getQueueStatus).mockResolvedValue({
        success: true,
        data: status
      });

      const result = await getQueueStatus(projectId);

      expect(mockGetQueueStatus).toHaveBeenCalledWith(projectId);
      expect(result).toEqual(status);
    });

    it('should update store state on success', async () => {
      const projectId = 'project-1';
      const status = createTestQueueStatus({
        enabled: true,
        maxConcurrent: 2,
        runningCount: 1,
        backlogCount: 5
      });
      vi.mocked(window.electronAPI.getQueueStatus).mockResolvedValue({
        success: true,
        data: status
      });

      await getQueueStatus(projectId);

      expect(useQueueStore.getState().statuses[projectId]).toEqual(status);
    });

    it('should return null on failure', async () => {
      const projectId = 'project-1';
      vi.mocked(window.electronAPI.getQueueStatus).mockResolvedValue({
        success: false,
        error: 'Not found'
      });

      const result = await getQueueStatus(projectId);

      expect(result).toBeNull();
    });

    it('should return null when no data returned', async () => {
      const projectId = 'project-1';
      vi.mocked(window.electronAPI.getQueueStatus).mockResolvedValue({
        success: true
      });

      const result = await getQueueStatus(projectId);

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const projectId = 'project-1';
      vi.mocked(window.electronAPI.getQueueStatus).mockRejectedValue(new Error('Network error'));

      const result = await getQueueStatus(projectId);

      expect(result).toBeNull();
    });
  });
});
