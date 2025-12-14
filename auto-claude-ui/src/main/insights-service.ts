import { EventEmitter } from 'events';
import path from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { detectRateLimit, createSDKRateLimitInfo, getProfileEnv } from './rate-limit-detector';
import type {
  InsightsSession,
  InsightsSessionSummary,
  InsightsChatMessage,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsToolUsage
} from '../shared/types';

const INSIGHTS_DIR = '.auto-claude/insights';
const SESSIONS_DIR = 'sessions';
const CURRENT_SESSION_FILE = 'current_session.json';

/**
 * Service for AI-powered codebase insights chat
 */
export class InsightsService extends EventEmitter {
  private pythonPath: string = 'python3';
  private autoBuildSourcePath: string = '';
  private activeSessions: Map<string, ChildProcess> = new Map();
  private sessions: Map<string, InsightsSession> = new Map();

  constructor() {
    super();
  }

  /**
   * Configure paths for Python and auto-claude source
   */
  configure(pythonPath?: string, autoBuildSourcePath?: string): void {
    if (pythonPath) {
      this.pythonPath = pythonPath;
    }
    if (autoBuildSourcePath) {
      this.autoBuildSourcePath = autoBuildSourcePath;
    }
  }

  /**
   * Get the auto-claude source path (detects automatically if not configured)
   */
  private getAutoBuildSourcePath(): string | null {
    if (this.autoBuildSourcePath && existsSync(this.autoBuildSourcePath)) {
      return this.autoBuildSourcePath;
    }

    const possiblePaths = [
      path.resolve(__dirname, '..', '..', '..', 'auto-claude'),
      path.resolve(app.getAppPath(), '..', 'auto-claude'),
      path.resolve(process.cwd(), 'auto-claude')
    ];

    for (const p of possiblePaths) {
      if (existsSync(p) && existsSync(path.join(p, 'VERSION'))) {
        return p;
      }
    }
    return null;
  }

  /**
   * Load environment variables from auto-claude .env file
   */
  private loadAutoBuildEnv(): Record<string, string> {
    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) return {};

    const envPath = path.join(autoBuildSource, '.env');
    if (!existsSync(envPath)) return {};

    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars: Record<string, string> = {};

