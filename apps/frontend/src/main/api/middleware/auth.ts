/**
 * API Key Authentication Middleware
 *
 * Provides authentication for the REST API using API keys.
 * Keys are loaded from the API_KEY environment variable (comma-separated for multiple keys).
 *
 * Features:
 * - Support for multiple API keys (for zero-downtime key rotation)
 * - Validation via x-api-key header
 * - Optional query parameter support for WebSocket connections (?api_key=)
 * - Secure by default: throws startup error if API_KEY not set
 */

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { ApiKeyValidation, ApiErrorResponse } from '../types';

/**
 * Configuration for API key authentication
 */
export interface AuthConfig {
  /** Set of valid API keys */
  validKeys: Set<string>;
  /** Whether to allow authentication via query parameter (for WebSocket) */
  allowQueryParam: boolean;
  /** Name of the header to check for API key */
  headerName: string;
  /** Name of the query parameter to check for API key */
  queryParamName: string;
}

/**
 * Default authentication configuration
 */
const defaultAuthConfig: AuthConfig = {
  validKeys: new Set<string>(),
  headerName: 'x-api-key',
  queryParamName: 'api_key',
  allowQueryParam: true,
};

/**
 * Loaded authentication configuration
 * Initialized by loadApiKeys() on startup
 */
let authConfig: AuthConfig = { ...defaultAuthConfig };

/**
 * Track whether API keys have been loaded
 */
let keysLoaded = false;

/**
 * Load API keys from environment variable
 *
 * This function should be called during server startup.
 * It reads the API_KEY environment variable and parses comma-separated keys.
 *
 * @throws Error if API_KEY environment variable is not set or empty
 */
export function loadApiKeys(): void {
  const apiKeyEnv = process.env.API_KEY;

  if (!apiKeyEnv || apiKeyEnv.trim() === '') {
    throw new Error(
      'API_KEY environment variable must be set. ' +
      'Set one or more API keys (comma-separated for multiple keys). ' +
      'Example: API_KEY=your-secure-key-here'
    );
  }

  // Parse comma-separated keys, trim whitespace, filter empty strings
  const keys = apiKeyEnv
    .split(',')
    .map(key => key.trim())
    .filter(key => key.length > 0);

  if (keys.length === 0) {
    throw new Error(
      'API_KEY environment variable contains no valid keys. ' +
      'Provide at least one non-empty API key.'
    );
  }

  authConfig = {
    ...defaultAuthConfig,
    validKeys: new Set(keys),
  };

  keysLoaded = true;
}

/**
 * Check if API keys have been loaded
 */
export function areKeysLoaded(): boolean {
  return keysLoaded;
}

/**
 * Get the number of configured API keys
 * (useful for diagnostics, but does not expose the actual keys)
 */
export function getKeyCount(): number {
  return authConfig.validKeys.size;
}

/**
 * Validate an API key
 *
 * @param apiKey - The API key to validate
 * @returns Validation result with valid flag
 */
export function validateApiKey(apiKey: string | undefined | null): ApiKeyValidation {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false };
  }

  if (!keysLoaded) {
    // Keys not loaded - fail closed (reject)
    return { valid: false };
  }

  const isValid = authConfig.validKeys.has(apiKey);

  return {
    valid: isValid,
    // Note: We don't include keyId to avoid leaking information
  };
}

/**
 * Extract API key from request
 *
 * Checks the x-api-key header first, then falls back to query parameter
 * if allowQueryParam is enabled (for WebSocket connections).
 *
 * @param request - Fastify request object
 * @returns The API key if found, undefined otherwise
 */
export function extractApiKey(request: FastifyRequest): string | undefined {
  // Check header first (preferred method)
  const headerKey = request.headers[authConfig.headerName];
  if (headerKey && typeof headerKey === 'string') {
    return headerKey;
  }

  // Fall back to query parameter if allowed (for WebSocket)
  if (authConfig.allowQueryParam) {
    const query = request.query as Record<string, unknown>;
    const queryKey = query[authConfig.queryParamName];
    if (queryKey && typeof queryKey === 'string') {
      return queryKey;
    }
  }

  return undefined;
}

/**
 * Create a 401 Unauthorized error response
 */
function createUnauthorizedResponse(message: string): ApiErrorResponse {
  return {
    error: 'Unauthorized',
    message,
    statusCode: 401,
  };
}

/**
 * API Key authentication middleware for protected routes
 *
 * Use as a preHandler hook on routes that require authentication:
 *
 * @example
 * fastify.route({
 *   method: 'GET',
 *   url: '/api/tasks',
 *   preHandler: [authenticateApiKey],
 *   handler: async (request, reply) => { ... }
 * })
 */
export const authenticateApiKey: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    const response = createUnauthorizedResponse(
      'API key is required. Provide it via the x-api-key header.'
    );
    reply.code(401).send(response);
    return;
  }

  const validation = validateApiKey(apiKey);

  if (!validation.valid) {
    const response = createUnauthorizedResponse(
      'Invalid API key. Please check your credentials.'
    );
    reply.code(401).send(response);
    return;
  }

  // Authentication successful - continue to route handler
};

/**
 * Create a Fastify preValidation hook for WebSocket routes
 *
 * Similar to authenticateApiKey but designed for WebSocket preValidation.
 * Supports both header and query parameter authentication.
 *
 * @example
 * fastify.get('/ws', {
 *   websocket: true,
 *   preValidation: [authenticateWebSocket],
 * }, (socket, request) => { ... })
 */
export const authenticateWebSocket: preHandlerHookHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> => {
  const apiKey = extractApiKey(request);

  if (!apiKey) {
    // For WebSocket, also check for API key in query param
    // This is the primary method for browser WebSocket connections
    const response = createUnauthorizedResponse(
      'API key is required. Provide it via x-api-key header or api_key query parameter.'
    );
    reply.code(401).send(response);
    return;
  }

  const validation = validateApiKey(apiKey);

  if (!validation.valid) {
    const response = createUnauthorizedResponse(
      'Invalid API key. Please check your credentials.'
    );
    reply.code(401).send(response);
    return;
  }

  // Authentication successful - continue to WebSocket handler
};

/**
 * Reset authentication state (for testing purposes only)
 *
 * This function should only be used in test environments.
 * It resets the auth configuration to defaults.
 */
export function resetAuthState(): void {
  authConfig = { ...defaultAuthConfig };
  keysLoaded = false;
}

/**
 * Configure auth with custom keys (for testing purposes only)
 *
 * This function allows setting API keys programmatically for tests.
 * In production, always use loadApiKeys() to load from environment.
 *
 * @param keys - Array of valid API keys
 */
export function setApiKeysForTesting(keys: string[]): void {
  authConfig = {
    ...defaultAuthConfig,
    validKeys: new Set(keys),
  };
  keysLoaded = true;
}
