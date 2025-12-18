/**
 * Claude Integration Handler
 * Manages Claude-specific operations including profile switching, rate limiting, and OAuth token detection
 */

import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import { getClaudeProfileManager } from '../claude-profile-manager';
import * as OutputParser from './output-parser';
import * as SessionHandler from './session-handler';
import type {
  TerminalProcess,
  WindowGetter,
  RateLimitEvent,
  OAuthTokenEvent
} from './types';

/**
 * Handle rate limit detection and profile switching
 */
export function handleRateLimit(
  terminal: TerminalProcess,
  data: string,
  lastNotifiedRateLimitReset: Map<string, string>,
  getWindow: WindowGetter,
  switchProfileCallback: (terminalId: string, profileId: string) => Promise<void>
): void {
  const resetTime = OutputParser.extractRateLimitReset(data);
  if (!resetTime) {
    return;
  }

  const lastNotifiedReset = lastNotifiedRateLimitReset.get(terminal.id);
  if (resetTime === lastNotifiedReset) {
    return;
  }

  lastNotifiedRateLimitReset.set(terminal.id, resetTime);
  console.warn('[ClaudeIntegration] Rate limit detected, reset:', resetTime);

  const profileManager = getClaudeProfileManager();
  const currentProfileId = terminal.claudeProfileId || 'default';

  try {
    const rateLimitEvent = profileManager.recordRateLimitEvent(currentProfileId, resetTime);
    console.warn('[ClaudeIntegration] Recorded rate limit event:', rateLimitEvent.type);
  } catch (err) {
    console.error('[ClaudeIntegration] Failed to record rate limit event:', err);
  }

  const autoSwitchSettings = profileManager.getAutoSwitchSettings();
  const bestProfile = profileManager.getBestAvailableProfile(currentProfileId);

  const win = getWindow();
  if (win) {
    win.webContents.send(IPC_CHANNELS.TERMINAL_RATE_LIMIT, {
      terminalId: terminal.id,
      resetTime,
      detectedAt: new Date().toISOString(),
      profileId: currentProfileId,
      suggestedProfileId: bestProfile?.id,
      suggestedProfileName: bestProfile?.name,
      autoSwitchEnabled: autoSwitchSettings.autoSwitchOnRateLimit
    } as RateLimitEvent);
  }

  if (autoSwitchSettings.enabled && autoSwitchSettings.autoSwitchOnRateLimit && bestProfile) {
    console.warn('[ClaudeIntegration] Auto-switching to profile:', bestProfile.name);
    switchProfileCallback(terminal.id, bestProfile.id).then(_result => {
      console.warn('[ClaudeIntegration] Auto-switch completed');
    }).catch(err => {
      console.error('[ClaudeIntegration] Auto-switch failed:', err);
    });
  }
}

/**
 * Handle OAuth token detection and auto-save
 */
export function handleOAuthToken(
  terminal: TerminalProcess,
  data: string,
  getWindow: WindowGetter
): void {
  const token = OutputParser.extractOAuthToken(data);
  if (!token) {
    return;
  }

  console.warn('[ClaudeIntegration] OAuth token detected, length:', token.length);

  const email = OutputParser.extractEmail(terminal.outputBuffer);
  const profileIdMatch = terminal.id.match(/claude-login-(profile-\d+)-/);

  if (profileIdMatch) {
    const profileId = profileIdMatch[1];
    const profileManager = getClaudeProfileManager();
    const success = profileManager.setProfileToken(profileId, token, email || undefined);

    if (success) {
      console.warn('[ClaudeIntegration] OAuth token auto-saved to profile:', profileId);

      const win = getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, {
          terminalId: terminal.id,
          profileId,
          email,
          success: true,
          detectedAt: new Date().toISOString()
        } as OAuthTokenEvent);
      }
    } else {
      console.error('[ClaudeIntegration] Failed to save OAuth token to profile:', profileId);
    }
  } else {
    console.warn('[ClaudeIntegration] OAuth token detected but not in a profile login terminal');
    const win = getWindow();
    if (win) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, {
        terminalId: terminal.id,
        email,
        success: false,
        message: 'Token detected but no profile associated with this terminal',
        detectedAt: new Date().toISOString()
      } as OAuthTokenEvent);
    }
  }
}

/**
 * Handle Claude session ID capture
 */
