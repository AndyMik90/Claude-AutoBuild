import { app, safeStorage } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { homedir } from 'os';
import type {
  ClaudeProfile,
  ClaudeProfileSettings,
  ClaudeUsageData,
  ClaudeRateLimitEvent,
  ClaudeAutoSwitchSettings
} from '../shared/types';

const STORE_VERSION = 3;  // Bumped for encrypted token storage

/**
 * Encrypt a token using the OS keychain (safeStorage API).
 * Returns base64-encoded encrypted data, or the raw token if encryption unavailable.
 */
function encryptToken(token: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      // Prefix with 'enc:' to identify encrypted tokens
      return 'enc:' + encrypted.toString('base64');
    }
  } catch (error) {
    console.warn('[ClaudeProfileManager] Encryption not available, storing token as-is:', error);
  }
  return token;
}

/**
 * Decrypt a token. Handles both encrypted (enc:...) and legacy plain tokens.
 */
function decryptToken(storedToken: string): string {
  try {
    if (storedToken.startsWith('enc:') && safeStorage.isEncryptionAvailable()) {
      const encryptedData = Buffer.from(storedToken.slice(4), 'base64');
      return safeStorage.decryptString(encryptedData);
    }
  } catch (error) {
    console.error('[ClaudeProfileManager] Failed to decrypt token:', error);
    return ''; // Return empty string on decryption failure
  }
  // Return as-is for legacy unencrypted tokens
  return storedToken;
}

/**
 * Internal storage format for Claude profiles
 */
interface ProfileStoreData {
  version: number;
  profiles: ClaudeProfile[];
  activeProfileId: string;
  autoSwitch?: ClaudeAutoSwitchSettings;
}

/**
 * Default Claude config directory
 */
const DEFAULT_CLAUDE_CONFIG_DIR = join(homedir(), '.claude');

/**
 * Default profiles directory for additional accounts
 */
const CLAUDE_PROFILES_DIR = join(homedir(), '.claude-profiles');

/**
 * Default auto-switch settings
 */
