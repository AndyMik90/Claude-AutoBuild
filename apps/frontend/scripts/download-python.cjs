#!/usr/bin/env node
/**
 * Download Python from python-build-standalone for bundling with the Electron app.
 *
 * This script downloads a standalone Python distribution that can be bundled
 * with the packaged Electron app, eliminating the need for users to have
 * Python installed on their system.
 *
 * Usage:
 *   node scripts/download-python.cjs [--platform <platform>] [--arch <arch>]
 *
 * Platforms: darwin, win32, linux
 * Architectures: x64, arm64
 *
 * If not specified, uses current platform/arch.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
// Note: crypto.createHash could be used for checksum verification in future

// Python version to bundle (must be 3.10+ for claude-agent-sdk, 3.12+ for full Graphiti support)
const PYTHON_VERSION = '3.12.8';

// python-build-standalone release tag
const RELEASE_TAG = '20241219';

// Base URL for downloads
const BASE_URL = `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}`;

// Output directory for downloaded Python (relative to frontend root)
const OUTPUT_DIR = 'python-runtime';

/**
 * Get the download URL for a specific platform/arch combination.
 * python-build-standalone uses specific naming conventions.
 */
function getDownloadInfo(platform, arch) {
  const version = PYTHON_VERSION;

  // Map platform/arch to python-build-standalone naming
  const configs = {
    'darwin-arm64': {
      filename: `cpython-${version}+${RELEASE_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz`,
      extractDir: 'python',
    },
    'darwin-x64': {
      filename: `cpython-${version}+${RELEASE_TAG}-x86_64-apple-darwin-install_only_stripped.tar.gz`,
      extractDir: 'python',
    },
    'win32-x64': {
      filename: `cpython-${version}+${RELEASE_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`,
      extractDir: 'python',
    },
    'linux-x64': {
      filename: `cpython-${version}+${RELEASE_TAG}-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz`,
      extractDir: 'python',
    },
    'linux-arm64': {
      filename: `cpython-${version}+${RELEASE_TAG}-aarch64-unknown-linux-gnu-install_only_stripped.tar.gz`,
      extractDir: 'python',
    },
  };

  const key = `${platform}-${arch}`;
  const config = configs[key];

  if (!config) {
    throw new Error(`Unsupported platform/arch combination: ${key}. Supported: ${Object.keys(configs).join(', ')}`);
  }

  return {
    url: `${BASE_URL}/${config.filename}`,
    filename: config.filename,
    extractDir: config.extractDir,
    outputDir: `${platform}-${arch}`,
  };
}

/**
 * Download a file from URL to destination path.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`[download-python] Downloading from: ${url}`);

    const file = fs.createWriteStream(destPath);

    const request = (urlString) => {
      https.get(urlString, (response) => {
        // Handle redirects (GitHub uses them)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`[download-python] Following redirect...`);
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          if (percent >= lastPercent + 10) {
            console.log(`[download-python] Progress: ${percent}%`);
            lastPercent = percent;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`[download-python] Download complete: ${destPath}`);
          resolve();
        });
      }).on('error', (err) => {
        fs.unlink(destPath, () => {}); // Clean up partial file
        reject(err);
      });
    };

    request(url);
  });
}

/**
 * Extract a tar.gz file.
 */
function extractTarGz(archivePath, destDir) {
  console.log(`[download-python] Extracting to: ${destDir}`);

  // Ensure destination exists
  fs.mkdirSync(destDir, { recursive: true });

  // Use tar command (available on all platforms we support)
  try {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}"`, { stdio: 'inherit' });
    console.log(`[download-python] Extraction complete`);
  } catch (error) {
    throw new Error(`Failed to extract archive: ${error.message}`);
  }
}

/**
 * Main function to download and set up Python.
 */
