/**
 * Auto Claude Source Updater
 *
 * Checks GitHub Releases for updates and downloads them.
 * GitHub Releases are the single source of truth for versioning.
 *
 * Update flow:
 * 1. Check GitHub Releases API for the latest release
 * 2. Compare release tag with current app version
 * 3. If update available, download release tarball and apply
 * 4. Existing project update system handles pushing to individual projects
 *
 * Versioning:
 * - Single source of truth: GitHub Releases
 * - Current version: app.getVersion() (from package.json at build time)
 * - Latest version: Fetched from GitHub Releases API
 * - To release: Create a GitHub release with tag (e.g., v1.2.0)
 */

// Export types
export type {
  GitHubRelease,
  AutoBuildUpdateCheck,
  AutoBuildUpdateResult,
  UpdateProgressCallback,
  UpdateMetadata
} from './updater/types';

// Export version management
export { getBundledVersion, getEffectiveVersion } from './updater/version-manager';

// Export path resolution
export {
  getBundledSourcePath,
  getEffectiveSourcePath
} from './updater/path-resolver';

// Export update checking
export { checkForUpdates } from './updater/update-checker';

// Export update installation
export { downloadAndApplyUpdate } from './updater/update-installer';

// Export update status
export {
  hasPendingSourceUpdate,
  getUpdateMetadata
} from './updater/update-status';