const DEFAULT_AUTO_SWITCH_SETTINGS: ClaudeAutoSwitchSettings = {
  enabled: false,
  sessionThreshold: 85,  // Consider switching at 85% session usage
  weeklyThreshold: 90,   // Consider switching at 90% weekly usage
  autoSwitchOnRateLimit: false,  // Prompt user by default
  usageCheckInterval: 0  // Disabled by default (in ms, e.g., 300000 = 5 min)
};

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
function parseResetTime(resetTimeStr: string): Date {
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
function classifyRateLimitType(resetTimeStr: string): 'session' | 'weekly' {
  // Weekly limits mention specific dates like "Dec 17" or "Nov 1"
  // Session limits are typically just times like "11:59pm"
  const hasDate = /[A-Za-z]{3}\s+\d+/i.test(resetTimeStr);
  const hasWeeklyIndicator = resetTimeStr.toLowerCase().includes('week');

  return (hasDate || hasWeeklyIndicator) ? 'weekly' : 'session';
}

/**
 * Manages Claude Code profiles for multi-account support.
 * Profiles are stored in the app's userData directory.
 * Each profile points to a separate Claude config directory.
 */
export class ClaudeProfileManager {
  private storePath: string;
  private data: ProfileStoreData;

  constructor() {
    const configDir = join(app.getPath('userData'), 'config');
    this.storePath = join(configDir, 'claude-profiles.json');

    // Ensure directory exists
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Load existing data or initialize with default profile
    this.data = this.load();
  }

  /**
   * Load profiles from disk
   */
  private load(): ProfileStoreData {
    try {
      if (existsSync(this.storePath)) {
        const content = readFileSync(this.storePath, 'utf-8');
        const data = JSON.parse(content);

        // Handle version migration
        if (data.version === 1) {
          // Migrate v1 to v2: add usage and rateLimitEvents fields
          data.version = STORE_VERSION;
          data.autoSwitch = DEFAULT_AUTO_SWITCH_SETTINGS;
        }

        if (data.version === STORE_VERSION) {
          // Parse dates
          data.profiles = data.profiles.map((p: ClaudeProfile) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            lastUsedAt: p.lastUsedAt ? new Date(p.lastUsedAt) : undefined,
            usage: p.usage ? {
              ...p.usage,
              lastUpdated: new Date(p.usage.lastUpdated)
            } : undefined,
            rateLimitEvents: p.rateLimitEvents?.map(e => ({
              ...e,
              hitAt: new Date(e.hitAt),
              resetAt: new Date(e.resetAt)
            }))
          }));
          return data;
        }
      }
    } catch (error) {
      console.error('[ClaudeProfileManager] Error loading profiles:', error);
    }

    // Return default with a single "Default" profile
    return this.createDefaultData();
  }

  /**
   * Create default profile data
   */
  private createDefaultData(): ProfileStoreData {
    const defaultProfile: ClaudeProfile = {
      id: 'default',
      name: 'Default',
      configDir: DEFAULT_CLAUDE_CONFIG_DIR,
      isDefault: true,
      description: 'Default Claude configuration (~/.claude)',
      createdAt: new Date()
    };

    return {
      version: STORE_VERSION,
      profiles: [defaultProfile],
      activeProfileId: 'default',
      autoSwitch: DEFAULT_AUTO_SWITCH_SETTINGS
    };
  }

  /**
   * Save profiles to disk
   */
  private save(): void {
    try {
      writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('[ClaudeProfileManager] Error saving profiles:', error);
    }
  }

  /**
   * Get all profiles and settings
   */
  getSettings(): ClaudeProfileSettings {
    return {
      profiles: this.data.profiles,
      activeProfileId: this.data.activeProfileId,
      autoSwitch: this.data.autoSwitch || DEFAULT_AUTO_SWITCH_SETTINGS
    };
  }

  /**
   * Get auto-switch settings
   */
  getAutoSwitchSettings(): ClaudeAutoSwitchSettings {
    return this.data.autoSwitch || DEFAULT_AUTO_SWITCH_SETTINGS;
  }

  /**
   * Update auto-switch settings
   */
  updateAutoSwitchSettings(settings: Partial<ClaudeAutoSwitchSettings>): void {
    this.data.autoSwitch = {
      ...(this.data.autoSwitch || DEFAULT_AUTO_SWITCH_SETTINGS),
      ...settings
    };
    this.save();
  }

  /**
   * Get a specific profile by ID
   */
  getProfile(profileId: string): ClaudeProfile | undefined {
    return this.data.profiles.find(p => p.id === profileId);
  }

  /**
   * Get the active profile
   */
  getActiveProfile(): ClaudeProfile {
    const active = this.data.profiles.find(p => p.id === this.data.activeProfileId);
    if (!active) {
      // Fallback to default
      const defaultProfile = this.data.profiles.find(p => p.isDefault);
      if (defaultProfile) {
        return defaultProfile;
      }
      // If somehow no default exists, return first profile
      return this.data.profiles[0];
    }
    return active;
  }

  /**
   * Save or update a profile
   */
  saveProfile(profile: ClaudeProfile): ClaudeProfile {
    // Expand ~ in configDir path
    if (profile.configDir && profile.configDir.startsWith('~')) {
      const home = homedir();
      profile.configDir = profile.configDir.replace(/^~/, home);
    }

    const index = this.data.profiles.findIndex(p => p.id === profile.id);

    if (index >= 0) {
      // Update existing
      this.data.profiles[index] = profile;
    } else {
      // Add new
      this.data.profiles.push(profile);
    }

    this.save();
    return profile;
  }

  /**
   * Delete a profile (cannot delete default or last profile)
   */
  deleteProfile(profileId: string): boolean {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return false;
    }

    // Cannot delete default profile
    if (profile.isDefault) {
      console.warn('[ClaudeProfileManager] Cannot delete default profile');
      return false;
    }

    // Cannot delete if it's the only profile
    if (this.data.profiles.length <= 1) {
      console.warn('[ClaudeProfileManager] Cannot delete last profile');
      return false;
    }

    // Remove the profile
    this.data.profiles = this.data.profiles.filter(p => p.id !== profileId);

    // If we deleted the active profile, switch to default
    if (this.data.activeProfileId === profileId) {
      const defaultProfile = this.data.profiles.find(p => p.isDefault);
      this.data.activeProfileId = defaultProfile?.id || this.data.profiles[0].id;
    }

    this.save();
    return true;
  }

  /**
   * Rename a profile
   */
  renameProfile(profileId: string, newName: string): boolean {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return false;
    }

    // Cannot rename to empty name
    if (!newName.trim()) {
      console.warn('[ClaudeProfileManager] Cannot rename to empty name');
      return false;
    }

    profile.name = newName.trim();
    this.save();
    console.log('[ClaudeProfileManager] Renamed profile:', profileId, 'to:', newName);
    return true;
  }

  /**
   * Set the active profile
   */
  setActiveProfile(profileId: string): boolean {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return false;
    }

    this.data.activeProfileId = profileId;
    profile.lastUsedAt = new Date();
    this.save();
    return true;
  }

  /**
   * Update last used timestamp for a profile
   */
  markProfileUsed(profileId: string): void {
    const profile = this.getProfile(profileId);
    if (profile) {
      profile.lastUsedAt = new Date();
      this.save();
    }
  }

  /**
   * Get the OAuth token for the active profile (decrypted).
   * Returns undefined if no token is set (profile needs authentication).
   */
  getActiveProfileToken(): string | undefined {
    const profile = this.getActiveProfile();
    if (!profile?.oauthToken) {
      return undefined;
    }
    // Decrypt the token before returning
    return decryptToken(profile.oauthToken);
  }

  /**
   * Get the decrypted OAuth token for a specific profile.
   */
  getProfileToken(profileId: string): string | undefined {
    const profile = this.getProfile(profileId);
    if (!profile?.oauthToken) {
      return undefined;
    }
    return decryptToken(profile.oauthToken);
  }

  /**
   * Set the OAuth token for a profile (encrypted storage).
   * Used when capturing token from `claude setup-token` output.
   */
  setProfileToken(profileId: string, token: string, email?: string): boolean {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return false;
    }

    // Encrypt the token before storing
    profile.oauthToken = encryptToken(token);
    profile.tokenCreatedAt = new Date();
    if (email) {
      profile.email = email;
    }
    
    // Clear any rate limit events since this might be a new account
    profile.rateLimitEvents = [];
    
    this.save();
    
    const isEncrypted = profile.oauthToken.startsWith('enc:');
    console.log('[ClaudeProfileManager] Set OAuth token for profile:', profile.name, {
      email: email || '(not captured)',
      encrypted: isEncrypted,
      tokenLength: token.length
    });
    return true;
  }

  /**
   * Check if a profile has a valid OAuth token.
   * Token is valid for 1 year from creation.
   */
  hasValidToken(profileId: string): boolean {
    const profile = this.getProfile(profileId);
    if (!profile?.oauthToken) {
      return false;
    }
    
    // Check if token is expired (1 year validity)
    if (profile.tokenCreatedAt) {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      if (new Date(profile.tokenCreatedAt) < oneYearAgo) {
        console.log('[ClaudeProfileManager] Token expired for profile:', profile.name);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get environment variables for spawning processes with the active profile.
   * Returns { CLAUDE_CODE_OAUTH_TOKEN: token } if token is available (decrypted).
   */
  getActiveProfileEnv(): Record<string, string> {
    const profile = this.getActiveProfile();
    const env: Record<string, string> = {};

    if (profile?.oauthToken) {
      // Decrypt the token before putting in environment
      const decryptedToken = decryptToken(profile.oauthToken);
      if (decryptedToken) {
        env.CLAUDE_CODE_OAUTH_TOKEN = decryptedToken;
        console.log('[ClaudeProfileManager] Using OAuth token for profile:', profile.name);
      } else {
        console.warn('[ClaudeProfileManager] Failed to decrypt token for profile:', profile.name);
      }
    } else if (profile?.configDir && !profile.isDefault) {
      // Fallback to configDir for backward compatibility
      env.CLAUDE_CONFIG_DIR = profile.configDir;
      console.log('[ClaudeProfileManager] Using configDir for profile:', profile.name);
    }

    return env;
  }

  /**
   * Update usage data for a profile (parsed from /usage output)
   */
  updateProfileUsage(profileId: string, usageOutput: string): ClaudeUsageData | null {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return null;
    }

    // Parse the /usage output
    // Expected format sections:
    // "Current session ████▌ 9% used Resets 11:59pm"
    // "Current week (all models) 79% used Resets Nov 1, 10:59am"
    // "Current week (Opus) 0% used"

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

    profile.usage = usage;
    this.save();

    console.log('[ClaudeProfileManager] Updated usage for', profile.name, ':', usage);
    return usage;
  }

  /**
   * Record a rate limit event for a profile
   */
  recordRateLimitEvent(profileId: string, resetTimeStr: string): ClaudeRateLimitEvent {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error('Profile not found');
    }

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

    this.save();

    console.log('[ClaudeProfileManager] Recorded rate limit event for', profile.name, ':', event);
    return event;
  }

  /**
   * Check if a profile is currently rate-limited
   */
  isProfileRateLimited(profileId: string): { limited: boolean; type?: 'session' | 'weekly'; resetAt?: Date } {
    const profile = this.getProfile(profileId);
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
   * Get the best profile to switch to based on usage and rate limit status
   * Returns null if no good alternative is available
   */
  getBestAvailableProfile(excludeProfileId?: string): ClaudeProfile | null {
    const now = new Date();
    const settings = this.getAutoSwitchSettings();

    // Get all profiles except the excluded one
    const candidates = this.data.profiles.filter(p => p.id !== excludeProfileId);

    if (candidates.length === 0) {
      return null;
    }

    // Score each profile based on:
    // 1. Not rate-limited (highest priority)
    // 2. Lower weekly usage (more important than session)
    // 3. Lower session usage
    // 4. More recently authenticated

    const scoredProfiles = candidates.map(profile => {
      let score = 100;  // Base score

      // Check rate limit status
      const rateLimitStatus = this.isProfileRateLimited(profile.id);
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
      if (!this.isProfileAuthenticated(profile)) {
        score -= 500;  // Severely penalize unauthenticated profiles
      }

      return { profile, score };
    });

    // Sort by score (highest first)
    scoredProfiles.sort((a, b) => b.score - a.score);

    // Return the best candidate if it has a positive score
    const best = scoredProfiles[0];
    if (best && best.score > 0) {
      console.log('[ClaudeProfileManager] Best available profile:', best.profile.name, 'score:', best.score);
      return best.profile;
    }

    // All profiles are rate-limited or have issues
    console.log('[ClaudeProfileManager] No good profile available, all are rate-limited or have issues');
    return null;
  }

  /**
   * Determine if we should proactively switch profiles based on current usage
   */
  shouldProactivelySwitch(profileId: string): { shouldSwitch: boolean; reason?: string; suggestedProfile?: ClaudeProfile } {
    const settings = this.getAutoSwitchSettings();
    if (!settings.enabled) {
      return { shouldSwitch: false };
    }

    const profile = this.getProfile(profileId);
    if (!profile?.usage) {
      return { shouldSwitch: false };
    }

    const usage = profile.usage;

    // Check if we're approaching limits
    if (usage.weeklyUsagePercent >= settings.weeklyThreshold) {
      const bestProfile = this.getBestAvailableProfile(profileId);
      if (bestProfile) {
        return {
          shouldSwitch: true,
          reason: `Weekly usage at ${usage.weeklyUsagePercent}% (threshold: ${settings.weeklyThreshold}%)`,
          suggestedProfile: bestProfile
        };
      }
    }

    if (usage.sessionUsagePercent >= settings.sessionThreshold) {
      const bestProfile = this.getBestAvailableProfile(profileId);
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
   * Generate a unique ID for a new profile
   */
  generateProfileId(name: string): string {
    const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let id = baseId;
    let counter = 1;

    while (this.data.profiles.some(p => p.id === id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }

    return id;
  }

  /**
   * Create a new profile directory and initialize it
   */
  async createProfileDirectory(profileName: string): Promise<string> {
    // Ensure profiles directory exists
    if (!existsSync(CLAUDE_PROFILES_DIR)) {
      mkdirSync(CLAUDE_PROFILES_DIR, { recursive: true });
    }

    // Create directory for this profile
    const sanitizedName = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const profileDir = join(CLAUDE_PROFILES_DIR, sanitizedName);

    if (!existsSync(profileDir)) {
      mkdirSync(profileDir, { recursive: true });
    }

    return profileDir;
  }

  /**
   * Check if a profile has valid authentication
   * (checks if the config directory has credential files)
   */
  isProfileAuthenticated(profile: ClaudeProfile): boolean {
    const configDir = profile.configDir;
    if (!existsSync(configDir)) {
      return false;
    }

    // Claude stores auth in .claude/credentials or similar files
    // Check for common auth indicators
    const possibleAuthFiles = [
      join(configDir, 'credentials'),
      join(configDir, 'credentials.json'),
      join(configDir, '.credentials'),
      join(configDir, 'settings.json'),  // Often contains auth tokens
    ];

    for (const authFile of possibleAuthFiles) {
      if (existsSync(authFile)) {
        try {
          const content = readFileSync(authFile, 'utf-8');
          // Check if file has actual content (not just empty or placeholder)
          if (content.length > 10) {
            return true;
          }
        } catch {
          // Ignore read errors
        }
      }
    }

    // Also check if there are any session files (indicates authenticated usage)
    const projectsDir = join(configDir, 'projects');
    if (existsSync(projectsDir)) {
      try {
        const projects = readdirSync(projectsDir);
        if (projects.length > 0) {
          return true;
        }
      } catch {
        // Ignore read errors
      }
    }

    return false;
  }

  /**
   * Get environment variables for invoking Claude with a specific profile
   */
  getProfileEnv(profileId: string): Record<string, string> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return {};
    }

    // Only set CLAUDE_CONFIG_DIR if not using default
    if (profile.isDefault) {
      return {};
    }

    return {
      CLAUDE_CONFIG_DIR: profile.configDir
    };
  }

  /**
   * Clear rate limit events for a profile (e.g., when they've reset)
   */
  clearRateLimitEvents(profileId: string): void {
    const profile = this.getProfile(profileId);
    if (profile) {
      profile.rateLimitEvents = [];
      this.save();
    }
  }

  /**
   * Get profiles sorted by availability (best first)
   */
  getProfilesSortedByAvailability(): ClaudeProfile[] {
    const now = new Date();

    return [...this.data.profiles].sort((a, b) => {
      // Not rate-limited profiles first
      const aLimited = this.isProfileRateLimited(a.id);
      const bLimited = this.isProfileRateLimited(b.id);

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
}

// Singleton instance
let profileManager: ClaudeProfileManager | null = null;

/**
 * Get the singleton Claude profile manager instance
 */
export function getClaudeProfileManager(): ClaudeProfileManager {
  if (!profileManager) {
    profileManager = new ClaudeProfileManager();
  }
  return profileManager;
}
