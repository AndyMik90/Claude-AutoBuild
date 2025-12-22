/**
 * Usage Parser Module
 * Handles parsing of Claude /usage command output and reset time calculations
 */

import type { ClaudeUsageData } from '../../shared/types';

/**
 * Regex to parse /usage command output
 * Matches patterns like: "████▌ 9% used" and "Resets Nov 1, 10:59am (America/Sao_Paulo)"
 */
const USAGE_PERCENT_PATTERN = /(\d+)%\s*used/i;
const USAGE_RESET_PATTERN = /Resets?\s+(.+?)(?:\s*$|\n)/i;

/**
 * Parse a rate limit reset time string and estimate when it resets
 * Examples: "Dec 17 at 6am (Europe/Oslo)", "11:59pm (America/Sao_Paulo)", "Nov 1, 10:59am"
 */
export function parseResetTime(resetTimeStr: string): Date {
  const now = new Date();

  // Try to parse various formats
  // Format: "Dec 17 at 6am (Europe/Oslo)" or "Nov 1, 10:59am"
  const dateMatch = resetTimeStr.match(/([A-Za-z]+)\s+(\d+)(?:,|\s+at)?\s*(\d+)?:?(\d+)?(am|pm)?/i);
  if (dateMatch) {
    const [, month, day, hour = '0', minute = '0', ampm = ''] = dateMatch;
    const monthMap: Record<string, number> = {
      'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
      'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    const monthNum = monthMap[month.toLowerCase()] ?? now.getMonth();
    let hourNum = parseInt(hour, 10);
    if (ampm.toLowerCase() === 'pm' && hourNum < 12) hourNum += 12;
    if (ampm.toLowerCase() === 'am' && hourNum === 12) hourNum = 0;

    const resetDate = new Date(now.getFullYear(), monthNum, parseInt(day, 10), hourNum, parseInt(minute, 10));
    // If the date is in the past, assume next year
    if (resetDate < now) {
      resetDate.setFullYear(resetDate.getFullYear() + 1);
    }
    return resetDate;
  }

  // Format: "11:59pm" (today or tomorrow)
  const timeOnlyMatch = resetTimeStr.match(/(\d+):?(\d+)?\s*(am|pm)/i);
  if (timeOnlyMatch) {
    const [, hour, minute = '0', ampm] = timeOnlyMatch;
    let hourNum = parseInt(hour, 10);
    if (ampm.toLowerCase() === 'pm' && hourNum < 12) hourNum += 12;
    if (ampm.toLowerCase() === 'am' && hourNum === 12) hourNum = 0;

    const resetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hourNum, parseInt(minute, 10));
    // If the time is in the past, assume tomorrow
    if (resetDate < now) {
      resetDate.setDate(resetDate.getDate() + 1);
    }
    return resetDate;
  }

  // Fallback: assume 5 hours from now (session reset) or 7 days (weekly)
  const isWeekly = resetTimeStr.toLowerCase().includes('week') ||
    /[a-z]{3}\s+\d+/i.test(resetTimeStr);  // Has a date like "Dec 17"
  if (isWeekly) {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() + 5 * 60 * 60 * 1000);
}

/**
 * Determine if a rate limit is session-based or weekly based on reset time
 */
export function classifyRateLimitType(resetTimeStr: string): 'session' | 'weekly' {
  // Weekly limits mention specific dates like "Dec 17" or "Nov 1"
  // Session limits are typically just times like "11:59pm"
  const hasDate = /[A-Za-z]{3}\s+\d+/i.test(resetTimeStr);
  const hasWeeklyIndicator = resetTimeStr.toLowerCase().includes('week');

  return (hasDate || hasWeeklyIndicator) ? 'weekly' : 'session';
}

/**
 * Parse Claude /usage command output into structured data
 * Expected format sections:
 * "Current session ████▌ 9% used Resets 11:59pm"
 * "Current week (all models) 79% used Resets Nov 1, 10:59am"
 * "Current week (Opus) 0% used"
 */
export function parseUsageOutput(usageOutput: string): ClaudeUsageData {
  const sections = usageOutput.split(/Current\s+/i).filter(Boolean);
  const usage: ClaudeUsageData = {
    sessionUsagePercent: 0,
    sessionResetTime: '',
    weeklyUsagePercent: 0,
    weeklyResetTime: '',
    lastUpdated: new Date()
  };

  for (const section of sections) {
    const percentMatch = section.match(USAGE_PERCENT_PATTERN);
    const resetMatch = section.match(USAGE_RESET_PATTERN);

    if (percentMatch) {
      const percent = parseInt(percentMatch[1], 10);
      const resetTime = resetMatch?.[1]?.trim() || '';

      if (/session/i.test(section)) {
        usage.sessionUsagePercent = percent;
        usage.sessionResetTime = resetTime;
      } else if (/week.*all\s*model/i.test(section)) {
        usage.weeklyUsagePercent = percent;
        usage.weeklyResetTime = resetTime;
      } else if (/week.*opus/i.test(section)) {
        usage.opusUsagePercent = percent;
      }
    }
  }

  return usage;
}
