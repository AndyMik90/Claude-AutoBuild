import * as pty from 'node-pty';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../shared/constants';
import type { TerminalCreateOptions } from '../shared/types';
import * as os from 'os';
import { getTerminalSessionStore, type TerminalSession } from './terminal-session-store';

interface TerminalProcess {
  id: string;
  pty: pty.IPty;
  isClaudeMode: boolean;
  projectPath?: string;
  claudeSessionId?: string;
  outputBuffer: string;  // Track output for session persistence
  title: string;
}

// Regex patterns to capture Claude session ID from output
// Claude Code outputs something like "Session: abc123" or stores it in the init message
const CLAUDE_SESSION_PATTERNS = [
  // Direct session display (if Claude shows it)
  /Session(?:\s+ID)?:\s*([a-zA-Z0-9_-]+)/i,
  // From the JSONL filename pattern that Claude uses internally
  /session[_-]?id["\s:=]+([a-zA-Z0-9_-]+)/i,
  // From Claude Code's init output
  /Resuming session:\s*([a-zA-Z0-9_-]+)/i,
  // From conversation ID in output
  /conversation[_-]?id["\s:=]+([a-zA-Z0-9_-]+)/i,
];

export class TerminalManager {
  private terminals: Map<string, TerminalProcess> = new Map();
  private getWindow: () => BrowserWindow | null;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(getWindow: () => BrowserWindow | null) {
    this.getWindow = getWindow;

    // Periodically save session data (every 30 seconds)
    this.saveTimer = setInterval(() => {
      this.persistAllSessions();
    }, 30000);
  }

  /**
   * Persist all current sessions to disk
   */
  private persistAllSessions(): void {
    const store = getTerminalSessionStore();

    for (const [, terminal] of this.terminals) {
      if (terminal.projectPath) {
        const session: TerminalSession = {
          id: terminal.id,
          title: terminal.title,
          cwd: '', // Will be set from options
          projectPath: terminal.projectPath,
          isClaudeMode: terminal.isClaudeMode,
          claudeSessionId: terminal.claudeSessionId,
          outputBuffer: terminal.outputBuffer,
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString()
        };
        store.saveSession(session);
      }
    }
  }

  /**
   * Try to extract Claude session ID from output
   */
  private extractClaudeSessionId(data: string): string | null {
    for (const pattern of CLAUDE_SESSION_PATTERNS) {
      const match = data.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Create a new terminal process
   */
  async create(options: TerminalCreateOptions & { projectPath?: string }): Promise<{ success: boolean; error?: string }> {
    const { id, cwd, cols = 80, rows = 24, projectPath } = options;

    console.log('[TerminalManager] Creating terminal:', { id, cwd, cols, rows, projectPath });

    // Check if terminal already exists - return success instead of error
    // This handles React StrictMode double-render gracefully
    if (this.terminals.has(id)) {
      console.log('[TerminalManager] Terminal already exists, returning success:', id);
      return { success: true };
    }

    try {
      // Determine shell based on platform
      const shell = process.platform === 'win32'
        ? process.env.COMSPEC || 'cmd.exe'
        : process.env.SHELL || '/bin/zsh';

      // Get shell args
      const shellArgs = process.platform === 'win32' ? [] : ['-l'];

      console.log('[TerminalManager] Spawning shell:', shell, shellArgs);

      // Spawn the pty process
      const ptyProcess = pty.spawn(shell, shellArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: cwd || os.homedir(),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      console.log('[TerminalManager] PTY process spawned, pid:', ptyProcess.pid);

      // Store the terminal
      const terminal: TerminalProcess = {
        id,
        pty: ptyProcess,
        isClaudeMode: false,
        projectPath,
        outputBuffer: '',
        title: `Terminal ${this.terminals.size + 1}`
      };
      this.terminals.set(id, terminal);

      // Handle data from terminal
      ptyProcess.onData((data) => {
        // Append to output buffer (limit to 100KB)
        terminal.outputBuffer = (terminal.outputBuffer + data).slice(-100000);

        // Try to extract Claude session ID if in Claude mode
        if (terminal.isClaudeMode && !terminal.claudeSessionId) {
          const sessionId = this.extractClaudeSessionId(data);
          if (sessionId) {
            terminal.claudeSessionId = sessionId;
            console.log('[TerminalManager] Captured Claude session ID:', sessionId);

            // Save to persistent store
            if (terminal.projectPath) {
              const store = getTerminalSessionStore();
              store.updateClaudeSessionId(terminal.projectPath, id, sessionId);
            }

            // Notify renderer
            const win = this.getWindow();
            if (win) {
              win.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, id, sessionId);
            }
          }
        }

        const win = this.getWindow();
        if (win) {
          win.webContents.send(IPC_CHANNELS.TERMINAL_OUTPUT, id, data);
        }
      });

      // Handle terminal exit
      ptyProcess.onExit(({ exitCode }) => {
        console.log('[TerminalManager] Terminal exited:', id, 'code:', exitCode);
        const win = this.getWindow();
        if (win) {
          win.webContents.send(IPC_CHANNELS.TERMINAL_EXIT, id, exitCode);
        }

        // Remove session from persistent store when terminal exits
        if (terminal.projectPath) {
          const store = getTerminalSessionStore();
          store.removeSession(terminal.projectPath, id);
        }

        this.terminals.delete(id);
      });

      // Save initial session state
      if (projectPath) {
        const store = getTerminalSessionStore();
        store.saveSession({
          id,
          title: terminal.title,
          cwd: cwd || os.homedir(),
          projectPath,
          isClaudeMode: false,
          outputBuffer: '',
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString()
        });
      }

      console.log('[TerminalManager] Terminal created successfully:', id);
      return { success: true };
    } catch (error) {
      console.error('[TerminalManager] Error creating terminal:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create terminal',
      };
    }
  }

  /**
   * Restore a terminal session (create PTY and optionally resume Claude)
   */
  async restore(session: TerminalSession, cols = 80, rows = 24): Promise<{ success: boolean; error?: string; outputBuffer?: string }> {
    console.log('[TerminalManager] Restoring terminal session:', session.id, 'Claude mode:', session.isClaudeMode);

    // First create the base terminal
    const result = await this.create({
      id: session.id,
      cwd: session.cwd,
      cols,
      rows,
      projectPath: session.projectPath
    });

    if (!result.success) {
      return result;
    }

    const terminal = this.terminals.get(session.id);
    if (!terminal) {
      return { success: false, error: 'Terminal not found after creation' };
    }

    // Set the title
    terminal.title = session.title;

    // If it was a Claude session, try to resume
    if (session.isClaudeMode) {
      // Wait a bit for shell to initialize
      await new Promise(resolve => setTimeout(resolve, 500));

      terminal.isClaudeMode = true;
      terminal.claudeSessionId = session.claudeSessionId;

      // Build the resume command
      let resumeCommand: string;
      if (session.claudeSessionId) {
        // Resume specific session
        resumeCommand = `claude --resume "${session.claudeSessionId}"`;
        console.log('[TerminalManager] Resuming Claude with session ID:', session.claudeSessionId);
      } else {
        // Continue most recent session in that directory
        resumeCommand = 'claude --continue';
        console.log('[TerminalManager] Continuing most recent Claude session');
      }

      terminal.pty.write(`${resumeCommand}\r`);

      // Notify renderer about title change
      const win = this.getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, session.id, 'Claude');
      }
    }

    return {
      success: true,
      outputBuffer: session.outputBuffer  // Return buffer for replay in UI
    };
  }

  /**
   * Destroy a terminal process
   */
  async destroy(id: string): Promise<{ success: boolean; error?: string }> {
    const terminal = this.terminals.get(id);
    if (!terminal) {
      return { success: false, error: 'Terminal not found' };
    }

    try {
      // Remove from persistent store
      if (terminal.projectPath) {
        const store = getTerminalSessionStore();
        store.removeSession(terminal.projectPath, id);
      }

      terminal.pty.kill();
      this.terminals.delete(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to destroy terminal',
      };
    }
  }

  /**
   * Send input to a terminal
   */
  write(id: string, data: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.pty.write(data);
    }
  }

  /**
   * Resize a terminal
   */
  resize(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.pty.resize(cols, rows);
    }
  }

  /**
   * Invoke Claude in a terminal
   */
  invokeClaude(id: string, cwd?: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.isClaudeMode = true;
      terminal.claudeSessionId = undefined;  // Will be captured from output

      // Clear the terminal and invoke claude
      const cwdCommand = cwd ? `cd "${cwd}" && ` : '';
      terminal.pty.write(`${cwdCommand}claude\r`);

      // Notify the renderer about title change
      const win = this.getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, id, 'Claude');
      }

      // Update persistent store
      if (terminal.projectPath) {
        const store = getTerminalSessionStore();
        const session = store.getSession(terminal.projectPath, id);
        if (session) {
          store.saveSession({
            ...session,
            isClaudeMode: true,
            lastActiveAt: new Date().toISOString()
          });
        }
      }
    }
  }

  /**
   * Resume Claude in a terminal with a specific session ID
   */
  resumeClaude(id: string, sessionId?: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.isClaudeMode = true;

      let command: string;
      if (sessionId) {
        command = `claude --resume "${sessionId}"`;
        terminal.claudeSessionId = sessionId;
      } else {
        command = 'claude --continue';
      }

      terminal.pty.write(`${command}\r`);

      // Notify the renderer about title change
      const win = this.getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, id, 'Claude');
      }
    }
  }

  /**
   * Get saved sessions for a project
   */
  getSavedSessions(projectPath: string): TerminalSession[] {
    const store = getTerminalSessionStore();
    return store.getSessions(projectPath);
  }

  /**
   * Clear saved sessions for a project
   */
  clearSavedSessions(projectPath: string): void {
    const store = getTerminalSessionStore();
    store.clearProjectSessions(projectPath);
  }

  /**
   * Kill all terminal processes
   */
  async killAll(): Promise<void> {
    // Save all sessions before killing
    this.persistAllSessions();

    // Clear the save timer
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }

    const promises: Promise<void>[] = [];

    for (const [id, terminal] of this.terminals) {
      promises.push(
        new Promise((resolve) => {
          try {
            terminal.pty.kill();
          } catch {
            // Ignore errors during cleanup
          }
          resolve();
        })
      );
    }

    await Promise.all(promises);
    this.terminals.clear();
  }

  /**
   * Get all active terminal IDs
   */
  getActiveTerminalIds(): string[] {
    return Array.from(this.terminals.keys());
  }

  /**
   * Check if a terminal is in Claude mode
   */
  isClaudeMode(id: string): boolean {
    const terminal = this.terminals.get(id);
    return terminal?.isClaudeMode ?? false;
  }

  /**
   * Get Claude session ID for a terminal
   */
  getClaudeSessionId(id: string): string | undefined {
    const terminal = this.terminals.get(id);
    return terminal?.claudeSessionId;
  }

  /**
   * Update terminal title
   */
  setTitle(id: string, title: string): void {
    const terminal = this.terminals.get(id);
    if (terminal) {
      terminal.title = title;
    }
  }
}
