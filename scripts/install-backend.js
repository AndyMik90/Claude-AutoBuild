#!/usr/bin/env node
/**
 * Cross-platform backend installer script
 * Handles Python venv creation and dependency installation on Windows/Mac/Linux
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isWindows = os.platform() === 'win32';
const backendDir = path.join(__dirname, '..', 'apps', 'backend');
const venvDir = path.join(backendDir, '.venv');

console.log('Installing Auto Claude backend dependencies...\n');

// Helper to run commands
function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: backendDir, ...options });
    return true;
  } catch (error) {
    return false;
  }
}

// Helper to run command and capture output
function runCapture(cmd, options = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: backendDir, ...options });
  } catch (error) {
    return null;
  }
}

// Retry logic for pip install with fallback options
function pipInstall(pip, requirements, retries = 3) {
  const installOptions = [
    // First attempt: prefer pre-built wheels, no cache
    {
      flags: 'install --prefer-binary --no-cache-dir',
      desc: 'prefer-binary (wheels)'
    },
    // Second attempt: force reinstall, clear cache
    {
      flags: 'install --force-reinstall --no-cache-dir',
      desc: 'force-reinstall'
    },
    // Third attempt: upgrade all dependencies
    {
      flags: 'install --upgrade --no-cache-dir',
      desc: 'upgrade all'
    },
    // Last resort: compile from source
    {
      flags: 'install --no-binary :all: --no-cache-dir',
      desc: 'from source'
    }
  ];

  for (let i = 0; i < Math.min(retries, installOptions.length); i++) {
    const option = installOptions[i];
    console.log(`\nAttempt ${i + 1}: pip ${option.flags} ${requirements}`);

    const cmd = `"${pip}" ${option.flags} ${requirements}`;
    if (run(cmd)) {
      console.log(`✓ Installation succeeded with: ${option.desc}`);
      return true;
    }

    console.warn(`✗ Attempt ${i + 1} failed with: ${option.desc}`);
  }

  return false;
}

// Find Python 3.12+
// Prefer 3.12 first since it has the most stable wheel support for native packages
function findPython() {
  const candidates = isWindows
    ? ['py -3.12', 'py -3.13', 'py -3.14', 'python3.12', 'python3.13', 'python3.14', 'python3', 'python']
    : ['python3.12', 'python3.13', 'python3.14', 'python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd.split(' ')[0], [...cmd.split(' ').slice(1), '--version'], {
        encoding: 'utf8',
        shell: true,
      });
      // Accept Python 3.12+ using proper version parsing
      if (result.status === 0) {
        const versionMatch = result.stdout.match(/Python (\d+)\.(\d+)/);
        if (versionMatch) {
          const major = parseInt(versionMatch[1], 10);
          const minor = parseInt(versionMatch[2], 10);
          if (major === 3 && minor >= 12) {
            console.log(`Found Python 3.12+: ${cmd} -> ${result.stdout.trim()}`);
            return cmd;
          }
        }
      }
    } catch (e) {
      // Continue to next candidate
    }
  }
  return null;
}

// Get pip path based on platform
function getPipPath() {
  return isWindows
    ? path.join(venvDir, 'Scripts', 'pip.exe')
    : path.join(venvDir, 'bin', 'pip');
}

// Main installation
async function main() {
  // Check for Python 3.12+
  const python = findPython();
  if (!python) {
    console.error('\nError: Python 3.12+ is required but not found.');
    console.error('Please install Python 3.12 or higher:');
    if (isWindows) {
      console.error('  winget install Python.Python.3.12');
    } else if (os.platform() === 'darwin') {
      console.error('  brew install python@3.12');
    } else {
      console.error('  sudo apt install python3.12 python3.12-venv');
    }
    process.exit(1);
  }

  // Remove existing venv if present
  if (fs.existsSync(venvDir)) {
    console.log('\nRemoving existing virtual environment...');
    fs.rmSync(venvDir, { recursive: true, force: true });
  }

  // Create virtual environment
  console.log('\nCreating virtual environment...');
  if (!run(`${python} -m venv .venv`)) {
    console.error('Failed to create virtual environment');
    process.exit(1);
  }

  // Install dependencies with retry logic
  console.log('\nInstalling dependencies...');
  const pip = getPipPath();

  // Upgrade pip and setuptools first for better compatibility
  console.log('\nUpgrading pip and setuptools...');
  run(`"${pip}" install --upgrade pip setuptools wheel --no-cache-dir`);

  // Install dependencies with robust retry logic
  if (!pipInstall(pip, '-r requirements.txt', 4)) {
    console.error('\nFailed to install dependencies after multiple attempts.');
    console.error('Please check your Python installation and try again.');
    console.error('If the issue persists, try installing with verbose output:');
    console.error(`  "${pip}" install -r requirements.txt -v`);
    process.exit(1);
  }

  // Verify critical imports
  console.log('\nVerifying critical packages...');
  const pythonBin = isWindows
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python');

  const verifyCmd = `"${pythonBin}" -c "import pydantic_core._pydantic_core; import pydantic; from claude_agent_sdk import ClaudeSDKClient; print('✓ All critical imports verified')"`;

  if (!run(verifyCmd)) {
    console.error('\nPackage verification failed. Some packages may be corrupted.');
    console.error('Attempting reinstall of problematic packages...');

    // Try reinstalling critical packages individually
    const criticalPackages = ['pydantic-core', 'pydantic', 'claude-agent-sdk'];
    for (const pkg of criticalPackages) {
      console.log(`\nReinstalling ${pkg}...`);
      pipInstall(pip, `--force-reinstall ${pkg}`, 2);
    }

    // Verify again
    if (!run(verifyCmd)) {
      console.error('\nVerification failed after reinstall attempt.');
      console.error('Please try manually:');
      console.error(`  1. Delete .venv folder: rm -rf ${venvDir}`);
      console.error(`  2. Run installer again: npm run install:backend`);
      process.exit(1);
    }
  }
  console.log('✓ All packages verified successfully');

  // Create .env file from .env.example if it doesn't exist
  const envPath = path.join(backendDir, '.env');
  const envExamplePath = path.join(backendDir, '.env.example');

  if (fs.existsSync(envPath)) {
    console.log('\n✓ .env file already exists');
  } else if (fs.existsSync(envExamplePath)) {
    console.log('\nCreating .env file from .env.example...');
    try {
      fs.copyFileSync(envExamplePath, envPath);
      console.log('✓ Created .env file');
      console.log('  Please configure it with your credentials:');
      console.log(`  - Run: claude setup-token`);
      console.log(`  - Or edit: ${envPath}`);
    } catch (error) {
      console.warn('Warning: Could not create .env file:', error.message);
      console.warn('You will need to manually copy .env.example to .env');
    }
  } else {
    console.warn('\nWarning: .env.example not found. Cannot auto-create .env file.');
    console.warn('Please create a .env file manually if your configuration requires it.');
  }

  console.log('\nBackend installation complete!');
  console.log(`Virtual environment: ${venvDir}`);
}

main().catch((err) => {
  console.error('Installation failed:', err);
  process.exit(1);
});
