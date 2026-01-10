/**
 * Claude Integration Handler
 * Manages Claude-specific operations including profile switching, rate limiting, and OAuth token detection
 */

import * as os from "os";
import * as fs from "fs";
import { promises as fsPromises } from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { IPC_CHANNELS } from "../../shared/constants";
import { getClaudeProfileManager, initializeClaudeProfileManager } from "../claude-profile-manager";
import * as OutputParser from "./output-parser";
import * as SessionHandler from "./session-handler";
import { debugLog, debugError } from "../../shared/utils/debug-logger";
import {
  escapeShellArg,
  escapePowerShellArg,
  escapeShellArgWindows,
  buildPathAssignment,
  buildCommandInvocation,
  buildCdCommandForShell,
  type ShellType,
} from "../../shared/utils/shell-escape";
import { getClaudeCliInvocation, getClaudeCliInvocationAsync } from "../claude-cli-utils";
import type { TerminalProcess, WindowGetter, RateLimitEvent, OAuthTokenEvent } from "./types";

// ============================================================================
// SHARED HELPERS - Used by both sync and async invokeClaude
// ============================================================================

/**
 * Check if bash is available on Windows.
 * On Unix platforms, always returns true (bash is assumed to be available).
 * On Windows, checks if bash command can be found.
 *
 * Result is cached to avoid redundant execSync calls.
 *
 * @returns true if bash is available, false otherwise
 */
// Cache result at module level - result doesn't change during app lifetime
// Caches the absolute path to bash executable, or null if not found
let bashPathCache: string | null | undefined;

/**
 * Get the absolute path to bash executable.
 * On Unix systems, returns "bash" (assumed to be in PATH).
 * On Windows, searches for bash in PATH first, then common installation locations.
 * Returns the absolute path if found, null otherwise.
 */
function getBashPath(): string | null {
  // Return cached result if available
  if (bashPathCache !== undefined) {
    return bashPathCache;
  }

  if (process.platform !== "win32") {
    bashPathCache = "bash"; // Unix systems always have bash in PATH
    return "bash";
  }

  // On Windows, check if bash is in PATH by trying common locations
  const commonBashPaths = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\msys64\\usr\\bin\\bash.exe",
    "C:\\cygwin64\\bin\\bash.exe",
  ];

  // Check if bash is in PATH (returns "bash" if found via PATH)
  try {
    require("child_process").execSync("bash --version", {
      stdio: "ignore",
      timeout: 1000, // Add timeout to prevent blocking
    });
    bashPathCache = "bash";
    return "bash";
  } catch {
    // bash not found in PATH, check common installation locations
    for (const bashPath of commonBashPaths) {
      if (fs.existsSync(bashPath)) {
        bashPathCache = bashPath;
        return bashPath;
      }
    }
    // bash not found anywhere
    bashPathCache = null;
    return null;
  }
}

/**
 * Parameters for building profile-specific Claude commands
 */
interface BuildProfileCommandParams {
  /** Shell type (PowerShell, cmd, bash, zsh, fish, or unknown) */
  shellType: ShellType | "unknown";
  /** Command to change directory (empty string if no change needed) */
  cwdCommand: string;
  /** PATH prefix for Claude CLI (empty string if not needed) */
  pathPrefix: string;
  /** Claude CLI command (not escaped) */
  claudeCmd: string;
  /** OAuth token (for token-based authentication) */
  token?: string;
  /** Custom config directory (for configDir-based profiles) */
  configDir?: string;
  /** Temp file path (required for token-based method) */
  tempFile?: string;
}

/**
 * Build the command string for profile-specific Claude invocation.
 *
 * This helper function reduces code duplication between sync and async versions
 * by centralizing the shell-specific command building logic.
 *
 * Handles two methods:
 * - 'token': Uses temp file with OAuth token, supports bash fallback and native Windows shells
 * - 'configDir': Sets CLAUDE_CONFIG_DIR for custom profile location
 *
 * @param params - Command building parameters
 * @returns The command string, or null if default method should be used
 *
 * @example
 * // Token-based method with bash available
 * buildProfileCommandString({
 *   shellType: 'powershell',
 *   cwdCommand: 'cd C:\\path && ',
 *   pathPrefix: '',
 *   claudeCmd: 'claude',
 *   token: 'my-token',
 *   tempFile: 'C:\\Users\\...\\token-file'
 * });
 */
