/**
 * Usage Monitor - Proactive usage monitoring and account switching
 *
 * Monitors Claude account usage at configured intervals and automatically
 * switches to alternative accounts before hitting rate limits.
 *
 * Supports multiple profile types:
 * - Claude OAuth profiles (multi-account switching)
 * - API profiles (Z.ai, custom endpoints)
 *
 * Uses hybrid approach:
 * 1. Primary: Direct OAuth API (https://api.anthropic.com/api/oauth/usage)
 * 2. API profiles: Provider-specific endpoints (Z.ai, etc.)
 * 3. Fallback: CLI /usage command parsing
 */

import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import { getClaudeProfileManager } from '../claude-profile-manager';
import { ClaudeUsageSnapshot } from '../../shared/types/agent';
import { loadProfilesFile, detectProvider, fetchUsageForProfile, fetchAnthropicOAuthUsage } from '../services/profile';
import { getClaudeCliInvocationAsync } from '../claude-cli-utils';
import { getSpawnCommand, getSpawnOptions } from '../env-utils';
import { parseUsageOutput } from './usage-parser';

export class UsageMonitor extends EventEmitter {
  private static instance: UsageMonitor;
  private intervalId: NodeJS.Timeout | null = null;
  private currentUsage: ClaudeUsageSnapshot | null = null;
  private isChecking = false;
  private useApiMethod = true; // Try API first, fall back to CLI if it fails

  // Swap loop protection: track profiles that recently failed auth
  private authFailedProfiles: Map<string, number> = new Map(); // profileId -> timestamp
  private static AUTH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown
  private static CLI_USAGE_TIMEOUT_MS = 10000; // 10 seconds timeout for CLI /usage command

  // Debug flag for verbose logging
  private readonly isDebug = process.env.DEBUG === 'true';

  private constructor() {
    super();
    console.warn('[UsageMonitor] Initialized');
  }

  static getInstance(): UsageMonitor {
    if (!UsageMonitor.instance) {
      UsageMonitor.instance = new UsageMonitor();
    }
    return UsageMonitor.instance;
  }

