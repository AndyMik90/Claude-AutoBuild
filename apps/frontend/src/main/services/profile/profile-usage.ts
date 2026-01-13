/**
 * Profile Usage Service
 *
 * Fetches usage statistics for different API providers.
 * Supports:
 * - Anthropic OAuth (sk-ant-oat01- tokens)
 * - Z.ai (GLM API)
 * - Other Anthropic-compatible APIs (returns "not available")
 */

import type { ClaudeUsageSnapshot } from '../../../shared/types/agent';
import { RESETTING_SOON } from '../../../shared/types/agent';

// ============================================
// Error Classes
// ============================================

/**
 * Custom error for API authentication failures
 * Used when fetch returns 401 or 403 status codes
 */
export class ApiAuthError extends Error {
  public readonly statusCode: number;
  public readonly name = 'ApiAuthError';

  constructor(statusCode: number, message?: string) {
    super(message || `API Auth Failure: ${statusCode}`);
    this.statusCode = statusCode;
  }
}

// ============================================
// Provider Detection
// ============================================

/**
 * Provider type for usage fetching
 */
export type UsageProvider = 'anthropic-oauth' | 'zai' | 'other';

/**
 * Z.ai quota response structure
 * API returns: https://api.z.ai/api/monitor/usage/quota/limit
 */
interface ZaiQuotaResponse {
  code: number;
  msg: string;
  data: {
    limits: Array<{
      type: 'TOKENS_LIMIT' | 'TIME_LIMIT';
      unit: number;
      number: number;
      usage: number;
      currentValue: number;
      remaining: number;
      percentage: number;
      nextResetTime?: number; // Unix timestamp for TOKENS_LIMIT
      usageDetails?: Array<{
        modelCode: string;
        usage: number;
      }>;
    }>;
  };
  success: boolean;
}

/**
 * Anthropic OAuth usage response structure
 */
interface AnthropicUsageResponse {
  five_hour_utilization?: number;
  seven_day_utilization?: number;
  five_hour_reset_at?: string;
  seven_day_reset_at?: string;
}

/**
 * Detect provider type from base URL and API key/token format
 *
 * For api.anthropic.com:
 * - OAuth tokens (sk-ant-oat01-*) -> 'anthropic-oauth' (usage available)
 * - Regular API keys (sk-ant-api03-*, etc.) -> 'other' (no usage API)
 *
 * @param baseUrl - API base URL
 * @param apiKey - API key or OAuth token
 */
export function detectProvider(baseUrl: string, apiKey: string): UsageProvider {
  try {
    const url = new URL(baseUrl.trim());
    const hostname = url.hostname.toLowerCase();

    // Check for Z.ai domains (z.ai and subdomains)
    if (hostname === 'z.ai' || hostname.endsWith('.z.ai')) {
      return 'zai';
    }

    // Check for Anthropic OAuth domain (api.anthropic.com)
    // Must also have an OAuth token (sk-ant-oat01-*)
    if (hostname === 'api.anthropic.com') {
      const isOAuthToken = apiKey.startsWith('sk-ant-oat01-');
      if (isOAuthToken) {
        return 'anthropic-oauth';
      }
      // Regular API keys on api.anthropic.com don't have a usage API
      return 'other';
    }

    return 'other';
  } catch {
    // Invalid URL, treat as unknown provider
    return 'other';
  }
}

// ============================================
// Z.ai Usage Fetching
// ============================================

/**
 * Fetch usage from Z.ai API endpoint
 * Endpoint: https://api.z.ai/api/monitor/usage/quota/limit
 */
export async function fetchZaiUsage(
  apiKey: string,
  profileId: string,
  profileName: string
): Promise<ClaudeUsageSnapshot | null> {
  const FETCH_TIMEOUT_MS = 10000; // 10 seconds timeout

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch('https://api.z.ai/api/monitor/usage/quota/limit', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[profile-usage] Z.ai API error:', response.status, response.statusText);
      return null;
    }

    const data = (await response.json()) as ZaiQuotaResponse;

    // Guard against malformed response - ensure limits array exists
    const limits = Array.isArray(data?.data?.limits) ? data.data.limits : [];

    // Extract token and tool limits from the response
    const tokensLimit = limits.find((limit) => limit.type === 'TOKENS_LIMIT');
    const timeLimit = limits.find((limit) => limit.type === 'TIME_LIMIT');

    // Use pre-calculated percentages from API with bounds validation
    const tokenPercent = Math.max(0, Math.min(100, tokensLimit?.percentage ?? 0));
    const toolPercent = Math.max(0, Math.min(100, timeLimit?.percentage ?? 0));

    // Parse reset time from TOKENS_LIMIT's nextResetTime (Unix timestamp in milliseconds)
    const sessionResetTimestamp = tokensLimit?.nextResetTime;
    const sessionResetTime = sessionResetTimestamp
      ? formatResetTimeFromTimestamp(sessionResetTimestamp)
      : undefined;

    // Z.ai doesn't provide a weekly/monthly reset time for TIME_LIMIT in this response
    // The TIME_LIMIT appears to be a monthly rolling window based on unit/number fields
    return {
      sessionPercent: tokenPercent,
      weeklyPercent: toolPercent,
      sessionResetTime,
      weeklyResetTime: undefined, // Not provided by Z.ai API
      sessionResetTimestamp,
      weeklyResetTimestamp: undefined,
      profileId,
      profileName,
      fetchedAt: new Date(),
      limitType: tokenPercent > toolPercent ? 'session' : 'weekly',
      provider: 'zai'
    };
  } catch (error) {
    // Handle AbortError from timeout
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[profile-usage] Z.ai fetch timed out');
      return null;
    }
    console.error('[profile-usage] Z.ai fetch failed:', error);
    return null;
  }
}

