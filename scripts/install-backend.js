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

// Find Python 3.12
function findPython() {
  const candidates = isWindows
    ? ['py -3.12', 'python3.12', 'python']
    : ['python3.12', 'python3', 'python'];

  for (const cmd of candidates) {
    try {
      const result = spawnSync(cmd.split(' ')[0], [...cmd.split(' ').slice(1), '--version'], {
        encoding: 'utf8',
        shell: true,
      });
      if (result.status === 0 && result.stdout.includes('3.12')) {
        console.log(`Found Python 3.12: ${cmd} -> ${result.stdout.trim()}`);
        return cmd;
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
  // Check for Python 3.12
  const python = findPython();
  if (!python) {
    console.error('\nError: Python 3.12 is required but not found.');
    console.error('Please install Python 3.12:');
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

  // Install dependencies
  console.log('\nInstalling dependencies...');
  const pip = getPipPath();
  if (!run(`"${pip}" install -r requirements.txt`)) {
    console.error('Failed to install dependencies');
    process.exit(1);
  }

  console.log('\nBackend installation complete!');
  console.log(`Virtual environment: ${venvDir}`);
}

main().catch((err) => {
  console.error('Installation failed:', err);
  process.exit(1);
});
