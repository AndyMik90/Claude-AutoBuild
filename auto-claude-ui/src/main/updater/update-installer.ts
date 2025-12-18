/**
 * Update installation and application
 */

import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import { GITHUB_CONFIG, PRESERVE_FILES } from './config';
import { downloadFile, fetchJson } from './http-client';
import { parseVersionFromTag } from './version-manager';
import { getUpdateCachePath, getUpdateTargetPath } from './path-resolver';
import { extractTarball, copyDirectoryRecursive, preserveFiles, restoreFiles, cleanTargetDirectory } from './file-operations';
import { getCachedRelease, setCachedRelease, clearCachedRelease } from './update-checker';
import { GitHubRelease, AutoBuildUpdateResult, UpdateProgressCallback, UpdateMetadata } from './types';

/**
 * Download and apply the latest auto-claude update from GitHub Releases
 *
 * Note: In production, this updates the bundled source in userData.
 * For packaged apps, we can't modify resourcesPath directly,
 * so we use a "source override" system.
 */
export async function downloadAndApplyUpdate(
  onProgress?: UpdateProgressCallback
): Promise<AutoBuildUpdateResult> {
  const cachePath = getUpdateCachePath();

  try {
    onProgress?.({
      stage: 'checking',
      message: 'Fetching release info...'
    });

    // Ensure cache directory exists
    if (!existsSync(cachePath)) {
      mkdirSync(cachePath, { recursive: true });
    }

    // Get release info (use cache or fetch fresh)
    let release = getCachedRelease();
    if (!release) {
      const releaseUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/releases/latest`;
      release = await fetchJson<GitHubRelease>(releaseUrl);
      setCachedRelease(release);
    }

    // Use the release tarball URL
    const tarballUrl = release.tarball_url;
    const releaseVersion = parseVersionFromTag(release.tag_name);

    const tarballPath = path.join(cachePath, 'auto-claude-update.tar.gz');
    const extractPath = path.join(cachePath, 'extracted');

    // Clean up previous extraction
    if (existsSync(extractPath)) {
      rmSync(extractPath, { recursive: true, force: true });
    }
    mkdirSync(extractPath, { recursive: true });

    onProgress?.({
      stage: 'downloading',
      percent: 0,
      message: 'Downloading update...'
    });

    // Download the tarball
    await downloadFile(tarballUrl, tarballPath, (percent) => {
      onProgress?.({
        stage: 'downloading',
        percent,
        message: `Downloading... ${percent}%`
      });
    });

    onProgress?.({
      stage: 'extracting',
      message: 'Extracting update...'
    });

    // Extract the tarball
    await extractTarball(tarballPath, extractPath);

    // Find the auto-claude folder in extracted content
    // GitHub tarballs have a root folder like "owner-repo-hash/"
    const extractedDirs = readdirSync(extractPath);
    if (extractedDirs.length === 0) {
      throw new Error('Empty tarball');
    }

    const rootDir = path.join(extractPath, extractedDirs[0]);
    const autoBuildSource = path.join(rootDir, GITHUB_CONFIG.autoBuildPath);

    if (!existsSync(autoBuildSource)) {
      throw new Error('auto-claude folder not found in download');
    }

    // Determine where to install the update
    const targetPath = getUpdateTargetPath();

    // Backup existing source (if in dev mode)
    const backupPath = path.join(cachePath, 'backup');
    if (!app.isPackaged && existsSync(targetPath)) {
      if (existsSync(backupPath)) {
        rmSync(backupPath, { recursive: true, force: true });
      }
      // Simple copy for backup
      copyDirectoryRecursive(targetPath, backupPath);
    }

    // Apply the update
    await applyUpdate(targetPath, autoBuildSource);

    // Write update metadata
    const metadata: UpdateMetadata = {
      version: releaseVersion,
      updatedAt: new Date().toISOString(),
      source: 'github-release',
      releaseTag: release.tag_name,
      releaseName: release.name
    };
    writeUpdateMetadata(targetPath, metadata);

    // Clear the cache after successful update
    clearCachedRelease();

    // Cleanup
    rmSync(tarballPath, { force: true });
    rmSync(extractPath, { recursive: true, force: true });

    onProgress?.({
      stage: 'complete',
      message: `Updated to version ${releaseVersion}`
    });

    return {
      success: true,
      version: releaseVersion
    };
  } catch (error) {
    onProgress?.({
      stage: 'error',
      message: error instanceof Error ? error.message : 'Update failed'
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Apply update to target directory
 */
async function applyUpdate(targetPath: string, sourcePath: string): Promise<void> {
  if (existsSync(targetPath)) {
    // Preserve important files
    const preservedContent = preserveFiles(targetPath, PRESERVE_FILES);

    // Clean target but preserve certain files
    cleanTargetDirectory(targetPath, PRESERVE_FILES);

    // Copy new files
    copyDirectoryRecursive(sourcePath, targetPath, true);

    // Restore preserved files that might have been overwritten
    restoreFiles(targetPath, preservedContent);
  } else {
    mkdirSync(targetPath, { recursive: true });
    copyDirectoryRecursive(sourcePath, targetPath, false);
  }
}

/**
 * Write update metadata to disk
 */
function writeUpdateMetadata(targetPath: string, metadata: UpdateMetadata): void {
  const metadataPath = path.join(targetPath, '.update-metadata.json');
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
}
