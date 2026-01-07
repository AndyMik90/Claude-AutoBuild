/**
 * Terminal Lifecycle
 * Handles terminal creation, restoration, and destruction operations
 */

import * as os from 'os';
import { existsSync } from 'fs';
import type { TerminalCreateOptions } from '../../shared/types';
import { IPC_CHANNELS } from '../../shared/constants';
import type { TerminalSession } from '../terminal-session-store';
import * as PtyManager from './pty-manager';
import * as SessionHandler from './session-handler';
import type {
  TerminalProcess,
  WindowGetter,
  TerminalOperationResult
} from './types';
import { debugLog, debugError } from '../../shared/utils/debug-logger';

/**
 * Options for terminal restoration
 */
export interface RestoreOptions {
  resumeClaudeSession: boolean;
  captureSessionId: (terminalId: string, projectPath: string, startTime: number) => void;
  /** Callback triggered when a Claude session needs to be resumed.
   * Note: sessionId is deprecated and ignored - resumeClaude uses --continue */
  onResumeNeeded?: (terminalId: string, sessionId: string | undefined) => void;
}

/**
 * Data handler function type
 */
export type DataHandlerFn = (terminal: TerminalProcess, data: string) => void;

/**
 * Create a new terminal process
 */
export async function createTerminal(
  options: TerminalCreateOptions & { projectPath?: string },
  terminals: Map<string, TerminalProcess>,
  getWindow: WindowGetter,
  dataHandler: DataHandlerFn
): Promise<TerminalOperationResult> {
  const { id, cwd, cols = 80, rows = 24, projectPath } = options;

  debugLog('[TerminalLifecycle] Creating terminal:', { id, cwd, cols, rows, projectPath });

  if (terminals.has(id)) {
    debugLog('[TerminalLifecycle] Terminal already exists, returning success:', id);
    return { success: true };
  }

  try {
    const profileEnv = PtyManager.getActiveProfileEnv();

    if (profileEnv.CLAUDE_CODE_OAUTH_TOKEN) {
      debugLog('[TerminalLifecycle] Injecting OAuth token from active profile');
    }

    // Validate cwd exists - if the directory doesn't exist (e.g., worktree removed),
    // fall back to project path to prevent shell exit with code 1
    let effectiveCwd = cwd;
    if (cwd && !existsSync(cwd)) {
      debugLog('[TerminalLifecycle] Terminal cwd does not exist, falling back:', cwd, '->', projectPath || os.homedir());
      effectiveCwd = projectPath || os.homedir();
    }

    const ptyProcess = PtyManager.spawnPtyProcess(
      effectiveCwd || os.homedir(),
      cols,
      rows,
      profileEnv
    );

    debugLog('[TerminalLifecycle] PTY process spawned, pid:', ptyProcess.pid);

    const terminalCwd = effectiveCwd || os.homedir();
    const terminal: TerminalProcess = {
      id,
      pty: ptyProcess,
      isClaudeMode: false,
      projectPath,
      cwd: terminalCwd,
      outputBuffer: '',
      title: `Terminal ${terminals.size + 1}`
    };

    terminals.set(id, terminal);

    PtyManager.setupPtyHandlers(
      terminal,
      terminals,
      getWindow,
      (term, data) => dataHandler(term, data),
      (term) => handleTerminalExit(term, terminals)
    );

    if (projectPath) {
      SessionHandler.persistSession(terminal);
    }

    debugLog('[TerminalLifecycle] Terminal created successfully:', id);
    return { success: true };
  } catch (error) {
    debugError('[TerminalLifecycle] Error creating terminal:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create terminal',
    };
  }
}

/**
 * Restore a terminal session
 */
