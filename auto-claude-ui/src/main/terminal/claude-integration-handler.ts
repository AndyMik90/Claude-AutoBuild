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
import { debugLog, debugError } from '../../shared/utils/debug-logger';
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
  // Match both custom profiles (profile-123456) and the default profile
  const profileIdMatch = terminal.id.match(/claude-login-(profile-\d+|default)-/);

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
  debugLog('[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE START ==========');
  debugLog('[ClaudeIntegration:invokeClaude] Terminal ID:', terminal.id);
  debugLog('[ClaudeIntegration:invokeClaude] Requested profile ID:', profileId);
  debugLog('[ClaudeIntegration:invokeClaude] CWD:', cwd);

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

  debugLog('[ClaudeIntegration:invokeClaude] Profile resolution:', {
    previousProfileId,
    newProfileId: activeProfile?.id,
    profileName: activeProfile?.name,
    hasOAuthToken: !!activeProfile?.oauthToken,
    isDefault: activeProfile?.isDefault
  });

  const cwdCommand = cwd ? `cd "${cwd}" && ` : '';
  const needsEnvOverride = profileId && profileId !== previousProfileId;

  debugLog('[ClaudeIntegration:invokeClaude] Environment override check:', {
    profileIdProvided: !!profileId,
    previousProfileId,
    needsEnvOverride
  });

  if (needsEnvOverride && activeProfile && !activeProfile.isDefault) {
    const token = profileManager.getProfileToken(activeProfile.id);
    debugLog('[ClaudeIntegration:invokeClaude] Token retrieval:', {
      hasToken: !!token,
      tokenLength: token?.length
    });

    if (token) {
      const tempFile = path.join(os.tmpdir(), `.claude-token-${Date.now()}`);
      debugLog('[ClaudeIntegration:invokeClaude] Writing token to temp file:', tempFile);
      fs.writeFileSync(tempFile, `export CLAUDE_CODE_OAUTH_TOKEN="${token}"\n`, { mode: 0o600 });

      // Clear terminal before running command to hide the ugly temp file path
      const command = `clear && ${cwdCommand}source "${tempFile}" && rm -f "${tempFile}" && claude\r`;
      debugLog('[ClaudeIntegration:invokeClaude] Executing command (temp file method):', command.replace(token, '[TOKEN_REDACTED]'));
      terminal.pty.write(command);
      debugLog('[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE COMPLETE (temp file) ==========');
      return;
    } else if (activeProfile.configDir) {
      // Clear terminal before running command
      const command = `clear && ${cwdCommand}CLAUDE_CONFIG_DIR="${activeProfile.configDir}" claude\r`;
      debugLog('[ClaudeIntegration:invokeClaude] Executing command (configDir method):', command);
      terminal.pty.write(command);
      debugLog('[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE COMPLETE (configDir) ==========');
      return;
    } else {
      debugLog('[ClaudeIntegration:invokeClaude] WARNING: No token or configDir available for non-default profile');
    }
  }

  if (activeProfile && !activeProfile.isDefault) {
    debugLog('[ClaudeIntegration:invokeClaude] Using terminal environment for non-default profile:', activeProfile.name);
  }

  const command = `${cwdCommand}claude\r`;
  debugLog('[ClaudeIntegration:invokeClaude] Executing command (default method):', command);
  terminal.pty.write(command);

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

  debugLog('[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE COMPLETE (default) ==========');
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
  // Always-on tracing
  console.warn('[ClaudeIntegration:switchClaudeProfile] Called for terminal:', terminal.id, '| profileId:', profileId);
  console.warn('[ClaudeIntegration:switchClaudeProfile] Terminal state: isClaudeMode=', terminal.isClaudeMode);

  debugLog('[ClaudeIntegration:switchClaudeProfile] ========== SWITCH PROFILE START ==========');
  debugLog('[ClaudeIntegration:switchClaudeProfile] Terminal ID:', terminal.id);
  debugLog('[ClaudeIntegration:switchClaudeProfile] Target profile ID:', profileId);
  debugLog('[ClaudeIntegration:switchClaudeProfile] Terminal state:', {
    isClaudeMode: terminal.isClaudeMode,
    currentProfileId: terminal.claudeProfileId,
    claudeSessionId: terminal.claudeSessionId,
    projectPath: terminal.projectPath,
    cwd: terminal.cwd
  });

  const profileManager = getClaudeProfileManager();
  const profile = profileManager.getProfile(profileId);

  console.warn('[ClaudeIntegration:switchClaudeProfile] Profile found:', profile?.name || 'NOT FOUND');
  debugLog('[ClaudeIntegration:switchClaudeProfile] Target profile:', profile ? {
    id: profile.id,
    name: profile.name,
    hasOAuthToken: !!profile.oauthToken,
    isDefault: profile.isDefault
  } : 'NOT FOUND');

  if (!profile) {
    console.error('[ClaudeIntegration:switchClaudeProfile] Profile not found, aborting');
    debugError('[ClaudeIntegration:switchClaudeProfile] Profile not found, aborting');
    return { success: false, error: 'Profile not found' };
  }

  console.warn('[ClaudeIntegration:switchClaudeProfile] Switching to profile:', profile.name);
  debugLog('[ClaudeIntegration:switchClaudeProfile] Switching to Claude profile:', profile.name);

  if (terminal.isClaudeMode) {
    console.warn('[ClaudeIntegration:switchClaudeProfile] Sending exit commands (Ctrl+C, /exit)');
    debugLog('[ClaudeIntegration:switchClaudeProfile] Terminal is in Claude mode, sending exit commands');
    debugLog('[ClaudeIntegration:switchClaudeProfile] Sending Ctrl+C (\\x03)');
    terminal.pty.write('\x03');
    await new Promise(resolve => setTimeout(resolve, 500));
    debugLog('[ClaudeIntegration:switchClaudeProfile] Sending /exit command');
    terminal.pty.write('/exit\r');
    await new Promise(resolve => setTimeout(resolve, 500));
    console.warn('[ClaudeIntegration:switchClaudeProfile] Exit commands sent');
    debugLog('[ClaudeIntegration:switchClaudeProfile] Exit commands sent, waiting for Claude to exit');
  } else {
    console.warn('[ClaudeIntegration:switchClaudeProfile] NOT in Claude mode, skipping exit commands');
    debugLog('[ClaudeIntegration:switchClaudeProfile] Terminal NOT in Claude mode, skipping exit commands');
  }

  debugLog('[ClaudeIntegration:switchClaudeProfile] Clearing rate limit state for terminal');
  clearRateLimitCallback(terminal.id);

  const projectPath = terminal.projectPath || terminal.cwd;
  console.warn('[ClaudeIntegration:switchClaudeProfile] Invoking Claude with profile:', profileId, '| cwd:', projectPath);
  debugLog('[ClaudeIntegration:switchClaudeProfile] Invoking Claude with new profile:', {
    terminalId: terminal.id,
    projectPath,
    profileId
  });
  invokeClaudeCallback(terminal.id, projectPath, profileId);

  debugLog('[ClaudeIntegration:switchClaudeProfile] Setting active profile in profile manager');
  profileManager.setActiveProfile(profileId);

  console.warn('[ClaudeIntegration:switchClaudeProfile] COMPLETE');
  debugLog('[ClaudeIntegration:switchClaudeProfile] ========== SWITCH PROFILE COMPLETE ==========');
  return { success: true };
}
