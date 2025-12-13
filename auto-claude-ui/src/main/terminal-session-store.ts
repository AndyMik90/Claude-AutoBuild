import { app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';

/**
 * Persisted terminal session data
 */
export interface TerminalSession {
  id: string;
  title: string;
  cwd: string;
  projectPath: string;  // Which project this terminal belongs to
  isClaudeMode: boolean;
  claudeSessionId?: string;  // Claude session ID for resume functionality
  outputBuffer: string;  // Last 100KB of output for replay
  createdAt: string;  // ISO timestamp
  lastActiveAt: string;  // ISO timestamp
}

/**
 * All persisted sessions grouped by project
 */
interface SessionData {
  version: number;
  sessions: Record<string, TerminalSession[]>;  // projectPath -> sessions
}

const STORE_VERSION = 1;
const MAX_OUTPUT_BUFFER = 100000;  // 100KB per terminal

/**
 * Manages persistent terminal session storage
 * Sessions are saved to userData/sessions/terminals.json
 */
export class TerminalSessionStore {
  private storePath: string;
  private data: SessionData;

  constructor() {
    const sessionsDir = join(app.getPath('userData'), 'sessions');
    this.storePath = join(sessionsDir, 'terminals.json');

    // Ensure directory exists
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    // Load existing data or initialize
    this.data = this.load();
  }

  /**
   * Load sessions from disk
   */
  private load(): SessionData {
    try {
      if (existsSync(this.storePath)) {
        const content = readFileSync(this.storePath, 'utf-8');
        const data = JSON.parse(content) as SessionData;

        // Version check for future migrations
        if (data.version !== STORE_VERSION) {
          console.log('[TerminalSessionStore] Version mismatch, resetting sessions');
          return { version: STORE_VERSION, sessions: {} };
        }

        return data;
      }
    } catch (error) {
      console.error('[TerminalSessionStore] Error loading sessions:', error);
    }

    return { version: STORE_VERSION, sessions: {} };
  }

  /**
   * Save sessions to disk
   */
  private save(): void {
    try {
      writeFileSync(this.storePath, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('[TerminalSessionStore] Error saving sessions:', error);
    }
  }

  /**
   * Save a terminal session
   */
  saveSession(session: TerminalSession): void {
    const { projectPath } = session;

    if (!this.data.sessions[projectPath]) {
      this.data.sessions[projectPath] = [];
    }

    // Update existing or add new
    const existingIndex = this.data.sessions[projectPath].findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      this.data.sessions[projectPath][existingIndex] = {
        ...session,
        // Limit output buffer size
        outputBuffer: session.outputBuffer.slice(-MAX_OUTPUT_BUFFER),
        lastActiveAt: new Date().toISOString()
      };
    } else {
      this.data.sessions[projectPath].push({
        ...session,
        outputBuffer: session.outputBuffer.slice(-MAX_OUTPUT_BUFFER),
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      });
    }

    this.save();
  }

  /**
   * Get all sessions for a project
   */
  getSessions(projectPath: string): TerminalSession[] {
    return this.data.sessions[projectPath] || [];
  }

  /**
   * Get a specific session
   */
  getSession(projectPath: string, sessionId: string): TerminalSession | undefined {
    const sessions = this.data.sessions[projectPath] || [];
    return sessions.find(s => s.id === sessionId);
  }

  /**
   * Remove a session
   */
  removeSession(projectPath: string, sessionId: string): void {
    if (this.data.sessions[projectPath]) {
      this.data.sessions[projectPath] = this.data.sessions[projectPath].filter(
        s => s.id !== sessionId
      );
      this.save();
    }
  }

  /**
   * Clear all sessions for a project
   */
  clearProjectSessions(projectPath: string): void {
    delete this.data.sessions[projectPath];
    this.save();
  }

  /**
   * Update output buffer for a session (called frequently, batched save)
   */
  updateOutputBuffer(projectPath: string, sessionId: string, output: string): void {
    const sessions = this.data.sessions[projectPath];
    if (!sessions) return;

    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.outputBuffer = (session.outputBuffer + output).slice(-MAX_OUTPUT_BUFFER);
      session.lastActiveAt = new Date().toISOString();
      // Note: We don't save immediately here to avoid excessive disk writes
      // Call saveAllPending() periodically or on app quit
    }
  }

  /**
   * Update Claude session ID for a terminal
   */
  updateClaudeSessionId(projectPath: string, terminalId: string, claudeSessionId: string): void {
    const sessions = this.data.sessions[projectPath];
    if (!sessions) return;

    const session = sessions.find(s => s.id === terminalId);
    if (session) {
      session.claudeSessionId = claudeSessionId;
      session.isClaudeMode = true;
      this.save();
      console.log('[TerminalSessionStore] Saved Claude session ID:', claudeSessionId, 'for terminal:', terminalId);
    }
  }

  /**
   * Save all pending changes (call on app quit or periodically)
   */
  saveAllPending(): void {
    this.save();
  }

  /**
   * Get all sessions (for debugging)
   */
  getAllSessions(): SessionData {
    return this.data;
  }
}

// Singleton instance
let instance: TerminalSessionStore | null = null;

export function getTerminalSessionStore(): TerminalSessionStore {
  if (!instance) {
    instance = new TerminalSessionStore();
  }
  return instance;
}
