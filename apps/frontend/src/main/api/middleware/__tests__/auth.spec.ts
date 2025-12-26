/**
 * Unit tests for API Key Authentication Middleware
 * Tests all authentication functions and middleware handlers
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';

// Helper to call middleware with proper this context
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const callMiddleware = async (
  middleware: any,
  request: FastifyRequest,
  reply: FastifyReply,
  done: () => void
): Promise<void> => {
  await middleware.call(null as unknown as FastifyInstance, request, reply, done);
};

// Store original environment
const originalEnv = process.env;

describe('API Key Authentication Middleware', () => {
  beforeEach(() => {
    // Reset modules to get fresh state
    vi.resetModules();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('loadApiKeys', () => {
    it('should throw error when API_KEY environment variable is not set', async () => {
      delete process.env.API_KEY;
      const { loadApiKeys } = await import('../auth');

      expect(() => loadApiKeys()).toThrow('API_KEY environment variable must be set');
    });

    it('should throw error when API_KEY is empty string', async () => {
      process.env.API_KEY = '';
      const { loadApiKeys } = await import('../auth');

      expect(() => loadApiKeys()).toThrow('API_KEY environment variable must be set');
    });

    it('should throw error when API_KEY contains only whitespace', async () => {
      process.env.API_KEY = '   ';
      const { loadApiKeys } = await import('../auth');

      expect(() => loadApiKeys()).toThrow('API_KEY environment variable must be set');
    });

    it('should throw error when API_KEY contains only commas', async () => {
      process.env.API_KEY = ',,,';
      const { loadApiKeys } = await import('../auth');

      expect(() => loadApiKeys()).toThrow('no valid keys');
    });

    it('should load a single API key successfully', async () => {
      process.env.API_KEY = 'test-key-123';
      const { loadApiKeys, areKeysLoaded, getKeyCount } = await import('../auth');

      loadApiKeys();

      expect(areKeysLoaded()).toBe(true);
      expect(getKeyCount()).toBe(1);
    });

    it('should load multiple comma-separated API keys', async () => {
      process.env.API_KEY = 'key1,key2,key3';
      const { loadApiKeys, areKeysLoaded, getKeyCount } = await import('../auth');

      loadApiKeys();

      expect(areKeysLoaded()).toBe(true);
      expect(getKeyCount()).toBe(3);
    });

    it('should trim whitespace from API keys', async () => {
      process.env.API_KEY = '  key1  ,  key2  ';
      const { loadApiKeys, getKeyCount, validateApiKey } = await import('../auth');

      loadApiKeys();

      expect(getKeyCount()).toBe(2);
      expect(validateApiKey('key1').valid).toBe(true);
      expect(validateApiKey('key2').valid).toBe(true);
      // Keys with whitespace should not be valid
      expect(validateApiKey('  key1  ').valid).toBe(false);
    });

    it('should filter out empty strings between commas', async () => {
      process.env.API_KEY = 'key1,,key2,,,key3';
      const { loadApiKeys, getKeyCount } = await import('../auth');

      loadApiKeys();

      expect(getKeyCount()).toBe(3);
    });
  });

  describe('areKeysLoaded', () => {
    it('should return false when keys have not been loaded', async () => {
      const { areKeysLoaded } = await import('../auth');

      expect(areKeysLoaded()).toBe(false);
    });

    it('should return true after keys are loaded', async () => {
      process.env.API_KEY = 'test-key';
      const { loadApiKeys, areKeysLoaded } = await import('../auth');

      loadApiKeys();

      expect(areKeysLoaded()).toBe(true);
    });
  });

  describe('getKeyCount', () => {
    it('should return 0 when keys have not been loaded', async () => {
      const { getKeyCount } = await import('../auth');

      expect(getKeyCount()).toBe(0);
    });

    it('should return correct count after keys are loaded', async () => {
      process.env.API_KEY = 'key1,key2,key3,key4';
      const { loadApiKeys, getKeyCount } = await import('../auth');

      loadApiKeys();

      expect(getKeyCount()).toBe(4);
    });
  });

  describe('validateApiKey', () => {
    it('should return invalid for undefined key', async () => {
      process.env.API_KEY = 'valid-key';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();
      const result = validateApiKey(undefined);

      expect(result.valid).toBe(false);
    });

    it('should return invalid for null key', async () => {
      process.env.API_KEY = 'valid-key';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();
      const result = validateApiKey(null);

      expect(result.valid).toBe(false);
    });

    it('should return invalid for non-string key', async () => {
      process.env.API_KEY = 'valid-key';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();
      // @ts-expect-error - testing non-string input
      const result = validateApiKey(123);

      expect(result.valid).toBe(false);
    });

    it('should return invalid when keys have not been loaded', async () => {
      const { validateApiKey } = await import('../auth');

      const result = validateApiKey('any-key');

      expect(result.valid).toBe(false);
    });

    it('should return valid for a correct API key', async () => {
      process.env.API_KEY = 'valid-key-123';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();
      const result = validateApiKey('valid-key-123');

      expect(result.valid).toBe(true);
    });

    it('should return invalid for an incorrect API key', async () => {
      process.env.API_KEY = 'valid-key-123';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();
      const result = validateApiKey('wrong-key');

      expect(result.valid).toBe(false);
    });

    it('should validate any of multiple configured keys', async () => {
      process.env.API_KEY = 'key-alpha,key-beta,key-gamma';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();

      expect(validateApiKey('key-alpha').valid).toBe(true);
      expect(validateApiKey('key-beta').valid).toBe(true);
      expect(validateApiKey('key-gamma').valid).toBe(true);
      expect(validateApiKey('key-delta').valid).toBe(false);
    });
  });

  describe('extractApiKey', () => {
    it('should extract API key from x-api-key header', async () => {
      const { extractApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['test-key']);

      const mockRequest = {
        headers: { 'x-api-key': 'my-api-key' },
        query: {},
      } as unknown as FastifyRequest;

      const result = extractApiKey(mockRequest);

      expect(result).toBe('my-api-key');
    });

    it('should extract API key from query parameter when header not present', async () => {
      const { extractApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['test-key']);

      const mockRequest = {
        headers: {},
        query: { api_key: 'query-api-key' },
      } as unknown as FastifyRequest;

      const result = extractApiKey(mockRequest);

      expect(result).toBe('query-api-key');
    });

    it('should prefer header over query parameter', async () => {
      const { extractApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['test-key']);

      const mockRequest = {
        headers: { 'x-api-key': 'header-key' },
        query: { api_key: 'query-key' },
      } as unknown as FastifyRequest;

      const result = extractApiKey(mockRequest);

      expect(result).toBe('header-key');
    });

    it('should return undefined when no API key is provided', async () => {
      const { extractApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['test-key']);

      const mockRequest = {
        headers: {},
        query: {},
      } as unknown as FastifyRequest;

      const result = extractApiKey(mockRequest);

      expect(result).toBeUndefined();
    });

    it('should ignore non-string header values', async () => {
      const { extractApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['test-key']);

      const mockRequest = {
        headers: { 'x-api-key': ['array', 'value'] },
        query: { api_key: 'fallback-key' },
      } as unknown as FastifyRequest;

      const result = extractApiKey(mockRequest);

      expect(result).toBe('fallback-key');
    });

    it('should ignore non-string query parameter values', async () => {
      const { extractApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['test-key']);

      const mockRequest = {
        headers: {},
        query: { api_key: 123 },
      } as unknown as FastifyRequest;

      const result = extractApiKey(mockRequest);

      expect(result).toBeUndefined();
    });
  });

  describe('authenticateApiKey middleware', () => {
    let mockReply: FastifyReply;
    const mockDone = vi.fn();

    beforeEach(() => {
      mockReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      } as unknown as FastifyReply;
      mockDone.mockClear();
    });

    it('should return 401 when no API key is provided', async () => {
      const { authenticateApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['valid-key']);

      const mockRequest = {
        headers: {},
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateApiKey, mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          statusCode: 401,
          message: expect.stringContaining('API key is required'),
        })
      );
    });

    it('should return 401 for invalid API key', async () => {
      const { authenticateApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['valid-key']);

      const mockRequest = {
        headers: { 'x-api-key': 'invalid-key' },
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateApiKey, mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          statusCode: 401,
          message: expect.stringContaining('Invalid API key'),
        })
      );
    });

    it('should allow request with valid API key', async () => {
      const { authenticateApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['valid-key']);

      const mockRequest = {
        headers: { 'x-api-key': 'valid-key' },
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateApiKey, mockRequest, mockReply, mockDone);

      // Should not call reply.code or reply.send for successful auth
      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should work with multiple valid keys', async () => {
      const { authenticateApiKey, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['key-1', 'key-2', 'key-3']);

      const mockRequest = {
        headers: { 'x-api-key': 'key-2' },
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateApiKey, mockRequest, mockReply, mockDone);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });

  describe('authenticateWebSocket middleware', () => {
    let mockReply: FastifyReply;
    const mockDone = vi.fn();

    beforeEach(() => {
      mockReply = {
        code: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      } as unknown as FastifyReply;
      mockDone.mockClear();
    });

    it('should return 401 when no API key is provided', async () => {
      const { authenticateWebSocket, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['valid-key']);

      const mockRequest = {
        headers: {},
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateWebSocket, mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          statusCode: 401,
          message: expect.stringContaining('API key is required'),
        })
      );
    });

    it('should return 401 for invalid API key', async () => {
      const { authenticateWebSocket, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['valid-key']);

      const mockRequest = {
        headers: { 'x-api-key': 'invalid-key' },
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateWebSocket, mockRequest, mockReply, mockDone);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: expect.stringContaining('Invalid API key'),
        })
      );
    });

    it('should allow request with valid API key in header', async () => {
      const { authenticateWebSocket, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['valid-key']);

      const mockRequest = {
        headers: { 'x-api-key': 'valid-key' },
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateWebSocket, mockRequest, mockReply, mockDone);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should allow request with valid API key in query parameter', async () => {
      const { authenticateWebSocket, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['ws-key']);

      const mockRequest = {
        headers: {},
        query: { api_key: 'ws-key' },
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateWebSocket, mockRequest, mockReply, mockDone);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should provide WebSocket-specific error message', async () => {
      const { authenticateWebSocket, setApiKeysForTesting } = await import('../auth');

      setApiKeysForTesting(['valid-key']);

      const mockRequest = {
        headers: {},
        query: {},
      } as unknown as FastifyRequest;

      await callMiddleware(authenticateWebSocket, mockRequest, mockReply, mockDone);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('query parameter'),
        })
      );
    });
  });

  describe('resetAuthState', () => {
    it('should reset keys loaded flag to false', async () => {
      process.env.API_KEY = 'test-key';
      const { loadApiKeys, areKeysLoaded, resetAuthState } = await import('../auth');

      loadApiKeys();
      expect(areKeysLoaded()).toBe(true);

      resetAuthState();
      expect(areKeysLoaded()).toBe(false);
    });

    it('should reset key count to zero', async () => {
      process.env.API_KEY = 'test-key';
      const { loadApiKeys, getKeyCount, resetAuthState } = await import('../auth');

      loadApiKeys();
      expect(getKeyCount()).toBe(1);

      resetAuthState();
      expect(getKeyCount()).toBe(0);
    });
  });

  describe('setApiKeysForTesting', () => {
    it('should set valid API keys', async () => {
      const { setApiKeysForTesting, validateApiKey, areKeysLoaded, getKeyCount } = await import('../auth');

      setApiKeysForTesting(['test-key-1', 'test-key-2']);

      expect(areKeysLoaded()).toBe(true);
      expect(getKeyCount()).toBe(2);
      expect(validateApiKey('test-key-1').valid).toBe(true);
      expect(validateApiKey('test-key-2').valid).toBe(true);
    });

    it('should replace previously configured keys', async () => {
      const { setApiKeysForTesting, validateApiKey } = await import('../auth');

      setApiKeysForTesting(['old-key']);
      expect(validateApiKey('old-key').valid).toBe(true);

      setApiKeysForTesting(['new-key']);
      expect(validateApiKey('old-key').valid).toBe(false);
      expect(validateApiKey('new-key').valid).toBe(true);
    });

    it('should handle empty array', async () => {
      const { setApiKeysForTesting, getKeyCount, areKeysLoaded } = await import('../auth');

      setApiKeysForTesting([]);

      // Keys are still marked as loaded (even if empty)
      expect(areKeysLoaded()).toBe(true);
      expect(getKeyCount()).toBe(0);
    });
  });

  describe('security edge cases', () => {
    it('should not leak key information in validation result', async () => {
      process.env.API_KEY = 'secret-key-123';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();
      const validResult = validateApiKey('secret-key-123');
      const invalidResult = validateApiKey('wrong-key');

      // Valid result should only contain 'valid' flag
      expect(Object.keys(validResult)).toEqual(['valid']);
      expect(validResult).not.toHaveProperty('keyId');

      // Invalid result should only contain 'valid' flag
      expect(Object.keys(invalidResult)).toEqual(['valid']);
    });

    it('should reject empty string as API key', async () => {
      process.env.API_KEY = 'valid-key';
      const { loadApiKeys, validateApiKey } = await import('../auth');

      loadApiKeys();
      const result = validateApiKey('');

      expect(result.valid).toBe(false);
    });

    it('should fail closed when keys are not loaded', async () => {
      const { validateApiKey } = await import('../auth');

      // Without loading keys, any key should be rejected
      expect(validateApiKey('any-key').valid).toBe(false);
      expect(validateApiKey('valid-key').valid).toBe(false);
    });
  });
});
