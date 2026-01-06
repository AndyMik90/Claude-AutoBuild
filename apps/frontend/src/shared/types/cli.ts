/**
 * CLI Tool Types
 *
 * Shared types for CLI tool detection and management.
 * Used by both main process (cli-tool-manager) and renderer process (Settings UI).
 */

/**
 * Result of tool detection operation
 * Contains path, version, and metadata about detection source
 */
export interface ToolDetectionResult {
  found: boolean;
  path?: string;
  version?: string;
  source:
    | 'user-config'
    | 'venv'
    | 'homebrew'
    | 'nvm'
    | 'system-path'
    | 'bundled'
    | 'fallback';
  message: string;
}

/**
 * Claude Code CLI version information
 * Used for version checking and update prompts
 */
export interface ClaudeCodeVersionInfo {
  /** Currently installed version, null if not installed */
  installed: string | null;
  /** Latest version available from npm registry */
  latest: string;
  /** True if installed version is older than latest */
  isOutdated: boolean;
  /** Path to Claude CLI binary if found */
  path?: string;
  /** Full detection result with source information */
  detectionResult: ToolDetectionResult;
}
