/**
 * WebSocket Server for Real-Time Task Monitoring
 *
 * Provides WebSocket connections for real-time task progress, status changes,
 * logs, and error events. Supports task and project subscriptions.
 *
 * Features:
 * - API key authentication via header or query parameter
 * - Task subscription management (subscribe to specific tasks or all tasks)
 * - Project subscription management (subscribe to all tasks in a project)
 * - Event type filtering (only receive specific event types)
 * - Automatic cleanup on disconnect
 * - Ping/pong for connection health monitoring
 *
 * Based on patterns from:
 * - apps/frontend/src/main/ipc-handlers/agent-events-handlers.ts
 * - apps/frontend/src/main/ipc-handlers/task/logs-handlers.ts
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';

import { authenticateWebSocket } from './middleware/auth';
import type {
  WebSocketMessage,
  WebSocketMessageType,
  SubscribePayload,
  UnsubscribePayload,
  TaskProgressPayload,
  TaskStatusChangePayload,
  TaskLogPayload,
  TaskErrorPayload,
  TaskExecutionProgressPayload,
  WebSocketErrorPayload,
  ImplementationPlan,
  TaskStatus,
  ExecutionProgress,
} from './types';

// ============================================
// Types
// ============================================

/**
 * Client subscription state
 */
interface ClientSubscription {
  /** Subscribed task IDs (empty = all tasks) */
  taskIds: Set<string>;
  /** Subscribed project IDs (empty = all projects) */
  projectIds: Set<string>;
  /** Subscribed event types (empty = all events) */
  eventTypes: Set<WebSocketMessageType>;
}

/**
 * Connected WebSocket client with subscription state
 */
interface ConnectedClient {
  /** WebSocket connection */
  socket: WebSocket;
  /** Client identifier (for logging) */
  clientId: string;
  /** Connection timestamp */
  connectedAt: Date;
  /** Subscription state */
  subscription: ClientSubscription;
  /** Last activity timestamp (for connection health) */
  lastActivity: Date;
}

// ============================================
// Client Management
// ============================================

/**
 * Map of connected clients by client ID
 */
const clients = new Map<string, ConnectedClient>();

/**
 * Counter for generating unique client IDs
 */
let clientIdCounter = 0;

/**
 * Generate a unique client ID
 */
function generateClientId(): string {
  return `ws-client-${++clientIdCounter}-${Date.now()}`;
}

/**
 * Get a connected client by ID
 */
export function getClient(clientId: string): ConnectedClient | undefined {
  return clients.get(clientId);
}

/**
 * Get all connected clients
 */
export function getAllClients(): ConnectedClient[] {
  return Array.from(clients.values());
}

/**
 * Get the number of connected clients
 */
export function getClientCount(): number {
  return clients.size;
}

/**
 * Check if a client is subscribed to a specific task
 */
function isSubscribedToTask(client: ConnectedClient, taskId: string): boolean {
  // If no specific tasks subscribed, client receives all tasks
  if (client.subscription.taskIds.size === 0) {
    return true;
  }
  return client.subscription.taskIds.has(taskId);
}

/**
 * Check if a client is subscribed to a specific project
 */
function isSubscribedToProject(client: ConnectedClient, projectId: string): boolean {
  // If no specific projects subscribed, client receives all projects
  if (client.subscription.projectIds.size === 0) {
    return true;
  }
  return client.subscription.projectIds.has(projectId);
}

/**
 * Check if a client is subscribed to a specific event type
 */
function isSubscribedToEvent(client: ConnectedClient, eventType: WebSocketMessageType): boolean {
  // If no specific events subscribed, client receives all events
  if (client.subscription.eventTypes.size === 0) {
    return true;
  }
  return client.subscription.eventTypes.has(eventType);
}

// ============================================
// Message Helpers
// ============================================

/**
 * Create a WebSocket message with timestamp
 */
