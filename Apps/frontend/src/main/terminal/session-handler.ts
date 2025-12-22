/**
 * Session Handler Module
 * Manages terminal session persistence, restoration, and Claude session tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { TerminalProcess, WindowGetter } from './types';
import { getTerminalSessionStore, type TerminalSession } from '../terminal-session-store';
import { IPC_CHANNELS } from '../../shared/constants';
import { debugLog, debugError } from '../../shared/utils/debug-logger';

/**
 * Get the Claude project slug from a project path.
 * Claude uses the full path with forward slashes replaced by dashes.
 */
function getClaudeProjectSlug(projectPath: string): string {
  return projectPath.replace(/[/\\]/g, '-');
}

/**
 * Find the most recent Claude session file for a project
 */
export function findMostRecentClaudeSession(projectPath: string): string | null {
  const slug = getClaudeProjectSlug(projectPath);
  const claudeProjectDir = path.join(os.homedir(), '.claude', 'projects', slug);

  try {
    if (!fs.existsSync(claudeProjectDir)) {
      debugLog('[SessionHandler] Claude project directory not found:', claudeProjectDir);
      return null;
    }

    const files = fs.readdirSync(claudeProjectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(claudeProjectDir, f),
        mtime: fs.statSync(path.join(claudeProjectDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      debugLog('[SessionHandler] No Claude session files found in:', claudeProjectDir);
      return null;
    }

    const sessionId = files[0].name.replace('.jsonl', '');
    debugLog('[SessionHandler] Found most recent Claude session:', sessionId);
    return sessionId;
  } catch (error) {
    debugError('[SessionHandler] Error finding Claude session:', error);
    return null;
  }
}

/**
 * Find a Claude session created/modified after a given timestamp
 */
export function findClaudeSessionAfter(projectPath: string, afterTimestamp: number): string | null {
  const slug = getClaudeProjectSlug(projectPath);
  const claudeProjectDir = path.join(os.homedir(), '.claude', 'projects', slug);

  try {
    if (!fs.existsSync(claudeProjectDir)) {
      return null;
    }

    const files = fs.readdirSync(claudeProjectDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({
        name: f,
        path: path.join(claudeProjectDir, f),
        mtime: fs.statSync(path.join(claudeProjectDir, f)).mtime.getTime()
      }))
      .filter(f => f.mtime > afterTimestamp)
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length === 0) {
      return null;
    }

    return files[0].name.replace('.jsonl', '');
  } catch (error) {
    debugError('[SessionHandler] Error finding Claude session:', error);
    return null;
  }
}

/**
 * Persist a terminal session to disk
 */
export function persistSession(terminal: TerminalProcess): void {
  if (!terminal.projectPath) {
    return;
  }

  const store = getTerminalSessionStore();
  const session: TerminalSession = {
    id: terminal.id,
    title: terminal.title,
    cwd: terminal.cwd,
    projectPath: terminal.projectPath,
    isClaudeMode: terminal.isClaudeMode,
    claudeSessionId: terminal.claudeSessionId,
    outputBuffer: terminal.outputBuffer,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString()
  };
  store.saveSession(session);
}

/**
 * Persist all active sessions
 */
export function persistAllSessions(terminals: Map<string, TerminalProcess>): void {
  const _store = getTerminalSessionStore();

  terminals.forEach((terminal) => {
    if (terminal.projectPath) {
      persistSession(terminal);
    }
  });
}

/**
 * Remove a session from persistent storage
 */
export function removePersistedSession(terminal: TerminalProcess): void {
  if (!terminal.projectPath) {
    return;
  }

  const store = getTerminalSessionStore();
  store.removeSession(terminal.projectPath, terminal.id);
}

/**
 * Update Claude session ID in persistent storage
 */
export function updateClaudeSessionId(
  projectPath: string,
  terminalId: string,
  sessionId: string
): void {
  const store = getTerminalSessionStore();
  store.updateClaudeSessionId(projectPath, terminalId, sessionId);
}

/**
 * Get saved sessions for a project
 */
export function getSavedSessions(projectPath: string): TerminalSession[] {
  const store = getTerminalSessionStore();
  return store.getSessions(projectPath);
}

/**
 * Clear all saved sessions for a project
 */
export function clearSavedSessions(projectPath: string): void {
  const store = getTerminalSessionStore();
  store.clearProjectSessions(projectPath);
}

/**
 * Get available session dates
 */
export function getAvailableSessionDates(
  projectPath?: string
): import('../terminal-session-store').SessionDateInfo[] {
  const store = getTerminalSessionStore();
  return store.getAvailableDates(projectPath);
}

/**
 * Get sessions for a specific date
 */
export function getSessionsForDate(date: string, projectPath: string): TerminalSession[] {
  const store = getTerminalSessionStore();
  return store.getSessionsForDate(date, projectPath);
}

/**
 * Attempt to capture Claude session ID by polling the session directory
 */
export function captureClaudeSessionId(
  terminalId: string,
  projectPath: string,
  startTime: number,
  terminals: Map<string, TerminalProcess>,
  getWindow: WindowGetter
): void {
  let attempts = 0;
  const maxAttempts = 10;

  const checkForSession = () => {
    attempts++;

    const terminal = terminals.get(terminalId);
    if (!terminal || !terminal.isClaudeMode) {
      return;
    }

    if (terminal.claudeSessionId) {
      return;
    }

    const sessionId = findClaudeSessionAfter(projectPath, startTime);

    if (sessionId) {
      terminal.claudeSessionId = sessionId;
      debugLog('[SessionHandler] Captured Claude session ID from directory:', sessionId);

      if (terminal.projectPath) {
        updateClaudeSessionId(terminal.projectPath, terminalId, sessionId);
      }

      const win = getWindow();
      if (win) {
        win.webContents.send(IPC_CHANNELS.TERMINAL_CLAUDE_SESSION, terminalId, sessionId);
      }
    } else if (attempts < maxAttempts) {
      setTimeout(checkForSession, 1000);
    } else {
      debugLog('[SessionHandler] Could not capture Claude session ID after', maxAttempts, 'attempts');
    }
  };

  setTimeout(checkForSession, 2000);
}
