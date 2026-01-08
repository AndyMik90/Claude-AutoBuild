import type * as pty from '@lydell/node-pty';
import type { BrowserWindow } from 'electron';
import type { TerminalWorktreeConfig } from '../../shared/types';

/**
 * Terminal process tracking
 */
export interface TerminalProcess {
  id: string;
  pty: pty.IPty;
  isClaudeMode: boolean;
  projectPath?: string;
  cwd: string;
  claudeSessionId?: string;
  claudeProfileId?: string;
  outputBuffer: string;
  title: string;
  /** Associated worktree configuration (persisted across restarts) */
  worktreeConfig?: TerminalWorktreeConfig;
  /** Whether this terminal has a pending Claude resume that should be triggered on activation */
  pendingClaudeResume?: boolean;
}

/**
 * Rate limit event data
 */
export interface RateLimitEvent {
  terminalId: string;
  resetTime: string;
  detectedAt: string;
  profileId: string;
  suggestedProfileId?: string;
  suggestedProfileName?: string;
  autoSwitchEnabled: boolean;
}

/**
 * OAuth token event data
 */
export interface OAuthTokenEvent {
  terminalId: string;
  profileId?: string;
  email?: string;
  success: boolean;
  message?: string;
  detectedAt: string;
}

/**
 * Session capture result
 */
export interface SessionCaptureResult {
  sessionId: string | null;
  captured: boolean;
}

/**
 * Terminal creation result
 */
export interface TerminalOperationResult {
  success: boolean;
  error?: string;
  outputBuffer?: string;
}

/**
 * Window getter function type
 */
export type WindowGetter = () => BrowserWindow | null;
