/**
 * Claude Code API for renderer process
 *
 * Provides access to Claude Code CLI management:
 * - Check installed vs latest version
 * - Install or update Claude Code
 * - Get available versions for rollback
 * - Install specific version
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import type { ClaudeCodeVersionInfo, ClaudeCodeVersionList, ClaudeInstallationList } from '../../../shared/types/cli';
import { invokeIpc } from './ipc-utils';

/**
 * Result of Claude Code installation attempt
 */
export interface ClaudeCodeInstallResult {
  success: boolean;
  data?: {
    command: string;
  };
  error?: string;
}

/**
 * Result of version check
 */
export interface ClaudeCodeVersionResult {
  success: boolean;
  data?: ClaudeCodeVersionInfo;
  error?: string;
}

/**
 * Result of fetching available versions
 */
export interface ClaudeCodeVersionsResult {
  success: boolean;
  data?: ClaudeCodeVersionList;
  error?: string;
}

/**
 * Result of installing a specific version
 */
export interface ClaudeCodeInstallVersionResult {
  success: boolean;
  data?: {
    command: string;
    version: string;
  };
  error?: string;
}

/**
 * Result of getting installations
 */
export interface ClaudeCodeInstallationsResult {
  success: boolean;
  data?: ClaudeInstallationList;
  error?: string;
}

/**
 * Result of setting active path
 */
export interface ClaudeCodeSetActivePathResult {
  success: boolean;
  data?: {
    path: string;
  };
  error?: string;
}

/**
 * Claude Code API interface exposed to renderer
 */
export interface ClaudeCodeAPI {
  /**
   * Check Claude Code CLI version status
   * Returns installed version, latest version, and whether update is available
   */
  checkClaudeCodeVersion: () => Promise<ClaudeCodeVersionResult>;

  /**
   * Install or update Claude Code CLI
   * Opens the user's terminal with the install command
   */
  installClaudeCode: () => Promise<ClaudeCodeInstallResult>;

  /**
   * Get available Claude Code CLI versions
   * Returns list of versions sorted newest first
   */
  getClaudeCodeVersions: () => Promise<ClaudeCodeVersionsResult>;

  /**
   * Install a specific version of Claude Code CLI
   * Opens the user's terminal with the install command for the specified version
   */
  installClaudeCodeVersion: (version: string) => Promise<ClaudeCodeInstallVersionResult>;

  /**
   * Get all Claude CLI installations found on the system
   * Returns list of installations with paths, versions, and sources
   */
  getClaudeCodeInstallations: () => Promise<ClaudeCodeInstallationsResult>;

  /**
   * Set the active Claude CLI path
   * Updates settings and CLI tool manager cache
   */
  setClaudeCodeActivePath: (cliPath: string) => Promise<ClaudeCodeSetActivePathResult>;
}

/**
 * Creates the Claude Code API implementation
 */
export const createClaudeCodeAPI = (): ClaudeCodeAPI => ({
  checkClaudeCodeVersion: (): Promise<ClaudeCodeVersionResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_CHECK_VERSION),

  installClaudeCode: (): Promise<ClaudeCodeInstallResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_INSTALL),

  getClaudeCodeVersions: (): Promise<ClaudeCodeVersionsResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_GET_VERSIONS),

  installClaudeCodeVersion: (version: string): Promise<ClaudeCodeInstallVersionResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_INSTALL_VERSION, version),

  getClaudeCodeInstallations: (): Promise<ClaudeCodeInstallationsResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_GET_INSTALLATIONS),

  setClaudeCodeActivePath: (cliPath: string): Promise<ClaudeCodeSetActivePathResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_SET_ACTIVE_PATH, cliPath),
});
