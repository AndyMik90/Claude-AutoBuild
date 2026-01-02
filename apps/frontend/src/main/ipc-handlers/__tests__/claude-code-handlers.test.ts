/**
 * Unit tests for Claude Code IPC handlers
 * Tests timeout protection and error handling
 * 
 * NOTE: These tests verify the IPC handler's Promise.race timeout logic.
 * Since getToolInfo is synchronous and calls execFileSync, true blocking
 * cannot be prevented by Promise.race. However, the timeout provides
 * defense-in-depth for cases where the operation is slow but not completely
 * blocking, and ensures the handler always returns a response.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolDetectionResult } from '../../../shared/types/cli';

// Mock the cli-tool-manager module
vi.mock('../../cli-tool-manager', () => ({
  getToolInfo: vi.fn()
}));

// Mock semver module
vi.mock('semver', () => ({
  default: {
    lt: vi.fn((a: string, b: string) => a < b)
  },
  lt: vi.fn((a: string, b: string) => a < b)
}));

describe('Claude Code IPC Handlers', () => {
  describe('claudeCode:checkVersion handler timeout protection', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should timeout if getToolInfo takes longer than 5 seconds', async () => {
      const { getToolInfo } = await import('../../cli-tool-manager');
      
      // Mock getToolInfo to hang indefinitely
      vi.mocked(getToolInfo).mockImplementation((): ToolDetectionResult => {
        return new Promise(() => {
          // Never resolves - simulates hanging execFileSync
        }) as unknown as ToolDetectionResult;
      });

      // Import the handler after mocking
      const { registerClaudeCodeHandlers } = await import('../claude-code-handlers');
      
      // Create a mock ipcMain
      const handlers = new Map<string, Function>();
      const mockIpcMain = {
        handle: vi.fn((channel: string, handler: Function) => {
          handlers.set(channel, handler);
        })
      };

      // Register handlers
      vi.stubGlobal('ipcMain', mockIpcMain);
      registerClaudeCodeHandlers();

      // Get the registered handler
      const handler = handlers.get('claudeCode:checkVersion');
      expect(handler).toBeDefined();

      if (handler) {
        // Call the handler and expect it to timeout
        const startTime = Date.now();
        const result = await handler();
        const duration = Date.now() - startTime;

        // Should timeout around 5 seconds (allow some variance)
        expect(duration).toBeGreaterThanOrEqual(4900);
        expect(duration).toBeLessThan(6000);

        // Should return an error response
        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
        expect(result.error).toContain('timeout');
      }
    });

    it('should return error response on detection failure', async () => {
      const { getToolInfo } = await import('../../cli-tool-manager');
      
      // Mock getToolInfo to throw an error
      vi.mocked(getToolInfo).mockImplementation(() => {
        throw new Error('Command not found');
      });

      // Import the handler after mocking
      const { registerClaudeCodeHandlers } = await import('../claude-code-handlers');
      
      // Create a mock ipcMain
      const handlers = new Map<string, Function>();
      const mockIpcMain = {
        handle: vi.fn((channel: string, handler: Function) => {
          handlers.set(channel, handler);
        })
      };

      // Register handlers
      vi.stubGlobal('ipcMain', mockIpcMain);
      registerClaudeCodeHandlers();

      // Get the registered handler
      const handler = handlers.get('claudeCode:checkVersion');
      expect(handler).toBeDefined();

      if (handler) {
        // Call the handler
        const result = await handler();

        // Should return an error response, not throw
        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
        expect(result.error).toContain('Detection failed');
      }
    });

    it('should return success response when detection succeeds quickly', async () => {
      const { getToolInfo } = await import('../../cli-tool-manager');
      
      // Mock getToolInfo to return immediately
      vi.mocked(getToolInfo).mockReturnValue({
        found: true,
        version: '1.0.0',
        path: '/usr/bin/claude',
        source: 'system-path',
        message: 'Found'
      });

      // Mock fetch for latest version
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ version: '1.1.0' })
        } as Response)
      );

      // Import the handler after mocking
      const { registerClaudeCodeHandlers } = await import('../claude-code-handlers');
      
      // Create a mock ipcMain
      const handlers = new Map<string, Function>();
      const mockIpcMain = {
        handle: vi.fn((channel: string, handler: Function) => {
          handlers.set(channel, handler);
        })
      };

      // Register handlers
      vi.stubGlobal('ipcMain', mockIpcMain);
      registerClaudeCodeHandlers();

      // Get the registered handler
      const handler = handlers.get('claudeCode:checkVersion');
      expect(handler).toBeDefined();

      if (handler) {
        // Call the handler
        const result = await handler();

        // Should return success
        expect(result).toHaveProperty('success', true);
        expect(result).toHaveProperty('data');
        expect(result.data).toHaveProperty('installed', '1.0.0');
        expect(result.data).toHaveProperty('latest', '1.1.0');
      }
    });

    it('should handle detection timeout gracefully without hanging', async () => {
      const { getToolInfo } = await import('../../cli-tool-manager');
      
      // Mock getToolInfo to delay for 10 seconds (longer than timeout)
      vi.mocked(getToolInfo).mockImplementation((): ToolDetectionResult => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              found: true,
              version: '1.0.0',
              path: '/usr/bin/claude',
              source: 'system-path',
              message: 'Found'
            });
          }, 10000);
        }) as unknown as ToolDetectionResult;
      });

      // Import the handler after mocking
      const { registerClaudeCodeHandlers } = await import('../claude-code-handlers');
      
      // Create a mock ipcMain
      const handlers = new Map<string, Function>();
      const mockIpcMain = {
        handle: vi.fn((channel: string, handler: Function) => {
          handlers.set(channel, handler);
        })
      };

      // Register handlers
      vi.stubGlobal('ipcMain', mockIpcMain);
      registerClaudeCodeHandlers();

      // Get the registered handler
      const handler = handlers.get('claudeCode:checkVersion');
      expect(handler).toBeDefined();

      if (handler) {
        // Call the handler - should timeout before 10 seconds
        const startTime = Date.now();
        const result = await handler();
        const duration = Date.now() - startTime;

        // Should timeout around 5 seconds, not wait 10 seconds
        expect(duration).toBeLessThan(6000);

        // Should return error response
        expect(result).toHaveProperty('success', false);
        expect(result).toHaveProperty('error');
      }
    });
  });
});