// ============================================
// Anthropic OAuth Usage Fetching
// ============================================

/**
 * Fetch usage from Anthropic OAuth API endpoint
 * Endpoint: https://api.anthropic.com/api/oauth/usage
 *
 * @param oauthToken - OAuth bearer token
 * @param profileId - Profile ID for the snapshot
 * @param profileName - Profile name for display
 * @param throwOnAuthFailure - If true, throw error on 401/403 instead of returning null
 */
export async function fetchAnthropicOAuthUsage(
  oauthToken: string,
  profileId: string,
  profileName: string,
  throwOnAuthFailure = false
): Promise<ClaudeUsageSnapshot | null> {
  const FETCH_TIMEOUT_MS = 10000; // 10 seconds timeout

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${oauthToken}`,
        'anthropic-version': '2023-06-01'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('[profile-usage] Anthropic OAuth API error:', response.status, response.statusText);
      // Throw specific error for auth failures if requested
      if (throwOnAuthFailure && (response.status === 401 || response.status === 403)) {
        throw new ApiAuthError(response.status);
      }
      return null;
    }

    const data = (await response.json()) as AnthropicUsageResponse;

    const fiveHourResetTimestamp = data.five_hour_reset_at
      ? new Date(data.five_hour_reset_at).getTime()
      : undefined;

    const sevenDayResetTimestamp = data.seven_day_reset_at
      ? new Date(data.seven_day_reset_at).getTime()
      : undefined;

    return {
      sessionPercent: Math.max(0, Math.min(100, Math.round((data.five_hour_utilization || 0) * 100))),
      weeklyPercent: Math.max(0, Math.min(100, Math.round((data.seven_day_utilization || 0) * 100))),
      sessionResetTime: formatResetTimeFromTimestamp(fiveHourResetTimestamp),
      weeklyResetTime: formatResetTimeFromTimestamp(sevenDayResetTimestamp),
      sessionResetTimestamp: fiveHourResetTimestamp,
      weeklyResetTimestamp: sevenDayResetTimestamp,
      profileId,
      profileName,
      fetchedAt: new Date(),
      limitType: (data.seven_day_utilization || 0) > (data.five_hour_utilization || 0)
        ? 'weekly'
        : 'session',
      provider: 'anthropic-oauth'
    };
  } catch (error) {
    // Handle AbortError from timeout
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[profile-usage] Anthropic OAuth fetch timed out');
      return null;
    }
    // Re-throw ApiAuthError instances
    if (error instanceof ApiAuthError) {
      throw error;
    }
    console.error('[profile-usage] Anthropic OAuth fetch failed:', error);
    return null;
  }
}

// ============================================
// Main Routing Function
// ============================================

/**
 * Fetch usage for a profile (routes to appropriate provider)
 *
 * @param provider - Provider type
 * @param credentials - API key or OAuth token
 * @param profileId - Profile ID for the snapshot
 * @param profileName - Profile name for display
 */
export async function fetchUsageForProfile(
  provider: UsageProvider,
  credentials: string,
  profileId: string,
  profileName: string
): Promise<ClaudeUsageSnapshot | null> {
  switch (provider) {
    case 'zai':
      return fetchZaiUsage(credentials, profileId, profileName);

    case 'anthropic-oauth':
      return fetchAnthropicOAuthUsage(credentials, profileId, profileName);

    case 'other':
      console.warn('[profile-usage] Usage statistics not available for this provider');
      return null;

    default:
      console.warn('[profile-usage] Unknown provider:', provider);
      return null;
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Format reset time from Unix timestamp to human-readable string
 * Returns RESETTING_SOON sentinel when diffMs <= 0
 */
function formatResetTimeFromTimestamp(timestamp?: number): string | undefined {
  if (!timestamp) return undefined;

  const now = Date.now();
  const diffMs = timestamp - now;

  if (diffMs <= 0) return RESETTING_SOON;

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (diffHours < 24) {
    return `${diffHours}h ${diffMins}m`;
  }

  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  return `${diffDays}d ${remainingHours}h`;
}
