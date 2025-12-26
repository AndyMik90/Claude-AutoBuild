/**
 * API Server Startup Module
 *
 * Provides functions to initialize and shutdown the API server as part
 * of the Electron main process lifecycle. The API server is OPTIONAL -
 * it only starts if the API_KEY environment variable is set.
 *
 * This module handles:
 * - Server creation and configuration
 * - Route registration
 * - Event bridge initialization (for real-time WebSocket updates)
 * - Graceful startup with error handling (non-fatal to main app)
 * - Graceful shutdown with resource cleanup
 *
 * Based on patterns from:
 * - apps/frontend/src/main/index.ts (Electron main process lifecycle)
 */

import type { FastifyInstance } from 'fastify';
import type { AgentManager } from '../agent';
import type { FileWatcher } from '../file-watcher';
import {
  createApiServer,
  startApiServer,
  stopApiServer,
  isServerRunning,
  getServerUptime,
  getServerInstance,
} from './server';
import { registerRoutes } from './routes';
import {
  initializeEventBridge,
  shutdownEventBridge,
  isEventBridgeActive,
  getEventBridgeStats,
} from './event-bridge';
import { closeAllConnections, getClientCount } from './websocket';
import { areKeysLoaded } from './middleware/auth';

// ============================================
// Types
// ============================================

/**
 * Configuration options for API server startup
 */
export interface ApiStartupOptions {
  /** Server port (default: 3001 or API_PORT env var) */
  port?: number;
  /** Server host (default: '0.0.0.0' or API_HOST env var) */
  host?: string;
  /** Enable verbose logging (default: false) */
  debug?: boolean;
  /** Application version for OpenAPI info */
  version?: string;
}

/**
 * Result of API server initialization
 */
export interface ApiStartupResult {
  /** Whether the server started successfully */
  success: boolean;
  /** The address the server is listening on (if successful) */
  address?: string;
  /** Error message (if failed) */
  error?: string;
  /** Whether the API server was skipped (no API_KEY set) */
  skipped?: boolean;
  /** Reason for skipping (if skipped) */
  skipReason?: string;
}

/**
 * API server shutdown result
 */
export interface ApiShutdownResult {
  /** Whether shutdown completed successfully */
  success: boolean;
  /** Error message (if any errors occurred during shutdown) */
  error?: string;
  /** Number of WebSocket clients disconnected */
  clientsDisconnected: number;
  /** Number of events bridged before shutdown */
  eventsBridged: number;
  /** Server uptime before shutdown (in seconds) */
  uptimeSeconds: number;
}

/**
 * API server status information
 */
export interface ApiServerStatus {
  /** Whether the server is running */
  running: boolean;
  /** Whether the event bridge is active */
  eventBridgeActive: boolean;
  /** Number of connected WebSocket clients */
  connectedClients: number;
  /** Server uptime in seconds */
  uptimeSeconds: number;
  /** Number of events bridged */
  eventsBridged: number;
}

// ============================================
// Module State
// ============================================

/**
 * Track references to AgentManager and FileWatcher for event bridge
 */
let agentManagerRef: AgentManager | null = null;
let fileWatcherRef: FileWatcher | null = null;

/**
 * Track the Fastify instance
 */
let fastifyInstance: FastifyInstance | null = null;

/**
 * Track whether initialization has been attempted
 */
let initializationAttempted = false;

// ============================================
// Public API
// ============================================

/**
 * Initialize and start the API server
 *
 * This function is designed to be called from the Electron main process
 * after IPC handlers are set up. It handles all aspects of API server
 * startup including:
 * - Creating and configuring the Fastify server
 * - Registering all routes
 * - Starting the server
 * - Initializing the event bridge for real-time updates
 *
 * The API server is OPTIONAL and will be SKIPPED if:
 * - API_KEY environment variable is not set
 *
 * All errors are caught and returned in the result object - this function
 * will NOT throw exceptions or crash the main Electron process.
 *
 * @param agentManager - The AgentManager instance for event bridging
 * @param fileWatcher - The FileWatcher instance for event bridging
 * @param options - Optional configuration overrides
 * @returns Result object indicating success/failure
 */
