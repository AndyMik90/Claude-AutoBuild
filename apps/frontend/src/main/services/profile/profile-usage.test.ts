/**
 * Tests for profile-usage.ts service
 * Tests provider detection, API fetching, and CLI usage parsing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectProvider,
  fetchZaiUsage,
  fetchAnthropicOAuthUsage,
  fetchUsageForProfile,
  ApiAuthError
} from './profile-usage';
import type { ClaudeUsageSnapshot } from '../../../shared/types/agent';

// Mock global fetch
global.fetch = vi.fn();

describe('profile-usage service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('detectProvider', () => {
    const zaiApiKey = 'zai-api-key';
    const oauthToken = 'sk-ant-oat01-test-token';
    const regularApiKey = 'sk-ant-api03-test-key';

    it('should detect Z.ai provider from api.z.ai URL', () => {
      expect(detectProvider('https://api.z.ai', zaiApiKey)).toBe('zai');
      expect(detectProvider('https://api.z.ai/v1', zaiApiKey)).toBe('zai');
      expect(detectProvider('http://api.z.ai', zaiApiKey)).toBe('zai');
    });

    it('should detect Z.ai provider from z.ai URL', () => {
      expect(detectProvider('https://z.ai', zaiApiKey)).toBe('zai');
      expect(detectProvider('https://z.ai/api', zaiApiKey)).toBe('zai');
    });

    it('should detect Anthropic OAuth provider from api.anthropic.com with OAuth token', () => {
      expect(detectProvider('https://api.anthropic.com', oauthToken)).toBe('anthropic-oauth');
      expect(detectProvider('https://api.anthropic.com/v1', oauthToken)).toBe('anthropic-oauth');
    });

    it('should return "other" for api.anthropic.com with regular API key', () => {
      expect(detectProvider('https://api.anthropic.com', regularApiKey)).toBe('other');
      expect(detectProvider('https://api.anthropic.com/v1', regularApiKey)).toBe('other');
    });

    it('should return "other" for unknown providers', () => {
      expect(detectProvider('https://api.example.com', regularApiKey)).toBe('other');
      expect(detectProvider('https://custom-api.com/v1', regularApiKey)).toBe('other');
      expect(detectProvider('https://api.openai.com', regularApiKey)).toBe('other');
    });

    it('should handle URLs with paths correctly', () => {
      expect(detectProvider('https://api.anthropic.com/v1/messages', oauthToken)).toBe('anthropic-oauth');
      expect(detectProvider('https://api.z.ai/api/monitor/usage/quota/limit', zaiApiKey)).toBe('zai');
    });

    it('should be case-insensitive for domain matching', () => {
      expect(detectProvider('https://API.Z.AI', zaiApiKey)).toBe('zai');
      expect(detectProvider('https://API.ANTHROPIC.COM', oauthToken)).toBe('anthropic-oauth');
    });

    it('should handle whitespace in URLs', () => {
      expect(detectProvider('  https://api.z.ai  ', zaiApiKey)).toBe('zai');
      expect(detectProvider('  https://api.anthropic.com  ', oauthToken)).toBe('anthropic-oauth');
    });
  });

  describe('fetchZaiUsage', () => {
    it('should fetch and parse Z.ai quota successfully', async () => {
      const mockResponse = {
        code: 200,
        msg: 'Operation successful',
        data: {
          limits: [
            {
              type: 'TIME_LIMIT',
              unit: 5,
              number: 1,
              usage: 1000,
              currentValue: 534,
              remaining: 466,
              percentage: 53,
              usageDetails: [
                { modelCode: 'search-prime', usage: 485 },
                { modelCode: 'web-reader', usage: 76 },
                { modelCode: 'zread', usage: 0 }
              ]
            },
            {
              type: 'TOKENS_LIMIT',
              unit: 3,
              number: 5,
              usage: 200000000,
              currentValue: 27128437,
              remaining: 172871563,
              percentage: 13,
              nextResetTime: 1768301417641
            }
          ]
        },
        success: true
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('zai');
      expect(result?.sessionPercent).toBe(13); // From TOKENS_LIMIT.percentage
      expect(result?.weeklyPercent).toBe(53); // From TIME_LIMIT.percentage
      expect(result?.profileName).toBe('Test Profile');
    });

    it('should handle missing TOKENS_LIMIT gracefully', async () => {
      const mockResponse = {
        code: 200,
        msg: 'Operation successful',
        data: {
          limits: [
            {
              type: 'TIME_LIMIT',
              unit: 5,
              number: 1,
              usage: 1000,
              currentValue: 650,
              remaining: 350,
              percentage: 65
            }
          ]
        },
        success: true
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result?.sessionPercent).toBe(0); // Default when TOKENS_LIMIT not found
      expect(result?.weeklyPercent).toBe(65); // From TIME_LIMIT
    });

    it('should handle missing TIME_LIMIT gracefully', async () => {
      const mockResponse = {
        code: 200,
        msg: 'Operation successful',
        data: {
          limits: [
            {
              type: 'TOKENS_LIMIT',
              unit: 3,
              number: 5,
              usage: 200000000,
              currentValue: 150000000,
              remaining: 50000000,
              percentage: 75
            }
          ]
        },
        success: true
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result?.sessionPercent).toBe(75); // From TOKENS_LIMIT
      expect(result?.weeklyPercent).toBe(0); // Default when TIME_LIMIT not found
    });

    it('should return null on API error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      const result = await fetchZaiUsage('invalid-key', 'test-profile', 'Test Profile');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result).toBeNull();
    });

    it('should return null and log error on AbortError (timeout)', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      (global.fetch as any).mockRejectedValue(abortError);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('[profile-usage] Z.ai fetch timed out');

      consoleSpy.mockRestore();
    });

    it('should set correct reset timestamp when nextResetTime is provided', async () => {
      const futureTimestamp = Date.now() + 5 * 60 * 60 * 1000; // 5 hours from now
      const mockResponse = {
        code: 200,
        msg: 'Operation successful',
        data: {
          limits: [
            {
              type: 'TOKENS_LIMIT',
              unit: 3,
              number: 5,
              usage: 200000000,
              currentValue: 100000000,
              remaining: 100000000,
              percentage: 50,
              nextResetTime: futureTimestamp
            }
          ]
        },
        success: true
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result?.sessionResetTimestamp).toBe(futureTimestamp);
    });
  });

  describe('fetchAnthropicOAuthUsage', () => {
    it('should fetch and parse Anthropic OAuth usage successfully', async () => {
      const mockResponse = {
        five_hour_utilization: 0.72,
        seven_day_utilization: 0.45,
        five_hour_reset_at: '2025-01-17T15:00:00Z',
        seven_day_reset_at: '2025-01-20T12:00:00Z'
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchAnthropicOAuthUsage('test-oauth-token', 'profile-1', 'My Profile');

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('anthropic-oauth');
      expect(result?.sessionPercent).toBe(72); // 0.72 * 100
      expect(result?.weeklyPercent).toBe(45); // 0.45 * 100
      expect(result?.profileId).toBe('profile-1');
      expect(result?.profileName).toBe('My Profile');
    });

    it('should handle missing utilization data gracefully', async () => {
      const mockResponse = {
        five_hour_utilization: 0.5
        // seven_day_utilization missing
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchAnthropicOAuthUsage('token', 'profile-1', 'Profile');

      expect(result?.sessionPercent).toBe(50);
      expect(result?.weeklyPercent).toBe(0);
    });

    it('should return null on API error', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Invalid token'
      });

      const result = await fetchAnthropicOAuthUsage('invalid-token', 'profile-1', 'Profile');

      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await fetchAnthropicOAuthUsage('token', 'profile-1', 'Profile');

      expect(result).toBeNull();
    });

    it('should set correct reset timestamps when provided', async () => {
      const mockResponse = {
        five_hour_utilization: 0.5,
        seven_day_utilization: 0.3,
        five_hour_reset_at: '2025-01-17T15:00:00Z',
        seven_day_reset_at: '2025-01-20T12:00:00Z'
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchAnthropicOAuthUsage('token', 'profile-1', 'Profile');

      expect(result?.sessionResetTimestamp).toBeDefined();
      expect(result?.weeklyResetTimestamp).toBeDefined();
      expect(typeof result?.sessionResetTimestamp).toBe('number');
      expect(typeof result?.weeklyResetTimestamp).toBe('number');
    });

    it('should determine limitType based on which is higher', async () => {
      const mockResponse = {
        five_hour_utilization: 0.4,
        seven_day_utilization: 0.8,
        five_hour_reset_at: '2025-01-17T15:00:00Z',
        seven_day_reset_at: '2025-01-20T12:00:00Z'
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchAnthropicOAuthUsage('token', 'profile-1', 'Profile');

      expect(result?.limitType).toBe('weekly');
    });

    it('should throw ApiAuthError when throwOnAuthFailure is true and API returns 401', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(
        fetchAnthropicOAuthUsage('invalid-token', 'profile-1', 'Profile', true)
      ).rejects.toThrow(ApiAuthError);
    });

    it('should throw ApiAuthError when throwOnAuthFailure is true and API returns 403', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      await expect(
        fetchAnthropicOAuthUsage('invalid-token', 'profile-1', 'Profile', true)
      ).rejects.toThrow(ApiAuthError);
    });
  });

  describe('fetchUsageForProfile', () => {
    it('should route to Z.ai fetch for zai provider', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          code: 200,
          msg: 'Operation successful',
          data: {
            limits: [
              {
                type: 'TOKENS_LIMIT',
                unit: 3,
                number: 5,
                usage: 200000000,
                currentValue: 75000000,
                remaining: 125000000,
                percentage: 37
              }
            ]
          },
          success: true
        })
      });

      const result = await fetchUsageForProfile('zai', 'api-key', 'profile-1', 'Z.ai Profile');

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('zai');
    });

    it('should route to Anthropic OAuth fetch for anthropic-oauth provider', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          five_hour_utilization: 0.5,
          seven_day_utilization: 0.3
        })
      });

      const result = await fetchUsageForProfile('anthropic-oauth', 'oauth-token', 'profile-1', 'My Profile');

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('anthropic-oauth');
    });

    it('should return null for "other" provider', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await fetchUsageForProfile('other', 'api-key', 'profile-1', 'Custom API');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('[profile-usage] Usage statistics not available for this provider');

      consoleSpy.mockRestore();
    });

    it('should return null for unknown provider', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // @ts-expect-error - testing invalid provider
      const result = await fetchUsageForProfile('unknown', 'key', 'profile-1', 'Profile');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('[profile-usage] Unknown provider:', 'unknown');

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle fetch failures gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Connection failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await fetchZaiUsage('key', 'test-profile', 'Test Profile');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith('[profile-usage] Z.ai fetch failed:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle malformed JSON gracefully', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('Invalid JSON');
        }
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await fetchZaiUsage('key', 'test-profile', 'Test Profile');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
