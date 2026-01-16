#!/usr/bin/env node
/**
 * WSL Claude CLI Wrapper (Node.js)
 *
 * This wrapper spawns the Claude CLI inside WSL with proper pipe handling.
 * It's designed to be called by the Claude Agent SDK on Windows when the
 * project is on a WSL filesystem.
 *
 * The Windows Claude CLI (built with Bun) crashes when watching WSL filesystem
 * directories. This wrapper runs the Linux Claude CLI inside WSL instead.
 *
 * Environment variables (required):
 *   AUTO_CLAUDE_WSL_DISTRO - WSL distribution name (e.g., "Ubuntu")
 *
 * Environment variables (optional):
 *   AUTO_CLAUDE_WSL_PROJECT_PATH - Linux path to project (e.g., "/home/user/project")
 *   AUTO_CLAUDE_WSL_HOME - WSL home directory (default: auto-detected from distro)
 *   AUTO_CLAUDE_WSL_CLAUDE_PATH - Path to claude CLI in WSL (default: "claude" from PATH)
 *   CLAUDE_CODE_OAUTH_TOKEN - OAuth token for Claude authentication
 */

const { spawn, execSync } = require('child_process');

/**
 * Validate and sanitize WSL distro name to prevent command injection.
 * WSL distro names can only contain alphanumeric characters, hyphens, underscores, and periods.
 */
function validateDistroName(name) {
  if (!name) return null;
  // WSL distro names follow similar rules to Windows folder names
  // Only allow safe characters
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    console.error('ERROR: Invalid WSL distro name. Only alphanumeric characters, hyphens, underscores, and periods are allowed.');
    process.exit(1);
  }
  return name;
}

const distro = validateDistroName(process.env.AUTO_CLAUDE_WSL_DISTRO);
const projectPath = process.env.AUTO_CLAUDE_WSL_PROJECT_PATH;
const token = process.env.CLAUDE_CODE_OAUTH_TOKEN || '';

if (!distro) {
  console.error('ERROR: AUTO_CLAUDE_WSL_DISTRO not set');
  process.exit(1);
}

// Detect WSL home directory if not specified
let wslHome = process.env.AUTO_CLAUDE_WSL_HOME;
if (!wslHome) {
  try {
    // Get the default user's home directory from WSL
    wslHome = execSync(`wsl.exe -d ${distro} -e sh -c "echo $HOME"`, {
      encoding: 'utf8',
      timeout: 5000
    }).trim();
  } catch {
    // Fallback to /root if detection fails
    wslHome = '/root';
  }
}

// Get Claude CLI path
// We need to find Claude in WSL, not the Windows shim which doesn't work in WSL
let claudePath = process.env.AUTO_CLAUDE_WSL_CLAUDE_PATH;
if (!claudePath) {
  // Check common installation locations in WSL
  const commonPaths = [
    `${wslHome}/.local/bin/claude`,
    '/usr/local/bin/claude',
    `${wslHome}/.npm-global/bin/claude`,
  ];

  for (const path of commonPaths) {
    try {
      execSync(`wsl.exe -d ${distro} -e test -x "${path}"`, { timeout: 5000 });
      claudePath = path;
      break;
    } catch {
      // Not found at this path, continue
    }
  }

  if (!claudePath) {
    console.error('ERROR: Claude CLI not found in WSL. Please install it:');
    console.error('  wsl -d ' + distro);
    console.error('  npm install -g @anthropic-ai/claude-code');
    console.error('');
    console.error('Or set AUTO_CLAUDE_WSL_CLAUDE_PATH to the path of the claude binary in WSL.');
    process.exit(1);
  }
}

// Build wsl.exe arguments
const args = ['-d', distro];

if (projectPath) {
  args.push('--cd', projectPath);
}

// Use -e for direct execution (no shell)
// Set HOME so Claude can find its config
args.push('-e', '/usr/bin/env', `HOME=${wslHome}`, claudePath);

// Pass through any arguments (e.g., --output-format stream-json)
args.push(...process.argv.slice(2));

// Build environment with WSLENV to propagate token securely
// WSLENV tells WSL which Windows env vars to forward to Linux
// The /u flag converts Windows paths to Linux paths (not needed for token, but harmless)
const spawnEnv = { ...process.env };
if (token) {
  spawnEnv.CLAUDE_CODE_OAUTH_TOKEN = token;
  // Append to existing WSLENV or create new one
  const existingWslenv = spawnEnv.WSLENV || '';
  const vars = existingWslenv ? existingWslenv.split(':') : [];
  if (!vars.includes('CLAUDE_CODE_OAUTH_TOKEN')) {
    vars.push('CLAUDE_CODE_OAUTH_TOKEN');
  }
  spawnEnv.WSLENV = vars.join(':');
}

// Spawn wsl.exe with inherited stdio
// Token is passed via environment (not visible in process listing)
const proc = spawn('wsl.exe', args, {
  stdio: 'inherit',
  windowsHide: true,
  env: spawnEnv
});

proc.on('error', (err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});

proc.on('exit', (code) => {
  process.exit(code || 0);
});
