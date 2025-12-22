/**
 * Type definitions for Auto Claude updater system
 */

/**
 * GitHub Release API response (partial)
 */
export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  tarball_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * Result of checking for updates
 */
export interface AutoBuildUpdateCheck {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  error?: string;
}

/**
 * Result of applying an update
 */
export interface AutoBuildUpdateResult {
  success: boolean;
  version?: string;
  error?: string;
}

/**
 * Update progress stages
 */
export type UpdateStage = 'checking' | 'downloading' | 'extracting' | 'complete' | 'error';

/**
 * Progress callback for download
 */
export type UpdateProgressCallback = (progress: {
  stage: UpdateStage;
  percent?: number;
  message: string;
}) => void;

/**
 * Update metadata stored after successful update
 */
export interface UpdateMetadata {
  version: string;
  updatedAt: string;
  source: string;
  releaseTag: string;
  releaseName: string;
}
