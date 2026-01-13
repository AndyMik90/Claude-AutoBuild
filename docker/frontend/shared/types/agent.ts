/**
 * Agent-related types (Claude profiles and authentication)
 */

// ============================================
// Claude Profile Types (Multi-Account Support)
// ============================================

/**
 * Usage data parsed from Claude Code's /usage command
 */
export interface ClaudeUsageData {
  /** Session usage percentage (0-100) */
  sessionUsagePercent: number;
  /** When the session limit resets (ISO string or description like "11:59pm") */
  sessionResetTime: string;
  /** Weekly usage percentage across all models (0-100) */
  weeklyUsagePercent: number;
  /** When the weekly limit resets (ISO string or description) */
  weeklyResetTime: string;
  /** Weekly Opus usage percentage (0-100), if applicable */
  opusUsagePercent?: number;
  /** When this usage data was last updated */
  lastUpdated: Date;
}

/**
 * Real-time usage snapshot for proactive monitoring
 * Returned from API or CLI usage check
 */
export interface ClaudeUsageSnapshot {
  /** Session usage percentage (0-100) */
  sessionPercent: number;
  /** Weekly usage percentage (0-100) */
  weeklyPercent: number;
  /** When the session limit resets (human-readable or ISO) */
  sessionResetTime?: string;
  /** When the weekly limit resets (human-readable or ISO) */
  weeklyResetTime?: string;
  /** Profile ID this snapshot belongs to */
  profileId: string;
  /** Profile name for display */
  profileName: string;
  /** When this snapshot was captured */
  fetchedAt: Date;
  /** Which limit is closest to threshold ('session' or 'weekly') */
  limitType?: 'session' | 'weekly';
}

/**
 * Rate limit event recorded for a profile
 */
export interface ClaudeRateLimitEvent {
  /** Type of limit hit: 'session' or 'weekly' */
  type: 'session' | 'weekly';
  /** When the limit was hit */
  hitAt: Date;
  /** When it's expected to reset */
  resetAt: Date;
  /** The reset time string from Claude (e.g., "Dec 17 at 6am") */
  resetTimeString: string;
}

/**
 * A Claude Code subscription profile for multi-account support.
 * Profiles store OAuth tokens for instant switching without browser re-auth.
 */
export interface ClaudeProfile {
  id: string;
  name: string;
  /**
   * OAuth token (sk-ant-oat01-...) for this profile.
   * When set, CLAUDE_CODE_OAUTH_TOKEN env var is used instead of config dir.
   * Token is valid for 1 year from creation.
   */
  oauthToken?: string;
  /** Email address associated with this profile (for display) */
  email?: string;
  /** When the OAuth token was created (for expiry tracking - 1 year validity) */
  tokenCreatedAt?: Date;
  /**
   * Path to the Claude config directory (e.g., ~/.claude or ~/.claude-profiles/work)
   * @deprecated Use oauthToken instead for reliable multi-profile switching
   */
  configDir?: string;
  /** Whether this is the default profile (uses ~/.claude) */
  isDefault: boolean;
  /** Optional description/notes for this profile */
  description?: string;
  /** When the profile was created */
  createdAt: Date;
  /** Last time this profile was used */
  lastUsedAt?: Date;
  /** Current usage data from /usage command */
  usage?: ClaudeUsageData;
  /** Recent rate limit events for this profile */
  rateLimitEvents?: ClaudeRateLimitEvent[];
}

/**
 * Settings for Claude profile management
 */
export interface ClaudeProfileSettings {
  /** All configured Claude profiles */
  profiles: ClaudeProfile[];
  /** ID of the currently active profile */
  activeProfileId: string;
  /** Auto-switch settings */
  autoSwitch?: ClaudeAutoSwitchSettings;
}

/**
 * Settings for automatic profile switching
 */
export interface ClaudeAutoSwitchSettings {
  /** Master toggle - enables all auto-switch features */
  enabled: boolean;

  // Proactive monitoring settings
  /** Enable proactive monitoring and swapping before hitting limits */
  proactiveSwapEnabled: boolean;
  /** Interval (ms) to check usage (default: 30000 = 30s, 0 = disabled) */
  usageCheckInterval: number;

  // Threshold settings
  /** Session usage threshold (0-100) to trigger proactive switch (default: 95) */
  sessionThreshold: number;
  /** Weekly usage threshold (0-100) to trigger proactive switch (default: 99) */
  weeklyThreshold: number;

  // Reactive recovery
  /** Whether to automatically switch on unexpected rate limit (vs. prompting user) */
  autoSwitchOnRateLimit: boolean;
}

export interface ClaudeAuthResult {
  success: boolean;
  authenticated: boolean;
  error?: string;
}