export async function initializeApiServer(
  agentManager: AgentManager,
  fileWatcher: FileWatcher,
  options: ApiStartupOptions = {}
): Promise<ApiStartupResult> {
  // Prevent double initialization
  if (initializationAttempted && isServerRunning()) {
    return {
      success: true,
      address: getServerInstance()?.server?.address()?.toString(),
      skipped: false,
    };
  }

  initializationAttempted = true;

  // Check if API_KEY is set - API server is optional
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    const skipReason = 'API_KEY environment variable not set - API server disabled';
    if (options.debug) {
      process.stdout.write(`[API Startup] ${skipReason}\n`);
    }
    return {
      success: true,
      skipped: true,
      skipReason,
    };
  }

  try {
    if (options.debug) {
      process.stdout.write('[API Startup] Starting API server initialization\n');
    }

    // Store references for event bridge
    agentManagerRef = agentManager;
    fileWatcherRef = fileWatcher;

    // Create the Fastify server
    if (options.debug) {
      process.stdout.write('[API Startup] Creating Fastify server\n');
    }

    fastifyInstance = await createApiServer({
      port: options.port,
      host: options.host,
      version: options.version,
      logger: true,
    });

    // Register all routes
    if (options.debug) {
      process.stdout.write('[API Startup] Registering routes\n');
    }

    await registerRoutes(fastifyInstance);

    // Start the server
    if (options.debug) {
      process.stdout.write('[API Startup] Starting server\n');
    }

    const address = await startApiServer(fastifyInstance, {
      port: options.port,
      host: options.host,
    });

    // Initialize event bridge for real-time updates
    if (options.debug) {
      process.stdout.write('[API Startup] Initializing event bridge\n');
    }

    initializeEventBridge(agentManager, fileWatcher, {
      debug: options.debug,
    });

    if (options.debug) {
      process.stdout.write(`[API Startup] API server started successfully at ${address}\n`);
    }

    return {
      success: true,
      address,
      skipped: false,
    };
  } catch (error) {
    // Handle startup errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Log the error
    process.stderr.write(`[API Startup] Failed to start API server: ${errorMessage}\n`);

    // Clean up any partial initialization
    try {
      if (fastifyInstance) {
        await fastifyInstance.close();
        fastifyInstance = null;
      }
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: false,
      error: errorMessage,
      skipped: false,
    };
  }
}

/**
 * Shutdown the API server gracefully
 *
 * This function handles all cleanup required when shutting down:
 * - Closes all WebSocket connections
 * - Shuts down the event bridge
 * - Stops the Fastify server
 *
 * This function is designed to be called from the Electron 'before-quit'
 * handler. All errors are caught and logged - this function will NOT
 * throw exceptions.
 *
 * @returns Result object with shutdown statistics
 */
export async function shutdownApiServer(): Promise<ApiShutdownResult> {
  const result: ApiShutdownResult = {
    success: true,
    clientsDisconnected: 0,
    eventsBridged: 0,
    uptimeSeconds: 0,
  };

  try {
    // Check if server is running
    if (!isServerRunning()) {
      return result;
    }

    // Capture stats before shutdown
    result.uptimeSeconds = getServerUptime();
    result.clientsDisconnected = getClientCount();

    const eventBridgeStats = getEventBridgeStats();
    result.eventsBridged = eventBridgeStats.eventCount;

    // Close all WebSocket connections
    try {
      closeAllConnections();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[API Shutdown] Error closing WebSocket connections: ${errorMessage}\n`);
    }

    // Shutdown event bridge
    try {
      shutdownEventBridge();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[API Shutdown] Error shutting down event bridge: ${errorMessage}\n`);
    }

    // Stop the server
    try {
      await stopApiServer(fastifyInstance ?? undefined);
      fastifyInstance = null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[API Shutdown] Error stopping server: ${errorMessage}\n`);
      result.success = false;
      result.error = errorMessage;
    }

    // Clear references
    agentManagerRef = null;
    fileWatcherRef = null;
    initializationAttempted = false;

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[API Shutdown] Unexpected error: ${errorMessage}\n`);

    return {
      ...result,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Get the current status of the API server
 *
 * @returns Status information about the API server
 */
export function getApiServerStatus(): ApiServerStatus {
  const eventBridgeStats = getEventBridgeStats();

  return {
    running: isServerRunning(),
    eventBridgeActive: isEventBridgeActive(),
    connectedClients: getClientCount(),
    uptimeSeconds: getServerUptime(),
    eventsBridged: eventBridgeStats.eventCount,
  };
}

/**
 * Check if the API server is enabled
 *
 * Returns true if API_KEY is set and the server can be started.
 * This can be used to check before initialization whether the
 * API server will be started.
 */
export function isApiServerEnabled(): boolean {
  const apiKey = process.env.API_KEY;
  return !!(apiKey && apiKey.trim() !== '');
}

/**
 * Check if the API server is currently running
 */
export { isServerRunning as isApiServerRunning } from './server';

/**
 * Check if API keys have been loaded
 */
export function areApiKeysLoaded(): boolean {
  return areKeysLoaded();
}

/**
 * Get the Fastify instance (if running)
 *
 * This is useful for advanced scenarios where direct access
 * to the Fastify instance is needed.
 */
export function getApiServerInstance(): FastifyInstance | null {
  return fastifyInstance ?? getServerInstance();
}
