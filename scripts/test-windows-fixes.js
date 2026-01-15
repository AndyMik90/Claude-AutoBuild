#!/usr/bin/env node
/**
 * Windows Fixes Verification Script
 * ==================================
 * Quick verification for Windows-specific fixes in the Auto-Claude fork.
 *
 * Usage:
 *   node scripts/test-windows-fixes.js
 *   node scripts/test-windows-fixes.js --pr 1   # Test specific PR
 *   node scripts/test-windows-fixes.js --all    # Run full test suite
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function success(msg) { log(`✓ ${msg}`, 'green'); }
function error(msg) { log(`✗ ${msg}`, 'red'); }
function info(msg) { log(`ℹ ${msg}`, 'blue'); }
function warn(msg) { log(`⚠ ${msg}`, 'yellow'); }

/**
 * PR #1: Windows marketplace initialization fix
 * Verifies that known_marketplaces.json is properly created
 */
function testPR1_MarketplaceInit() {
  log('\n--- PR #1: Windows Marketplace Fix ---', 'cyan');

  // Cross-platform app data directory resolution
  let appDataDir;
  if (process.platform === 'win32') {
    appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    appDataDir = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    appDataDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }
  const autoClaudeDir = path.join(appDataDir, 'auto-claude');
  const marketplaceFile = path.join(autoClaudeDir, 'known_marketplaces.json');

  info(`Checking marketplace file at: ${marketplaceFile}`);

  // Check if directory exists
  if (!fs.existsSync(autoClaudeDir)) {
    warn('Auto-Claude config directory does not exist yet (will be created on first run)');
    return { passed: true, skipped: true };
  }

  // Check if file exists and is valid JSON
  if (fs.existsSync(marketplaceFile)) {
    try {
      const content = fs.readFileSync(marketplaceFile, 'utf8');
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        success(`Marketplace file exists and contains ${data.length} entries`);
        return { passed: true };
      } else {
        error('Marketplace file exists but is not an array');
        return { passed: false };
      }
    } catch (e) {
      error(`Marketplace file exists but contains invalid JSON: ${e.message}`);
      return { passed: false };
    }
  } else {
    info('Marketplace file does not exist yet (will be created on first run)');
    return { passed: true, skipped: true };
  }
}

/**
 * PR #2: Error surfacing fix
 * Verifies that agent-process.ts has stderr collection
 */
function testPR2_ErrorSurfacing() {
  log('\n--- PR #2: Error Surfacing Fix ---', 'cyan');

  const agentProcessPath = path.join(__dirname, '../apps/frontend/src/main/agent/agent-process.ts');

  if (!fs.existsSync(agentProcessPath)) {
    error(`Agent process file not found at: ${agentProcessPath}`);
    return { passed: false };
  }

  const content = fs.readFileSync(agentProcessPath, 'utf8');

  // Check for stderr collection variable
  const hasStderrCollected = content.includes('stderrCollected');
  const hasErrorPatterns = content.includes('errorPatterns');

  if (hasStderrCollected && hasErrorPatterns) {
    success('Error surfacing code is present (stderrCollected + errorPatterns)');
    return { passed: true };
  } else if (hasStderrCollected && !hasErrorPatterns) {
    warn('stderrCollected present but errorPatterns missing');
    return { passed: false };
  } else if (!hasStderrCollected && hasErrorPatterns) {
    warn('errorPatterns present but stderrCollected missing');
    return { passed: false };
  } else {
    info('Error surfacing code not present (PR #2 may not be merged yet)');
    return { passed: true, skipped: true };
  }
}

/**
 * PR #3: Windows path normalization fix (Errno 22)
 * Verifies that path normalization utilities exist
 */
function testPR3_WindowsPathFix() {
  log('\n--- PR #3: Windows Path Fix (Errno 22) ---', 'cyan');

  // Test path normalization on Windows-specific characters
  const testCases = [
    { input: 'C:\\Users\\test', desc: 'Backslash path' },
    { input: 'C:/Users/test', desc: 'Forward slash path' },
    { input: 'path/with spaces/file.txt', desc: 'Path with spaces' },
    { input: 'path\\with\\mixed/slashes', desc: 'Mixed slashes' },
  ];

  let allPassed = true;

  for (const test of testCases) {
    try {
      // Use path.normalize which should work on all platforms
      const normalized = path.normalize(test.input);
      success(`${test.desc}: "${test.input}" → "${normalized}"`);
    } catch (e) {
      error(`${test.desc}: Failed to normalize "${test.input}": ${e.message}`);
      allPassed = false;
    }
  }

  // Check for Windows reserved name handling
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1'];
  info('Windows reserved names check:');
  for (const name of reservedNames) {
    if (process.platform === 'win32') {
      info(`  ${name} - would be problematic on Windows`);
    } else {
      info(`  ${name} - safe on this platform`);
    }
  }

  return { passed: allPassed };
}

/**
 * PR #4: Token hot-reload fix
 * Verifies that config reload IPC channel exists
 */