function buildProfileCommandString(params: BuildProfileCommandParams): string | null {
  const { shellType, cwdCommand, pathPrefix, claudeCmd, token, configDir, tempFile } = params;

  // Token-based method (OAuth)
  if (token && tempFile) {
    if (shellType === "powershell" || shellType === "cmd") {
      // On Windows, check if bash is available
      const bashPath = getBashPath();
      if (bashPath) {
        // Use bash-style temp file with bash -c wrapper
        const tempFileBash = tempFile.replace(/\\/g, "/");
        const bashClaudeCmd = claudeCmd.replace(/\\/g, "/");
        const escapedClaudeBash = escapeShellArg(bashClaudeCmd);
        const escapedTempFileBash = escapeShellArg(tempFileBash);
        // Use the discovered bash path (may be absolute path on Windows)
        const bashExe = bashPath === "bash" ? "bash" : bashPath.replace(/\\/g, "/");

        // Both PowerShell and cmd.exe use the same bash command
        return `${cwdCommand}${pathPrefix}${bashExe} -c "source ${escapedTempFileBash} && rm -f ${escapedTempFileBash} && exec ${escapedClaudeBash}"\r`;
      } else {
        // Bash not available - use native PowerShell/cmd syntax
        // For native Windows shells, we need to create a different temp file format
        // and set the token as an environment variable directly
        if (shellType === "powershell") {
          // PowerShell: set environment variable, invoke claude, then remove temp file
          const escapedToken = escapePowerShellArg(token);
          const escapedClaude = escapePowerShellArg(claudeCmd);
          const escapedTempFile = escapePowerShellArg(tempFile);
          return `Clear-Host; ${cwdCommand}$env:CLAUDE_CODE_OAUTH_TOKEN=${escapedToken}; ${pathPrefix}${escapedClaude}; Remove-Item -Force ${escapedTempFile}\r`;
        } else {
          // cmd.exe: set environment variable, invoke claude, then remove temp file
          const escapedToken = escapeShellArgWindows(token);
          const escapedClaudeCmdWin = escapeShellArgWindows(claudeCmd);
          const escapedTempFileWin = escapeShellArgWindows(tempFile);
          return `cls && ${cwdCommand}set "CLAUDE_CODE_OAUTH_TOKEN=${escapedToken}" && ${pathPrefix}"${escapedClaudeCmdWin}" && del /f "${escapedTempFileWin}"\r`;
        }
      }
    } else {
      // Unix shells - use existing temp file method
      const escapedTempFile = escapeShellArg(tempFile);
      const escapedClaudeCmd = escapeShellArg(claudeCmd);
      return buildClaudeShellCommand(cwdCommand, pathPrefix, escapedClaudeCmd, {
        method: "temp-file",
        escapedTempFile,
      });
    }
  }

  // ConfigDir-based method
  if (configDir) {
    if (shellType === "powershell") {
      return `${cwdCommand}${pathPrefix}$env:CLAUDE_CONFIG_DIR=${escapePowerShellArg(configDir)}; ${buildCommandInvocation(claudeCmd, [], shellType)}\r`;
    } else if (shellType === "cmd") {
      const escapedConfigDir = escapeShellArgWindows(configDir);
      return `${cwdCommand}set "CLAUDE_CONFIG_DIR=${escapedConfigDir}" && ${pathPrefix}${buildCommandInvocation(claudeCmd, [], shellType)}\r`;
    } else {
      // Bash/zsh/fish - use history-safe prefix with bash -c "exec ..." to replace shell
      const escapedConfigDir = escapeShellArg(configDir);
      const escapedClaudeCmd = escapeShellArg(claudeCmd);
      return `clear && ${cwdCommand}HISTFILE= HISTCONTROL=ignorespace CLAUDE_CONFIG_DIR=${escapedConfigDir} ${pathPrefix}bash -c "exec ${escapedClaudeCmd}"\r`;
    }
  }

  // No profile-specific method applicable
  return null;
}

/**
 * Configuration for building Claude shell commands using discriminated union.
 * This provides type safety by ensuring the correct options are provided for each method.
 */
type ClaudeCommandConfig =
  | { method: "default" }
  | { method: "temp-file"; escapedTempFile: string }
  | { method: "config-dir"; escapedConfigDir: string };

/**
 * Build the shell command for invoking Claude CLI.
 *
 * Generates the appropriate command string based on the invocation method:
 * - 'default': Simple command execution
 * - 'temp-file': Sources OAuth token from temp file, then removes it
 * - 'config-dir': Sets CLAUDE_CONFIG_DIR for custom profile location
 *
 * All non-default methods include history-safe prefixes (HISTFILE=, HISTCONTROL=)
 * to prevent sensitive data from appearing in shell history.
 *
 * @param cwdCommand - Command to change directory (empty string if no change needed)
 * @param pathPrefix - PATH prefix for Claude CLI (empty string if not needed)
 * @param escapedClaudeCmd - Shell-escaped Claude CLI command
 * @param config - Configuration object with method and required options (discriminated union)
 * @returns Complete shell command string ready for terminal.pty.write()
 *
 * @example
 * // Default method
 * buildClaudeShellCommand('cd /path && ', 'PATH=/bin ', 'claude', { method: 'default' });
 * // Returns: 'cd /path && PATH=/bin claude\r'
 *
 * // Temp file method
 * buildClaudeShellCommand('', '', 'claude', { method: 'temp-file', escapedTempFile: '/tmp/token' });
 * // Returns: 'clear && HISTFILE= HISTCONTROL=ignorespace bash -c "source /tmp/token && rm -f /tmp/token && exec claude"\r'
 */
export function buildClaudeShellCommand(
  cwdCommand: string,
  pathPrefix: string,
  escapedClaudeCmd: string,
  config: ClaudeCommandConfig
): string {
  switch (config.method) {
    case "temp-file":
      return `clear && ${cwdCommand}HISTFILE= HISTCONTROL=ignorespace ${pathPrefix}bash -c "source ${config.escapedTempFile} && rm -f ${config.escapedTempFile} && exec ${escapedClaudeCmd}"\r`;

    case "config-dir":
      return `clear && ${cwdCommand}HISTFILE= HISTCONTROL=ignorespace CLAUDE_CONFIG_DIR=${config.escapedConfigDir} ${pathPrefix}bash -c "exec ${escapedClaudeCmd}"\r`;

    default:
      return `${cwdCommand}${pathPrefix}${escapedClaudeCmd}\r`;
  }
}

