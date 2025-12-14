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
 * Session date info for dropdown display
 */
export interface SessionDateInfo {
  date: string;  // YYYY-MM-DD format
  label: string;  // Human readable: "Today", "Yesterday", "Dec 10"
  sessionCount: number;  // Total sessions across all projects
  projectCount: number;  // Number of projects with sessions
}

/**
 * All persisted sessions grouped by date, then by project
 */
interface SessionData {
  version: number;
  // date (YYYY-MM-DD) -> projectPath -> sessions
  sessionsByDate: Record<string, Record<string, TerminalSession[]>>;
}

const STORE_VERSION = 2;  // Bumped for new structure
const MAX_OUTPUT_BUFFER = 100000;  // 100KB per terminal
const MAX_DAYS_TO_KEEP = 10;  // Keep sessions for 10 days

/**
 * Get date string in YYYY-MM-DD format
 */
function getDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get human readable date label
 */
function getDateLabel(dateStr: string): string {
  const today = getDateString();
  const yesterday = getDateString(new Date(Date.now() - 24 * 60 * 60 * 1000));

  if (dateStr === today) {
    return 'Today';
  } else if (dateStr === yesterday) {
    return 'Yesterday';
  } else {
    // Format as "Dec 10" or similar
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}

/**
 * Manages persistent terminal session storage organized by date
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

    // Clean up old sessions on startup
    this.cleanupOldSessions();
  }

  /**
   * Load sessions from disk
   */
  private load(): SessionData {
    try {
      if (existsSync(this.storePath)) {
        const content = readFileSync(this.storePath, 'utf-8');
        const data = JSON.parse(content);

        // Migrate from v1 to v2 structure
        if (data.version === 1 && data.sessions) {
          console.log('[TerminalSessionStore] Migrating from v1 to v2 structure');
          const today = getDateString();
          const migratedData: SessionData = {
            version: STORE_VERSION,
            sessionsByDate: {
              [today]: data.sessions
            }
          };
          return migratedData;
        }

        if (data.version === STORE_VERSION) {
          return data as SessionData;
        }

        console.log('[TerminalSessionStore] Version mismatch, resetting sessions');
        return { version: STORE_VERSION, sessionsByDate: {} };
      }
    } catch (error) {
      console.error('[TerminalSessionStore] Error loading sessions:', error);
    }

    return { version: STORE_VERSION, sessionsByDate: {} };
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
   * Remove sessions older than MAX_DAYS_TO_KEEP days
   */
  private cleanupOldSessions(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MAX_DAYS_TO_KEEP);
    const cutoffStr = getDateString(cutoffDate);

    let removedCount = 0;
    const dates = Object.keys(this.data.sessionsByDate);

    for (const dateStr of dates) {
      if (dateStr < cutoffStr) {
        delete this.data.sessionsByDate[dateStr];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[TerminalSessionStore] Cleaned up sessions from ${removedCount} old dates`);
      this.save();
    }
  }

  /**
   * Get sessions for today, organized by project
   */
  private getTodaysSessions(): Record<string, TerminalSession[]> {
    const today = getDateString();
    if (!this.data.sessionsByDate[today]) {
      this.data.sessionsByDate[today] = {};
    }
    return this.data.sessionsByDate[today];
  }

  /**
   * Save a terminal session (to today's bucket)
   */
  saveSession(session: TerminalSession): void {
    const { projectPath } = session;
    const todaySessions = this.getTodaysSessions();

    if (!todaySessions[projectPath]) {
      todaySessions[projectPath] = [];
    }

    // Update existing or add new
    const existingIndex = todaySessions[projectPath].findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      todaySessions[projectPath][existingIndex] = {
        ...session,
        // Limit output buffer size
        outputBuffer: session.outputBuffer.slice(-MAX_OUTPUT_BUFFER),
        lastActiveAt: new Date().toISOString()
      };
    } else {
      todaySessions[projectPath].push({
        ...session,
        outputBuffer: session.outputBuffer.slice(-MAX_OUTPUT_BUFFER),
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      });
    }

    this.save();
  }

  /**
   * Get most recent sessions for a project.
   * First checks today, then looks at the most recent date with sessions.
   * This ensures sessions survive app restarts even after midnight.
   */
  getSessions(projectPath: string): TerminalSession[] {
    // First check today
    const todaySessions = this.getTodaysSessions();
    if (todaySessions[projectPath]?.length > 0) {
      return todaySessions[projectPath];
    }

    // If no sessions today, find the most recent date with sessions for this project
    const dates = Object.keys(this.data.sessionsByDate)
      .filter(date => {
        const sessions = this.data.sessionsByDate[date][projectPath];
        return sessions && sessions.length > 0;
      })
      .sort((a, b) => b.localeCompare(a));  // Most recent first

    if (dates.length > 0) {
      const mostRecentDate = dates[0];
      console.log(`[TerminalSessionStore] No sessions today, using sessions from ${mostRecentDate}`);
      return this.data.sessionsByDate[mostRecentDate][projectPath] || [];
    }

    return [];
  }

  /**
   * Get sessions for a specific date and project
   */
  getSessionsForDate(date: string, projectPath: string): TerminalSession[] {
    const dateSessions = this.data.sessionsByDate[date];
    if (!dateSessions) return [];
    return dateSessions[projectPath] || [];
  }

  /**
   * Get all sessions for a specific date (all projects)
   */
  getAllSessionsForDate(date: string): Record<string, TerminalSession[]> {
    return this.data.sessionsByDate[date] || {};
  }

  /**
   * Get available session dates with metadata
   */
  getAvailableDates(projectPath?: string): SessionDateInfo[] {
    const dates = Object.keys(this.data.sessionsByDate)
      .filter(date => {
        // If projectPath specified, only include dates with sessions for that project
        if (projectPath) {
          const sessions = this.data.sessionsByDate[date][projectPath];
          return sessions && sessions.length > 0;
        }
        return true;
      })
      .sort((a, b) => b.localeCompare(a));  // Most recent first

    return dates.map(date => {
      const dateSessions = this.data.sessionsByDate[date];
      let sessionCount = 0;
      let projectCount = 0;

      for (const [projPath, sessions] of Object.entries(dateSessions)) {
        if (!projectPath || projPath === projectPath) {
          if (sessions.length > 0) {
            sessionCount += sessions.length;
            projectCount++;
          }
        }
      }

      return {
        date,
        label: getDateLabel(date),
        sessionCount,
        projectCount
      };
    }).filter(info => info.sessionCount > 0);  // Only dates with actual sessions
  }

  /**
   * Get a specific session
   */
  getSession(projectPath: string, sessionId: string): TerminalSession | undefined {
    const todaySessions = this.getTodaysSessions();
    const sessions = todaySessions[projectPath] || [];
    return sessions.find(s => s.id === sessionId);
  }

  /**
   * Remove a session (from today's sessions)
   */
  removeSession(projectPath: string, sessionId: string): void {
    const todaySessions = this.getTodaysSessions();
    if (todaySessions[projectPath]) {
      todaySessions[projectPath] = todaySessions[projectPath].filter(
        s => s.id !== sessionId
      );
      this.save();
    }
  }

  /**
   * Clear all sessions for a project (from today)
   */
  clearProjectSessions(projectPath: string): void {
    const todaySessions = this.getTodaysSessions();
    delete todaySessions[projectPath];
    this.save();
  }

  /**
   * Clear sessions for a specific date and project
   */
  clearSessionsForDate(date: string, projectPath?: string): void {
    if (projectPath) {
      if (this.data.sessionsByDate[date]) {
        delete this.data.sessionsByDate[date][projectPath];
      }
    } else {
      delete this.data.sessionsByDate[date];
    }
    this.save();
  }

  /**
   * Update output buffer for a session (called frequently, batched save)
   */
  updateOutputBuffer(projectPath: string, sessionId: string, output: string): void {
    const todaySessions = this.getTodaysSessions();
    const sessions = todaySessions[projectPath];
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
    const todaySessions = this.getTodaysSessions();
    const sessions = todaySessions[projectPath];
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
