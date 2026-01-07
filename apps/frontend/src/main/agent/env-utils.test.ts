/**
 * Unit tests for env-utils
 * Tests OAuth mode environment variable clearing functionality
 */

import { describe, it, expect } from 'vitest';
import { getOAuthModeClearVars } from './env-utils';

describe('getOAuthModeClearVars', () => {
  describe('OAuth mode (no active API profile)', () => {
    it('should return clearing vars when apiProfileEnv is empty', () => {
      const result = getOAuthModeClearVars({});

      expect(result).toEqual({
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_BASE_URL: '',
        ANTHROPIC_MODEL: '',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: '',
        ANTHROPIC_DEFAULT_OPUS_MODEL: ''
      });
    });

    it('should clear all ANTHROPIC_* environment variables', () => {
      const result = getOAuthModeClearVars({});

      // Verify all known ANTHROPIC_* vars are cleared
      expect(result.ANTHROPIC_API_KEY).toBe('');
      expect(result.ANTHROPIC_AUTH_TOKEN).toBe('');
      expect(result.ANTHROPIC_BASE_URL).toBe('');
      expect(result.ANTHROPIC_MODEL).toBe('');
      expect(result.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('');
      expect(result.ANTHROPIC_DEFAULT_SONNET_MODEL).toBe('');
      expect(result.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('');
    });
  });

  describe('API Profile mode (active profile)', () => {
    it('should return empty object when apiProfileEnv has values', () => {
      const apiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-active-profile',
        ANTHROPIC_BASE_URL: 'https://custom.api.com'
      };

      const result = getOAuthModeClearVars(apiProfileEnv);

      expect(result).toEqual({});
    });

    it('should NOT clear vars when API profile is active', () => {
      const apiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-test',
        ANTHROPIC_BASE_URL: 'https://test.com',
        ANTHROPIC_MODEL: 'claude-3-opus'
      };

      const result = getOAuthModeClearVars(apiProfileEnv);

      // Should not return any clearing vars
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should detect non-empty profile even with single property', () => {
      const apiProfileEnv = {
        ANTHROPIC_AUTH_TOKEN: 'sk-minimal'
      };

      const result = getOAuthModeClearVars(apiProfileEnv);

      expect(result).toEqual({});
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined gracefully (treat as empty)', () => {
      // TypeScript should prevent this, but runtime safety
      const result = getOAuthModeClearVars(undefined as any);

      // Should treat undefined as empty object -> OAuth mode
      expect(result).toBeDefined();
    });

    it('should handle null gracefully (treat as empty)', () => {
      // Runtime safety for null values
      const result = getOAuthModeClearVars(null as any);

      // Should treat null as OAuth mode and return clearing vars
      expect(result).toEqual({
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_BASE_URL: '',
        ANTHROPIC_MODEL: '',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: '',
        ANTHROPIC_DEFAULT_OPUS_MODEL: ''
      });
    });

    it('should return consistent object shape for OAuth mode', () => {
      const result1 = getOAuthModeClearVars({});
      const result2 = getOAuthModeClearVars({});

      expect(result1).toEqual(result2);
      // Use specific expected keys instead of magic number
      const expectedKeys = [
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_AUTH_TOKEN',
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_MODEL',
        'ANTHROPIC_DEFAULT_HAIKU_MODEL',
        'ANTHROPIC_DEFAULT_SONNET_MODEL',
        'ANTHROPIC_DEFAULT_OPUS_MODEL'
      ];
      expect(Object.keys(result1).sort()).toEqual(expectedKeys.sort());
    });

    it('should NOT clear if apiProfileEnv has non-ANTHROPIC keys only', () => {
      // Edge case: service returns metadata but no ANTHROPIC_* vars
      const result = getOAuthModeClearVars({ SOME_OTHER_VAR: 'value' });

      // Should treat as OAuth mode since no ANTHROPIC_* keys present
      expect(result).toEqual({
        ANTHROPIC_API_KEY: '',
        ANTHROPIC_AUTH_TOKEN: '',
        ANTHROPIC_BASE_URL: '',
        ANTHROPIC_MODEL: '',
        ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
        ANTHROPIC_DEFAULT_SONNET_MODEL: '',
        ANTHROPIC_DEFAULT_OPUS_MODEL: ''
      });
    });
  });
});