/**
 * Profile information for terminal title generation
 */
interface ProfileInfo {
  /** Profile name for display */
  name?: string;
  /** Whether this is the default profile */
  isDefault?: boolean;
}

/**
 * Callback type for session capture
 */
type SessionCaptureCallback = (terminalId: string, projectPath: string, startTime: number) => void;

/**
 * Finalize terminal state after invoking Claude.
 *
 * Updates terminal title, sends IPC notification to renderer, persists session,
 * and calls the session capture callback. This consolidates the post-invocation
 * logic used by both sync and async invoke methods.
 *
 * @param terminal - The terminal process to update
 * @param activeProfile - The profile being used (or undefined for default)
 * @param projectPath - The project path (for session capture)
 * @param startTime - Timestamp when invocation started
 * @param getWindow - Function to get the BrowserWindow
 * @param onSessionCapture - Callback for session capture
 *
 * @example
 * finalizeClaudeInvoke(
 *   terminal,
 *   { name: 'Work', isDefault: false },
 *   '/path/to/project',
 *   Date.now(),
 *   () => mainWindow,
 *   (id, path, time) => console.log('Session captured')
 * );
 */
export function finalizeClaudeInvoke(
  terminal: TerminalProcess,
  activeProfile: ProfileInfo | undefined,
  projectPath: string | undefined,
  startTime: number,
  getWindow: WindowGetter,
  onSessionCapture: SessionCaptureCallback
): void {
  // Set terminal title based on profile
  const title =
    activeProfile && !activeProfile.isDefault ? `Claude (${activeProfile.name})` : "Claude";
  terminal.title = title;

  // Notify renderer of title change
  const win = getWindow();
  if (win) {
    win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, terminal.id, title);
  }

  // Persist session if project path is available
  if (terminal.projectPath) {
    SessionHandler.persistSession(terminal);
  }

  // Call session capture callback if project path provided
  if (projectPath) {
    onSessionCapture(terminal.id, projectPath, startTime);
  }
}

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
  console.warn("[ClaudeIntegration] Rate limit detected, reset:", resetTime);

  const profileManager = getClaudeProfileManager();
  const currentProfileId = terminal.claudeProfileId || "default";

  try {
    const rateLimitEvent = profileManager.recordRateLimitEvent(currentProfileId, resetTime);
    console.warn("[ClaudeIntegration] Recorded rate limit event:", rateLimitEvent.type);
  } catch (err) {
    console.error("[ClaudeIntegration] Failed to record rate limit event:", err);
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
      autoSwitchEnabled: autoSwitchSettings.autoSwitchOnRateLimit,
    } as RateLimitEvent);
  }

  if (autoSwitchSettings.enabled && autoSwitchSettings.autoSwitchOnRateLimit && bestProfile) {
    console.warn("[ClaudeIntegration] Auto-switching to profile:", bestProfile.name);
    switchProfileCallback(terminal.id, bestProfile.id)
      .then((_result) => {
        console.warn("[ClaudeIntegration] Auto-switch completed");
      })
      .catch((err) => {
        console.error("[ClaudeIntegration] Auto-switch failed:", err);
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

  console.warn("[ClaudeIntegration] OAuth token detected, length:", token.length);

  const email = OutputParser.extractEmail(terminal.outputBuffer);
  // Match both custom profiles (profile-123456) and the default profile
  const profileIdMatch = terminal.id.match(/claude-login-(profile-\d+|default)-/);

  if (profileIdMatch) {
    // Save to specific profile (profile login terminal)
    const profileId = profileIdMatch[1];
    const profileManager = getClaudeProfileManager();
    const success = profileManager.setProfileToken(profileId, token, email || undefined);

    if (success) {
      console.warn("[ClaudeIntegration] OAuth token auto-saved to profile:", profileId);

      const win = getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, {
          terminalId: terminal.id,
          profileId,
          email,
          success: true,
          detectedAt: new Date().toISOString(),
        } as OAuthTokenEvent);
      }
    } else {
      console.error("[ClaudeIntegration] Failed to save OAuth token to profile:", profileId);
    }
  } else {
    // No profile-specific terminal, save to active profile (GitHub OAuth flow, etc.)
    console.warn(
      "[ClaudeIntegration] OAuth token detected in non-profile terminal, saving to active profile"
    );
    const profileManager = getClaudeProfileManager();
    const activeProfile = profileManager.getActiveProfile();

    // Defensive null check for active profile
    if (!activeProfile) {
      console.error("[ClaudeIntegration] Failed to save OAuth token: no active profile found");
      const win = getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, {
          terminalId: terminal.id,
          profileId: undefined,
          email,
          success: false,
          message: "No active profile found",
          detectedAt: new Date().toISOString(),
        } as OAuthTokenEvent);
      }
      return;
    }

    const success = profileManager.setProfileToken(activeProfile.id, token, email || undefined);

    if (success) {
      console.warn(
        "[ClaudeIntegration] OAuth token auto-saved to active profile:",
        activeProfile.name
      );

      const win = getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, {
          terminalId: terminal.id,
          profileId: activeProfile.id,
          email,
          success: true,
          detectedAt: new Date().toISOString(),
        } as OAuthTokenEvent);
      }
    } else {
      console.error(
        "[ClaudeIntegration] Failed to save OAuth token to active profile:",
        activeProfile.name
      );
      const win = getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_OAUTH_TOKEN, {
          terminalId: terminal.id,
          profileId: activeProfile?.id,
          email,
          success: false,
          message: "Failed to save token to active profile",
          detectedAt: new Date().toISOString(),
        } as OAuthTokenEvent);
      }
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
  console.warn("[ClaudeIntegration] Captured Claude session ID:", sessionId);

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
  debugLog("[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE START ==========");
  debugLog("[ClaudeIntegration:invokeClaude] Terminal ID:", terminal.id);
  debugLog("[ClaudeIntegration:invokeClaude] Requested profile ID:", profileId);
  debugLog("[ClaudeIntegration:invokeClaude] CWD:", cwd);

  terminal.isClaudeMode = true;
  SessionHandler.releaseSessionId(terminal.id);
  terminal.claudeSessionId = undefined;

  const startTime = Date.now();
  const projectPath = cwd || terminal.projectPath || terminal.cwd;

  const profileManager = getClaudeProfileManager();
  const activeProfile = profileId
    ? profileManager.getProfile(profileId)
    : profileManager.getActiveProfile();

  const previousProfileId = terminal.claudeProfileId;
  terminal.claudeProfileId = activeProfile?.id;

  // Get shell type for command syntax generation (fallback to 'unknown' if not set)
  const shellType = terminal.shellType || "unknown";
  debugLog("[ClaudeIntegration:invokeClaude] Shell type:", shellType);

  debugLog("[ClaudeIntegration:invokeClaude] Profile resolution:", {
    previousProfileId,
    newProfileId: activeProfile?.id,
    profileName: activeProfile?.name,
    hasOAuthToken: !!activeProfile?.oauthToken,
    isDefault: activeProfile?.isDefault,
  });

  // Use shell-type-aware cd command
  const cwdCommand = buildCdCommandForShell(cwd, shellType);
  const { command: claudeCmd, env: claudeEnv } = getClaudeCliInvocation();

  // Build path prefix with shell-specific syntax
  const pathPrefix = claudeEnv.PATH ? buildPathAssignment(claudeEnv.PATH, shellType) + " " : "";

  const needsEnvOverride = profileId && profileId !== previousProfileId;

  debugLog("[ClaudeIntegration:invokeClaude] Environment override check:", {
    profileIdProvided: !!profileId,
    previousProfileId,
    needsEnvOverride,
  });

  if (needsEnvOverride && activeProfile && !activeProfile.isDefault) {
    const token = profileManager.getProfileToken(activeProfile.id);
    debugLog("[ClaudeIntegration:invokeClaude] Token retrieval:", {
      hasToken: !!token,
      tokenLength: token?.length,
    });

    if (token) {
      // For non-default profiles with OAuth token, use shell-specific temp file method
      const nonce = crypto.randomBytes(8).toString("hex");
      const tempFile = path.join(os.tmpdir(), `.claude-token-${Date.now()}-${nonce}`);

      debugLog("[ClaudeIntegration:invokeClaude] Writing token to temp file:", tempFile);
      // Write token file with Unix-only permissions (mode 0o600 is not supported on Windows)
      const writeOptions: fs.WriteFileOptions = {};
      if (process.platform !== "win32") {
        writeOptions.mode = 0o600;
      }
      fs.writeFileSync(
        tempFile,
        `export CLAUDE_CODE_OAUTH_TOKEN=${escapeShellArg(token)}\n`,
        writeOptions
      );

      // Build shell-specific command for temp file method using shared helper
      const command = buildProfileCommandString({
        shellType,
        cwdCommand,
        pathPrefix,
        claudeCmd,
        token,
        tempFile,
      });

      if (command) {
        debugLog(
          "[ClaudeIntegration:invokeClaude] Executing command (temp file method, history-safe)"
        );
        terminal.pty.write(command);
        profileManager.markProfileUsed(activeProfile.id);
        finalizeClaudeInvoke(
          terminal,
          activeProfile,
          projectPath,
          startTime,
          getWindow,
          onSessionCapture
        );
        debugLog(
          "[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE COMPLETE (temp file) =========="
        );
        return;
      }
      // If command is null, fall through to default method
    } else if (activeProfile.configDir) {
      // For profiles with custom config dir
      const command = buildProfileCommandString({
        shellType,
        cwdCommand,
        pathPrefix,
        claudeCmd,
        configDir: activeProfile.configDir,
      });

      if (command) {
        debugLog("[ClaudeIntegration:invokeClaude] Executing command (configDir method)");
        terminal.pty.write(command);
        profileManager.markProfileUsed(activeProfile.id);
        finalizeClaudeInvoke(
          terminal,
          activeProfile,
          projectPath,
          startTime,
          getWindow,
          onSessionCapture
        );
        debugLog(
          "[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE COMPLETE (configDir) =========="
        );
        return;
      }
    } else {
      debugLog(
        "[ClaudeIntegration:invokeClaude] WARNING: No token or configDir available for non-default profile"
      );
    }
  }

  if (activeProfile && !activeProfile.isDefault) {
    debugLog(
      "[ClaudeIntegration:invokeClaude] Using terminal environment for non-default profile:",
      activeProfile.name
    );
  }

  // Default method: use shell-type-aware command invocation
  const command = `${cwdCommand}${pathPrefix}${buildCommandInvocation(claudeCmd, [], shellType)}\r`;
  debugLog("[ClaudeIntegration:invokeClaude] Executing command (default method):", command);
  terminal.pty.write(command);

  if (activeProfile) {
    profileManager.markProfileUsed(activeProfile.id);
  }

  finalizeClaudeInvoke(
    terminal,
    activeProfile,
    projectPath,
    startTime,
    getWindow,
    onSessionCapture
  );
  debugLog(
    "[ClaudeIntegration:invokeClaude] ========== INVOKE CLAUDE COMPLETE (default) =========="
  );
}

