/**
 * Update checking functionality
 */

import { GITHUB_CONFIG } from './config';
import { fetchJson } from './http-client';
import { getEffectiveVersion, parseVersionFromTag, compareVersions } from './version-manager';
import { GitHubRelease, AutoBuildUpdateCheck } from './types';
import { debugLog } from '../../shared/utils/debug-logger';

// Cache for the latest release info (used by download)
let cachedLatestRelease: GitHubRelease | null = null;

/**
 * Get cached release (if available)
 */
export function getCachedRelease(): GitHubRelease | null {
  return cachedLatestRelease;
}

/**
 * Set cached release
 */
export function setCachedRelease(release: GitHubRelease | null): void {
  cachedLatestRelease = release;
}

/**
 * Clear cached release
 */
export function clearCachedRelease(): void {
  cachedLatestRelease = null;
}

/**
 * Check GitHub Releases for the latest version
 */
export async function checkForUpdates(): Promise<AutoBuildUpdateCheck> {
  // Use effective version which accounts for source updates
  const currentVersion = getEffectiveVersion();
  debugLog('[UpdateCheck] Current effective version:', currentVersion);

  try {
    // Fetch latest release from GitHub Releases API
    const releaseUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases/latest`;
    const release = await fetchJson<GitHubRelease>(releaseUrl);

    // Cache for download function
    setCachedRelease(release);

    // Parse version from tag (e.g., "v1.2.0" -> "1.2.0")
    const latestVersion = parseVersionFromTag(release.tag_name);
    debugLog('[UpdateCheck] Latest version:', latestVersion);

    // Compare versions
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;
    debugLog('[UpdateCheck] Update available:', updateAvailable);

    return {
      updateAvailable,
      currentVersion,
      latestVersion,
      releaseNotes: release.body || undefined,
      releaseUrl: release.html_url || undefined
    };
  } catch (error) {
    // Clear cache on error
    clearCachedRelease();
    debugLog('[UpdateCheck] Error:', error instanceof Error ? error.message : error);

    return {
      updateAvailable: false,
      currentVersion,
      error: error instanceof Error ? error.message : 'Failed to check for updates'
    };
  }
}
