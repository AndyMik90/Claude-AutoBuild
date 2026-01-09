/**
 * PTY Manager Module
 * Handles low-level PTY process creation and lifecycle
 */

import * as pty from '@lydell/node-pty';
import * as os from 'os';
import * as path from 'path';
import { existsSync } from 'fs';
import type { TerminalProcess, WindowGetter } from './types';
import { IPC_CHANNELS } from '../../shared/constants';
import { getClaudeProfileManager } from '../claude-profile-manager';
import { readSettingsFile } from '../settings-utils';
import type { SupportedTerminal } from '../../shared/types/settings';
import { getToolInfo } from '../cli-tool-manager';

/**
 * Windows shell paths for different terminal preferences
 */
const WINDOWS_SHELL_PATHS: Record<string, string[]> = {
  powershell: [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',  // PowerShell 7 (Core)
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',  // Windows PowerShell 5.1
  ],
  windowsterminal: [
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',  // Prefer PowerShell Core in Windows Terminal
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  ],
  cmd: [
    'C:\\Windows\\System32\\cmd.exe',
  ],
  gitbash: [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
  ],
  cygwin: [
    'C:\\cygwin64\\bin\\bash.exe',
    'C:\\cygwin\\bin\\bash.exe',
  ],
  msys2: [
    'C:\\msys64\\usr\\bin\\bash.exe',
    'C:\\msys32\\usr\\bin\\bash.exe',
  ],
};

/**
 * Derive the path to bash.exe from the git.exe path on Windows.
 * Git for Windows installs bash.exe in the Git/bin directory.
 */