/**
 * Resume Claude session in the current directory
 *
 * Uses `claude --continue` which resumes the most recent conversation in the
 * current directory. This is simpler and more reliable than tracking session IDs,
 * since Auto Claude already restores terminals to their correct cwd/projectPath.
 *
 * Note: The sessionId parameter is kept for backwards compatibility but is ignored.
 * Claude Code's --resume flag expects user-named sessions (set via /rename), not
 * internal session file IDs.
 */
export function resumeClaude(
  terminal: TerminalProcess,
  _sessionId: string | undefined,
  getWindow: WindowGetter
): void {
  terminal.isClaudeMode = true;
  SessionHandler.releaseSessionId(terminal.id);

  const shellType = terminal.shellType || "unknown";
  const { command: claudeCmd, env: claudeEnv } = getClaudeCliInvocation();

  // Build path prefix with shell-specific syntax
  const pathPrefix = claudeEnv.PATH ? buildPathAssignment(claudeEnv.PATH, shellType) + " " : "";

  // Always use --continue which resumes the most recent session in the current directory.
  // This is more reliable than --resume with session IDs since Auto Claude already restores
  // terminals to their correct cwd/projectPath.
  //
  // Note: We clear claudeSessionId because --continue doesn't track specific sessions,
  // and we don't want stale IDs persisting through SessionHandler.persistSession().
  terminal.claudeSessionId = undefined;

  // Deprecation warning for callers still passing sessionId
  if (_sessionId) {
    console.warn(
      "[ClaudeIntegration:resumeClaude] sessionId parameter is deprecated and ignored; using claude --continue instead"
    );
  }

  const command = `${pathPrefix}${buildCommandInvocation(claudeCmd, ["--continue"], shellType)}`;

  terminal.pty.write(`${command}\r`);

  // Update terminal title in main process and notify renderer
  terminal.title = "Claude";
  const win = getWindow();
  if (win) {
    win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, terminal.id, "Claude");
  }

  // Persist session with updated title
  if (terminal.projectPath) {
    SessionHandler.persistSession(terminal);
  }
}

