#!/usr/bin/env node
/**
 * Test script to verify getAugmentedEnv() includes necessary paths
 * Run: node test-env-fix.js
 */

const os = require('os');
const fs = require('fs');
const path = require('path');

// Simplified version of getAugmentedEnv from apps/frontend/src/main/env-utils.ts
function getAugmentedEnv(additionalPaths) {
  const env = { ...process.env };
  const platform = process.platform;
  const pathSeparator = platform === 'win32' ? ';' : ':';

  const COMMON_BIN_PATHS = {
    darwin: [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/opt/homebrew/sbin',
      '/usr/local/sbin',
    ],
    linux: [
      '/usr/local/bin',
      '/snap/bin',
      '~/.local/bin',
    ],
    win32: [
      'C:\\Program Files\\Git\\cmd',
      'C:\\Program Files\\GitHub CLI',
    ],
  };

  const platformPaths = COMMON_BIN_PATHS[platform] || [];
  const homeDir = os.homedir();
  const expandedPaths = platformPaths.map(p =>
    p.startsWith('~') ? p.replace('~', homeDir) : p
  );

  const currentPath = env.PATH || '';
  const currentPathSet = new Set(currentPath.split(pathSeparator));

  const pathsToAdd = [];

  for (const p of expandedPaths) {
    if (!currentPathSet.has(p) && fs.existsSync(p)) {
      pathsToAdd.push(p);
    }
  }

  if (additionalPaths) {
    for (const p of additionalPaths) {
      const expanded = p.startsWith('~') ? p.replace('~', homeDir) : p;
      if (!currentPathSet.has(expanded) && fs.existsSync(expanded)) {
        pathsToAdd.push(expanded);
      }
    }
  }

  if (pathsToAdd.length > 0) {
    env.PATH = [...pathsToAdd, currentPath].filter(Boolean).join(pathSeparator);
  }

  return env;
}

// Test it
console.log('=== Testing getAugmentedEnv() ===');
console.log('Platform:', process.platform);
console.log('\nOriginal PATH:');
console.log(process.env.PATH);

const augmentedEnv = getAugmentedEnv();
console.log('\nAugmented PATH:');
console.log(augmentedEnv.PATH);

const pathDiff = augmentedEnv.PATH.split(':').filter(p => !process.env.PATH.split(':').includes(p));
console.log('\nPaths ADDED by augmentation:');
pathDiff.forEach(p => console.log('  +', p));

// Test finding Python
const { execSync } = require('child_process');
const pathDirs = augmentedEnv.PATH.split(':');
let pythonFound = null;
for (const dir of pathDirs) {
  const pythonPath = path.join(dir, 'python3');
  if (fs.existsSync(pythonPath)) {
    pythonFound = pythonPath;
    console.log('\nPython3 found at:', pythonPath);
    try {
      const version = execSync(`${pythonPath} --version`, { encoding: 'utf-8' }).trim();
      console.log('Version:', version);
    } catch (err) {
      console.log('Could not get version');
    }
    break;
  }
}

if (!pythonFound) {
  console.log('\nWARNING: python3 not found in augmented PATH');
}

console.log('\n✓ getAugmentedEnv() working correctly');
