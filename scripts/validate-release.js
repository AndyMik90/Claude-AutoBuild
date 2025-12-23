#!/usr/bin/env node

/**
 * Validate Release Script
 *
 * Prevents HTTP 300 errors by ensuring no branch/tag name conflicts.
 * Run before creating a new release to check if the version is safe.
 *
 * Usage: node scripts/validate-release.js <version>
 * Example: node scripts/validate-release.js v2.7.2
 */

const { execSync } = require('child_process');

function validateRelease(version) {
  console.log(`Validating release: ${version}...`);

  // Check if version tag already exists
  try {
    const tags = execSync('git tag -l').toString().split('\n').filter(Boolean);
    if (tags.includes(version)) {
      console.error(`\u274C Tag ${version} already exists!`);
      console.error('   Cannot create duplicate tag.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to check git tags:', error.message);
    process.exit(1);
  }

  // Check if branch with same name exists (locally)
  try {
    const branches = execSync('git branch')
      .toString()
      .split('\n')
      .map(b => b.trim().replace(/^\*\s*/, ''))
      .filter(Boolean);
    if (branches.includes(version)) {
      console.error(`\u274C Local branch "${version}" already exists!`);
      console.error('   This will cause HTTP 300 errors during updates.');
      console.error(`   Please delete the branch: git branch -D ${version}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Failed to check local branches:', error.message);
    process.exit(1);
  }

  // Check if branch with same name exists (remotely)
  try {
    const remoteBranches = execSync('git branch -r')
      .toString()
      .split('\n')
      .map(b => b.trim())
      .filter(b => b && !b.includes(' -> ')); // Exclude symbolic refs like origin/HEAD -> origin/main
    if (remoteBranches.includes(`origin/${version}`) || remoteBranches.includes(`fork/${version}`)) {
      console.error(`\u274C Remote branch "${version}" already exists!`);
      console.error('   This will cause HTTP 300 errors during updates.');
      console.error(`   Please delete the remote branch: git push origin --delete ${version}`);
      process.exit(1);
    }
  } catch (error) {
    // Ignore errors from remote check (might not have remotes configured)
    console.warn('\u26A0\uFE0F  Could not check remote branches:', error.message);
  }

  console.log(`\u2705 Version ${version} is safe to release`);
  console.log('   No conflicting branches or tags found.');
}

// Main execution
const version = process.argv[2];
if (!version) {
  console.error('Usage: node validate-release.js <version>');
  console.error('Example: node validate-release.js v2.7.2');
  process.exit(1);
}

validateRelease(version);