// ============================================================================
// ASYNC VERSIONS - Non-blocking alternatives for Electron main process
// ============================================================================

/**
 * Invoke Claude asynchronously (non-blocking)
 *
 * Safe to call from Electron main process without blocking the event loop.
 * Uses async CLI detection which doesn't block on subprocess calls.
 */
export async function invokeClaudeAsync(
  terminal: TerminalProcess,
  cwd: string | undefined,
  profileId: string | undefined,
  getWindow: WindowGetter,
  onSessionCapture: (terminalId: string, projectPath: string, startTime: number) => void
): Promise<void> {
  debugLog(
    "[ClaudeIntegration:invokeClaudeAsync] ========== INVOKE CLAUDE START (async) =========="
  );
  debugLog("[ClaudeIntegration:invokeClaudeAsync] Terminal ID:", terminal.id);
  debugLog("[ClaudeIntegration:invokeClaudeAsync] Requested profile ID:", profileId);
  debugLog("[ClaudeIntegration:invokeClaudeAsync] CWD:", cwd);

  terminal.isClaudeMode = true;
  SessionHandler.releaseSessionId(terminal.id);
  terminal.claudeSessionId = undefined;

  const startTime = Date.now();
  const projectPath = cwd || terminal.projectPath || terminal.cwd;

  // Ensure profile manager is initialized (async, yields to event loop)
  const profileManager = await initializeClaudeProfileManager();
  const activeProfile = profileId
    ? profileManager.getProfile(profileId)
    : profileManager.getActiveProfile();

  const previousProfileId = terminal.claudeProfileId;
  terminal.claudeProfileId = activeProfile?.id;

  // Get shell type for command syntax generation (fallback to 'unknown' if not set)
  const shellType = terminal.shellType || "unknown";
  debugLog("[ClaudeIntegration:invokeClaudeAsync] Shell type:", shellType);

  debugLog("[ClaudeIntegration:invokeClaudeAsync] Profile resolution:", {
    previousProfileId,
    newProfileId: activeProfile?.id,
    profileName: activeProfile?.name,
    hasOAuthToken: !!activeProfile?.oauthToken,
    isDefault: activeProfile?.isDefault,
  });

  // Use shell-type-aware cd command
  const cwdCommand = buildCdCommandForShell(cwd, shellType);
  const { command: claudeCmd, env: claudeEnv } = await getClaudeCliInvocationAsync();

  // Build path prefix with shell-specific syntax
  const pathPrefix = claudeEnv.PATH ? buildPathAssignment(claudeEnv.PATH, shellType) + " " : "";

  const needsEnvOverride = profileId && profileId !== previousProfileId;

  debugLog("[ClaudeIntegration:invokeClaudeAsync] Environment override check:", {
    profileIdProvided: !!profileId,
    previousProfileId,
    needsEnvOverride,
  });

  if (needsEnvOverride && activeProfile && !activeProfile.isDefault) {
    const token = profileManager.getProfileToken(activeProfile.id);
    debugLog("[ClaudeIntegration:invokeClaudeAsync] Token retrieval:", {
      hasToken: !!token,
      tokenLength: token?.length,
    });

    if (token) {
      // For non-default profiles with OAuth token, use shell-specific temp file method
      const nonce = crypto.randomBytes(8).toString("hex");
      const tempFile = path.join(os.tmpdir(), `.claude-token-${Date.now()}-${nonce}`);

      debugLog("[ClaudeIntegration:invokeClaudeAsync] Writing token to temp file:", tempFile);
      // Build options object - mode 0o600 is Unix-only (not supported on Windows)
      const writeOptions: fs.WriteFileOptions = {};
      if (process.platform !== "win32") {
        writeOptions.mode = 0o600;
      }
      await fsPromises.writeFile(
        tempFile,
        `export CLAUDE_CODE_OAUTH_TOKEN=${escapeShellArg(token)}\n`,
        writeOptions
      );

      // Build shell-specific command for temp file method using shared helper
      const command = buildProfileCommandString({
        shellType,
        cwdCommand,
        pathPrefix,
        claudeCmd,
        token,
        tempFile,
      });

      if (command) {
        debugLog(
          "[ClaudeIntegration:invokeClaudeAsync] Executing command (temp file method, history-safe)"
        );
        terminal.pty.write(command);
        profileManager.markProfileUsed(activeProfile.id);
        finalizeClaudeInvoke(
          terminal,
          activeProfile,
          projectPath,
          startTime,
          getWindow,
          onSessionCapture
        );
        debugLog(
          "[ClaudeIntegration:invokeClaudeAsync] ========== INVOKE CLAUDE COMPLETE (temp file) =========="
        );
        return;
      }
      // If command is null, fall through to default method
    } else if (activeProfile.configDir) {
      // For profiles with custom config dir
      const command = buildProfileCommandString({
        shellType,
        cwdCommand,
        pathPrefix,
        claudeCmd,
        configDir: activeProfile.configDir,
      });

      if (command) {
        debugLog("[ClaudeIntegration:invokeClaudeAsync] Executing command (configDir method)");
        terminal.pty.write(command);
        profileManager.markProfileUsed(activeProfile.id);
        finalizeClaudeInvoke(
          terminal,
          activeProfile,
          projectPath,
          startTime,
          getWindow,
          onSessionCapture
        );
        debugLog(
          "[ClaudeIntegration:invokeClaudeAsync] ========== INVOKE CLAUDE COMPLETE (configDir) =========="
        );
        return;
      }
    } else {
      debugLog(
        "[ClaudeIntegration:invokeClaudeAsync] WARNING: No token or configDir available for non-default profile"
      );
    }
  }

  if (activeProfile && !activeProfile.isDefault) {
    debugLog(
      "[ClaudeIntegration:invokeClaudeAsync] Using terminal environment for non-default profile:",
      activeProfile.name
    );
  }

  // Default method: use shell-type-aware command invocation
  const command = `${cwdCommand}${pathPrefix}${buildCommandInvocation(claudeCmd, [], shellType)}\r`;
  debugLog("[ClaudeIntegration:invokeClaudeAsync] Executing command (default method):", command);
  terminal.pty.write(command);

  if (activeProfile) {
    profileManager.markProfileUsed(activeProfile.id);
  }

  finalizeClaudeInvoke(
    terminal,
    activeProfile,
    projectPath,
    startTime,
    getWindow,
    onSessionCapture
  );
  debugLog(
    "[ClaudeIntegration:invokeClaudeAsync] ========== INVOKE CLAUDE COMPLETE (default) =========="
  );
}

