#!/usr/bin/env node

/**
 * Version Bump Script
 *
 * Automatically bumps the version in package.json and creates a git tag.
 * This ensures version consistency between package.json and git tags.
 *
 * Usage:
 *   node scripts/bump-version.js <major|minor|patch|x.y.z>
 *
 * Examples:
 *   node scripts/bump-version.js patch   # 2.5.5 -> 2.5.6
 *   node scripts/bump-version.js minor   # 2.5.5 -> 2.6.0
 *   node scripts/bump-version.js major   # 2.5.5 -> 3.0.0
 *   node scripts/bump-version.js 2.6.0   # Set to specific version
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ Error: ${message}`, colors.red);
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ️  ${message}`, colors.cyan);
}

function warning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

// Parse semver version
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    error(`Invalid version format: ${version}. Expected format: x.y.z`);
  }
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
  };
}

// Bump version based on type
function bumpVersion(currentVersion, bumpType) {
  const version = parseVersion(currentVersion);

  switch (bumpType) {
    case 'major':
      return `${version.major + 1}.0.0`;
    case 'minor':
      return `${version.major}.${version.minor + 1}.0`;
    case 'patch':
      return `${version.major}.${version.minor}.${version.patch + 1}`;
    default:
      // Assume it's a specific version
      parseVersion(bumpType); // Validate format
      return bumpType;
  }
}

// Execute shell command
function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options }).trim();
  } catch (err) {
    error(`Command failed: ${command}\n${err.message}`);
  }
}

// Check if git working directory is clean
function checkGitStatus() {
  const status = exec('git status --porcelain');
  if (status) {
    error('Git working directory is not clean. Please commit or stash changes first.');
  }
}

// Update package.json version
function updatePackageJson(newVersion) {
  const packagePath = path.join(__dirname, '..', 'auto-claude-ui', 'package.json');

  if (!fs.existsSync(packagePath)) {
    error(`package.json not found at ${packagePath}`);
  }

  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const oldVersion = packageJson.version;

  packageJson.version = newVersion;

  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

  return { oldVersion, packagePath };
}

// Main function
function main() {
  const bumpType = process.argv[2];

  if (!bumpType) {
    error('Please specify version bump type or version number.\n' +
          'Usage: node scripts/bump-version.js <major|minor|patch|x.y.z>');
  }

  log('\n🚀 Auto Claude Version Bump\n', colors.cyan);

  // 1. Check git status
  info('Checking git status...');
  checkGitStatus();
  success('Git working directory is clean');

  // 2. Read current version
  const packagePath = path.join(__dirname, '..', 'auto-claude-ui', 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const currentVersion = packageJson.version;
  info(`Current version: ${currentVersion}`);

  // 3. Calculate new version
  const newVersion = bumpVersion(currentVersion, bumpType);
  info(`New version: ${newVersion}`);

  if (currentVersion === newVersion) {
    error('New version is the same as current version');
  }

  // 4. Update package.json
  info('Updating package.json...');
  updatePackageJson(newVersion);
  success('Updated package.json');

  // 5. Create git commit
  info('Creating git commit...');
  exec('git add auto-claude-ui/package.json');
  exec(`git commit -m "chore: bump version to ${newVersion}"`);
  success(`Created commit: "chore: bump version to ${newVersion}"`);

  // 6. Create git tag
  info('Creating git tag...');
  exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  success(`Created tag: v${newVersion}`);

  // 7. Instructions
  log('\n📋 Next steps:', colors.yellow);
  log(`   1. Review the changes: git log -1`, colors.yellow);
  log(`   2. Push the commit: git push origin <branch-name>`, colors.yellow);
  log(`   3. Push the tag: git push origin v${newVersion}`, colors.yellow);
  log(`   4. Create a GitHub release from the tag\n`, colors.yellow);

  warning('Note: The commit and tag have been created locally but NOT pushed.');
  warning('Please review and push manually when ready.');

  log('\n✨ Version bump complete!\n', colors.green);
}

// Run
main();
