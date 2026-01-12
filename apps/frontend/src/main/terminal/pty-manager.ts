/**
 * PTY Manager Module
 * Handles low-level PTY process creation and lifecycle
 */

import * as pty from '@lydell/node-pty';
import * as os from 'os';
import { existsSync } from 'fs';
import type { TerminalProcess, WindowGetter, ShellType } from './types';
import { IPC_CHANNELS } from '../../shared/constants';
import { getClaudeProfileManager } from '../claude-profile-manager';
import { readSettingsFile } from '../settings-utils';
import { debugLog, debugError } from '../../shared/utils/debug-logger';
import type { SupportedTerminal } from '../../shared/types/settings';

/**
 * Result of spawning a PTY process
 */
export interface SpawnResult {
  pty: pty.IPty;
  shellType: ShellType;
}

/**
 * Detect shell type from executable path.
 *
 * Uses precise matching to avoid false positives (e.g., a path containing 'cmd'
 * as a substring should not match as cmd.exe).
 *
 * @param shellPath - The path to the shell executable
 * @returns The detected shell type
 */
export function detectShellType(shellPath: string): ShellType {
  const normalized = shellPath.toLowerCase();

  // Check for PowerShell Core (pwsh) first - more specific match
  // Matches: pwsh.exe, pwsh, /usr/bin/pwsh
  if (normalized.endsWith('pwsh.exe') || normalized.endsWith('pwsh') || normalized.includes('/pwsh')) {
    return 'pwsh';
  }

  // Check for Windows PowerShell
  // Matches: powershell.exe, /powershell
  if (normalized.endsWith('powershell.exe') || normalized.includes('/powershell')) {
    return 'powershell';
  }

  // Check for cmd.exe - use precise matching to avoid false positives
  // A path like 'C:\Documents\mycmdtool\bash.exe' should NOT match as cmd
  // Only match: cmd.exe, \cmd.exe, /cmd.exe, or just 'cmd'
  if (
    normalized.endsWith('cmd.exe') ||
    normalized.endsWith('\\cmd') ||
    normalized.endsWith('/cmd') ||
    normalized === 'cmd'
  ) {
    return 'cmd';
  }

  // Check for bash (includes Git Bash, Cygwin, MSYS2)
  // Matches: bash.exe, bash, /bin/bash, /usr/bin/bash
  if (normalized.endsWith('bash.exe') || normalized.endsWith('bash') || normalized.includes('/bash')) {
    return 'bash';
  }

  // Check for zsh
  // Matches: zsh, /bin/zsh, /usr/bin/zsh
  if (normalized.endsWith('zsh') || normalized.includes('/zsh')) {
    return 'zsh';
  }

  // Unix fallback based on platform
  if (process.platform !== 'win32') return 'bash';

  return 'unknown';
}

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
 * Returns both the PTY process and the detected shell type for command generation
 */
export function spawnPtyProcess(
  cwd: string,
  cols: number,
  rows: number,
  profileEnv?: Record<string, string>
): SpawnResult {
  // Read user's preferred terminal setting
  const settings = readSettingsFile();
  const preferredTerminal = settings?.preferredTerminal as SupportedTerminal | undefined;

  const shell = process.platform === 'win32'
    ? getWindowsShell(preferredTerminal)
    : process.env.SHELL || '/bin/zsh';

  const shellType = detectShellType(shell);
  const shellArgs = process.platform === 'win32' ? [] : ['-l'];

  debugLog('[PtyManager] Spawning shell:', shell, shellArgs, '(preferred:', preferredTerminal || 'system', ', type:', shellType, ')');

  // Create a clean environment without DEBUG to prevent Claude Code from
  // enabling debug mode when the Electron app is run in development mode.
  // Also remove ANTHROPIC_API_KEY to ensure Claude Code uses OAuth tokens
  // (CLAUDE_CODE_OAUTH_TOKEN from profileEnv) instead of API keys that may
  // be present in the shell environment. Without this, Claude Code would
  // show "Claude API" instead of "Claude Max" when ANTHROPIC_API_KEY is set.
  const { DEBUG: _DEBUG, ANTHROPIC_API_KEY: _ANTHROPIC_API_KEY, ...cleanEnv } = process.env;

  const ptyProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: cwd || os.homedir(),
    env: {
      ...cleanEnv,
      ...profileEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    },
  });

  return { pty: ptyProcess, shellType };
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
    debugLog('[PtyManager] Terminal exited:', id, 'code:', exitCode);

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
 * Constants for chunked write behavior
 * CHUNKED_WRITE_THRESHOLD: Data larger than this (bytes) will be written in chunks
 * CHUNK_SIZE: Size of each chunk - smaller chunks yield to event loop more frequently
 */
const CHUNKED_WRITE_THRESHOLD = 1000;
const CHUNK_SIZE = 100;

/**
 * Write queue per terminal to prevent interleaving of concurrent writes.
 * Maps terminal ID to the last write Promise in the queue.
 */
const pendingWrites = new Map<string, Promise<void>>();

/**
 * Internal function to perform the actual write (chunked or direct)
 * Returns a Promise that resolves when the write is complete
 */
function performWrite(terminal: TerminalProcess, data: string): Promise<void> {
  return new Promise((resolve) => {
    // For large commands, write in chunks to prevent blocking
    if (data.length > CHUNKED_WRITE_THRESHOLD) {
      debugLog('[PtyManager:writeToPty] Large write detected, using chunked write');
      let offset = 0;
      let chunkNum = 0;

      const writeChunk = () => {
        // Check if terminal is still valid before writing
        if (!terminal.pty) {
          debugError('[PtyManager:writeToPty] Terminal PTY no longer valid, aborting chunked write');
          resolve();
          return;
        }

        if (offset >= data.length) {
          debugLog('[PtyManager:writeToPty] Chunked write completed, total chunks:', chunkNum);
          resolve();
          return;
        }

        const chunk = data.slice(offset, offset + CHUNK_SIZE);
        chunkNum++;
        try {
          terminal.pty.write(chunk);
          offset += CHUNK_SIZE;
          // Use setImmediate to yield to the event loop between chunks
          setImmediate(writeChunk);
        } catch (error) {
          debugError('[PtyManager:writeToPty] Chunked write FAILED at chunk', chunkNum, ':', error);
          resolve(); // Resolve anyway - fire-and-forget semantics
        }
      };

      // Start the chunked write after yielding
      setImmediate(writeChunk);
    } else {
      try {
        terminal.pty.write(data);
        debugLog('[PtyManager:writeToPty] Write completed successfully');
      } catch (error) {
        debugError('[PtyManager:writeToPty] Write FAILED:', error);
      }
      resolve();
    }
  });
}

/**
 * Write data to a PTY process
 * Uses setImmediate to prevent blocking the event loop on large writes.
 * Serializes writes per terminal to prevent interleaving of concurrent writes.
 */
export function writeToPty(terminal: TerminalProcess, data: string): void {
  debugLog('[PtyManager:writeToPty] About to write to pty, data length:', data.length);

  // Get the previous write Promise for this terminal (if any)
  const previousWrite = pendingWrites.get(terminal.id) || Promise.resolve();

  // Chain this write after the previous one completes
  const currentWrite = previousWrite.then(() => performWrite(terminal, data));

  // Update the pending write for this terminal
  pendingWrites.set(terminal.id, currentWrite);

  // Clean up the Map entry when done to prevent memory leaks
  currentWrite.finally(() => {
    // Only clean up if this is still the latest write
    if (pendingWrites.get(terminal.id) === currentWrite) {
      pendingWrites.delete(terminal.id);
    }
  });
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