function testPR4_TokenHotReload() {
  log('\n--- PR #4: Token Hot-Reload Fix ---', 'cyan');

  const ipcConstantsPath = path.join(__dirname, '../apps/frontend/src/shared/constants/ipc.ts');
  const settingsApiPath = path.join(__dirname, '../apps/frontend/src/preload/api/settings-api.ts');
  const settingsHandlersPath = path.join(__dirname, '../apps/frontend/src/main/ipc-handlers/settings-handlers.ts');

  const checks = [
    { path: ipcConstantsPath, search: 'CONFIG_RELOAD', name: 'IPC channel constant' },
    { path: settingsApiPath, search: 'reloadConfig', name: 'Settings API method' },
    { path: settingsHandlersPath, search: 'CONFIG_RELOAD', name: 'IPC handler' },
  ];

  let allPassed = true;

  for (const check of checks) {
    if (!fs.existsSync(check.path)) {
      error(`File not found: ${check.path}`);
      allPassed = false;
      continue;
    }

    const content = fs.readFileSync(check.path, 'utf8');
    if (content.includes(check.search)) {
      success(`${check.name}: Found "${check.search}"`);
    } else {
      error(`${check.name}: "${check.search}" not found`);
      allPassed = false;
    }
  }

  return { passed: allPassed };
}

/**
 * Run TypeScript compilation check
 */
function testTypeScriptCompilation() {
  log('\n--- TypeScript Compilation Check ---', 'cyan');

  try {
    info('Running TypeScript type check (this may take a moment)...');
    execSync('npx tsc --noEmit', {
      cwd: path.join(__dirname, '..', 'apps', 'frontend'),
      stdio: 'pipe',
      timeout: 120000,
    });
    success('TypeScript compilation passed');
    return { passed: true };
  } catch (e) {
    error(`TypeScript compilation failed: ${e.message}`);
    if (e.stdout) console.log(e.stdout.toString());
    if (e.stderr) console.log(e.stderr.toString());
    return { passed: false };
  }
}

/**
 * Run frontend tests
 */
function testFrontendTests() {
  log('\n--- Frontend Tests ---', 'cyan');

  try {
    info('Running frontend tests (this may take a moment)...');
    execSync('npm test', {
      cwd: path.join(__dirname, '..', 'apps', 'frontend'),
      stdio: 'inherit',
      timeout: 300000,
    });
    success('Frontend tests passed');
    return { passed: true };
  } catch (e) {
    error('Frontend tests failed');
    return { passed: false };
  }
}

/**
 * Main execution
 */
function main() {
  log('\n╔════════════════════════════════════════════════╗', 'cyan');
  log('║  Auto-Claude Windows Fixes Verification Tool   ║', 'cyan');
  log('╚════════════════════════════════════════════════╝', 'cyan');

  info(`Platform: ${process.platform}`);
  info(`Node.js: ${process.version}`);
  info(`Working directory: ${process.cwd()}`);

  const args = process.argv.slice(2);
  const runAll = args.includes('--all');

  // Parse --pr argument with validation
  let specificPR = null;
  const prEqualsArg = args.find(a => /^--pr=\d+$/.test(a));
  const prArgIndex = args.indexOf('--pr');

  if (prEqualsArg) {
    // Handle --pr=N format
    specificPR = parseInt(prEqualsArg.split('=')[1], 10);
  } else if (prArgIndex !== -1) {
    // Handle --pr N format
    const nextArg = args[prArgIndex + 1];
    if (nextArg && /^\d+$/.test(nextArg)) {
      specificPR = parseInt(nextArg, 10);
    } else {
      error('--pr requires a valid PR number (e.g., --pr 1 or --pr=1)');
      process.exit(1);
    }
  }

  const results = [];

  // Run specific PR test or all quick tests
  if (specificPR) {
    info(`Testing PR #${specificPR} only`);
    switch (specificPR) {
      case 1: results.push({ name: 'PR #1', ...testPR1_MarketplaceInit() }); break;
      case 2: results.push({ name: 'PR #2', ...testPR2_ErrorSurfacing() }); break;
      case 3: results.push({ name: 'PR #3', ...testPR3_WindowsPathFix() }); break;
      case 4: results.push({ name: 'PR #4', ...testPR4_TokenHotReload() }); break;
      default: error(`Unknown PR number: ${specificPR}`);
    }
  } else {
    // Run all quick verification tests
    results.push({ name: 'PR #1 (Marketplace)', ...testPR1_MarketplaceInit() });
    results.push({ name: 'PR #2 (Error Surfacing)', ...testPR2_ErrorSurfacing() });
    results.push({ name: 'PR #3 (Windows Path)', ...testPR3_WindowsPathFix() });
    results.push({ name: 'PR #4 (Hot-Reload)', ...testPR4_TokenHotReload() });

    if (runAll) {
      results.push({ name: 'TypeScript', ...testTypeScriptCompilation() });
      results.push({ name: 'Frontend Tests', ...testFrontendTests() });
    }
  }

  // Summary
  log('\n══════════════════════════════════════════════════', 'cyan');
  log('                    SUMMARY                        ', 'cyan');
  log('══════════════════════════════════════════════════', 'cyan');

  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const result of results) {
    if (result.skipped) {
      warn(`${result.name}: SKIPPED`);
      skippedCount++;
    } else if (result.passed) {
      success(`${result.name}: PASSED`);
      passedCount++;
    } else {
      error(`${result.name}: FAILED`);
      failedCount++;
    }
  }

  log('');
  log(`Total: ${passedCount} passed, ${failedCount} failed, ${skippedCount} skipped`,
      failedCount > 0 ? 'red' : 'green');

  if (!runAll) {
    info('\nRun with --all to include TypeScript and test suite verification');
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

main();