export async function restoreTerminal(
  session: TerminalSession,
  terminals: Map<string, TerminalProcess>,
  getWindow: WindowGetter,
  dataHandler: DataHandlerFn,
  options: RestoreOptions,
  cols = 80,
  rows = 24
): Promise<TerminalOperationResult> {
  // Look up the stored session to get the correct isClaudeMode value
  // The renderer may pass isClaudeMode: false (by design), but we need the stored value
  // to determine whether to auto-resume Claude
  const storedSessions = SessionHandler.getSavedSessions(session.projectPath);
  const storedSession = storedSessions.find(s => s.id === session.id);
  const storedIsClaudeMode = storedSession?.isClaudeMode ?? session.isClaudeMode;
  const storedClaudeSessionId = storedSession?.claudeSessionId ?? session.claudeSessionId;

  debugLog('[TerminalLifecycle] Restoring terminal session:', session.id,
    'Passed Claude mode:', session.isClaudeMode,
    'Stored Claude mode:', storedIsClaudeMode,
    'Stored session ID:', storedClaudeSessionId);

  // Validate cwd exists - if the directory was deleted (e.g., worktree removed),
  // fall back to project path to prevent shell exit with code 1
  let effectiveCwd = session.cwd;
  if (!existsSync(session.cwd)) {
    debugLog('[TerminalLifecycle] Session cwd does not exist, falling back to project path:', session.cwd, '->', session.projectPath);
    effectiveCwd = session.projectPath || os.homedir();
  }

  const result = await createTerminal(
    {
      id: session.id,
      cwd: effectiveCwd,
      cols,
      rows,
      projectPath: session.projectPath
    },
    terminals,
    getWindow,
    dataHandler
  );

  if (!result.success) {
    return result;
  }

  const terminal = terminals.get(session.id);
  if (!terminal) {
    return { success: false, error: 'Terminal not found after creation' };
  }

  // Restore title and worktree config from session
  terminal.title = session.title;
  // Only restore worktree config if the worktree directory still exists
  // (effectiveCwd matching session.cwd means no fallback was needed)
  if (effectiveCwd === session.cwd) {
    terminal.worktreeConfig = session.worktreeConfig;
  } else {
    // Worktree was deleted, clear the config and update terminal's cwd
    terminal.worktreeConfig = undefined;
    terminal.cwd = effectiveCwd;
    debugLog('[TerminalLifecycle] Cleared worktree config for terminal with deleted worktree:', session.id);
  }

  // Send title change event for all restored terminals so renderer updates
  const win = getWindow();
  if (win) {
    win.webContents.send(IPC_CHANNELS.TERMINAL_TITLE_CHANGE, session.id, session.title);
  }

  // Auto-resume Claude if session was in Claude mode
  // Use storedIsClaudeMode which comes from the persisted store,
  // not the renderer-passed values (renderer always passes isClaudeMode: false)
  //
  // Note: We no longer require storedClaudeSessionId because resumeClaude uses
  // `claude --continue` which resumes the most recent session in the directory
  // automatically. Session IDs are deprecated and ignored.
  if (options.resumeClaudeSession && storedIsClaudeMode) {
    terminal.isClaudeMode = true;
    // Don't set claudeSessionId - it's deprecated and --continue doesn't use it
    debugLog('[TerminalLifecycle] Auto-resuming Claude session using --continue');

    // Notify renderer that we're in Claude mode (session ID is deprecated)
    // This prevents the renderer from also trying to resume (duplicate command)
    if (win) {
      win.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, terminal.id, storedClaudeSessionId);
    }

    // Persist the restored Claude mode state immediately to avoid data loss
    // if app closes before the 30-second periodic save
    if (terminal.projectPath) {
      SessionHandler.persistSession(terminal);
    }

    // Small delay to ensure PTY is ready before sending resume command
    // Note: sessionId parameter is deprecated and ignored by resumeClaude
    if (options.onResumeNeeded) {
      setTimeout(() => {
        options.onResumeNeeded!(terminal.id, storedClaudeSessionId);
      }, 500);
    }
  }

  return {
    success: true,
    outputBuffer: session.outputBuffer
  };
}

/**
 * Destroy a terminal process
 */
export async function destroyTerminal(
  id: string,
  terminals: Map<string, TerminalProcess>,
  onCleanup: (terminalId: string) => void
): Promise<TerminalOperationResult> {
  const terminal = terminals.get(id);
  if (!terminal) {
    return { success: false, error: 'Terminal not found' };
  }

  try {
    SessionHandler.removePersistedSession(terminal);
    // Release any claimed session ID for this terminal
    SessionHandler.releaseSessionId(id);
    onCleanup(id);
    PtyManager.killPty(terminal);
    terminals.delete(id);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to destroy terminal',
    };
  }
}

/**
 * Kill all terminal processes
 */
export async function destroyAllTerminals(
  terminals: Map<string, TerminalProcess>,
  saveTimer: NodeJS.Timeout | null
): Promise<NodeJS.Timeout | null> {
  SessionHandler.persistAllSessions(terminals);

  if (saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }

  const promises: Promise<void>[] = [];

  terminals.forEach((terminal) => {
    promises.push(
      new Promise((resolve) => {
        try {
          PtyManager.killPty(terminal);
        } catch {
          // Ignore errors during cleanup
        }
        resolve();
      })
    );
  });

  await Promise.all(promises);
  terminals.clear();

  return saveTimer;
}

/**
 * Handle terminal exit event
 * Note: We don't remove sessions here because terminal exit might be due to app shutdown.
 * Sessions are only removed when explicitly destroyed by user action via destroyTerminal().
 */
function handleTerminalExit(
  _terminal: TerminalProcess,
  _terminals: Map<string, TerminalProcess>
): void {
  // Don't remove session - let it persist for restoration
}

/**
 * Restore multiple sessions from a specific date
 */
export async function restoreSessionsFromDate(
  date: string,
  projectPath: string,
  terminals: Map<string, TerminalProcess>,
  getWindow: WindowGetter,
  dataHandler: DataHandlerFn,
  options: RestoreOptions,
  cols = 80,
  rows = 24
): Promise<{ restored: number; failed: number; sessions: Array<{ id: string; success: boolean; error?: string }> }> {
  const sessions = SessionHandler.getSessionsForDate(date, projectPath);
  const results: Array<{ id: string; success: boolean; error?: string }> = [];

  for (const session of sessions) {
    const result = await restoreTerminal(
      session,
      terminals,
      getWindow,
      dataHandler,
      options,
      cols,
      rows
    );
    results.push({
      id: session.id,
      success: result.success,
      error: result.error
    });
  }

  return {
    restored: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    sessions: results
  };
}
