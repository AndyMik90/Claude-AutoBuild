/**
 * Profile Scorer Module
 * Handles profile availability scoring and auto-switch logic
 */

import type { ClaudeProfile, ClaudeAutoSwitchSettings } from '../../shared/types';
import { isProfileRateLimited } from './rate-limit-manager';
import { isProfileAuthenticated } from './profile-utils';

interface ScoredProfile {
  profile: ClaudeProfile;
  score: number;
}

/**
 * Get the best profile to switch to based on usage and rate limit status
 * Returns null if no good alternative is available
 */
export function getBestAvailableProfile(
  profiles: ClaudeProfile[],
  settings: ClaudeAutoSwitchSettings,
  excludeProfileId?: string
): ClaudeProfile | null {
  const now = new Date();

  // Get all profiles except the excluded one
  const candidates = profiles.filter(p => p.id !== excludeProfileId);

  if (candidates.length === 0) {
    return null;
  }

  // Score each profile based on:
  // 1. Not rate-limited (highest priority)
  // 2. Lower weekly usage (more important than session)
  // 3. Lower session usage
  // 4. More recently authenticated

  const scoredProfiles: ScoredProfile[] = candidates.map(profile => {
    let score = 100;  // Base score

    // Check rate limit status
    const rateLimitStatus = isProfileRateLimited(profile);
    if (rateLimitStatus.limited) {
      // Severely penalize rate-limited profiles
      if (rateLimitStatus.type === 'weekly') {
        score -= 1000;  // Weekly limit is worse
      } else {
        score -= 500;   // Session limit will reset sooner
      }

      // But add back some score based on how soon it resets
      if (rateLimitStatus.resetAt) {
        const hoursUntilReset = (rateLimitStatus.resetAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        score += Math.max(0, 50 - hoursUntilReset);  // Closer reset = higher score
      }
    }

    // Factor in current usage (if known)
    if (profile.usage) {
      // Weekly usage is more important
      score -= profile.usage.weeklyUsagePercent * 0.5;
      // Session usage is less important (resets more frequently)
      score -= profile.usage.sessionUsagePercent * 0.2;

      // Penalize if above thresholds
      if (profile.usage.weeklyUsagePercent >= settings.weeklyThreshold) {
        score -= 200;
      }
      if (profile.usage.sessionUsagePercent >= settings.sessionThreshold) {
        score -= 100;
      }
    }

    // Check if authenticated
    if (!isProfileAuthenticated(profile)) {
      score -= 500;  // Severely penalize unauthenticated profiles
    }

    return { profile, score };
  });

  // Sort by score (highest first)
  scoredProfiles.sort((a, b) => b.score - a.score);

  // Return the best candidate if it has a positive score
  const best = scoredProfiles[0];
  if (best && best.score > 0) {
    console.warn('[ProfileScorer] Best available profile:', best.profile.name, 'score:', best.score);
    return best.profile;
  }

  // All profiles are rate-limited or have issues
  console.warn('[ProfileScorer] No good profile available, all are rate-limited or have issues');
  return null;
}

/**
 * Determine if we should proactively switch profiles based on current usage
 */
export function shouldProactivelySwitch(
  profile: ClaudeProfile,
  allProfiles: ClaudeProfile[],
  settings: ClaudeAutoSwitchSettings
): { shouldSwitch: boolean; reason?: string; suggestedProfile?: ClaudeProfile } {
  if (!settings.enabled) {
    return { shouldSwitch: false };
  }

  if (!profile?.usage) {
    return { shouldSwitch: false };
  }

  const usage = profile.usage;

  // Check if we're approaching limits
  if (usage.weeklyUsagePercent >= settings.weeklyThreshold) {
    const bestProfile = getBestAvailableProfile(allProfiles, settings, profile.id);
    if (bestProfile) {
      return {
        shouldSwitch: true,
        reason: `Weekly usage at ${usage.weeklyUsagePercent}% (threshold: ${settings.weeklyThreshold}%)`,
        suggestedProfile: bestProfile
      };
    }
  }

  if (usage.sessionUsagePercent >= settings.sessionThreshold) {
    const bestProfile = getBestAvailableProfile(allProfiles, settings, profile.id);
    if (bestProfile) {
      return {
        shouldSwitch: true,
        reason: `Session usage at ${usage.sessionUsagePercent}% (threshold: ${settings.sessionThreshold}%)`,
        suggestedProfile: bestProfile
      };
    }
  }

  return { shouldSwitch: false };
}

/**
 * Get profiles sorted by availability (best first)
 */
export function getProfilesSortedByAvailability(profiles: ClaudeProfile[]): ClaudeProfile[] {
  const _now = new Date();

  return [...profiles].sort((a, b) => {
    // Not rate-limited profiles first
    const aLimited = isProfileRateLimited(a);
    const bLimited = isProfileRateLimited(b);

    if (aLimited.limited !== bLimited.limited) {
      return aLimited.limited ? 1 : -1;
    }

    // If both limited, sort by reset time
    if (aLimited.limited && bLimited.limited && aLimited.resetAt && bLimited.resetAt) {
      return aLimited.resetAt.getTime() - bLimited.resetAt.getTime();
    }

    // Sort by lower weekly usage
    const aWeekly = a.usage?.weeklyUsagePercent ?? 0;
    const bWeekly = b.usage?.weeklyUsagePercent ?? 0;
    if (aWeekly !== bWeekly) {
      return aWeekly - bWeekly;
    }

    // Sort by lower session usage
    const aSession = a.usage?.sessionUsagePercent ?? 0;
    const bSession = b.usage?.sessionUsagePercent ?? 0;
    return aSession - bSession;
  });
}
