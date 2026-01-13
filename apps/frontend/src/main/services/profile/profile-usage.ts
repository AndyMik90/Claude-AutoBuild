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
 */
interface ZaiQuotaResponse {
  token_usage?: {
    used: number;
    limit: number;
  };
  monthly_tool_usage?: {
    web_search?: {
      used: number;
      limit: number;
    };
    reader?: {
      used: number;
      limit: number;
    };
  };
  reset_time?: string; // ISO timestamp
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
 * Detect provider type from base URL
 */
export function detectProvider(baseUrl: string): UsageProvider {
  try {
    const url = new URL(baseUrl.trim());
    const hostname = url.hostname.toLowerCase();

    // Check for Z.ai domains (z.ai and subdomains)
    if (hostname === 'z.ai' || hostname.endsWith('.z.ai')) {
      return 'zai';
    }

    // Check for Anthropic OAuth domain (api.anthropic.com)
    if (hostname === 'api.anthropic.com') {
      return 'anthropic-oauth';
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

    // Calculate token usage percentage
    const tokenPercent = data.token_usage && data.token_usage.limit > 0
      ? Math.round((data.token_usage.used / data.token_usage.limit) * 100)
      : 0;

    // Calculate tool usage percentage (web search + reader combined)
    const webSearchUsed = data.monthly_tool_usage?.web_search?.used ?? 0;
    const webSearchLimit = data.monthly_tool_usage?.web_search?.limit ?? 0;
    const readerUsed = data.monthly_tool_usage?.reader?.used ?? 0;
    const readerLimit = data.monthly_tool_usage?.reader?.limit ?? 0;

    const denom = webSearchLimit + readerLimit;
    const toolPercent = denom === 0
      ? 0
      : Math.round(((webSearchUsed + readerUsed) / denom) * 100);

    // Parse reset time
    const resetTimestamp = data.reset_time
      ? new Date(data.reset_time).getTime()
      : undefined;

    const resetTime = resetTimestamp
      ? formatResetTimeFromTimestamp(resetTimestamp)
      : undefined;

    return {
      sessionPercent: tokenPercent,
      weeklyPercent: toolPercent,
      sessionResetTime: resetTime,
      weeklyResetTime: resetTime, // Z.ai uses monthly reset for both
      sessionResetTimestamp: resetTimestamp,
      weeklyResetTimestamp: resetTimestamp,
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
      sessionPercent: Math.round((data.five_hour_utilization || 0) * 100),
      weeklyPercent: Math.round((data.seven_day_utilization || 0) * 100),
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
