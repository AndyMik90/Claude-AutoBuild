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
 * Escape a string for safe use in PowerShell -Command context.
 * PowerShell requires escaping backticks, double quotes, dollar signs,
 * parentheses, semicolons, and ampersands.
 */
export function escapePowerShellCommand(str: string): string {
  return str
    .replace(/`/g, '``')      // Escape backticks (PowerShell escape char)
    .replace(/"/g, '`"')      // Escape double quotes
    .replace(/\$/g, '`$')     // Escape dollar signs (variable expansion)
    .replace(/\(/g, '`(')     // Escape opening parentheses
    .replace(/\)/g, '`)')     // Escape closing parentheses
    .replace(/;/g, '`;')      // Escape semicolons (statement separator)
    .replace(/&/g, '`&')      // Escape ampersands (call operator)
    .replace(/\r/g, '`r')     // Escape carriage returns
    .replace(/\n/g, '`n');    // Escape newlines
}

/**
 * Escape a string for safe use in Git Bash -c context.
 * Bash requires escaping single quotes, double quotes, backslashes, and other metacharacters.
 */
export function escapeGitBashCommand(str: string): string {
  // For bash -c with double quotes, escape: backslash, double quote, dollar, backtick,
  // semicolon, pipe, and exclamation mark (all bash metacharacters that could allow command injection)
  return str
    .replace(/\\/g, '\\\\')   // Escape backslashes first
    .replace(/"/g, '\\"')     // Escape double quotes
    .replace(/\$/g, '\\$')    // Escape dollar signs
    .replace(/`/g, '\\`')     // Escape backticks
    .replace(/;/g, '\\;')     // Escape semicolons (command separator)
    .replace(/\|/g, '\\|')    // Escape pipes (command piping)
    .replace(/!/g, '\\!');    // Escape exclamation marks (history expansion)
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
    // Values match SupportedTerminal type: 'windowsterminal', 'powershell', 'cmd', 'conemu', 'cmder',
    // 'gitbash', 'alacritty', 'wezterm', 'hyper', 'tabby', 'cygwin', 'msys2'
    const terminalId = preferredTerminal?.toLowerCase() || 'powershell';

    console.log('[Claude Code] Using terminal:', terminalId);
    console.log('[Claude Code] Command to run:', command);

    // For Windows, use exec with a properly formed command string
    // This is more reliable than spawn for complex PowerShell commands with pipes
    const { exec } = require('child_process');

    const runWindowsCommand = (cmdString: string): Promise<void> => {
      return new Promise((resolve) => {
        console.log(`[Claude Code] Executing: ${cmdString}`);
        // Fire and forget - don't wait for the terminal to close
        // The -NoExit flag keeps the terminal open, so we can't wait for exec to complete
        const child = exec(cmdString, { windowsHide: false });

        // Detach from the child process so we don't wait for it
        child.unref?.();

        // Resolve immediately after starting the process
        // Give it a brief moment to ensure the window opens
        setTimeout(() => resolve(), 300);
      });
    };

    try {
      // Escape command for PowerShell context to prevent command injection
      const escapedCommand = escapePowerShellCommand(command);

      if (terminalId === 'windowsterminal') {
        // Windows Terminal - open new tab with PowerShell
        await runWindowsCommand(`wt new-tab powershell -NoExit -Command "${escapedCommand}"`);
      } else if (terminalId === 'gitbash') {
        // Git Bash - use the passed command (escaped for bash context)
        const escapedBashCommand = escapeGitBashCommand(command);
        const gitBashPaths = [
          'C:\\Program Files\\Git\\git-bash.exe',
          'C:\\Program Files (x86)\\Git\\git-bash.exe',
        ];
        let gitBashPath = gitBashPaths.find(p => existsSync(p));
        if (gitBashPath) {
          await runWindowsCommand(`"${gitBashPath}" -c "${escapedBashCommand}"`);
        } else {
          throw new Error('Git Bash not found');
        }
      } else if (terminalId === 'alacritty') {
        // Alacritty
        await runWindowsCommand(`start alacritty -e powershell -NoExit -Command "${escapedCommand}"`);
      } else if (terminalId === 'wezterm') {
        // WezTerm
        await runWindowsCommand(`start wezterm start -- powershell -NoExit -Command "${escapedCommand}"`);
      } else if (terminalId === 'cmd') {
        // Command Prompt - use cmd /k to run command and keep window open
        // Note: cmd.exe uses its own escaping rules, so we pass the raw command
        // and let cmd handle it. The command is typically PowerShell-formatted
        // for install scripts, so we run PowerShell from cmd.
        await runWindowsCommand(`start cmd /k "powershell -NoExit -Command ${escapedCommand}"`);
      } else if (terminalId === 'conemu') {
        // ConEmu - open with PowerShell tab running the command
        const conemuPaths = [
          'C:\\Program Files\\ConEmu\\ConEmu64.exe',
          'C:\\Program Files (x86)\\ConEmu\\ConEmu.exe',
        ];
        const conemuPath = conemuPaths.find(p => existsSync(p));
        if (conemuPath) {
          // ConEmu uses -run to specify the command to execute
          await runWindowsCommand(`start "" "${conemuPath}" -run "powershell -NoExit -Command ${escapedCommand}"`);
        } else {
          // Fall back to PowerShell if ConEmu not found
          console.warn('[Claude Code] ConEmu not found, falling back to PowerShell');
          await runWindowsCommand(`start powershell -NoExit -Command "${escapedCommand}"`);
        }
      } else if (terminalId === 'cmder') {
        // Cmder - portable console emulator for Windows
        const cmderPaths = [
          'C:\\cmder\\Cmder.exe',
          'C:\\tools\\cmder\\Cmder.exe',
          path.join(process.env.CMDER_ROOT || '', 'Cmder.exe'),
        ].filter(p => p); // Remove empty paths
        const cmderPath = cmderPaths.find(p => existsSync(p));
        if (cmderPath) {
          // Cmder uses /TASK for predefined tasks or /START for directory, but we can use /C for command
          await runWindowsCommand(`start "" "${cmderPath}" /SINGLE /START "" /TASK "powershell -NoExit -Command ${escapedCommand}"`);
        } else {
          // Fall back to PowerShell if Cmder not found
          console.warn('[Claude Code] Cmder not found, falling back to PowerShell');
          await runWindowsCommand(`start powershell -NoExit -Command "${escapedCommand}"`);
        }
      } else if (terminalId === 'hyper') {
        // Hyper - Electron-based terminal
        const hyperPaths = [
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Hyper', 'Hyper.exe'),
          path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Hyper', 'Hyper.exe'),
        ];
        const hyperPath = hyperPaths.find(p => existsSync(p));
        if (hyperPath) {
          // Launch Hyper and it will pick up the shell; send command via PowerShell since Hyper
          // doesn't have a built-in way to run commands on startup
          await runWindowsCommand(`start "" "${hyperPath}"`);
          console.log('[Claude Code] Hyper opened - command must be pasted manually');
        } else {
          console.warn('[Claude Code] Hyper not found, falling back to PowerShell');
          await runWindowsCommand(`start powershell -NoExit -Command "${escapedCommand}"`);
        }
      } else if (terminalId === 'tabby') {
        // Tabby (formerly Terminus) - modern terminal for Windows
        const tabbyPaths = [
          path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Tabby', 'Tabby.exe'),
          path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'Tabby', 'Tabby.exe'),
        ];
        const tabbyPath = tabbyPaths.find(p => existsSync(p));
        if (tabbyPath) {
          // Tabby opens with default shell; similar to Hyper, no command line arg for running commands
          await runWindowsCommand(`start "" "${tabbyPath}"`);
          console.log('[Claude Code] Tabby opened - command must be pasted manually');
        } else {
          console.warn('[Claude Code] Tabby not found, falling back to PowerShell');
          await runWindowsCommand(`start powershell -NoExit -Command "${escapedCommand}"`);
        }
      } else if (terminalId === 'cygwin') {
        // Cygwin terminal
        const cygwinPaths = [
          'C:\\cygwin64\\bin\\mintty.exe',
          'C:\\cygwin\\bin\\mintty.exe',
        ];
        const cygwinPath = cygwinPaths.find(p => existsSync(p));
        if (cygwinPath) {
          // mintty with bash, escaping for bash context
          const escapedBashCommand = escapeGitBashCommand(command);
          await runWindowsCommand(`"${cygwinPath}" -e /bin/bash -lc "${escapedBashCommand}"`);
        } else {
          console.warn('[Claude Code] Cygwin not found, falling back to PowerShell');
          await runWindowsCommand(`start powershell -NoExit -Command "${escapedCommand}"`);
        }
      } else if (terminalId === 'msys2') {
        // MSYS2 terminal
        const msys2Paths = [
          'C:\\msys64\\msys2_shell.cmd',
          'C:\\msys64\\mingw64.exe',
          'C:\\msys64\\usr\\bin\\mintty.exe',
        ];
        const msys2Path = msys2Paths.find(p => existsSync(p));
        if (msys2Path) {
          const escapedBashCommand = escapeGitBashCommand(command);
          if (msys2Path.endsWith('.cmd')) {
            // Use the shell launcher script
            await runWindowsCommand(`"${msys2Path}" -mingw64 -c "${escapedBashCommand}"`);
          } else {
            // Use mintty directly
            await runWindowsCommand(`"${msys2Path}" -e /bin/bash -lc "${escapedBashCommand}"`);
          }
        } else {
          console.warn('[Claude Code] MSYS2 not found, falling back to PowerShell');
          await runWindowsCommand(`start powershell -NoExit -Command "${escapedCommand}"`);
        }
      } else {
        // Default: PowerShell (handles 'powershell', 'system', or any unknown value)
        // Use 'start' command to open a new PowerShell window
        // The command is wrapped in double quotes and passed via -Command
        await runWindowsCommand(`start powershell -NoExit -Command "${escapedCommand}"`);
      }
    } catch (err) {
      console.error('[Claude Code] Terminal execution failed:', err);
      throw new Error(`Failed to open terminal: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
