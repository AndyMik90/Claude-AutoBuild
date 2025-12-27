/**
 * Main Fastify Server for AutoClaude Remote API
 *
 * Initializes and configures the Fastify HTTP server with:
 * - OpenAPI/Swagger documentation via @fastify/swagger
 * - Interactive Swagger UI at /documentation
 * - WebSocket support via @fastify/websocket
 * - API key authentication middleware
 *
 * Plugin Registration Order (critical):
 * 1. CORS (first, before any routes)
 * 2. Swagger (before routes for OpenAPI generation)
 * 3. Swagger UI
 * 4. WebSocket
 * 5. Routes (registered last before listen)
 */

import Fastify, { FastifyInstance, FastifyServerOptions, FastifyError } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';

import { loadApiKeys } from './middleware/auth';
import { apiKeySecurityScheme } from './schemas';

/**
 * API Server configuration options
 */
export interface ApiServerConfig {
  /** Server port (default: 3001 or API_PORT env var) */
  port: number;
  /** Server host (default: '0.0.0.0' or API_HOST env var) */
  host: string;
  /** Enable request logging (default: true) */
  logger: boolean;
  /** Application version for OpenAPI info */
  version: string;
  /** CORS origins (default: ['*'] or API_CORS_ORIGINS env var) */
  corsOrigins: string[];
}

/**
 * Parse CORS origins from environment variable
 */
function parseCorsOrigins(): string[] {
  const envOrigins = process.env.API_CORS_ORIGINS;
  if (!envOrigins) {
    return ['*']; // Allow all origins by default (configurable)
  }
  return envOrigins
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

/**
 * Default server configuration
 */
const defaultConfig: ApiServerConfig = {
  port: parseInt(process.env.API_PORT || '3001', 10),
  host: process.env.API_HOST || '0.0.0.0',
  logger: true,
  version: '1.0.0',
  corsOrigins: parseCorsOrigins(),
};

/**
 * Track the running server instance
 */
let serverInstance: FastifyInstance | null = null;

/**
 * Track server start time for uptime calculation
 */
let serverStartTime: Date | null = null;

/**
 * Get the server start time (for health checks)
 */
export function getServerStartTime(): Date | null {
  return serverStartTime;
}

/**
 * Get the current server instance (if running)
 */
export function getServerInstance(): FastifyInstance | null {
  return serverInstance;
}

/**
 * Create and configure a new Fastify server instance
 *
 * This function creates the server but does NOT start it.
 * Use startApiServer() to start listening for connections.
 *
 * @param config - Server configuration options
 * @returns Configured Fastify instance
 */
export async function createApiServer(
  config: Partial<ApiServerConfig> = {}
): Promise<FastifyInstance> {
  const mergedConfig: ApiServerConfig = { ...defaultConfig, ...config };

  // Load API keys from environment (throws if not set)
  loadApiKeys();

  // Create Fastify instance with logger
  const fastifyOptions: FastifyServerOptions = {
    logger: mergedConfig.logger
      ? {
          level: 'info',
          // Sanitize API keys from logs
          serializers: {
            req(request) {
              return {
                method: request.method,
                url: request.url,
                hostname: request.hostname,
                remoteAddress: request.ip,
                // Explicitly exclude headers to prevent API key logging
              };
            },
          },
        }
      : false,
  };

  const fastify = Fastify(fastifyOptions);

  // ============================================
  // Register CORS Plugin (FIRST, before any routes)
  // ============================================

  await fastify.register(fastifyCors, {
    // Allow all origins if '*' is in the list, otherwise use specific origins
    origin: mergedConfig.corsOrigins.includes('*') ? true : mergedConfig.corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
    credentials: true,
    // Preflight cache for 24 hours
    maxAge: 86400,
  });

  // ============================================
  // Register Swagger Plugin (BEFORE routes)
  // ============================================

  await fastify.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'AutoClaude Remote API',
        description:
          'HTTP API for remote control of AutoClaude task automation. ' +
          'Enables mobile companion apps and external tools to manage projects, ' +
          'tasks, and monitor real-time progress.',
        version: mergedConfig.version,
        contact: {
          name: 'AutoClaude Team',
          url: 'https://github.com/AndyMik90/Auto-Claude',
        },
        license: {
          name: 'AGPL-3.0',
          url: 'https://www.gnu.org/licenses/agpl-3.0.html',
        },
      },
      servers: [
        {
          url: `http://localhost:${mergedConfig.port}`,
          description: 'Local development server',
        },
      ],
      tags: [
        {
          name: 'Tasks',
          description: 'Task management operations (create, list, start, stop, review)',
        },
        {
          name: 'Projects',
          description: 'Project management operations (list, add, remove, settings)',
        },
        {
          name: 'Monitoring',
          description: 'Health checks and system status endpoints',
        },
        {
          name: 'WebSocket',
          description: 'Real-time task progress via WebSocket connection',
        },
      ],
      components: {
        securitySchemes: {
          apiKey: apiKeySecurityScheme,
        },
      },
      // Apply API key security to all endpoints by default
      security: [{ apiKey: [] }],
    },
  });

  // ============================================
  // Register Swagger UI Plugin
  // ============================================

  await fastify.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      syntaxHighlight: {
        theme: 'monokai',
      },
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    // Make documentation publicly accessible (no auth required)
    transformSpecification: (swaggerObject) => {
      return swaggerObject;
    },
  });

  // ============================================
  // Register WebSocket Plugin
  // ============================================

  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB max message size
    },
  });

  // ============================================
  // Add error handlers
  // ============================================

  // Global error handler
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;

    // Log errors (but not 4xx client errors at error level)
    if (statusCode >= 500) {
      request.log.error(error);
    } else {
      request.log.warn(error);
    }

    reply.status(statusCode).send({
      error: error.name ?? 'InternalServerError',
      message: error.message ?? 'An unexpected error occurred',
      statusCode,
    });
  });

  // Not found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'NotFound',
      message: `Route ${request.method} ${request.url} not found`,
      statusCode: 404,
    });
  });

  // ============================================
  // Add lifecycle hooks
  // ============================================

  // Log when server is ready
  fastify.addHook('onReady', async () => {
    if (mergedConfig.logger) {
      fastify.log.info('API server plugins registered and ready');
    }
  });

  // Cleanup on close
  fastify.addHook('onClose', async () => {
    if (mergedConfig.logger) {
      fastify.log.info('API server shutting down');
    }
    serverInstance = null;
    serverStartTime = null;
  });

  return fastify;
}

