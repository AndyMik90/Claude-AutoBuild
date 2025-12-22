/**
 * Configuration for Auto Claude updater
 */

/**
 * GitHub repository configuration
 */
export const GITHUB_CONFIG = {
  owner: 'AndyMik90',
  repo: 'Auto-Claude',
  autoBuildPath: 'auto-claude' // Path within repo where auto-claude lives
} as const;

/**
 * Files and directories to preserve during updates
 */
export const PRESERVE_FILES = ['.env', 'specs'] as const;

/**
 * Files and directories to skip when copying
 */
export const SKIP_FILES = ['__pycache__', '.DS_Store', '.git', 'specs', '.env'] as const;

/**
 * Update-related timeouts (in milliseconds)
 */
export const TIMEOUTS = {
  requestTimeout: 10000,
  downloadTimeout: 60000
} as const;