/**
 * Resume Claude asynchronously (non-blocking)
 *
 * Safe to call from Electron main process without blocking the event loop.
 * Uses async CLI detection which doesn't block on subprocess calls.
 */
export async function resumeClaudeAsync(
  terminal: TerminalProcess,
  sessionId: string | undefined,
  getWindow: WindowGetter
): Promise<void> {
  terminal.isClaudeMode = true;
  SessionHandler.releaseSessionId(terminal.id);

  const shellType = terminal.shellType || "unknown";
  const { command: claudeCmd, env: claudeEnv } = await getClaudeCliInvocationAsync();

  // Build path prefix with shell-specific syntax
  const pathPrefix = claudeEnv.PATH ? buildPathAssignment(claudeEnv.PATH, shellType) + " " : "";

  // Always use --continue which resumes the most recent session in the current directory.
  // This is more reliable than --resume with session IDs since Auto Claude already restores
  // terminals to their correct cwd/projectPath.
  //
  // Note: We clear claudeSessionId because --continue doesn't track specific sessions,
  // and we don't want stale IDs persisting through SessionHandler.persistSession().
  terminal.claudeSessionId = undefined;

  // Deprecation warning for callers still passing sessionId
  if (sessionId) {
    console.warn(
      "[ClaudeIntegration:resumeClaudeAsync] sessionId parameter is deprecated and ignored; using claude --continue instead"
    );
  }

  const command = `${pathPrefix}${buildCommandInvocation(claudeCmd, ["--continue"], shellType)}`;

  terminal.pty.write(`${command}\r`);

  terminal.title = "Claude";
  const win = getWindow();
  if (win) {
    win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, terminal.id, "Claude");
  }

  if (terminal.projectPath) {
    SessionHandler.persistSession(terminal);
  }
}

