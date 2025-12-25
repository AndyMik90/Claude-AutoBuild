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
 * Platforms: darwin/mac, win32/win, linux
 * Architectures: x64, arm64
 *
 * If not specified, uses current platform/arch.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');
const nodeCrypto = require('crypto');

// Python version to bundle (must be 3.10+ for claude-agent-sdk, 3.12+ for full Graphiti support)
const PYTHON_VERSION = '3.12.8';

// python-build-standalone release tag
const RELEASE_TAG = '20241219';

// Base URL for downloads
const BASE_URL = `https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_TAG}`;

// Output directory for downloaded Python (relative to frontend root)
const OUTPUT_DIR = 'python-runtime';

// SHA256 checksums for verification (from python-build-standalone release)
// These must be updated when changing PYTHON_VERSION or RELEASE_TAG
// Get checksums from: https://github.com/indygreg/python-build-standalone/releases/download/{RELEASE_TAG}/SHA256SUMS
const CHECKSUMS = {
  'darwin-arm64': 'abe1de2494bb8b243fd507944f4d50292848fa00685d5288c858a72623a16635',
  'darwin-x64': '867c1af10f204224b571f8f2593fc9eb580fe0c2376224d1096ebe855ad8c722',
  'win32-x64': '1a702b3463cf87ec0d2e33902a47e95456053b0178fe96bd673c1dbb554f5d15',
  'linux-x64': '698e53b264a9bcd35cfa15cd680c4d78b0878fa529838844b5ffd0cd661d6bc2',
  'linux-arm64': 'fb983ec85952513f5f013674fcbf4306b1a142c50fcfd914c2c3f00c61a874b0',
};

// Map Node.js platform names to electron-builder platform names
function toElectronBuilderPlatform(nodePlatform) {
  const map = {
    'darwin': 'mac',
    'win32': 'win',
    'linux': 'linux',
  };
  return map[nodePlatform] || nodePlatform;
}

// Map electron-builder platform names to Node.js platform names (for internal use)
function toNodePlatform(platform) {
  const map = {
    'mac': 'darwin',
    'win': 'win32',
    'darwin': 'darwin',
    'win32': 'win32',
    'linux': 'linux',
  };
  return map[platform] || platform;
}

/**
 * Get the download URL for a specific platform/arch combination.
 * python-build-standalone uses specific naming conventions.
 *
 * @param {string} platform - Node.js platform (darwin, win32, linux)
 * @param {string} arch - Architecture (x64, arm64)
 */
function getDownloadInfo(platform, arch) {
  // Normalize platform to Node.js naming for internal lookups
  const nodePlatform = toNodePlatform(platform);
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

  const key = `${nodePlatform}-${arch}`;
  const config = configs[key];

  if (!config) {
    throw new Error(`Unsupported platform/arch combination: ${key}. Supported: ${Object.keys(configs).join(', ')}`);
  }

  // Use electron-builder platform naming for output directory
  const ebPlatform = toElectronBuilderPlatform(nodePlatform);

  return {
    url: `${BASE_URL}/${config.filename}`,
    filename: config.filename,
    extractDir: config.extractDir,
    outputDir: `${ebPlatform}-${arch}`,  // e.g., "mac-arm64", "win-x64", "linux-x64"
    nodePlatform,  // For internal checks (darwin, win32, linux)
    checksum: CHECKSUMS[key],
  };
}

/**
 * Download a file from URL to destination path.
 * Includes timeout handling, redirect limits, and proper cleanup.
 */
