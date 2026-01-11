/**
 * Claude Code API for renderer process
 *
 * Provides access to Claude Code CLI management:
 * - Check installed vs latest version
 * - Install or update Claude Code
 */

import { IPC_CHANNELS } from '../../../shared/constants';
import type { ClaudeCodeVersionInfo } from '../../../shared/types/cli';
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
}

/**
 * Creates the Claude Code API implementation
 */
export const createClaudeCodeAPI = (): ClaudeCodeAPI => ({
  checkClaudeCodeVersion: (): Promise<ClaudeCodeVersionResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_CHECK_VERSION),

  installClaudeCode: (): Promise<ClaudeCodeInstallResult> =>
    invokeIpc(IPC_CHANNELS.CLAUDE_CODE_INSTALL)
});
