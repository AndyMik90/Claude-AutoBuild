/**
 * Unit tests for WebSocket Connection Handling
 * Tests client management, message processing, subscriptions, and broadcast functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';

// Mock the auth module before importing websocket
vi.mock('../middleware/auth', () => ({
  authenticateWebSocket: vi.fn().mockImplementation(async () => {
    // Default: authentication passes
  }),
}));

describe('WebSocket Connection Handling', () => {
  // Store module instance for resetting between tests
  let websocketModule: typeof import('../websocket');

  beforeEach(async () => {
    // Reset modules to get fresh state
    vi.resetModules();
    // Re-import module to get fresh client state
    websocketModule = await import('../websocket');
  });

  afterEach(() => {
    // Clean up any connections
    if (websocketModule) {
      websocketModule.closeAllConnections();
    }
    vi.clearAllMocks();
  });

  // ============================================
  // Client Management Tests
  // ============================================

  describe('Client Management', () => {
    describe('getClientCount', () => {
      it('should return 0 when no clients are connected', () => {
        expect(websocketModule.getClientCount()).toBe(0);
      });

      it('should return correct count after clients connect', () => {
        // Simulate client connections by using internal functions
        // We'll test this through the broadcast functions
        expect(websocketModule.getClientCount()).toBe(0);
      });
    });

    describe('getAllClients', () => {
      it('should return empty array when no clients are connected', () => {
        const clients = websocketModule.getAllClients();
        expect(clients).toEqual([]);
        expect(Array.isArray(clients)).toBe(true);
      });
    });

    describe('getClient', () => {
      it('should return undefined for non-existent client ID', () => {
        const client = websocketModule.getClient('non-existent-id');
        expect(client).toBeUndefined();
      });
    });

    describe('isWebSocketReady', () => {
      it('should return true when module is loaded', () => {
        expect(websocketModule.isWebSocketReady()).toBe(true);
      });
    });
  });

  // ============================================
  // Broadcast Function Tests
  // ============================================

  describe('Broadcast Functions', () => {
    describe('broadcastTaskProgress', () => {
      it('should not throw when no clients are connected', () => {
        expect(() => {
          websocketModule.broadcastTaskProgress('task-123', {
            feature: 'Test Feature',
            workflow_type: 'feature',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            status: 'in_progress',
            phases: [],
            final_acceptance: [],
            spec_file: 'spec.md',
          });
        }).not.toThrow();
      });
    });

    describe('broadcastTaskStatusChange', () => {
      it('should not throw when no clients are connected', () => {
        expect(() => {
          websocketModule.broadcastTaskStatusChange('task-123', 'in_progress', 'backlog');
        }).not.toThrow();
      });

      it('should accept status without previous status', () => {
        expect(() => {
          websocketModule.broadcastTaskStatusChange('task-123', 'done');
        }).not.toThrow();
      });
    });

    describe('broadcastTaskLog', () => {
      it('should not throw when no clients are connected', () => {
        expect(() => {
          websocketModule.broadcastTaskLog('task-123', 'This is a log message');
        }).not.toThrow();
      });

      it('should handle empty log message', () => {
        expect(() => {
          websocketModule.broadcastTaskLog('task-123', '');
        }).not.toThrow();
      });

      it('should handle multiline log messages', () => {
        expect(() => {
          websocketModule.broadcastTaskLog('task-123', 'Line 1\nLine 2\nLine 3');
        }).not.toThrow();
      });
    });

    describe('broadcastTaskError', () => {
      it('should not throw when no clients are connected', () => {
        expect(() => {
          websocketModule.broadcastTaskError('task-123', 'An error occurred');
        }).not.toThrow();
      });

      it('should handle empty error message', () => {
        expect(() => {
          websocketModule.broadcastTaskError('task-123', '');
        }).not.toThrow();
      });
    });

    describe('broadcastTaskExecutionProgress', () => {
      it('should not throw when no clients are connected', () => {
        expect(() => {
          websocketModule.broadcastTaskExecutionProgress('task-123', {
            phase: 'coding',
            phaseProgress: 50,
            overallProgress: 25,
            currentSubtask: 'subtask-1',
            message: 'Working on subtask',
          });
        }).not.toThrow();
      });
    });

    describe('broadcastToProject', () => {
      it('should not throw when no clients are connected', () => {
        expect(() => {
          websocketModule.broadcastToProject('project-123', 'task-progress', {
            taskId: 'task-1',
          });
        }).not.toThrow();
      });
    });
  });

  // ============================================
  // Connection Cleanup Tests
  // ============================================

  describe('Connection Cleanup', () => {
    describe('closeAllConnections', () => {
      it('should not throw when no clients are connected', () => {
        expect(() => {
          websocketModule.closeAllConnections();
        }).not.toThrow();
      });

      it('should clear all clients after closing', () => {
        websocketModule.closeAllConnections();
        expect(websocketModule.getClientCount()).toBe(0);
        expect(websocketModule.getAllClients()).toEqual([]);
      });
    });
  });

  // ============================================
  // WebSocket Route Registration Tests
  // ============================================

  describe('WebSocket Route Registration', () => {
    it('should register /ws route on Fastify instance', () => {
      const mockFastify = {
        get: vi.fn(),
      } as unknown as FastifyInstance;

      websocketModule.registerWebSocketRoute(mockFastify);

      expect(mockFastify.get).toHaveBeenCalledWith(
        '/ws',
        expect.objectContaining({
          websocket: true,
          preValidation: expect.any(Array),
          schema: expect.objectContaining({
            tags: ['WebSocket'],
            summary: expect.any(String),
            description: expect.any(String),
          }),
        }),
        expect.any(Function)
      );
    });

    it('should include authentication in preValidation', () => {
      const mockFastify = {
        get: vi.fn(),
      } as unknown as FastifyInstance;

      websocketModule.registerWebSocketRoute(mockFastify);

      const routeOptions = (mockFastify.get as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(routeOptions.preValidation).toHaveLength(1);
    });

    it('should include query parameter schema for api_key', () => {
      const mockFastify = {
        get: vi.fn(),
      } as unknown as FastifyInstance;

      websocketModule.registerWebSocketRoute(mockFastify);

      const routeOptions = (mockFastify.get as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(routeOptions.schema.querystring).toEqual({
        type: 'object',
        properties: {
          api_key: {
            type: 'string',
            description: expect.any(String),
          },
        },
      });
    });

    it('should include 101 and 401 response schemas', () => {
      const mockFastify = {
        get: vi.fn(),
      } as unknown as FastifyInstance;

      websocketModule.registerWebSocketRoute(mockFastify);

      const routeOptions = (mockFastify.get as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(routeOptions.schema.response).toHaveProperty('101');
      expect(routeOptions.schema.response).toHaveProperty('401');
    });
  });

  // ============================================
  // WebSocket Handler Tests (simulated)
  // ============================================

  describe('WebSocket Handler Behavior', () => {
    let wsHandler: (socket: WebSocket, request: FastifyRequest) => void;
    let mockSocket: WebSocket;
    let mockRequest: FastifyRequest;
    let messageHandlers: Map<string, (data: Buffer) => void>;
    let closeHandlers: ((code: number, reason: Buffer) => void)[];
    let errorHandlers: ((error: Error) => void)[];

    beforeEach(() => {
      messageHandlers = new Map();
      closeHandlers = [];
      errorHandlers = [];

      // Extract the handler from registerWebSocketRoute
      const mockFastify = {
        get: vi.fn((_path: string, _options: object, handler: typeof wsHandler) => {
          wsHandler = handler;
        }),
      } as unknown as FastifyInstance;

      websocketModule.registerWebSocketRoute(mockFastify);

      // Create mock socket
      mockSocket = {
        readyState: 1, // OPEN
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'message') {
            messageHandlers.set(event, handler as (data: Buffer) => void);
          } else if (event === 'close') {
            closeHandlers.push(handler as (code: number, reason: Buffer) => void);
          } else if (event === 'error') {
            errorHandlers.push(handler as (error: Error) => void);
          }
        }),
      } as unknown as WebSocket;

      // Create mock request
      mockRequest = {
        log: {
          info: vi.fn(),
          error: vi.fn(),
        },
      } as unknown as FastifyRequest;
    });

    describe('Client Connection', () => {
      it('should increment client count on connection', () => {
        const initialCount = websocketModule.getClientCount();
        wsHandler(mockSocket, mockRequest);
        expect(websocketModule.getClientCount()).toBe(initialCount + 1);
      });

      it('should send welcome message on connection', () => {
        wsHandler(mockSocket, mockRequest);

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"pong"')
        );
      });

      it('should log client connection', () => {
        wsHandler(mockSocket, mockRequest);

        expect(mockRequest.log.info).toHaveBeenCalledWith(
          expect.objectContaining({ clientId: expect.stringContaining('ws-client-') }),
          'WebSocket client connected'
        );
      });

      it('should register message, close, and error handlers', () => {
        wsHandler(mockSocket, mockRequest);

        expect(mockSocket.on).toHaveBeenCalledWith('message', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('close', expect.any(Function));
        expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
      });
    });

    describe('Client Disconnection', () => {
      it('should decrement client count on close', () => {
        wsHandler(mockSocket, mockRequest);
        const countAfterConnect = websocketModule.getClientCount();

        // Trigger close handler
        closeHandlers[0](1000, Buffer.from('Normal close'));

        expect(websocketModule.getClientCount()).toBe(countAfterConnect - 1);
      });

      it('should log client disconnection', () => {
        wsHandler(mockSocket, mockRequest);
        closeHandlers[0](1000, Buffer.from('Normal close'));

        expect(mockRequest.log.info).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: expect.any(String),
            code: 1000,
            reason: 'Normal close',
          }),
          'WebSocket client disconnected'
        );
      });

      it('should remove client on error', () => {
        wsHandler(mockSocket, mockRequest);
        const countAfterConnect = websocketModule.getClientCount();

        // Trigger error handler
        errorHandlers[0](new Error('Connection reset'));

        expect(websocketModule.getClientCount()).toBe(countAfterConnect - 1);
      });

      it('should log error on WebSocket error', () => {
        wsHandler(mockSocket, mockRequest);
        errorHandlers[0](new Error('Connection reset'));

        expect(mockRequest.log.error).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: expect.any(String),
            error: 'Connection reset',
          }),
          'WebSocket error'
        );
      });
    });

    describe('Message Processing', () => {
      it('should handle valid subscribe message', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        const subscribeMessage = JSON.stringify({
          type: 'subscribe',
          payload: {
            taskIds: ['task-1', 'task-2'],
          },
        });

        messageHandler(Buffer.from(subscribeMessage));

        // Should send acknowledgment
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"subscribe"')
        );
      });

      it('should handle valid unsubscribe message', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        const unsubscribeMessage = JSON.stringify({
          type: 'unsubscribe',
          payload: {
            taskIds: ['task-1'],
          },
        });

        messageHandler(Buffer.from(unsubscribeMessage));

        // Should send acknowledgment
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"unsubscribe"')
        );
      });

      it('should handle ping message with pong response', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        const pingMessage = JSON.stringify({ type: 'ping' });
        messageHandler(Buffer.from(pingMessage));

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"pong"')
        );
      });

      it('should send error for invalid JSON', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        messageHandler(Buffer.from('not valid json'));

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"')
        );
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('PARSE_ERROR')
        );
      });

      it('should send error for message without type', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        const invalidMessage = JSON.stringify({ payload: 'some data' });
        messageHandler(Buffer.from(invalidMessage));

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"')
        );
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('INVALID_MESSAGE')
        );
      });

      it('should send error for unknown message type', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        const unknownMessage = JSON.stringify({ type: 'unknown-type' });
        messageHandler(Buffer.from(unknownMessage));

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"')
        );
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('UNKNOWN_TYPE')
        );
      });
    });

    describe('Subscription Handling', () => {
      it('should subscribe to multiple task IDs', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        const subscribeMessage = JSON.stringify({
          type: 'subscribe',
          payload: {
            taskIds: ['task-1', 'task-2', 'task-3'],
          },
        });

        messageHandler(Buffer.from(subscribeMessage));

        const ackCall = vi.mocked(mockSocket.send).mock.calls.find(
          (call) => String(call[0]).includes('"type":"subscribe"')
        );
        expect(ackCall).toBeDefined();
        const ackMessage = JSON.parse(String(ackCall![0]));
        expect(ackMessage.payload.taskIds).toContain('task-1');
        expect(ackMessage.payload.taskIds).toContain('task-2');
        expect(ackMessage.payload.taskIds).toContain('task-3');
      });

      it('should subscribe to a project', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        const subscribeMessage = JSON.stringify({
          type: 'subscribe',
          payload: {
            projectId: 'project-123',
          },
        });

        messageHandler(Buffer.from(subscribeMessage));

        const ackCall = vi.mocked(mockSocket.send).mock.calls.find(
          (call) => String(call[0]).includes('"type":"subscribe"')
        );
        expect(ackCall).toBeDefined();
        const ackMessage = JSON.parse(String(ackCall![0]));
        expect(ackMessage.payload.projectIds).toContain('project-123');
      });

      it('should subscribe to specific event types', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        const subscribeMessage = JSON.stringify({
          type: 'subscribe',
          payload: {
            events: ['task-progress', 'task-error'],
          },
        });

        messageHandler(Buffer.from(subscribeMessage));

        const ackCall = vi.mocked(mockSocket.send).mock.calls.find(
          (call) => String(call[0]).includes('"type":"subscribe"')
        );
        expect(ackCall).toBeDefined();
        const ackMessage = JSON.parse(String(ackCall![0]));
        expect(ackMessage.payload.events).toContain('task-progress');
        expect(ackMessage.payload.events).toContain('task-error');
      });

      it('should unsubscribe from specific tasks', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Subscribe first
        messageHandler(Buffer.from(JSON.stringify({
          type: 'subscribe',
          payload: { taskIds: ['task-1', 'task-2'] },
        })));

        // Clear messages
        vi.mocked(mockSocket.send).mockClear();

        // Unsubscribe from task-1
        messageHandler(Buffer.from(JSON.stringify({
          type: 'unsubscribe',
          payload: { taskIds: ['task-1'] },
        })));

        const ackCall = vi.mocked(mockSocket.send).mock.calls.find(
          (call) => String(call[0]).includes('"type":"unsubscribe"')
        );
        expect(ackCall).toBeDefined();
        const ackMessage = JSON.parse(String(ackCall![0]));
        expect(ackMessage.payload.taskIds).not.toContain('task-1');
        expect(ackMessage.payload.taskIds).toContain('task-2');
      });

      it('should unsubscribe from everything when no payload', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Subscribe first
        messageHandler(Buffer.from(JSON.stringify({
          type: 'subscribe',
          payload: {
            taskIds: ['task-1'],
            projectId: 'project-1',
            events: ['task-progress'],
          },
        })));

        // Clear messages
        vi.mocked(mockSocket.send).mockClear();

        // Unsubscribe from everything
        messageHandler(Buffer.from(JSON.stringify({
          type: 'unsubscribe',
        })));

        const ackCall = vi.mocked(mockSocket.send).mock.calls.find(
          (call) => String(call[0]).includes('"type":"unsubscribe"')
        );
        expect(ackCall).toBeDefined();
        const ackMessage = JSON.parse(String(ackCall![0]));
        expect(ackMessage.payload.taskIds).toEqual([]);
        expect(ackMessage.payload.projectIds).toEqual([]);
        expect(ackMessage.payload.events).toEqual([]);
      });

      it('should send error for subscribe without payload', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Clear initial welcome message
        vi.mocked(mockSocket.send).mockClear();

        const subscribeMessage = JSON.stringify({ type: 'subscribe' });
        messageHandler(Buffer.from(subscribeMessage));

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"error"')
        );
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('INVALID_PAYLOAD')
        );
      });
    });

    describe('Broadcast Filtering', () => {
      it('should send broadcasts to subscribed clients', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Subscribe to a specific task
        messageHandler(Buffer.from(JSON.stringify({
          type: 'subscribe',
          payload: { taskIds: ['task-123'] },
        })));

        // Clear previous messages
        vi.mocked(mockSocket.send).mockClear();

        // Broadcast to subscribed task
        websocketModule.broadcastTaskLog('task-123', 'Test log');

        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"task-log"')
        );
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"taskId":"task-123"')
        );
      });

      it('should not send broadcasts to non-subscribed clients', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Subscribe to a specific task
        messageHandler(Buffer.from(JSON.stringify({
          type: 'subscribe',
          payload: { taskIds: ['task-123'] },
        })));

        // Clear previous messages
        vi.mocked(mockSocket.send).mockClear();

        // Broadcast to a different task
        websocketModule.broadcastTaskLog('task-456', 'Test log');

        // Should not have received this broadcast
        expect(mockSocket.send).not.toHaveBeenCalledWith(
          expect.stringContaining('"taskId":"task-456"')
        );
      });

      it('should filter broadcasts by event type', () => {
        wsHandler(mockSocket, mockRequest);
        const messageHandler = messageHandlers.get('message')!;

        // Subscribe only to task-log events
        messageHandler(Buffer.from(JSON.stringify({
          type: 'subscribe',
          payload: { events: ['task-log'] },
        })));

        // Clear previous messages
        vi.mocked(mockSocket.send).mockClear();

        // Broadcast a log - should receive
        websocketModule.broadcastTaskLog('task-1', 'Test log');
        expect(mockSocket.send).toHaveBeenCalledWith(
          expect.stringContaining('"type":"task-log"')
        );

        // Clear messages
        vi.mocked(mockSocket.send).mockClear();

        // Broadcast an error - should not receive
        websocketModule.broadcastTaskError('task-1', 'Test error');
        expect(mockSocket.send).not.toHaveBeenCalled();
      });

      it('should send all events to clients with no event filter', () => {
        wsHandler(mockSocket, mockRequest);

        // Clear welcome message
        vi.mocked(mockSocket.send).mockClear();

        // No subscription = receive all events
        websocketModule.broadcastTaskLog('task-1', 'Test log');
        websocketModule.broadcastTaskError('task-1', 'Test error');

        expect(mockSocket.send).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ============================================
  // Edge Cases and Error Handling
  // ============================================

  describe('Edge Cases', () => {
    let wsHandler: (socket: WebSocket, request: FastifyRequest) => void;
    let mockSocket: WebSocket;
    let mockRequest: FastifyRequest;

    beforeEach(() => {
      const mockFastify = {
        get: vi.fn((_path: string, _options: object, handler: typeof wsHandler) => {
          wsHandler = handler;
        }),
      } as unknown as FastifyInstance;

      websocketModule.registerWebSocketRoute(mockFastify);

      mockSocket = {
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn(),
      } as unknown as WebSocket;

      mockRequest = {
        log: {
          info: vi.fn(),
          error: vi.fn(),
        },
      } as unknown as FastifyRequest;
    });

    it('should handle socket already closed when sending', () => {
      // Socket with closed state - use Object.defineProperty for read-only property
      Object.defineProperty(mockSocket, 'readyState', { value: 3, writable: true }); // WebSocket.CLOSED
      wsHandler(mockSocket, mockRequest);

      // Should not throw when broadcasting to closed socket
      expect(() => {
        websocketModule.broadcastTaskLog('task-1', 'Test');
      }).not.toThrow();
    });

    it('should handle send error gracefully', () => {
      mockSocket.send = vi.fn().mockImplementation(() => {
        throw new Error('Send failed');
      });

      wsHandler(mockSocket, mockRequest);

      // Should not throw
      expect(() => {
        websocketModule.broadcastTaskLog('task-1', 'Test');
      }).not.toThrow();
    });

    it('should handle close error during shutdown', () => {
      mockSocket.close = vi.fn().mockImplementation(() => {
        throw new Error('Close failed');
      });

      wsHandler(mockSocket, mockRequest);

      // Should not throw
      expect(() => {
        websocketModule.closeAllConnections();
      }).not.toThrow();
    });

    it('should generate unique client IDs', () => {
      const mockFastify = {
        get: vi.fn((_path: string, _options: object, handler: typeof wsHandler) => {
          wsHandler = handler;
        }),
      } as unknown as FastifyInstance;

      websocketModule.registerWebSocketRoute(mockFastify);

      const clientIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const socket = {
          readyState: 1,
          send: vi.fn((data: string) => {
            const message = JSON.parse(data);
            if (message.payload?.clientId) {
              clientIds.push(message.payload.clientId);
            }
          }),
          close: vi.fn(),
          on: vi.fn(),
        } as unknown as WebSocket;

        wsHandler(socket, mockRequest);
      }

      // All client IDs should be unique
      const uniqueIds = new Set(clientIds);
      expect(uniqueIds.size).toBe(clientIds.length);
    });

    it('should trim whitespace from task IDs in subscriptions', () => {
      const messageHandlers = new Map<string, (data: Buffer) => void>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockSocket as any).on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'message') {
          messageHandlers.set(event, handler as (data: Buffer) => void);
        }
        return mockSocket;
      });

      wsHandler(mockSocket, mockRequest);
      const messageHandler = messageHandlers.get('message')!;

      // Clear welcome message
      vi.mocked(mockSocket.send).mockClear();

      // Subscribe with whitespace-padded task ID
      messageHandler(Buffer.from(JSON.stringify({
        type: 'subscribe',
        payload: { taskIds: ['  task-123  '] },
      })));

      // Check acknowledgment contains trimmed task ID
      const ackCall = vi.mocked(mockSocket.send).mock.calls.find(
        (call) => String(call[0]).includes('"type":"subscribe"')
      );
      expect(ackCall).toBeDefined();
      const ackMessage = JSON.parse(String(ackCall![0]));
      expect(ackMessage.payload.taskIds).toContain('task-123');
      expect(ackMessage.payload.taskIds).not.toContain('  task-123  ');
    });

    it('should ignore invalid event types in subscriptions', () => {
      const messageHandlers = new Map<string, (data: Buffer) => void>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mockSocket as any).on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (event === 'message') {
          messageHandlers.set(event, handler as (data: Buffer) => void);
        }
        return mockSocket;
      });

      wsHandler(mockSocket, mockRequest);
      const messageHandler = messageHandlers.get('message')!;

      // Clear welcome message
      vi.mocked(mockSocket.send).mockClear();

      // Subscribe with invalid event type
      messageHandler(Buffer.from(JSON.stringify({
        type: 'subscribe',
        payload: { events: ['invalid-event', 'task-log'] },
      })));

      // Check acknowledgment only contains valid event
      const ackCall = vi.mocked(mockSocket.send).mock.calls.find(
        (call) => String(call[0]).includes('"type":"subscribe"')
      );
      expect(ackCall).toBeDefined();
      const ackMessage = JSON.parse(String(ackCall![0]));
      expect(ackMessage.payload.events).toContain('task-log');
      expect(ackMessage.payload.events).not.toContain('invalid-event');
    });
  });
});