function createMessage<T>(type: WebSocketMessageType, payload?: T): WebSocketMessage<T> {
  return {
    type,
    payload,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send a message to a specific client
 */
function sendToClient(client: ConnectedClient, message: WebSocketMessage<unknown>): void {
  if (client.socket.readyState === 1) { // WebSocket.OPEN
    try {
      client.socket.send(JSON.stringify(message));
    } catch {
      // Socket may have closed, will be cleaned up by close handler
    }
  }
}

/**
 * Send an error message to a client
 */
function sendErrorToClient(client: ConnectedClient, code: string, message: string): void {
  const payload: WebSocketErrorPayload = { code, message };
  sendToClient(client, createMessage('error', payload));
}

// ============================================
// Message Handlers
// ============================================

/**
 * Handle subscribe message from client
 */
function handleSubscribe(client: ConnectedClient, payload: SubscribePayload | undefined): void {
  if (!payload) {
    sendErrorToClient(client, 'INVALID_PAYLOAD', 'Subscribe payload is required');
    return;
  }

  // Add task subscriptions
  if (payload.taskIds && Array.isArray(payload.taskIds)) {
    for (const taskId of payload.taskIds) {
      if (typeof taskId === 'string' && taskId.trim()) {
        client.subscription.taskIds.add(taskId.trim());
      }
    }
  }

  // Add project subscription
  if (payload.projectId && typeof payload.projectId === 'string') {
    client.subscription.projectIds.add(payload.projectId.trim());
  }

  // Add event type subscriptions
  if (payload.events && Array.isArray(payload.events)) {
    for (const event of payload.events) {
      if (typeof event === 'string' && isValidEventType(event)) {
        client.subscription.eventTypes.add(event);
      }
    }
  }

  // Send acknowledgment
  sendToClient(client, createMessage('subscribe', {
    taskIds: Array.from(client.subscription.taskIds),
    projectIds: Array.from(client.subscription.projectIds),
    events: Array.from(client.subscription.eventTypes),
  }));
}

/**
 * Handle unsubscribe message from client
 */
function handleUnsubscribe(client: ConnectedClient, payload: UnsubscribePayload | undefined): void {
  if (!payload) {
    // Unsubscribe from everything
    client.subscription.taskIds.clear();
    client.subscription.projectIds.clear();
    client.subscription.eventTypes.clear();
  } else {
    // Remove task subscriptions
    if (payload.taskIds && Array.isArray(payload.taskIds)) {
      for (const taskId of payload.taskIds) {
        if (typeof taskId === 'string') {
          client.subscription.taskIds.delete(taskId.trim());
        }
      }
    }

    // Remove project subscription
    if (payload.projectId && typeof payload.projectId === 'string') {
      client.subscription.projectIds.delete(payload.projectId.trim());
    }

    // Remove event type subscriptions
    if (payload.events && Array.isArray(payload.events)) {
      for (const event of payload.events) {
        if (typeof event === 'string') {
          client.subscription.eventTypes.delete(event as WebSocketMessageType);
        }
      }
    }
  }

  // Send acknowledgment
  sendToClient(client, createMessage('unsubscribe', {
    taskIds: Array.from(client.subscription.taskIds),
    projectIds: Array.from(client.subscription.projectIds),
    events: Array.from(client.subscription.eventTypes),
  }));
}

/**
 * Handle ping message from client
 */
function handlePing(client: ConnectedClient): void {
  client.lastActivity = new Date();
  sendToClient(client, createMessage('pong'));
}

/**
 * Validate if a string is a valid WebSocket message type
 */
function isValidEventType(type: string): type is WebSocketMessageType {
  const validTypes: WebSocketMessageType[] = [
    'task-progress',
    'task-status-change',
    'task-log',
    'task-error',
    'task-execution-progress',
    'subscribe',
    'unsubscribe',
    'ping',
    'pong',
    'error',
  ];
  return validTypes.includes(type as WebSocketMessageType);
}

/**
 * Process incoming WebSocket message from client
 */
function processClientMessage(client: ConnectedClient, rawMessage: string): void {
  client.lastActivity = new Date();

  let message: WebSocketMessage<unknown>;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    sendErrorToClient(client, 'PARSE_ERROR', 'Invalid JSON message');
    return;
  }

  if (!message.type || typeof message.type !== 'string') {
    sendErrorToClient(client, 'INVALID_MESSAGE', 'Message type is required');
    return;
  }

  switch (message.type) {
    case 'subscribe':
      handleSubscribe(client, message.payload as SubscribePayload);
      break;
    case 'unsubscribe':
      handleUnsubscribe(client, message.payload as UnsubscribePayload);
      break;
    case 'ping':
      handlePing(client);
      break;
    default:
      sendErrorToClient(client, 'UNKNOWN_TYPE', `Unknown message type: ${message.type}`);
  }
}

// ============================================
// Broadcast Functions (for event bridge to use)
// ============================================

/**
 * Get all connected clients as an array
 */
function getClientsArray(): ConnectedClient[] {
  return Array.from(clients.values());
}

/**
 * Broadcast task progress event to subscribed clients
 */
export function broadcastTaskProgress(taskId: string, plan: ImplementationPlan): void {
  const payload: TaskProgressPayload = { taskId, plan };
  const message = createMessage('task-progress', payload);

  for (const client of getClientsArray()) {
    if (isSubscribedToTask(client, taskId) && isSubscribedToEvent(client, 'task-progress')) {
      sendToClient(client, message);
    }
  }
}

/**
 * Broadcast task status change event to subscribed clients
 */
export function broadcastTaskStatusChange(
  taskId: string,
  status: TaskStatus,
  previousStatus?: TaskStatus
): void {
  const payload: TaskStatusChangePayload = { taskId, status, previousStatus };
  const message = createMessage('task-status-change', payload);

  for (const client of getClientsArray()) {
    if (isSubscribedToTask(client, taskId) && isSubscribedToEvent(client, 'task-status-change')) {
      sendToClient(client, message);
    }
  }
}

/**
 * Broadcast task log event to subscribed clients
 */
export function broadcastTaskLog(taskId: string, log: string): void {
  const payload: TaskLogPayload = {
    taskId,
    log,
    timestamp: new Date().toISOString(),
  };
  const message = createMessage('task-log', payload);

  for (const client of getClientsArray()) {
    if (isSubscribedToTask(client, taskId) && isSubscribedToEvent(client, 'task-log')) {
      sendToClient(client, message);
    }
  }
}

/**
 * Broadcast task error event to subscribed clients
 */
export function broadcastTaskError(taskId: string, error: string): void {
  const payload: TaskErrorPayload = {
    taskId,
    error,
    timestamp: new Date().toISOString(),
  };
  const message = createMessage('task-error', payload);

  for (const client of getClientsArray()) {
    if (isSubscribedToTask(client, taskId) && isSubscribedToEvent(client, 'task-error')) {
      sendToClient(client, message);
    }
  }
}

/**
 * Broadcast task execution progress event to subscribed clients
 */
export function broadcastTaskExecutionProgress(
  taskId: string,
  progress: ExecutionProgress
): void {
  const payload: TaskExecutionProgressPayload = { taskId, progress };
  const message = createMessage('task-execution-progress', payload);

  for (const client of getClientsArray()) {
    if (isSubscribedToTask(client, taskId) && isSubscribedToEvent(client, 'task-execution-progress')) {
      sendToClient(client, message);
    }
  }
}

/**
 * Broadcast a message to all clients subscribed to a specific project
 */
export function broadcastToProject(
  projectId: string,
  type: WebSocketMessageType,
  payload: unknown
): void {
  const message = createMessage(type, payload);

  for (const client of getClientsArray()) {
    if (isSubscribedToProject(client, projectId) && isSubscribedToEvent(client, type)) {
      sendToClient(client, message);
    }
  }
}

/**
 * Close all WebSocket connections (for graceful shutdown)
 */
export function closeAllConnections(): void {
  for (const client of getClientsArray()) {
    try {
      client.socket.close(1001, 'Server shutting down');
    } catch {
      // Ignore errors during shutdown
    }
  }
  clients.clear();
}

// ============================================
// WebSocket Route Registration
// ============================================

/**
 * WebSocket route options type with websocket property
 */
interface WebSocketRouteOptions {
  websocket: true;
  preValidation: typeof authenticateWebSocket[];
  schema: {
    tags: string[];
    summary: string;
    description: string;
    querystring: {
      type: string;
      properties: {
        api_key: {
          type: string;
          description: string;
        };
      };
    };
    response: {
      101: {
        description: string;
        type: string;
      };
      401: {
        description: string;
        type: string;
        properties: {
          error: { type: string };
          message: { type: string };
          statusCode: { type: string };
        };
      };
    };
  };
}

/**
 * Register WebSocket route on Fastify instance
 *
 * @param fastify - Fastify instance with WebSocket plugin registered
 */
export function registerWebSocketRoute(fastify: FastifyInstance): void {
  const routeOptions: WebSocketRouteOptions = {
    websocket: true,
    preValidation: [authenticateWebSocket],
    schema: {
      tags: ['WebSocket'],
      summary: 'WebSocket connection for real-time events',
      description:
        'Establishes a WebSocket connection for receiving real-time task progress, ' +
        'status changes, logs, and error events. Authenticate via x-api-key header ' +
        'or api_key query parameter.',
      querystring: {
        type: 'object',
        properties: {
          api_key: {
            type: 'string',
            description: 'API key for authentication (alternative to x-api-key header)',
          },
        },
      },
      response: {
        101: {
          description: 'WebSocket connection established',
          type: 'null',
        },
        401: {
          description: 'Authentication failed',
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            statusCode: { type: 'number' },
          },
        },
      },
    },
  };

  // WebSocket handler function
  const wsHandler = (socket: WebSocket, request: FastifyRequest): void => {
    const clientId = generateClientId();

    // Create client entry
    const client: ConnectedClient = {
      socket,
      clientId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      subscription: {
        taskIds: new Set(),
        projectIds: new Set(),
        eventTypes: new Set(),
      },
    };

    // Store client
    clients.set(clientId, client);

    request.log.info({ clientId }, 'WebSocket client connected');

    // Handle incoming messages
    socket.on('message', (data: Buffer) => {
      try {
        const message = data.toString('utf-8');
        processClientMessage(client, message);
      } catch (error) {
        request.log.error({ clientId, error }, 'Error processing WebSocket message');
        sendErrorToClient(client, 'INTERNAL_ERROR', 'Failed to process message');
      }
    });

    // Handle connection close
    socket.on('close', (code: number, reason: Buffer) => {
      clients.delete(clientId);
      request.log.info(
        { clientId, code, reason: reason.toString('utf-8') },
        'WebSocket client disconnected'
      );
    });

    // Handle connection errors
    socket.on('error', (error: Error) => {
      request.log.error({ clientId, error: error.message }, 'WebSocket error');
      clients.delete(clientId);
    });

    // Send welcome message with client ID
    sendToClient(client, createMessage('pong', { clientId, message: 'Connected successfully' }));
  };

  // Register the WebSocket route at /ws
  // Use type assertion as @fastify/websocket extends route options with 'websocket' property
  // and changes the handler signature from (request, reply) to (socket, request)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (fastify.get as any)('/ws', routeOptions, wsHandler);
}

/**
 * Check if WebSocket module is ready for connections
 */
export function isWebSocketReady(): boolean {
  return true; // Always ready once registered
}
