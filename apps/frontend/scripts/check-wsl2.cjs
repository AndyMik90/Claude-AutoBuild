/**
 * WSL2 Detection Script
 *
 * Validates that the development environment is running in WSL2 before allowing
 * --no-sandbox flag usage. This prevents accidental use of disabled Chromium
 * sandbox outside of WSL2 environments where it's required.
 *
 * Usage: node scripts/check-wsl2.cjs
 * Exit codes:
 *   0 - Running in WSL2 (safe to use --no-sandbox)
 *   1 - Not running in WSL2 (should not use --no-sandbox)
 */

const fs = require('fs');

/**
 * Check if running in WSL2 environment
 * @returns {boolean} true if in WSL2, false otherwise
 */
function isWSL2() {
  // Method 1: Check WSL_DISTRO_NAME environment variable
  if (process.env.WSL_DISTRO_NAME) {
    return true;
  }

  // Method 2: Check /proc/version for WSL2 signature (Linux only)
  if (process.platform === 'linux') {
    try {
      const versionInfo = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
      // WSL2 typically contains 'microsoft' and 'wsl2' in kernel version
      if (versionInfo.includes('microsoft') && versionInfo.includes('wsl2')) {
        return true;
      }
      // Older WSL2 versions might only have 'microsoft'
      if (versionInfo.includes('microsoft')) {
        return true;
      }
    } catch {
      // /proc/version doesn't exist or can't be read
      return false;
    }
  }

  // Method 3: Check for WSL interop (wsl.exe in PATH)
  if (process.platform === 'linux') {
    try {
      const { execSync } = require('child_process');
      execSync('which wsl.exe', { stdio: 'ignore' });
      return true;
    } catch {
      // wsl.exe not found
    }
  }

  return false;
}

// Main execution
const isWsl2 = isWSL2();

if (isWsl2) {
  console.log('✓ WSL2 environment detected - --no-sandbox flag is safe to use');
  process.exit(0);
} else {
  console.error('✗ Not running in WSL2!');
  console.error('');
  console.error('The dev:wsl2 script is designed for WSL2 environments only.');
  console.error('It disables Chromium sandbox (--no-sandbox) which is a security risk outside WSL2.');
  console.error('');
  console.error('Please use one of these alternatives:');
  console.error('  • npm run dev        - Development mode with Chromium sandbox enabled');
  console.error('  • npm run dev:debug  - Debug mode with Chromium sandbox enabled');
  console.error('');
  console.error('If you are in WSL2 but seeing this error, check:');
  console.error('  1. WSL_DISTRO_NAME environment variable is set');
  console.error('  2. Running WSL2 (not WSL1): wsl.exe --list --verbose');
  process.exit(1);
}
