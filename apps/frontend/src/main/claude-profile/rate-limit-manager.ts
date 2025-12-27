/**
 * Rate Limit Manager Module
 * Handles rate limit event recording and status checking
 */

import type { ClaudeProfile, ClaudeRateLimitEvent } from '../../shared/types';
import { parseResetTime, classifyRateLimitType } from './usage-parser';

/**
 * Record a rate limit event for a profile
 */
export function recordRateLimitEvent(
  profile: ClaudeProfile,
  resetTimeStr: string
): ClaudeRateLimitEvent {
  const event: ClaudeRateLimitEvent = {
    type: classifyRateLimitType(resetTimeStr),
    hitAt: new Date(),
    resetAt: parseResetTime(resetTimeStr),
    resetTimeString: resetTimeStr
  };

  // Keep last 10 events
  profile.rateLimitEvents = [
    event,
    ...(profile.rateLimitEvents || []).slice(0, 9)
  ];

  return event;
}

/**
 * Check if a profile is currently rate-limited
 */
export function isProfileRateLimited(
  profile: ClaudeProfile
): { limited: boolean; type?: 'session' | 'weekly'; resetAt?: Date } {
  if (!profile || !profile.rateLimitEvents?.length) {
    return { limited: false };
  }

  const now = new Date();
  // Check the most recent event
  const latestEvent = profile.rateLimitEvents[0];

  if (latestEvent.resetAt > now) {
    return {
      limited: true,
      type: latestEvent.type,
      resetAt: latestEvent.resetAt
    };
  }

  return { limited: false };
}

/**
 * Clear rate limit events for a profile (e.g., when they've reset)
 */
export function clearRateLimitEvents(profile: ClaudeProfile): void {
  profile.rateLimitEvents = [];
}