export function handleClaudeSessionId(
  terminal: TerminalProcess,
  sessionId: string,
  getWindow: WindowGetter
): void {
  terminal.claudeSessionId = sessionId;
  console.warn('[ClaudeIntegration] Captured Claude session ID:', sessionId);

  if (terminal.projectPath) {
    SessionHandler.updateClaudeSessionId(terminal.projectPath, terminal.id, sessionId);
  }

  const win = getWindow();
  if (win) {
    win.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, terminal.id, sessionId);
  }
}

/**
 * Invoke Claude with optional profile override
 */
export function invokeClaude(
  terminal: TerminalProcess,
  cwd: string | undefined,
  profileId: string | undefined,
  getWindow: WindowGetter,
  onSessionCapture: (terminalId: string, projectPath: string, startTime: number) => void
): void {
  terminal.isClaudeMode = true;
  terminal.claudeSessionId = undefined;

  const startTime = Date.now();
  const projectPath = cwd || terminal.projectPath || terminal.cwd;

  const profileManager = getClaudeProfileManager();
  const activeProfile = profileId
    ? profileManager.getProfile(profileId)
    : profileManager.getActiveProfile();

  const previousProfileId = terminal.claudeProfileId;
  terminal.claudeProfileId = activeProfile?.id;

  const cwdCommand = cwd ? `cd "${cwd}" && ` : '';
  const needsEnvOverride = profileId && profileId !== previousProfileId;

  if (needsEnvOverride && activeProfile && !activeProfile.isDefault) {
    const token = profileManager.getProfileToken(activeProfile.id);

    if (token) {
      const tempFile = path.join(os.tmpdir(), `.claude-token-${Date.now()}`);
      fs.writeFileSync(tempFile, `export CLAUDE_CODE_OAUTH_TOKEN="${token}"\n`, { mode: 0o600 });

      terminal.pty.write(`${cwdCommand}source "${tempFile}" && rm -f "${tempFile}" && claude\r`);
      console.warn('[ClaudeIntegration] Switching to Claude profile:', activeProfile.name, '(via secure temp file)');
      return;
    } else if (activeProfile.configDir) {
      terminal.pty.write(`${cwdCommand}CLAUDE_CONFIG_DIR="${activeProfile.configDir}" claude\r`);
      console.warn('[ClaudeIntegration] Using Claude profile:', activeProfile.name, 'config:', activeProfile.configDir);
      return;
    }
  }

  if (activeProfile && !activeProfile.isDefault) {
    console.warn('[ClaudeIntegration] Using Claude profile:', activeProfile.name, '(from terminal environment)');
  }

  terminal.pty.write(`${cwdCommand}claude\r`);

  if (activeProfile) {
    profileManager.markProfileUsed(activeProfile.id);
  }

  const win = getWindow();
  if (win) {
    const title = activeProfile && !activeProfile.isDefault
      ? `Claude (${activeProfile.name})`
      : 'Claude';
    win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, terminal.id, title);
  }

  if (terminal.projectPath) {
    SessionHandler.persistSession(terminal);
  }

  if (projectPath) {
    onSessionCapture(terminal.id, projectPath, startTime);
  }
}

/**
 * Resume Claude with optional session ID
 */
export function resumeClaude(
  terminal: TerminalProcess,
  sessionId: string | undefined,
  getWindow: WindowGetter
): void {
  terminal.isClaudeMode = true;

  let command: string;
  if (sessionId) {
    command = `claude --resume "${sessionId}"`;
    terminal.claudeSessionId = sessionId;
  } else {
    command = 'claude --continue';
  }

  terminal.pty.write(`${command}\r`);

  const win = getWindow();
  if (win) {
    win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, terminal.id, 'Claude');
  }
}

/**
 * Switch terminal to a different Claude profile
 */
export async function switchClaudeProfile(
  terminal: TerminalProcess,
  profileId: string,
  getWindow: WindowGetter,
  invokeClaudeCallback: (terminalId: string, cwd: string | undefined, profileId: string) => void,
  clearRateLimitCallback: (terminalId: string) => void
): Promise<{ success: boolean; error?: string }> {
  const profileManager = getClaudeProfileManager();
  const profile = profileManager.getProfile(profileId);
  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }

  console.warn('[ClaudeIntegration] Switching to Claude profile:', profile.name);

  if (terminal.isClaudeMode) {
    terminal.pty.write('\x03');
    await new Promise(resolve => setTimeout(resolve, 500));
    terminal.pty.write('/exit\r');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  clearRateLimitCallback(terminal.id);

  const projectPath = terminal.projectPath || terminal.cwd;
  invokeClaudeCallback(terminal.id, projectPath, profileId);

  profileManager.setActiveProfile(profileId);

  return { success: true };
}
