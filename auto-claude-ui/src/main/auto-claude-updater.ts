/**
 * Auto Claude Source Updater
 *
 * Checks GitHub for updates to the auto-claude framework and downloads them.
 * This allows users to get new auto-claude features without requiring a full app update.
 *
 * Update flow:
 * 1. Check GitHub for latest VERSION file
 * 2. Compare with bundled source version
 * 3. If update available, download and replace bundled source
 * 4. Existing project update system handles pushing to individual projects
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, copyFileSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import https from 'https';
import { createWriteStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * GitHub repository configuration
 */
const GITHUB_CONFIG = {
  owner: 'AndyMik90',
  repo: 'Auto-Claude',
  branch: 'main',
  autoBuildPath: 'auto-claude' // Path within repo
};

/**
 * Result of checking for updates
 */
export interface AutoBuildUpdateCheck {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseNotes?: string;
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
 * Progress callback for download
 */
export type UpdateProgressCallback = (progress: {
  stage: 'checking' | 'downloading' | 'extracting' | 'complete' | 'error';
  percent?: number;
  message: string;
}) => void;

/**
 * Get the path to the bundled auto-claude source
 */
export function getBundledSourcePath(): string {
  // In production, use app resources
  // In development, use the repo's auto-claude folder
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'auto-claude');
  }

  // Development mode - look for auto-claude in various locations
  const possiblePaths = [
    path.join(app.getAppPath(), '..', 'auto-claude'),
    path.join(app.getAppPath(), '..', '..', 'auto-claude'),
    path.join(process.cwd(), 'auto-claude'),
    path.join(process.cwd(), '..', 'auto-claude')
  ];

  for (const p of possiblePaths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Fallback
  return path.join(app.getAppPath(), '..', 'auto-claude');
}

/**
 * Get the path for storing downloaded updates
 */
function getUpdateCachePath(): string {
  return path.join(app.getPath('userData'), 'auto-claude-updates');
}

/**
 * Read the current bundled version
 */
export function getBundledVersion(): string {
  const sourcePath = getBundledSourcePath();
  const versionFile = path.join(sourcePath, 'VERSION');

  if (existsSync(versionFile)) {
    return readFileSync(versionFile, 'utf-8').trim();
  }

  return '0.0.0';
}

/**
 * Fetch content from a URL using https
 */
function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        'User-Agent': 'Auto-Claude-UI',
        'Accept': 'application/vnd.github.v3.raw'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          fetchUrl(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
      response.on('error', reject);
    });

    request.on('error', reject);
    request.setTimeout(10000, () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Check GitHub for the latest version
 */
export async function checkForUpdates(): Promise<AutoBuildUpdateCheck> {
  const currentVersion = getBundledVersion();

  try {
    // Fetch VERSION file from GitHub
    const versionUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.autoBuildPath}/VERSION`;
    const latestVersion = (await fetchUrl(versionUrl)).trim();

    // Compare versions
    const updateAvailable = compareVersions(latestVersion, currentVersion) > 0;

    // If update available, try to fetch release notes
    let releaseNotes: string | undefined;
    if (updateAvailable) {
      try {
        const changelogUrl = `https://raw.githubusercontent.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/${GITHUB_CONFIG.branch}/${GITHUB_CONFIG.autoBuildPath}/CHANGELOG.md`;
        releaseNotes = await fetchUrl(changelogUrl);
      } catch {
        // Changelog is optional
      }
    }

    return {
      updateAvailable,
      currentVersion,
      latestVersion,
      releaseNotes
    };
  } catch (error) {
    return {
      updateAvailable: false,
      currentVersion,
      error: error instanceof Error ? error.message : 'Failed to check for updates'
    };
  }
}

/**
 * Compare semantic versions
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;

    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }

  return 0;
}

/**
 * Download a file with progress tracking
 */