/**
 * Start the API server and begin listening for connections
 *
 * @param fastify - Configured Fastify instance from createApiServer()
 * @param config - Optional config overrides for port/host
 * @returns The address the server is listening on
 */
export async function startApiServer(
  fastify: FastifyInstance,
  config: Partial<Pick<ApiServerConfig, 'port' | 'host'>> = {}
): Promise<string> {
  const port = config.port ?? parseInt(process.env.API_PORT || '3001', 10);
  const host = config.host ?? process.env.API_HOST ?? '0.0.0.0';

  // Start listening
  const address = await fastify.listen({ port, host });

  // Track the running instance
  serverInstance = fastify;
  serverStartTime = new Date();

  fastify.log.info(`AutoClaude API server listening on ${address}`);
  fastify.log.info(`Swagger UI available at ${address}/documentation`);

  return address;
}

/**
 * Stop the running API server gracefully
 *
 * @param fastify - The Fastify instance to stop (defaults to current instance)
 */
export async function stopApiServer(
  fastify?: FastifyInstance
): Promise<void> {
  const instance = fastify ?? serverInstance;

  if (instance) {
    await instance.close();
    serverInstance = null;
    serverStartTime = null;
  }
}

/**
 * Create and start the API server in one call
 *
 * Convenience function that combines createApiServer() and startApiServer().
 *
 * @param config - Server configuration options
 * @returns The Fastify instance and address
 */
export async function createAndStartApiServer(
  config: Partial<ApiServerConfig> = {}
): Promise<{ fastify: FastifyInstance; address: string }> {
  const fastify = await createApiServer(config);
  const address = await startApiServer(fastify, config);

  return { fastify, address };
}

/**
 * Check if the API server is currently running
 */
export function isServerRunning(): boolean {
  return serverInstance !== null;
}

/**
 * Get server uptime in seconds
 */
export function getServerUptime(): number {
  if (!serverStartTime) {
    return 0;
  }

  return Math.floor((Date.now() - serverStartTime.getTime()) / 1000);
}