function downloadFile(url, destPath) {
  const DOWNLOAD_TIMEOUT = 300000; // 5 minutes
  const MAX_REDIRECTS = 10;

  return new Promise((resolve, reject) => {
    console.log(`[download-python] Downloading from: ${url}`);

    let file = null;
    let redirectCount = 0;
    let currentRequest = null;

    const cleanup = () => {
      if (file) {
        file.close();
        file = null;
      }
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath);
        } catch {
          // Ignore cleanup errors
        }
      }
    };

    const request = (urlString) => {
      if (++redirectCount > MAX_REDIRECTS) {
        cleanup();
        reject(new Error(`Too many redirects (max ${MAX_REDIRECTS})`));
        return;
      }

      // Create file stream only on first request
      if (!file) {
        file = fs.createWriteStream(destPath);
      }

      currentRequest = https.get(urlString, { timeout: DOWNLOAD_TIMEOUT }, (response) => {
        // Handle redirects (GitHub uses them)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          console.log(`[download-python] Following redirect...`);
          response.resume(); // Consume response to free up memory
          request(response.headers.location);
          return;
        }

        if (response.statusCode !== 200) {
          cleanup();
          reject(new Error(`Download failed with status ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          if (totalSize > 0) {
            const percent = Math.floor((downloadedSize / totalSize) * 100);
            if (percent >= lastPercent + 10) {
              console.log(`[download-python] Progress: ${percent}%`);
              lastPercent = percent;
            }
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          file = null;
          console.log(`[download-python] Download complete: ${destPath}`);
          resolve();
        });

        file.on('error', (err) => {
          cleanup();
          reject(err);
        });
      });

      currentRequest.on('error', (err) => {
        cleanup();
        reject(err);
      });

      currentRequest.on('timeout', () => {
        currentRequest.destroy();
        cleanup();
        reject(new Error(`Download timeout after ${DOWNLOAD_TIMEOUT / 1000} seconds`));
      });
    };

    request(url);
  });
}

/**
 * Verify file checksum.
 */
function verifyChecksum(filePath, expectedChecksum) {
  if (!expectedChecksum) {
    console.log(`[download-python] Warning: No checksum available for verification`);
    return true;
  }

  console.log(`[download-python] Verifying checksum...`);
  const fileBuffer = fs.readFileSync(filePath);
  const hash = nodeCrypto.createHash('sha256').update(fileBuffer).digest('hex');

  if (hash !== expectedChecksum) {
    throw new Error(`Checksum mismatch! Expected: ${expectedChecksum}, Got: ${hash}`);
  }

  console.log(`[download-python] Checksum verified: ${hash.substring(0, 16)}...`);
  return true;
}

/**
 * Extract a tar.gz file using spawnSync for safety.
 */
function extractTarGz(archivePath, destDir) {
  console.log(`[download-python] Extracting to: ${destDir}`);

  // Ensure destination exists
  fs.mkdirSync(destDir, { recursive: true });

  // Use tar command with array arguments (safer than string interpolation)
  const result = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw new Error(`Failed to extract archive: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Failed to extract archive: tar exited with code ${result.status}`);
  }

  console.log(`[download-python] Extraction complete`);
}

/**
 * Verify Python binary works by checking its version.
 */
function verifyPythonBinary(pythonBin) {
  const result = spawnSync(pythonBin, ['--version'], { encoding: 'utf-8' });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Python verification failed with exit code ${result.status}`);
  }

  // Version output may be on stdout or stderr depending on Python version
  const version = (result.stdout || result.stderr || '').trim();
  return version;
}

/**
 * Main function to download and set up Python.
 */
async function downloadPython(targetPlatform, targetArch) {
  const platform = targetPlatform || os.platform();
  const arch = targetArch || os.arch();

  const info = getDownloadInfo(platform, arch);
  console.log(`[download-python] Setting up Python ${PYTHON_VERSION} for ${info.outputDir}`);

  const frontendDir = path.join(__dirname, '..');
  const runtimeDir = path.join(frontendDir, OUTPUT_DIR);
  const platformDir = path.join(runtimeDir, info.outputDir);

  // Check if already downloaded
  const pythonBin = info.nodePlatform === 'win32'
    ? path.join(platformDir, 'python', 'python.exe')
    : path.join(platformDir, 'python', 'bin', 'python3');

  if (fs.existsSync(pythonBin)) {
    console.log(`[download-python] Python already exists at ${pythonBin}`);

    // Verify it works
    try {
      const version = verifyPythonBinary(pythonBin);
      console.log(`[download-python] Verified: ${version}`);
      return { success: true, pythonPath: pythonBin };
    } catch {
      console.log(`[download-python] Existing Python is broken, re-downloading...`);
      // Remove broken installation
      fs.rmSync(platformDir, { recursive: true, force: true });
    }
  }

  // Create directories
  fs.mkdirSync(platformDir, { recursive: true });

  // Download
  const archivePath = path.join(runtimeDir, info.filename);
  let needsDownload = true;

  if (fs.existsSync(archivePath)) {
    console.log(`[download-python] Found cached archive: ${archivePath}`);
    // Verify cached archive checksum
    try {
      verifyChecksum(archivePath, info.checksum);
      needsDownload = false;
    } catch (err) {
      console.log(`[download-python] Cached archive failed verification: ${err.message}`);
      fs.unlinkSync(archivePath);
    }
  }

  if (needsDownload) {
    await downloadFile(info.url, archivePath);
    // Verify downloaded file
    verifyChecksum(archivePath, info.checksum);
  }

  // Extract
  extractTarGz(archivePath, platformDir);

  // Verify binary exists
  if (!fs.existsSync(pythonBin)) {
    throw new Error(`Python binary not found after extraction: ${pythonBin}`);
  }

  // Make executable on Unix
  if (info.nodePlatform !== 'win32') {
    fs.chmodSync(pythonBin, 0o755);
  }

  // Verify it works
  const version = verifyPythonBinary(pythonBin);
  console.log(`[download-python] Installed: ${version}`);

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

// Valid platforms and architectures (for input validation)
const VALID_PLATFORMS = ['darwin', 'mac', 'win32', 'win', 'linux'];
const VALID_ARCHS = ['x64', 'arm64'];

/**
 * Validate and sanitize CLI input to prevent log injection.
 */
function validateInput(value, validValues, name) {
  if (value === null) return null;

  // Remove any control characters or newlines (ASCII 0-31 and 127)
  // eslint-disable-next-line no-control-regex
  const sanitized = String(value).replace(/[\x00-\x1f\x7f]/g, '');

  if (!validValues.includes(sanitized)) {
    throw new Error(`Invalid ${name}: "${sanitized}". Valid values: ${validValues.join(', ')}`);
  }

  return sanitized;
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
  --platform <platform>  Target platform (darwin/mac, win32/win, linux)
  --arch <arch>          Target architecture (x64, arm64)
  --all                  Download for all supported platforms
  --help, -h             Show this help message

If no options specified, downloads for the current platform/arch.

Examples:
  node download-python.cjs                           # Current platform
  node download-python.cjs --platform darwin --arch arm64
  node download-python.cjs --platform mac --arch arm64  # Electron-builder style
  node download-python.cjs --all                     # All platforms (for CI)
`);
      process.exit(0);
    }
  }

  try {
    // Validate inputs before use
    platform = validateInput(platform, VALID_PLATFORMS, 'platform');
    arch = validateInput(arch, VALID_ARCHS, 'arch');

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
