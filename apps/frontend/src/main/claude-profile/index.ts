/**
 * Claude Profile Module
 * Central export point for all profile management functionality
 */

// Core types
export type {
  ClaudeProfile,
  ClaudeProfileSettings,
  ClaudeUsageData,
  ClaudeRateLimitEvent,
  ClaudeAutoSwitchSettings
} from './types';

// Token encryption utilities
export { encryptToken, decryptToken, isTokenEncrypted } from './token-encryption';

// Usage parsing utilities
export { parseUsageOutput, parseResetTime, classifyRateLimitType } from './usage-parser';

// Rate limit management
export {
  recordRateLimitEvent,
  isProfileRateLimited,
  clearRateLimitEvents
} from './rate-limit-manager';

// Storage utilities
export {
  loadProfileStore,
  saveProfileStore,
  DEFAULT_AUTO_SWITCH_SETTINGS,
  STORE_VERSION
} from './profile-storage';
export type { ProfileStoreData } from './profile-storage';

// Profile scoring and auto-switch
export {
  getBestAvailableProfile,
  shouldProactivelySwitch,
  getProfilesSortedByAvailability
} from './profile-scorer';

// Profile utilities
export {
  DEFAULT_CLAUDE_CONFIG_DIR,
  CLAUDE_PROFILES_DIR,
  generateProfileId,
  createProfileDirectory,
  isProfileAuthenticated,
  hasValidToken,
  expandHomePath
} from './profile-utils';

// Usage monitoring (proactive account switching)
export { UsageMonitor, getUsageMonitor } from './usage-monitor';