/**
 * Configuration for waiting for Claude to exit
 */
interface WaitForExitConfig {
  /** Maximum time to wait for Claude to exit (ms) */
  timeout?: number;
  /** Interval between checks (ms) */
  pollInterval?: number;
}

/**
 * Result of waiting for Claude to exit
 */
interface WaitForExitResult {
  /** Whether Claude exited successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether the operation timed out */
  timedOut?: boolean;
}

/**
 * Shell prompt patterns that indicate Claude has exited and shell is ready
 * These patterns match common shell prompts across bash, zsh, fish, PowerShell, etc.
 */
const SHELL_PROMPT_PATTERNS = [
  /[$%#>❯]\s*$/m, // Common prompt endings: $, %, #, >, ❯
  /\w+@[\w.-]+[:\s]/, // user@hostname: format
  /^\s*\S+\s*[$%#>❯]\s*$/m, // hostname/path followed by prompt char
  /\(.*\)\s*[$%#>❯]\s*$/m, // (venv) or (branch) followed by prompt
  /^PS\s+[^\r\n>]+>\s*$/m, // PowerShell prompt: PS C:\path> or PS>
];

/**
 * Wait for Claude to exit by monitoring terminal output for shell prompt
 *
 * Instead of using fixed delays, this monitors the terminal's outputBuffer
 * for patterns indicating that Claude has exited and the shell prompt is visible.
 */
async function waitForClaudeExit(
  terminal: TerminalProcess,
  config: WaitForExitConfig = {}
): Promise<WaitForExitResult> {
  const { timeout = 5000, pollInterval = 100 } = config;

  debugLog("[ClaudeIntegration:waitForClaudeExit] Waiting for Claude to exit...");
  debugLog("[ClaudeIntegration:waitForClaudeExit] Config:", { timeout, pollInterval });

  // Capture current buffer length to detect new output
  const initialBufferLength = terminal.outputBuffer.length;
  const startTime = Date.now();

  return new Promise((resolve) => {
    const checkForPrompt = () => {
      const elapsed = Date.now() - startTime;

      // Check for timeout
      if (elapsed >= timeout) {
        console.warn(
          "[ClaudeIntegration:waitForClaudeExit] Timeout waiting for Claude to exit after",
          timeout,
          "ms"
        );
        debugLog(
          "[ClaudeIntegration:waitForClaudeExit] Timeout reached, Claude may not have exited cleanly"
        );
        resolve({
          success: false,
          error: `Timeout waiting for Claude to exit after ${timeout}ms`,
          timedOut: true,
        });
        return;
      }

      // Get new output since we started waiting
      const newOutput = terminal.outputBuffer.slice(initialBufferLength);

      // Check if we can see a shell prompt in the new output
      for (const pattern of SHELL_PROMPT_PATTERNS) {
        if (pattern.test(newOutput)) {
          debugLog(
            "[ClaudeIntegration:waitForClaudeExit] Shell prompt detected after",
            elapsed,
            "ms"
          );
          debugLog("[ClaudeIntegration:waitForClaudeExit] Matched pattern:", pattern.toString());
          resolve({ success: true });
          return;
        }
      }

      // Also check if isClaudeMode was cleared (set by other handlers)
      if (!terminal.isClaudeMode) {
        debugLog(
          "[ClaudeIntegration:waitForClaudeExit] isClaudeMode flag cleared after",
          elapsed,
          "ms"
        );
        resolve({ success: true });
        return;
      }

      // Continue polling
      setTimeout(checkForPrompt, pollInterval);
    };

    // Start checking
    checkForPrompt();
  });
}

/**
 * Switch terminal to a different Claude profile
 */
export async function switchClaudeProfile(
  terminal: TerminalProcess,
  profileId: string,
  getWindow: WindowGetter,
  invokeClaudeCallback: (
    terminalId: string,
    cwd: string | undefined,
    profileId: string
  ) => Promise<void>,
  clearRateLimitCallback: (terminalId: string) => void
): Promise<{ success: boolean; error?: string }> {
  // Always-on tracing
  console.warn(
    "[ClaudeIntegration:switchClaudeProfile] Called for terminal:",
    terminal.id,
    "| profileId:",
    profileId
  );
  console.warn(
    "[ClaudeIntegration:switchClaudeProfile] Terminal state: isClaudeMode=",
    terminal.isClaudeMode
  );

  debugLog("[ClaudeIntegration:switchClaudeProfile] ========== SWITCH PROFILE START ==========");
  debugLog("[ClaudeIntegration:switchClaudeProfile] Terminal ID:", terminal.id);
  debugLog("[ClaudeIntegration:switchClaudeProfile] Target profile ID:", profileId);
  debugLog("[ClaudeIntegration:switchClaudeProfile] Terminal state:", {
    isClaudeMode: terminal.isClaudeMode,
    currentProfileId: terminal.claudeProfileId,
    claudeSessionId: terminal.claudeSessionId,
    projectPath: terminal.projectPath,
    cwd: terminal.cwd,
  });

  // Ensure profile manager is initialized (async, yields to event loop)
  const profileManager = await initializeClaudeProfileManager();
  const profile = profileManager.getProfile(profileId);

  console.warn(
    "[ClaudeIntegration:switchClaudeProfile] Profile found:",
    profile?.name || "NOT FOUND"
  );
  debugLog(
    "[ClaudeIntegration:switchClaudeProfile] Target profile:",
    profile
      ? {
          id: profile.id,
          name: profile.name,
          hasOAuthToken: !!profile.oauthToken,
          isDefault: profile.isDefault,
        }
      : "NOT FOUND"
  );

  if (!profile) {
    console.error("[ClaudeIntegration:switchClaudeProfile] Profile not found, aborting");
    debugError("[ClaudeIntegration:switchClaudeProfile] Profile not found, aborting");
    return { success: false, error: "Profile not found" };
  }

  console.warn("[ClaudeIntegration:switchClaudeProfile] Switching to profile:", profile.name);
  debugLog("[ClaudeIntegration:switchClaudeProfile] Switching to Claude profile:", profile.name);

  if (terminal.isClaudeMode) {
    console.warn("[ClaudeIntegration:switchClaudeProfile] Sending exit commands (Ctrl+C, /exit)");
    debugLog(
      "[ClaudeIntegration:switchClaudeProfile] Terminal is in Claude mode, sending exit commands"
    );

    // Send Ctrl+C to interrupt any ongoing operation
    debugLog("[ClaudeIntegration:switchClaudeProfile] Sending Ctrl+C (\\x03)");
    terminal.pty.write("\x03");

    // Wait briefly for Ctrl+C to take effect before sending /exit
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send /exit command
    debugLog("[ClaudeIntegration:switchClaudeProfile] Sending /exit command");
    terminal.pty.write("/exit\r");

    // Wait for Claude to actually exit by monitoring for shell prompt
    const exitResult = await waitForClaudeExit(terminal, { timeout: 5000, pollInterval: 100 });

    if (exitResult.timedOut) {
      console.warn(
        "[ClaudeIntegration:switchClaudeProfile] Timed out waiting for Claude to exit, proceeding with caution"
      );
      debugLog(
        "[ClaudeIntegration:switchClaudeProfile] Exit timeout - terminal may be in inconsistent state"
      );

      // Even on timeout, we'll try to proceed but log the warning
      // The alternative would be to abort, but that could leave users stuck
      // If this becomes a problem, we could add retry logic or abort option
    } else if (!exitResult.success) {
      console.error(
        "[ClaudeIntegration:switchClaudeProfile] Failed to exit Claude:",
        exitResult.error
      );
      debugError("[ClaudeIntegration:switchClaudeProfile] Exit failed:", exitResult.error);
      // Continue anyway - the /exit command was sent
    } else {
      console.warn("[ClaudeIntegration:switchClaudeProfile] Claude exited successfully");
      debugLog("[ClaudeIntegration:switchClaudeProfile] Claude exited, ready to switch profile");
    }
  } else {
    console.warn(
      "[ClaudeIntegration:switchClaudeProfile] NOT in Claude mode, skipping exit commands"
    );
    debugLog(
      "[ClaudeIntegration:switchClaudeProfile] Terminal NOT in Claude mode, skipping exit commands"
    );
  }

  debugLog("[ClaudeIntegration:switchClaudeProfile] Clearing rate limit state for terminal");
  clearRateLimitCallback(terminal.id);

  const projectPath = terminal.projectPath || terminal.cwd;
  console.warn(
    "[ClaudeIntegration:switchClaudeProfile] Invoking Claude with profile:",
    profileId,
    "| cwd:",
    projectPath
  );
  debugLog("[ClaudeIntegration:switchClaudeProfile] Invoking Claude with new profile:", {
    terminalId: terminal.id,
    projectPath,
    profileId,
  });
  await invokeClaudeCallback(terminal.id, projectPath, profileId);

  debugLog("[ClaudeIntegration:switchClaudeProfile] Setting active profile in profile manager");
  profileManager.setActiveProfile(profileId);

  console.warn("[ClaudeIntegration:switchClaudeProfile] COMPLETE");
  debugLog("[ClaudeIntegration:switchClaudeProfile] ========== SWITCH PROFILE COMPLETE ==========");
  return { success: true };
}
