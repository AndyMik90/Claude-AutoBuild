/**
 * Tests for profile-usage.ts service
 * Tests provider detection, API fetching, and CLI usage parsing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  detectProvider,
  fetchZaiUsage,
  fetchAnthropicOAuthUsage,
  fetchUsageForProfile
} from './profile-usage';
import type { ClaudeUsageSnapshot } from '../../../shared/types/agent';

// Mock global fetch
global.fetch = vi.fn();

describe('profile-usage service', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('detectProvider', () => {
    it('should detect Z.ai provider from api.z.ai URL', () => {
      expect(detectProvider('https://api.z.ai')).toBe('zai');
      expect(detectProvider('https://api.z.ai/v1')).toBe('zai');
      expect(detectProvider('http://api.z.ai')).toBe('zai');
    });

    it('should detect Z.ai provider from z.ai URL', () => {
      expect(detectProvider('https://z.ai')).toBe('zai');
      expect(detectProvider('https://z.ai/api')).toBe('zai');
    });

    it('should detect Anthropic OAuth provider from api.anthropic.com', () => {
      expect(detectProvider('https://api.anthropic.com')).toBe('anthropic-oauth');
      expect(detectProvider('https://api.anthropic.com/v1')).toBe('anthropic-oauth');
    });

    it('should return "other" for unknown providers', () => {
      expect(detectProvider('https://api.example.com')).toBe('other');
      expect(detectProvider('https://custom-api.com/v1')).toBe('other');
      expect(detectProvider('https://api.openai.com')).toBe('other');
    });

    it('should handle URLs with paths correctly', () => {
      expect(detectProvider('https://api.anthropic.com/v1/messages')).toBe('anthropic-oauth');
      expect(detectProvider('https://api.z.ai/api/monitor/usage/quota/limit')).toBe('zai');
    });

    it('should be case-insensitive for domain matching', () => {
      expect(detectProvider('https://API.Z.AI')).toBe('zai');
      expect(detectProvider('https://API.ANTHROPIC.COM')).toBe('anthropic-oauth');
    });

    it('should handle whitespace in URLs', () => {
      expect(detectProvider('  https://api.z.ai  ')).toBe('zai');
      expect(detectProvider('  https://api.anthropic.com  ')).toBe('anthropic-oauth');
    });
  });

  describe('fetchZaiUsage', () => {
    it('should fetch and parse Z.ai quota successfully', async () => {
      const mockResponse = {
        token_usage: {
          used: 75000,
          limit: 100000
        },
        monthly_tool_usage: {
          web_search: {
            used: 45,
            limit: 100
          },
          reader: {
            used: 20,
            limit: 50
          }
        },
        reset_time: '2025-02-01T00:00:00Z'
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result).not.toBeNull();
      expect(result?.provider).toBe('zai');
      expect(result?.sessionPercent).toBe(75); // 75000/100000
      expect(result?.weeklyPercent).toBe(43); // (45+20)/(100+50) = 65/150 ≈ 43%
      expect(result?.profileName).toBe('Test Profile');
    });

    it('should handle missing token_usage gracefully', async () => {
      const mockResponse = {
        monthly_tool_usage: {
          web_search: { used: 10, limit: 100 }
        }
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result?.sessionPercent).toBe(0);
    });

    it('should handle missing tool_usage gracefully', async () => {
      const mockResponse = {
        token_usage: {
          used: 50000,
          limit: 100000
        }
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      expect(result?.weeklyPercent).toBe(0);
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

    it('should set correct reset timestamp when provided', async () => {
      const mockResponse = {
        token_usage: { used: 50000, limit: 100000 },
        reset_time: '2025-02-01T12:00:00Z'
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const result = await fetchZaiUsage('test-api-key', 'test-profile', 'Test Profile');

      // Check timestamp is set and is a reasonable number (within a day of expected time)
      expect(result?.sessionResetTimestamp).toBeDefined();
      expect(result?.sessionResetTimestamp).toBeGreaterThan(1738300000000); // Jan 31, 2025
      expect(result?.sessionResetTimestamp).toBeLessThan(1738500000000); // Feb 2, 2025
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
  });

  describe('fetchUsageForProfile', () => {
    it('should route to Z.ai fetch for zai provider', async () => {
      const mockSnapshot: ClaudeUsageSnapshot = {
        sessionPercent: 75,
        weeklyPercent: 50,
        profileId: 'profile-1',
        profileName: 'Z.ai Profile',
        fetchedAt: new Date(),
        provider: 'zai'
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          token_usage: { used: 75000, limit: 100000 }
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