async function downloadPython(targetPlatform, targetArch) {
  const platform = targetPlatform || os.platform();
  const arch = targetArch || os.arch();

  console.log(`[download-python] Setting up Python ${PYTHON_VERSION} for ${platform}-${arch}`);

  const frontendDir = path.join(__dirname, '..');
  const runtimeDir = path.join(frontendDir, OUTPUT_DIR);
  const info = getDownloadInfo(platform, arch);
  const platformDir = path.join(runtimeDir, info.outputDir);

  // Check if already downloaded
  const pythonBin = platform === 'win32'
    ? path.join(platformDir, 'python', 'python.exe')
    : path.join(platformDir, 'python', 'bin', 'python3');

  if (fs.existsSync(pythonBin)) {
    console.log(`[download-python] Python already exists at ${pythonBin}`);

    // Verify it works
    try {
      const version = execSync(`"${pythonBin}" --version`, { encoding: 'utf-8' }).trim();
      console.log(`[download-python] Verified: ${version}`);
      return { success: true, pythonPath: pythonBin };
    } catch {
      console.log(`[download-python] Existing Python is broken, re-downloading...`);
    }
  }

  // Create directories
  fs.mkdirSync(platformDir, { recursive: true });

  // Download
  const archivePath = path.join(runtimeDir, info.filename);

  if (!fs.existsSync(archivePath)) {
    await downloadFile(info.url, archivePath);
  } else {
    console.log(`[download-python] Using cached archive: ${archivePath}`);
  }

  // Extract
  extractTarGz(archivePath, platformDir);

  // Verify
  if (!fs.existsSync(pythonBin)) {
    throw new Error(`Python binary not found after extraction: ${pythonBin}`);
  }

  // Make executable on Unix
  if (platform !== 'win32') {
    fs.chmodSync(pythonBin, 0o755);
  }

  // Verify it works
  const version = execSync(`"${pythonBin}" --version`, { encoding: 'utf-8' }).trim();
  console.log(`[download-python] Installed: ${version}`);

  // Clean up archive (optional - keep for caching)
  // fs.unlinkSync(archivePath);

  return { success: true, pythonPath: pythonBin };
}

/**
 * Download Python for all platforms (for CI/CD builds).
 */
async function downloadAllPlatforms() {
  const platforms = [
    { platform: 'darwin', arch: 'arm64' },
    { platform: 'darwin', arch: 'x64' },
    { platform: 'win32', arch: 'x64' },
    { platform: 'linux', arch: 'x64' },
    { platform: 'linux', arch: 'arm64' },
  ];

  console.log(`[download-python] Downloading Python for all platforms...`);

  for (const { platform, arch } of platforms) {
    try {
      await downloadPython(platform, arch);
    } catch (error) {
      console.error(`[download-python] Failed for ${platform}-${arch}: ${error.message}`);
      throw error;
    }
  }

  console.log(`[download-python] All platforms downloaded successfully!`);
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  let platform = null;
  let arch = null;
  let allPlatforms = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--platform' && args[i + 1]) {
      platform = args[++i];
    } else if (args[i] === '--arch' && args[i + 1]) {
      arch = args[++i];
    } else if (args[i] === '--all') {
      allPlatforms = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Usage: node download-python.cjs [options]

Options:
  --platform <platform>  Target platform (darwin, win32, linux)
  --arch <arch>          Target architecture (x64, arm64)
  --all                  Download for all supported platforms
  --help, -h             Show this help message

If no options specified, downloads for the current platform/arch.

Examples:
  node download-python.cjs                           # Current platform
  node download-python.cjs --platform darwin --arch arm64
  node download-python.cjs --all                     # All platforms (for CI)
`);
      process.exit(0);
    }
  }

  try {
    if (allPlatforms) {
      await downloadAllPlatforms();
    } else {
      await downloadPython(platform, arch);
    }
    console.log('[download-python] Done!');
  } catch (error) {
    console.error(`[download-python] Error: ${error.message}`);
    process.exit(1);
  }
}

// Export for use in other scripts
module.exports = { downloadPython, downloadAllPlatforms, getDownloadInfo };

// Run if called directly
if (require.main === module) {
  main();
}