  /**
   * Start monitoring usage at configured interval
   */
  start(): void {
    const profileManager = getClaudeProfileManager();
    const settings = profileManager.getAutoSwitchSettings();

    if (!settings.enabled || !settings.proactiveSwapEnabled) {
      console.warn('[UsageMonitor] Proactive monitoring disabled. Settings:', JSON.stringify(settings, null, 2));
      return;
    }

    if (this.intervalId) {
      console.warn('[UsageMonitor] Already running');
      return;
    }

    const interval = settings.usageCheckInterval || 30000;
    console.warn('[UsageMonitor] Starting with interval:', interval, 'ms');

    // Check immediately
    this.checkUsageAndSwap();

    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkUsageAndSwap();
    }, interval);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.warn('[UsageMonitor] Stopped');
    }
  }

  /**
   * Get current usage snapshot (for UI indicator)
   */
  getCurrentUsage(): ClaudeUsageSnapshot | null {
    return this.currentUsage;
  }

  /**
   * Check usage and trigger swap if thresholds exceeded
   *
   * Checks in order:
   * 1. API profiles (Z.ai, custom endpoints)
   * 2. Claude OAuth profiles
   */
  private async checkUsageAndSwap(): Promise<void> {
    if (this.isChecking) {
      return; // Prevent concurrent checks
    }

    this.isChecking = true;

    try {
      // First, try to fetch usage from active API profile
      let usage = await this.fetchAPIProfileUsage();

      // If no API profile or fetch failed, try Claude OAuth profile
      if (!usage) {
        usage = await this.fetchClaudeProfileUsage();
      }

      if (!usage) {
        console.warn('[UsageMonitor] No usage data available');
        return;
      }

      this.currentUsage = usage;

      // Emit usage update for UI
      this.emit('usage-updated', usage);

      // Proactive swapping only works for Claude OAuth profiles
      // API profiles don't have automatic switching
      if (usage.provider === 'anthropic-oauth') {
        const profileManager = getClaudeProfileManager();
        const settings = profileManager.getAutoSwitchSettings();
        const activeProfile = profileManager.getProfile(usage.profileId);
        const decryptedToken = activeProfile ? profileManager.getProfileToken(activeProfile.id) : undefined;
        const sessionExceeded = usage.sessionPercent >= settings.sessionThreshold;
        const weeklyExceeded = usage.weeklyPercent >= settings.weeklyThreshold;

        if (sessionExceeded || weeklyExceeded) {
          if (this.isDebug) {
            console.warn('[UsageMonitor:TRACE] Threshold exceeded', {
              sessionPercent: usage.sessionPercent,
              weekPercent: usage.weeklyPercent,
              activeProfile: activeProfile?.id,
              hasToken: !!decryptedToken
            });
          }

          console.warn('[UsageMonitor] Threshold exceeded:', {
            sessionPercent: usage.sessionPercent,
            sessionThreshold: settings.sessionThreshold,
            weeklyPercent: usage.weeklyPercent,
            weeklyThreshold: settings.weeklyThreshold
          });

          // Attempt proactive swap
          await this.performProactiveSwap(
            activeProfile?.id || usage.profileId,
            sessionExceeded ? 'session' : 'weekly'
          );
        } else {
          if (this.isDebug) {
            console.warn('[UsageMonitor:TRACE] Usage OK', {
              sessionPercent: usage.sessionPercent,
              weekPercent: usage.weeklyPercent
            });
          }
        }
      }
    } catch (error) {
      // Check for auth failure (401/403) from fetchUsageViaAPI
      if ((error as any).statusCode === 401 || (error as any).statusCode === 403) {
        const profileManager = getClaudeProfileManager();
        const activeProfile = profileManager.getActiveProfile();

        if (activeProfile) {
          // Mark this profile as auth-failed to prevent swap loops
          this.authFailedProfiles.set(activeProfile.id, Date.now());
          console.warn('[UsageMonitor] Auth failure detected, marked profile as failed:', activeProfile.id);

          // Clean up expired entries from the failed profiles map
          const now = Date.now();
          this.authFailedProfiles.forEach((timestamp, profileId) => {
            if (now - timestamp > UsageMonitor.AUTH_FAILURE_COOLDOWN_MS) {
              this.authFailedProfiles.delete(profileId);
            }
          });

          try {
            const excludeProfiles = Array.from(this.authFailedProfiles.keys());
            console.warn('[UsageMonitor] Attempting proactive swap (excluding failed profiles):', excludeProfiles);
            await this.performProactiveSwap(
              activeProfile.id,
              'session', // Treat auth failure as session limit for immediate swap
              excludeProfiles
            );
            return;
          } catch (swapError) {
            console.error('[UsageMonitor] Failed to perform auth-failure swap:', swapError);
          }
        }
      }

      console.error('[UsageMonitor] Check failed:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Fetch usage from active API profile (Z.ai, custom endpoints)
   */
  private async fetchAPIProfileUsage(): Promise<ClaudeUsageSnapshot | null> {
    try {
      const profilesFile = await loadProfilesFile();

      // Check if there's an active API profile
      if (!profilesFile.activeProfileId) {
        return null;
      }

      const activeProfile = profilesFile.profiles.find(
        (p) => p.id === profilesFile.activeProfileId
      );

      if (!activeProfile) {
        return null;
      }

      // Detect provider type
      const provider = detectProvider(activeProfile.baseUrl);

      // Fetch usage based on provider
      const usage = await fetchUsageForProfile(
        provider,
        activeProfile.apiKey,
        activeProfile.id,
        activeProfile.name
      );

      if (usage) {
        console.warn('[UsageMonitor] Fetched API profile usage:', {
          profile: activeProfile.name,
          provider,
          sessionPercent: usage.sessionPercent,
          weeklyPercent: usage.weeklyPercent
        });
      }

      return usage;
    } catch (error) {
      console.error('[UsageMonitor] API profile fetch failed:', error);
      return null;
    }
  }

  /**
   * Fetch usage from Claude OAuth profile
   */
  private async fetchClaudeProfileUsage(): Promise<ClaudeUsageSnapshot | null> {
    const profileManager = getClaudeProfileManager();
    const activeProfile = profileManager.getActiveProfile();

    if (!activeProfile) {
      return null;
    }

    // Get decrypted token from ProfileManager (activeProfile.oauthToken is encrypted)
    const decryptedToken = profileManager.getProfileToken(activeProfile.id);
    return await this.fetchUsage(activeProfile.id, decryptedToken ?? undefined);
  }

  /**
   * Fetch usage - HYBRID APPROACH
   * Tries API first, falls back to CLI if API fails
   */
  private async fetchUsage(
    profileId: string,
    oauthToken?: string
  ): Promise<ClaudeUsageSnapshot | null> {
    const profileManager = getClaudeProfileManager();
    const profile = profileManager.getProfile(profileId);
    if (!profile) {
      return null;
    }

    // Attempt 1: Direct API call (preferred)
    if (this.useApiMethod && oauthToken) {
      const apiUsage = await this.fetchUsageViaAPI(oauthToken, profileId, profile.name);
      if (apiUsage) {
        console.warn('[UsageMonitor] Successfully fetched via API');
        return apiUsage;
      }

      // API failed - switch to CLI method for future calls
      console.warn('[UsageMonitor] API method failed, falling back to CLI');
      this.useApiMethod = false;
    }

    // Attempt 2: CLI /usage command (fallback)
    return await this.fetchUsageViaCLI(profileId, profile.name);
  }

  /**
   * Fetch usage via OAuth API endpoint
   * Uses shared fetchAnthropicOAuthUsage from profile-usage service
   * Endpoint: https://api.anthropic.com/api/oauth/usage
   */
  private async fetchUsageViaAPI(
    oauthToken: string,
    profileId: string,
    profileName: string
  ): Promise<ClaudeUsageSnapshot | null> {
    try {
      return await fetchAnthropicOAuthUsage(oauthToken, profileId, profileName, true);
    } catch (error: any) {
      // Re-throw auth failures to be handled by checkUsageAndSwap
      if (error?.statusCode === 401 || error?.statusCode === 403) {
        throw error;
      }

      console.error('[UsageMonitor] API fetch failed:', error);
      return null;
    }
  }

  /**
   * Fetch usage via CLI /usage command (fallback)
   * Note: This is a fallback method. The API method is preferred.
   * Spawns a Claude process with the /usage command and parses the output.
   */
  private async fetchUsageViaCLI(
    profileId: string,
    profileName: string
  ): Promise<ClaudeUsageSnapshot | null> {
    try {
      const { command: claudeCmd } = await getClaudeCliInvocationAsync();

      return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let timeoutId: NodeJS.Timeout;

        // Build env object without undefined values
        const cleanEnv = Object.fromEntries(
          Object.entries(process.env).filter(([_, value]) => value !== undefined)
        ) as Record<string, string>;

        const proc = spawn(getSpawnCommand(claudeCmd), ['/usage'], getSpawnOptions(claudeCmd, {
          env: cleanEnv
        }));

        // Handle spawn errors (e.g., command not found)
        proc.on('error', (err) => {
          clearTimeout(timeoutId);
          console.error('[UsageMonitor] CLI spawn error:', err);
          resolve(null);
        });

        proc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        timeoutId = setTimeout(() => {
          timedOut = true;
          proc.kill();
          console.warn('[UsageMonitor] CLI /usage command timed out');
          resolve(null);
        }, UsageMonitor.CLI_USAGE_TIMEOUT_MS);

        // Use once() to ensure the close handler only fires once
        proc.once('close', (code) => {
          clearTimeout(timeoutId);
          if (timedOut) return;

          if (code === 0 && stdout) {
            try {
              const usageData = parseUsageOutput(stdout);

              // Convert ClaudeUsageData to ClaudeUsageSnapshot
              const snapshot: ClaudeUsageSnapshot = {
                sessionPercent: usageData.sessionUsagePercent,
                weeklyPercent: usageData.weeklyUsagePercent,
                sessionResetTime: usageData.sessionResetTime,
                weeklyResetTime: usageData.weeklyResetTime,
                profileId,
                profileName,
                fetchedAt: new Date(),
                limitType: usageData.weeklyUsagePercent > usageData.sessionUsagePercent
                  ? 'weekly'
                  : 'session',
                provider: 'anthropic-oauth' // CLI fallback for OAuth profiles
              };

              console.warn('[UsageMonitor] Successfully fetched via CLI');
              resolve(snapshot);
            } catch (parseError) {
              console.error('[UsageMonitor] Failed to parse usage output:', parseError);
              resolve(null);
            }
          } else {
            console.error('[UsageMonitor] CLI /usage command failed:', { code, stderr });
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('[UsageMonitor] CLI fetch failed:', error);
      return null;
    }
  }

  /**
   * Perform proactive profile swap
   * @param currentProfileId - The profile to switch from
   * @param limitType - The type of limit that triggered the swap
   * @param additionalExclusions - Additional profile IDs to exclude (e.g., auth-failed profiles)
   */
  private async performProactiveSwap(
    currentProfileId: string,
    limitType: 'session' | 'weekly',
    additionalExclusions: string[] = []
  ): Promise<void> {
    const profileManager = getClaudeProfileManager();

    // Get all profiles to swap to, excluding current and any additional exclusions
    const allProfiles = profileManager.getProfilesSortedByAvailability();
    const excludeIds = new Set([currentProfileId, ...additionalExclusions]);
    const eligibleProfiles = allProfiles.filter(p => !excludeIds.has(p.id));

    if (eligibleProfiles.length === 0) {
      console.warn('[UsageMonitor] No alternative profile for proactive swap (excluded:', Array.from(excludeIds), ')');
      this.emit('proactive-swap-failed', {
        reason: additionalExclusions.length > 0 ? 'all_alternatives_failed_auth' : 'no_alternative',
        currentProfile: currentProfileId,
        excludedProfiles: Array.from(excludeIds)
      });
      return;
    }

    // Use the best available from eligible profiles
    const bestProfile = eligibleProfiles[0];

    console.warn('[UsageMonitor] Proactive swap:', {
      from: currentProfileId,
      to: bestProfile.id,
      reason: limitType
    });

    // Switch profile
    profileManager.setActiveProfile(bestProfile.id);

    // Emit swap event
    this.emit('proactive-swap-completed', {
      fromProfile: { id: currentProfileId, name: profileManager.getProfile(currentProfileId)?.name },
      toProfile: { id: bestProfile.id, name: bestProfile.name },
      limitType,
      timestamp: new Date()
    });

    // Notify UI
    this.emit('show-swap-notification', {
      fromProfile: profileManager.getProfile(currentProfileId)?.name,
      toProfile: bestProfile.name,
      reason: 'proactive',
      limitType
    });

    // Note: Don't immediately check new profile - let normal interval handle it
    // This prevents cascading swaps if multiple profiles are near limits
  }
}

/**
 * Get the singleton UsageMonitor instance
 */
export function getUsageMonitor(): UsageMonitor {
  return UsageMonitor.getInstance();
}
