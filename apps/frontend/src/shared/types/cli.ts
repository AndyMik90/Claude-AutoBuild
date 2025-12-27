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
    | 'system-path'
    | 'bundled'
    | 'fallback';
  message: string;
}