function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);

    const request = https.get(url, {
      headers: {
        'User-Agent': 'Auto-Claude-UI',
        'Accept': 'application/octet-stream'
      }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0 && onProgress) {
          onProgress(Math.round((downloadedSize / totalSize) * 100));
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        file.close();
        reject(err);
      });
    });

    request.on('error', (err) => {
      file.close();
      reject(err);
    });

    request.setTimeout(60000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Download and apply the latest auto-claude update
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
      message: 'Checking for updates...'
    });

    // Ensure cache directory exists
    if (!existsSync(cachePath)) {
      mkdirSync(cachePath, { recursive: true });
    }

    // Get download URL for the tarball
    const tarballUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/tarball/${GITHUB_CONFIG.branch}`;

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
    let targetPath: string;

    if (app.isPackaged) {
      // For packaged apps, store in userData as a source override
      targetPath = path.join(app.getPath('userData'), 'auto-claude-source');
    } else {
      // In development, update the actual source
      targetPath = getBundledSourcePath();
    }

    // Backup existing source (if in dev mode)
    const backupPath = path.join(cachePath, 'backup');
    if (!app.isPackaged && existsSync(targetPath)) {
      if (existsSync(backupPath)) {
        rmSync(backupPath, { recursive: true, force: true });
      }
      // Simple copy for backup
      copyDirectoryRecursive(targetPath, backupPath);
    }

    // Copy new source to target
    if (existsSync(targetPath)) {
      // Clean target but preserve certain files
      const preserveFiles = ['.env', 'specs'];
      const preservedContent: Record<string, Buffer> = {};

      for (const file of preserveFiles) {
        const filePath = path.join(targetPath, file);
        if (existsSync(filePath)) {
          if (statSync(filePath).isDirectory()) {
            // Skip directories for now - they'll be preserved by copyDirectoryRecursive
          } else {
            preservedContent[file] = readFileSync(filePath);
          }
        }
      }

      // Remove old files except preserved
      const items = readdirSync(targetPath);
      for (const item of items) {
        if (!preserveFiles.includes(item)) {
          rmSync(path.join(targetPath, item), { recursive: true, force: true });
        }
      }

      // Copy new files
      copyDirectoryRecursive(autoBuildSource, targetPath, true);

      // Restore preserved files that might have been overwritten
      for (const [file, content] of Object.entries(preservedContent)) {
        writeFileSync(path.join(targetPath, file), content);
      }
    } else {
      mkdirSync(targetPath, { recursive: true });
      copyDirectoryRecursive(autoBuildSource, targetPath, false);
    }

    // Read the new version
    const versionFile = path.join(targetPath, 'VERSION');
    const newVersion = existsSync(versionFile)
      ? readFileSync(versionFile, 'utf-8').trim()
      : 'unknown';

    // Write update metadata
    const metadataPath = path.join(targetPath, '.update-metadata.json');
    writeFileSync(metadataPath, JSON.stringify({
      version: newVersion,
      updatedAt: new Date().toISOString(),
      source: 'github',
      branch: GITHUB_CONFIG.branch
    }, null, 2));

    // Cleanup
    rmSync(tarballPath, { force: true });
    rmSync(extractPath, { recursive: true, force: true });

    onProgress?.({
      stage: 'complete',
      message: `Updated to version ${newVersion}`
    });

    return {
      success: true,
      version: newVersion
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
 * Extract a .tar.gz file
 * Uses system tar command on Unix or PowerShell on Windows
 */
async function extractTarball(tarballPath: string, destPath: string): Promise<void> {
  try {
    if (process.platform === 'win32') {
      // On Windows, try multiple approaches:
      // 1. Modern Windows 10/11 has built-in tar
      // 2. Fall back to PowerShell's Expand-Archive for .zip (but .tar.gz needs tar)
      // 3. Use PowerShell to extract via .NET
      try {
        // First try native tar (available on Windows 10 1803+)
        await execAsync(`tar -xzf "${tarballPath}" -C "${destPath}"`);
      } catch {
        // Fall back to PowerShell with .NET for gzip decompression
        // This is more complex but works on older Windows versions
        const psScript = `
          $tarball = "${tarballPath.replace(/\\/g, '\\\\')}"
          $dest = "${destPath.replace(/\\/g, '\\\\')}"
          $tempTar = Join-Path $env:TEMP "auto-claude-update.tar"

          # Decompress gzip
          $gzipStream = [System.IO.File]::OpenRead($tarball)
          $decompressedStream = New-Object System.IO.Compression.GZipStream($gzipStream, [System.IO.Compression.CompressionMode]::Decompress)
          $tarStream = [System.IO.File]::Create($tempTar)
          $decompressedStream.CopyTo($tarStream)
          $tarStream.Close()
          $decompressedStream.Close()
          $gzipStream.Close()

          # Extract tar using tar command (should work even if gzip didn't)
          tar -xf $tempTar -C $dest
          Remove-Item $tempTar -Force
        `;
        await execAsync(`powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
      }
    } else {
      // Unix systems - use native tar
      await execAsync(`tar -xzf "${tarballPath}" -C "${destPath}"`);
    }
  } catch (error) {
    throw new Error(`Failed to extract tarball: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Recursively copy directory
 */
function copyDirectoryRecursive(
  src: string,
  dest: string,
  preserveExisting: boolean = false
): void {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }

  const entries = readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip certain files/directories
    if (['__pycache__', '.DS_Store', '.git', 'specs', '.env'].includes(entry.name)) {
      continue;
    }

    // In preserve mode, skip existing files
    if (preserveExisting && existsSync(destPath)) {
      if (entry.isDirectory()) {
        copyDirectoryRecursive(srcPath, destPath, preserveExisting);
      }
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, preserveExisting);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Get the effective source path (considers override from updates)
 */
export function getEffectiveSourcePath(): string {
  if (app.isPackaged) {
    // Check for user-updated source first
    const overridePath = path.join(app.getPath('userData'), 'auto-claude-source');
    if (existsSync(overridePath)) {
      return overridePath;
    }
  }

  return getBundledSourcePath();
}

/**
 * Check if there's a pending source update that requires restart
 */
export function hasPendingSourceUpdate(): boolean {
  if (!app.isPackaged) {
    return false;
  }

  const overridePath = path.join(app.getPath('userData'), 'auto-claude-source');
  const metadataPath = path.join(overridePath, '.update-metadata.json');

  if (!existsSync(metadataPath)) {
    return false;
  }

  try {
    const metadata = JSON.parse(readFileSync(metadataPath, 'utf-8'));
    const bundledVersion = getBundledVersion();
    return compareVersions(metadata.version, bundledVersion) > 0;
  } catch {
    return false;
  }
}
