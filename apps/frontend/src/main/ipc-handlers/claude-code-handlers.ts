/**
 * Claude Code CLI Handlers
 *
 * IPC handlers for Claude Code CLI version checking and installation.
 * Provides functionality to:
 * - Check installed vs latest version
 * - Open terminal with installation command
 */

import { ipcMain, shell } from 'electron';
import { execFileSync, spawn } from 'child_process';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants/ipc';
import type { IPCResult } from '../../shared/types';
import type { ClaudeCodeVersionInfo } from '../../shared/types/cli';
import { getToolInfo } from '../cli-tool-manager';
import { readSettingsFile } from '../settings-utils';
import semver from 'semver';

// Cache for latest version (avoid hammering npm registry)
let cachedLatestVersion: { version: string; timestamp: number } | null = null;
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Fetch the latest version of Claude Code from npm registry
 */
async function fetchLatestVersion(): Promise<string> {
  // Check cache first
  if (cachedLatestVersion && Date.now() - cachedLatestVersion.timestamp < CACHE_DURATION_MS) {
    return cachedLatestVersion.version;
  }

  try {
    const response = await fetch('https://registry.npmjs.org/@anthropic-ai/claude-code/latest', {
      headers: {
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const version = data.version;

    if (!version || typeof version !== 'string') {
      throw new Error('Invalid version format from npm registry');
    }

    // Cache the result
    cachedLatestVersion = { version, timestamp: Date.now() };
    return version;
  } catch (error) {
    console.error('[Claude Code] Failed to fetch latest version:', error);
    // Return cached version if available, even if expired
    if (cachedLatestVersion) {
      return cachedLatestVersion.version;
    }
    throw error;
  }
}

/**
 * Get the platform-specific install command for Claude Code
 * @param isUpdate - If true, Claude is already installed and we just need to update
 */
function getInstallCommand(isUpdate: boolean): string {
  if (process.platform === 'win32') {
    if (isUpdate) {
      // Update: kill running Claude processes first, then update with --force
      return 'taskkill /IM claude.exe /F 2>nul; claude install --force latest';
    }
    return 'irm https://claude.ai/install.ps1 | iex';
  } else {
    if (isUpdate) {
      // Update: kill running Claude processes first, then update with --force
      // pkill sends SIGTERM to gracefully stop Claude processes
      return 'pkill -x claude 2>/dev/null; sleep 1; claude install --force latest';
    }
    // Fresh install: use the full install script
    return 'curl -fsSL https://claude.ai/install.sh | bash -s -- latest';
  }
}

/**
 * Escape single quotes in a string for use in AppleScript
 */
export function escapeAppleScriptString(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Open a terminal with the given command
 * Uses the user's preferred terminal from settings
 * Supports macOS, Windows, and Linux terminals
 */
export async function openTerminalWithCommand(command: string): Promise<void> {
  const platform = process.platform;
  const settings = readSettingsFile();
  const preferredTerminal = settings?.preferredTerminal as string | undefined;

  console.log('[Claude Code] Platform:', platform);
  console.log('[Claude Code] Preferred terminal:', preferredTerminal);

  if (platform === 'darwin') {
    // macOS: Use AppleScript to open terminal with command
    const escapedCommand = escapeAppleScriptString(command);
    let script: string;

    // Map SupportedTerminal values to terminal handling
    // Values come from settings.preferredTerminal (SupportedTerminal type)
    const terminalId = preferredTerminal?.toLowerCase() || 'terminal';

    console.log('[Claude Code] Using terminal:', terminalId);

    if (terminalId === 'iterm2') {
      // iTerm2
      script = `
        tell application "iTerm"
          activate
          create window with default profile
          tell current session of current window
            write text "${escapedCommand}"
          end tell
        end tell
      `;
    } else if (terminalId === 'warp') {
      // Warp - open and send command
      script = `
        tell application "Warp"
          activate
        end tell
        delay 0.5
        tell application "System Events"
          keystroke "${escapedCommand}"
          keystroke return
        end tell
      `;
    } else if (terminalId === 'kitty') {
      // Kitty - use command line
      spawn('kitty', ['--', 'bash', '-c', command], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'alacritty') {
      // Alacritty - use command line
      spawn('open', ['-a', 'Alacritty', '--args', '-e', 'bash', '-c', command], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'wezterm') {
      // WezTerm - use command line
      spawn('wezterm', ['start', '--', 'bash', '-c', command], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'ghostty') {
      // Ghostty
      script = `
        tell application "Ghostty"
          activate
        end tell
        delay 0.3
        tell application "System Events"
          keystroke "${escapedCommand}"
          keystroke return
        end tell
      `;
    } else if (terminalId === 'hyper') {
      // Hyper
      script = `
        tell application "Hyper"
          activate
        end tell
        delay 0.3
        tell application "System Events"
          keystroke "${escapedCommand}"
          keystroke return
        end tell
      `;
    } else if (terminalId === 'tabby') {
      // Tabby (formerly Terminus)
      script = `
        tell application "Tabby"
          activate
        end tell
        delay 0.3
        tell application "System Events"
          keystroke "${escapedCommand}"
          keystroke return
        end tell
      `;
    } else {
      // Default: Terminal.app (handles 'terminal', 'system', or any unknown value)
      // IMPORTANT: do script FIRST, then activate - this prevents opening a blank default window
      // when Terminal.app isn't already running
      script = `
        tell application "Terminal"
          do script "${escapedCommand}"
          activate
        end tell
      `;
    }

    console.log('[Claude Code] Running AppleScript...');
    execFileSync('osascript', ['-e', script], { stdio: 'pipe' });

  } else if (platform === 'win32') {
    // Windows: Use appropriate terminal
    // Values match SupportedTerminal type: 'windowsterminal', 'powershell', 'cmd', 'conemu', 'cmder', 'gitbash'
    const terminalId = preferredTerminal?.toLowerCase() || 'powershell';

    console.log('[Claude Code] Using terminal:', terminalId);

    if (terminalId === 'windowsterminal') {
      // Windows Terminal
      spawn('wt.exe', ['powershell.exe', '-NoExit', '-Command', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    } else if (terminalId === 'cmd') {
      // Command Prompt
      spawn('cmd.exe', ['/K', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    } else if (terminalId === 'conemu') {
      // ConEmu
      spawn('ConEmu64.exe', ['-run', 'powershell.exe', '-NoExit', '-Command', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    } else if (terminalId === 'cmder') {
      // Cmder (ConEmu-based)
      spawn('cmder.exe', ['/TASK', 'powershell', '/CMD', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    } else if (terminalId === 'gitbash') {
      // Git Bash
      spawn('C:\\Program Files\\Git\\git-bash.exe', ['-c', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    } else if (terminalId === 'hyper') {
      // Hyper
      spawn('hyper.exe', [], { detached: true, stdio: 'ignore', shell: false }).unref();
      // Note: Hyper doesn't support direct command execution, user needs to paste
    } else if (terminalId === 'tabby') {
      // Tabby
      spawn('tabby.exe', [], { detached: true, stdio: 'ignore', shell: false }).unref();
    } else if (terminalId === 'alacritty') {
      // Alacritty on Windows
      spawn('alacritty.exe', ['-e', 'powershell.exe', '-NoExit', '-Command', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    } else if (terminalId === 'wezterm') {
      // WezTerm on Windows
      spawn('wezterm.exe', ['start', '--', 'powershell.exe', '-NoExit', '-Command', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    } else {
      // Default: PowerShell (handles 'powershell', 'system', or any unknown value)
      spawn('powershell.exe', ['-NoExit', '-Command', command], {
        detached: true, stdio: 'ignore', shell: false,
      }).unref();
    }
  } else {
    // Linux: Use preferred terminal or try common emulators
    // Values match SupportedTerminal type: 'gnometerminal', 'konsole', 'xfce4terminal', 'tilix', etc.
    const terminalId = preferredTerminal?.toLowerCase() || '';

    console.log('[Claude Code] Using terminal:', terminalId || 'auto-detect');

    // Command to run (keep terminal open after execution)
    const bashCommand = `${command}; exec bash`;

    // Try to use preferred terminal if specified
    if (terminalId === 'gnometerminal') {
      spawn('gnome-terminal', ['--', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'konsole') {
      spawn('konsole', ['-e', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'xfce4terminal') {
      spawn('xfce4-terminal', ['-e', `bash -c "${bashCommand}"`], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'lxterminal') {
      spawn('lxterminal', ['-e', `bash -c "${bashCommand}"`], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'mate-terminal') {
      spawn('mate-terminal', ['-e', `bash -c "${bashCommand}"`], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'tilix') {
      spawn('tilix', ['-e', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'terminator') {
      spawn('terminator', ['-e', `bash -c "${bashCommand}"`], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'guake') {
      spawn('guake', ['-e', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'yakuake') {
      spawn('yakuake', ['-e', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'kitty') {
      spawn('kitty', ['--', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'alacritty') {
      spawn('alacritty', ['-e', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'wezterm') {
      spawn('wezterm', ['start', '--', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'hyper') {
      spawn('hyper', [], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'tabby') {
      spawn('tabby', [], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'xterm') {
      spawn('xterm', ['-e', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'urxvt') {
      spawn('urxvt', ['-e', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'st') {
      spawn('st', ['-e', 'bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    } else if (terminalId === 'foot') {
      spawn('foot', ['bash', '-c', bashCommand], { detached: true, stdio: 'ignore' }).unref();
      return;
    }

    // Auto-detect (for 'system' or no preference): try common terminal emulators in order
    const terminals: Array<{ cmd: string; args: string[] }> = [
      { cmd: 'gnome-terminal', args: ['--', 'bash', '-c', bashCommand] },
      { cmd: 'konsole', args: ['-e', 'bash', '-c', bashCommand] },
      { cmd: 'xfce4-terminal', args: ['-e', `bash -c "${bashCommand}"`] },
      { cmd: 'tilix', args: ['-e', 'bash', '-c', bashCommand] },
      { cmd: 'terminator', args: ['-e', `bash -c "${bashCommand}"`] },
      { cmd: 'kitty', args: ['--', 'bash', '-c', bashCommand] },
      { cmd: 'alacritty', args: ['-e', 'bash', '-c', bashCommand] },
      { cmd: 'xterm', args: ['-e', 'bash', '-c', bashCommand] },
    ];

    let opened = false;
    for (const { cmd, args } of terminals) {
      try {
        spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
        opened = true;
        console.log('[Claude Code] Opened terminal:', cmd);
        break;
      } catch {
        continue;
      }
    }

    if (!opened) {
      throw new Error('No supported terminal emulator found');
    }
  }
}

/**
 * Register Claude Code IPC handlers
 */
export function registerClaudeCodeHandlers(): void {
  // Check Claude Code version
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_CODE_CHECK_VERSION,
    async (): Promise<IPCResult<ClaudeCodeVersionInfo>> => {
      try {
        console.log('[Claude Code] Checking version...');

        // Get installed version via cli-tool-manager
        let detectionResult;
        try {
          detectionResult = getToolInfo('claude');
          console.log('[Claude Code] Detection result:', JSON.stringify(detectionResult, null, 2));
        } catch (detectionError) {
          console.error('[Claude Code] Detection error:', detectionError);
          throw new Error(`Detection failed: ${detectionError instanceof Error ? detectionError.message : 'Unknown error'}`);
        }

        const installed = detectionResult.found ? detectionResult.version || null : null;
        console.log('[Claude Code] Installed version:', installed);

        // Fetch latest version from npm
        let latest: string;
        try {
          console.log('[Claude Code] Fetching latest version from npm...');
          latest = await fetchLatestVersion();
          console.log('[Claude Code] Latest version:', latest);
        } catch (error) {
          console.warn('[Claude Code] Failed to fetch latest version, continuing with unknown:', error);
          // If we can't fetch latest, still return installed info
          return {
            success: true,
            data: {
              installed,
              latest: 'unknown',
              isOutdated: false,
              path: detectionResult.path,
              detectionResult,
            },
          };
        }

        // Compare versions
        let isOutdated = false;
        if (installed && latest !== 'unknown') {
          try {
            // Clean version strings (remove 'v' prefix if present)
            const cleanInstalled = installed.replace(/^v/, '');
            const cleanLatest = latest.replace(/^v/, '');
            isOutdated = semver.lt(cleanInstalled, cleanLatest);
          } catch {
            // If semver comparison fails, assume not outdated
            isOutdated = false;
          }
        }

        console.log('[Claude Code] Check complete:', { installed, latest, isOutdated });
        return {
          success: true,
          data: {
            installed,
            latest,
            isOutdated,
            path: detectionResult.path,
            detectionResult,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Claude Code] Check failed:', errorMsg, error);
        return {
          success: false,
          error: `Failed to check Claude Code version: ${errorMsg}`,
        };
      }
    }
  );

  // Install Claude Code (open terminal with install command)
  ipcMain.handle(
    IPC_CHANNELS.CLAUDE_CODE_INSTALL,
    async (): Promise<IPCResult<{ command: string }>> => {
      try {
        // Check if Claude is already installed to determine if this is an update
        let isUpdate = false;
        try {
          const detectionResult = getToolInfo('claude');
          isUpdate = detectionResult.found && !!detectionResult.version;
          console.log('[Claude Code] Is update:', isUpdate, 'detected version:', detectionResult.version);
        } catch {
          // Detection failed, assume fresh install
          isUpdate = false;
        }

        const command = getInstallCommand(isUpdate);
        console.log('[Claude Code] Install command:', command);
        console.log('[Claude Code] Opening terminal...');
        await openTerminalWithCommand(command);
        console.log('[Claude Code] Terminal opened successfully');

        return {
          success: true,
          data: { command },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Claude Code] Install failed:', errorMsg, error);
        return {
          success: false,
          error: `Failed to open terminal for installation: ${errorMsg}`,
        };
      }
    }
  );

  console.warn('[IPC] Claude Code handlers registered');
}