function deriveGitBashPath(gitExePath: string): string | null {
  if (process.platform !== 'win32') {
    return null;
  }

  try {
    const gitDir = path.dirname(gitExePath);
    const gitDirName = path.basename(gitDir).toLowerCase();

    let gitRoot: string;

    if (gitDirName === 'cmd') {
      // .../Git/cmd/git.exe -> .../Git
      gitRoot = path.dirname(gitDir);
    } else if (gitDirName === 'bin') {
      // Could be .../Git/bin/git.exe OR .../Git/mingw64/bin/git.exe
      const parent = path.dirname(gitDir);
      const parentName = path.basename(parent).toLowerCase();
      if (parentName === 'mingw64' || parentName === 'mingw32') {
        // .../Git/mingw64/bin/git.exe -> .../Git
        gitRoot = path.dirname(parent);
      } else {
        // .../Git/bin/git.exe -> .../Git
        gitRoot = parent;
      }
    } else {
      gitRoot = path.dirname(gitDir);
    }

    const bashPath = path.join(gitRoot, 'bin', 'bash.exe');

    if (existsSync(bashPath)) {
      return bashPath;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the CLAUDE_CODE_GIT_BASH_PATH environment variable for Windows.
 * Claude Code on Windows requires git-bash for proper shell operations.
 */
function getGitBashEnv(): Record<string, string> {
  if (process.platform !== 'win32' || process.env.CLAUDE_CODE_GIT_BASH_PATH) {
    return {};
  }

  try {
    const gitInfo = getToolInfo('git');
    if (gitInfo.found && gitInfo.path) {
      const bashPath = deriveGitBashPath(gitInfo.path);
      if (bashPath) {
        console.log('[PtyManager] Setting CLAUDE_CODE_GIT_BASH_PATH:', bashPath);
        return { CLAUDE_CODE_GIT_BASH_PATH: bashPath };
      }
    }
  } catch (error) {
    console.warn('[PtyManager] Failed to detect git-bash path:', error);
  }

  return {};
}

/**
 * Get the Windows shell executable based on preferred terminal setting
 */
function getWindowsShell(preferredTerminal: SupportedTerminal | undefined): string {
  // If no preference or 'system', use COMSPEC (usually cmd.exe)
  if (!preferredTerminal || preferredTerminal === 'system') {
    return process.env.COMSPEC || 'cmd.exe';
  }

  // Check if we have paths defined for this terminal type
  const paths = WINDOWS_SHELL_PATHS[preferredTerminal];
  if (paths) {
    // Find the first existing shell
    for (const shellPath of paths) {
      if (existsSync(shellPath)) {
        return shellPath;
      }
    }
  }

  // Fallback to COMSPEC for unrecognized terminals
  return process.env.COMSPEC || 'cmd.exe';
}

/**
 * Spawn a new PTY process with appropriate shell and environment
 */
export function spawnPtyProcess(
  cwd: string,
  cols: number,
  rows: number,
  profileEnv?: Record<string, string>
): pty.IPty {
  // Read user's preferred terminal setting
  const settings = readSettingsFile();
  const preferredTerminal = settings?.preferredTerminal as SupportedTerminal | undefined;

  const shell = process.platform === 'win32'
    ? getWindowsShell(preferredTerminal)
    : process.env.SHELL || '/bin/zsh';

  const shellArgs = process.platform === 'win32' ? [] : ['-l'];

  console.warn('[PtyManager] Spawning shell:', shell, shellArgs, '(preferred:', preferredTerminal || 'system', ')');

  // Create a clean environment without DEBUG to prevent Claude Code from
  // enabling debug mode when the Electron app is run in development mode.
  // Also remove ANTHROPIC_API_KEY to ensure Claude Code uses OAuth tokens
  // (CLAUDE_CODE_OAUTH_TOKEN from profileEnv) instead of API keys that may
  // be present in the shell environment. Without this, Claude Code would
  // show "Claude API" instead of "Claude Max" when ANTHROPIC_API_KEY is set.
  const { DEBUG: _DEBUG, ANTHROPIC_API_KEY: _ANTHROPIC_API_KEY, ...cleanEnv } = process.env;

  // On Windows, Claude Code requires git-bash path
  const gitBashEnv = getGitBashEnv();

  return pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || os.homedir(),
    env: {
      ...cleanEnv,
      ...gitBashEnv,
      ...profileEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });
}

/**
 * Setup PTY event handlers for a terminal process
 */
export function setupPtyHandlers(
  terminal: TerminalProcess,
  terminals: Map<string, TerminalProcess>,
  getWindow: WindowGetter,
  onDataCallback: (terminal: TerminalProcess, data: string) => void,
  onExitCallback: (terminal: TerminalProcess) => void
): void {
  const { id, pty: ptyProcess } = terminal;

  // Handle data from terminal
  ptyProcess.onData((data) => {
    // Append to output buffer (limit to 100KB)
    terminal.outputBuffer = (terminal.outputBuffer + data).slice(-100000);

    // Call custom data handler
    onDataCallback(terminal, data);

    // Send to renderer
    const win = getWindow();
    if (win) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, id, data);
    }
  });

  // Handle terminal exit
  ptyProcess.onExit(({ exitCode }) => {
    console.warn('[PtyManager] Terminal exited:', id, 'code:', exitCode);

    const win = getWindow();
    if (win) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, id, exitCode);
    }

    // Call custom exit handler
    onExitCallback(terminal);

    terminals.delete(id);
  });
}

/**
 * Write data to a PTY process
 */
export function writeToPty(terminal: TerminalProcess, data: string): void {
  terminal.pty.write(data);
}

/**
 * Resize a PTY process
 */
export function resizePty(terminal: TerminalProcess, cols: number, rows: number): void {
  terminal.pty.resize(cols, rows);
}

/**
 * Kill a PTY process
 */
export function killPty(terminal: TerminalProcess): void {
  terminal.pty.kill();
}

/**
 * Get the active Claude profile environment variables
 */
export function getActiveProfileEnv(): Record<string, string> {
  const profileManager = getClaudeProfileManager();
  return profileManager.getActiveProfileEnv();
}