      // Handle both Unix (\n) and Windows (\r\n) line endings
      for (const line of envContent.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          let value = trimmed.substring(eqIndex + 1).trim();

          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          envVars[key] = value;
        }
      }

      return envVars;
    } catch {
      return {};
    }
  }

  /**
   * Get insights directory path for a project
   */
  private getInsightsDir(projectPath: string): string {
    return path.join(projectPath, INSIGHTS_DIR);
  }

  /**
   * Get sessions directory path for a project
   */
  private getSessionsDir(projectPath: string): string {
    return path.join(this.getInsightsDir(projectPath), SESSIONS_DIR);
  }

  /**
   * Get session file path for a specific session
   */
  private getSessionPath(projectPath: string, sessionId: string): string {
    return path.join(this.getSessionsDir(projectPath), `${sessionId}.json`);
  }

  /**
   * Get current session pointer file path
   */
  private getCurrentSessionPath(projectPath: string): string {
    return path.join(this.getInsightsDir(projectPath), CURRENT_SESSION_FILE);
  }

  /**
   * Generate a title from the first user message
   */
  private generateTitle(message: string): string {
    // Truncate to first 50 characters and clean up
    const title = message.trim().replace(/\n/g, ' ').slice(0, 50);
    return title.length < message.trim().length ? `${title}...` : title;
  }

  /**
   * Migrate old session format to new multi-session format
   */
  private migrateOldSession(projectPath: string): void {
    const oldSessionPath = path.join(this.getInsightsDir(projectPath), 'session.json');
    if (!existsSync(oldSessionPath)) return;

    try {
      const content = readFileSync(oldSessionPath, 'utf-8');
      const oldSession = JSON.parse(content) as InsightsSession;

      // Only migrate if it has messages
      if (oldSession.messages && oldSession.messages.length > 0) {
        // Ensure sessions directory exists
        const sessionsDir = this.getSessionsDir(projectPath);
        if (!existsSync(sessionsDir)) {
          mkdirSync(sessionsDir, { recursive: true });
        }

        // Generate title from first user message
        const firstUserMessage = oldSession.messages.find(m => m.role === 'user');
        const title = firstUserMessage
          ? this.generateTitle(firstUserMessage.content)
          : 'Imported Conversation';

        // Create new session with title
        const newSession: InsightsSession = {
          ...oldSession,
          title
        };

        // Save as new session file
        const sessionPath = this.getSessionPath(projectPath, oldSession.id);
        writeFileSync(sessionPath, JSON.stringify(newSession, null, 2));

        // Set as current session
        this.saveCurrentSessionId(projectPath, oldSession.id);
      }

      // Remove old session file
      unlinkSync(oldSessionPath);
    } catch {
      // Ignore migration errors
    }
  }

  /**
   * Get current session ID for a project
   */
  private getCurrentSessionId(projectPath: string): string | null {
    // Migrate old format if needed
    this.migrateOldSession(projectPath);

    const currentPath = this.getCurrentSessionPath(projectPath);
    if (!existsSync(currentPath)) return null;

    try {
      const content = readFileSync(currentPath, 'utf-8');
      const data = JSON.parse(content);
      return data.currentSessionId || null;
    } catch {
      return null;
    }
  }

  /**
   * Save current session ID pointer
   */
  private saveCurrentSessionId(projectPath: string, sessionId: string): void {
    const insightsDir = this.getInsightsDir(projectPath);
    if (!existsSync(insightsDir)) {
      mkdirSync(insightsDir, { recursive: true });
    }

    const currentPath = this.getCurrentSessionPath(projectPath);
    writeFileSync(currentPath, JSON.stringify({ currentSessionId: sessionId }, null, 2));
  }

  /**
   * Load a specific session from disk
   */
  private loadSessionById(projectPath: string, sessionId: string): InsightsSession | null {
    const sessionPath = this.getSessionPath(projectPath, sessionId);
    if (!existsSync(sessionPath)) return null;

    try {
      const content = readFileSync(sessionPath, 'utf-8');
      const session = JSON.parse(content) as InsightsSession;
      // Convert date strings back to Date objects
      session.createdAt = new Date(session.createdAt);
      session.updatedAt = new Date(session.updatedAt);
      session.messages = session.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp),
        // Convert toolsUsed timestamps if present
        toolsUsed: m.toolsUsed?.map(t => ({
          ...t,
          timestamp: new Date(t.timestamp)
        }))
      }));
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Load current session from disk
   */
  loadSession(projectId: string, projectPath: string): InsightsSession | null {
    // Check in-memory cache first
    if (this.sessions.has(projectId)) {
      return this.sessions.get(projectId)!;
    }

    const currentSessionId = this.getCurrentSessionId(projectPath);
    if (!currentSessionId) return null;

    const session = this.loadSessionById(projectPath, currentSessionId);
    if (session) {
      this.sessions.set(projectId, session);
    }
    return session;
  }

  /**
   * List all sessions for a project
   */
  listSessions(projectPath: string): InsightsSessionSummary[] {
    // Migrate old format if needed
    this.migrateOldSession(projectPath);

    const sessionsDir = this.getSessionsDir(projectPath);
    if (!existsSync(sessionsDir)) return [];

    try {
      const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
      const sessions: InsightsSessionSummary[] = [];

      for (const file of files) {
        try {
          const content = readFileSync(path.join(sessionsDir, file), 'utf-8');
          const session = JSON.parse(content) as InsightsSession;

          // Generate title if not present
          let title = session.title;
          if (!title && session.messages.length > 0) {
            const firstUserMessage = session.messages.find(m => m.role === 'user');
            title = firstUserMessage
              ? this.generateTitle(firstUserMessage.content)
              : 'Untitled Conversation';
          }

          sessions.push({
            id: session.id,
            projectId: session.projectId,
            title: title || 'New Conversation',
            messageCount: session.messages.length,
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt)
          });
        } catch {
          // Skip invalid session files
        }
      }

      // Sort by updatedAt descending (most recent first)
      return sessions.sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Create a new session
   */
  createNewSession(projectId: string, projectPath: string): InsightsSession {
    const sessionId = `session-${Date.now()}`;
    const session: InsightsSession = {
      id: sessionId,
      projectId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Ensure sessions directory exists
    const sessionsDir = this.getSessionsDir(projectPath);
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    // Save new session
    this.saveSession(projectPath, session);
    this.saveCurrentSessionId(projectPath, sessionId);
    this.sessions.set(projectId, session);

    return session;
  }

  /**
   * Switch to a different session
   */
  switchSession(projectId: string, projectPath: string, sessionId: string): InsightsSession | null {
    const session = this.loadSessionById(projectPath, sessionId);
    if (session) {
      this.saveCurrentSessionId(projectPath, sessionId);
      this.sessions.set(projectId, session);
    }
    return session;
  }

  /**
   * Delete a session
   */
  deleteSession(projectId: string, projectPath: string, sessionId: string): boolean {
    const sessionPath = this.getSessionPath(projectPath, sessionId);
    if (!existsSync(sessionPath)) return false;

    try {
      unlinkSync(sessionPath);

      // If this was the current session, clear the cache
      const currentSession = this.sessions.get(projectId);
      if (currentSession?.id === sessionId) {
        this.sessions.delete(projectId);

        // Find another session to switch to, or create new
        const remaining = this.listSessions(projectPath);
        if (remaining.length > 0) {
          this.switchSession(projectId, projectPath, remaining[0].id);
        } else {
          // Clear current session pointer
          const currentPath = this.getCurrentSessionPath(projectPath);
          if (existsSync(currentPath)) {
            unlinkSync(currentPath);
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Rename a session
   */
  renameSession(projectPath: string, sessionId: string, newTitle: string): boolean {
    const session = this.loadSessionById(projectPath, sessionId);
    if (!session) return false;

    session.title = newTitle;
    session.updatedAt = new Date();
    this.saveSession(projectPath, session);
    return true;
  }

  /**
   * Save session to disk
   */
  private saveSession(projectPath: string, session: InsightsSession): void {
    const sessionsDir = this.getSessionsDir(projectPath);
    if (!existsSync(sessionsDir)) {
      mkdirSync(sessionsDir, { recursive: true });
    }

    const sessionPath = this.getSessionPath(projectPath, session.id);
    writeFileSync(sessionPath, JSON.stringify(session, null, 2));
    this.sessions.set(session.projectId, session);
  }

  /**
   * Clear current session (delete messages but keep the session)
   */
  clearSession(projectId: string, projectPath: string): void {
    const currentSession = this.sessions.get(projectId);
    if (!currentSession) return;

    // Create a fresh session with new ID
    const newSession = this.createNewSession(projectId, projectPath);
    this.sessions.set(projectId, newSession);
  }

  /**
   * Send a message and get AI response
   */
  async sendMessage(projectId: string, projectPath: string, message: string): Promise<void> {
    // Cancel any existing session for this project
    if (this.activeSessions.has(projectId)) {
      const existingProcess = this.activeSessions.get(projectId);
      existingProcess?.kill();
      this.activeSessions.delete(projectId);
    }

    const autoBuildSource = this.getAutoBuildSourcePath();
    if (!autoBuildSource) {
      this.emit('error', projectId, 'Auto Claude source not found');
      return;
    }

    // Load or create session
    let session = this.loadSession(projectId, projectPath);
    if (!session) {
      session = this.createNewSession(projectId, projectPath);
    }

    // Auto-generate title from first user message if still default
    if (session.messages.length === 0 && session.title === 'New Conversation') {
      session.title = this.generateTitle(message);
    }

    // Add user message
    const userMessage: InsightsChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    session.messages.push(userMessage);
    session.updatedAt = new Date();
    this.saveSession(projectPath, session);

    // Emit thinking status
    this.emit('status', projectId, {
      phase: 'thinking',
      message: 'Processing your message...'
    } as InsightsChatStatus);

    // Load environment
    const envVars = this.loadAutoBuildEnv();

    // Build conversation history for context
    const conversationHistory = session.messages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Create the insights runner script path
    const runnerPath = path.join(autoBuildSource, 'insights_runner.py');

    // Check if runner exists
    if (!existsSync(runnerPath)) {
      this.emit('error', projectId, 'insights_runner.py not found in auto-claude directory');
      return;
    }

    // Get active Claude profile environment (CLAUDE_CONFIG_DIR if not default)
    const profileEnv = getProfileEnv();

    // Spawn Python process
    const proc = spawn(this.pythonPath, [
      runnerPath,
      '--project-dir', projectPath,
      '--message', message,
      '--history', JSON.stringify(conversationHistory)
    ], {
      cwd: autoBuildSource,
      env: {
        ...process.env,
        ...envVars,
        ...profileEnv, // Include active Claude profile config
        PYTHONUNBUFFERED: '1'
      }
    });

    this.activeSessions.set(projectId, proc);

    let fullResponse = '';
    let suggestedTask: InsightsChatMessage['suggestedTask'] | undefined;
    const toolsUsed: InsightsToolUsage[] = [];
    // Collect output for rate limit detection
    let allInsightsOutput = '';

    proc.stdout?.on('data', (data: Buffer) => {
      const text = data.toString();
      // Collect output for rate limit detection (keep last 10KB)
      allInsightsOutput = (allInsightsOutput + text).slice(-10000);

      // Check for special markers
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('__TASK_SUGGESTION__:')) {
          try {
            const taskJson = line.substring('__TASK_SUGGESTION__:'.length);
            suggestedTask = JSON.parse(taskJson);
            this.emit('stream-chunk', projectId, {
              type: 'task_suggestion',
              suggestedTask
            } as InsightsStreamChunk);
          } catch {
            // Not valid JSON, treat as normal text
            fullResponse += line + '\n';
            this.emit('stream-chunk', projectId, {
              type: 'text',
              content: line + '\n'
            } as InsightsStreamChunk);
          }
        } else if (line.startsWith('__TOOL_START__:')) {
          // Tool execution started
          try {
            const toolJson = line.substring('__TOOL_START__:'.length);
            const toolData = JSON.parse(toolJson);
            // Accumulate tool usage for persistence
            toolsUsed.push({
              name: toolData.name,
              input: toolData.input,
              timestamp: new Date()
            });
            this.emit('stream-chunk', projectId, {
              type: 'tool_start',
              tool: {
                name: toolData.name,
                input: toolData.input
              }
            } as InsightsStreamChunk);
          } catch {
            // Ignore parse errors for tool markers
          }
        } else if (line.startsWith('__TOOL_END__:')) {
          // Tool execution finished
          try {
            const toolJson = line.substring('__TOOL_END__:'.length);
            const toolData = JSON.parse(toolJson);
            this.emit('stream-chunk', projectId, {
              type: 'tool_end',
              tool: {
                name: toolData.name
              }
            } as InsightsStreamChunk);
          } catch {
            // Ignore parse errors for tool markers
          }
        } else if (line.trim()) {
          fullResponse += line + '\n';
          this.emit('stream-chunk', projectId, {
            type: 'text',
            content: line + '\n'
          } as InsightsStreamChunk);
        }
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      const text = data.toString();
      // Collect stderr for rate limit detection too
      allInsightsOutput = (allInsightsOutput + text).slice(-10000);
      console.error('[Insights]', text);
    });

    proc.on('close', (code) => {
      this.activeSessions.delete(projectId);

      // Check for rate limit if process failed
      if (code !== 0) {
        const rateLimitDetection = detectRateLimit(allInsightsOutput);
        if (rateLimitDetection.isRateLimited) {
          console.log('[Insights] Rate limit detected:', {
            projectId,
            resetTime: rateLimitDetection.resetTime,
            limitType: rateLimitDetection.limitType,
            suggestedProfile: rateLimitDetection.suggestedProfile?.name
          });

          const rateLimitInfo = createSDKRateLimitInfo('other', rateLimitDetection, {
            projectId
          });
          this.emit('sdk-rate-limit', rateLimitInfo);
        }
      }

      if (code === 0) {
        // Add assistant message to session
        const assistantMessage: InsightsChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: fullResponse.trim(),
          timestamp: new Date(),
          suggestedTask,
          toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
        };

        session!.messages.push(assistantMessage);
        session!.updatedAt = new Date();
        this.saveSession(projectPath, session!);

        this.emit('stream-chunk', projectId, {
          type: 'done'
        } as InsightsStreamChunk);

        this.emit('status', projectId, {
          phase: 'complete'
        } as InsightsChatStatus);
      } else {
        this.emit('stream-chunk', projectId, {
          type: 'error',
          error: `Process exited with code ${code}`
        } as InsightsStreamChunk);

        this.emit('error', projectId, `Process exited with code ${code}`);
      }
    });

    proc.on('error', (err) => {
      this.activeSessions.delete(projectId);
      this.emit('error', projectId, err.message);
    });
  }

}

// Singleton instance
export const insightsService = new InsightsService();
