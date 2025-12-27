/**
 * Terminal-related types
 */

export interface TerminalCreateOptions {
  id: string;
  cwd?: string;
  cols?: number;
  rows?: number;
  projectPath?: string;
  projectId?: string;  // Project UUID for backend validation
}

export interface TerminalResizeOptions {
  id: string;
  cols: number;
  rows: number;
}

/**
 * Persisted terminal session data for restoring sessions on app restart
 */
export interface TerminalSession {
  id: string;
  projectId?: string;  // Project UUID for filtering/isolation
  title: string;
  cwd: string;
  projectPath: string;
  isClaudeMode: boolean;
  claudeSessionId?: string;  // Claude Code session ID for --resume
  outputBuffer: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface TerminalRestoreResult {
  success: boolean;
  terminalId: string;
  outputBuffer?: string;  // For replay in UI
  error?: string;
}

/**
 * Session date information for dropdown display
 */
export interface SessionDateInfo {
  date: string;  // YYYY-MM-DD format
  label: string;  // Human readable: "Today", "Yesterday", "Dec 10"
  sessionCount: number;  // Total sessions across all projects
  projectCount: number;  // Number of projects with sessions
}

/**
 * Result of restoring sessions from a specific date
 */
export interface SessionDateRestoreResult {
  restored: number;
  failed: number;
  sessions: Array<{
    id: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Rate limit information when Claude Code hits subscription limits
 */
export interface RateLimitInfo {
  terminalId: string;
  resetTime: string;  // e.g., "Dec 17 at 6am (Europe/Oslo)"
  detectedAt: Date;
  /** ID of the profile that hit the limit */
  profileId?: string;
  /** ID of a suggested alternative profile to switch to */
  suggestedProfileId?: string;
  /** Name of the suggested alternative profile */
  suggestedProfileName?: string;
  /** Whether auto-switch on rate limit is enabled */
  autoSwitchEnabled?: boolean;
}

/**
 * Rate limit information for SDK/CLI calls (non-terminal)
 * Used for changelog, task execution, roadmap, ideation, etc.
 */
export interface SDKRateLimitInfo {
  /** Source of the rate limit (which feature hit it) */
  source: 'changelog' | 'task' | 'roadmap' | 'ideation' | 'title-generator' | 'other';
  /** Project ID if applicable */
  projectId?: string;
  /** Task ID if applicable */
  taskId?: string;
  /** The reset time string (e.g., "Dec 17 at 6am (Europe/Oslo)") */
  resetTime?: string;
  /** Type of limit: 'session' (5-hour) or 'weekly' (7-day) */
  limitType?: 'session' | 'weekly';
  /** Profile that hit the limit */
  profileId: string;
  /** Profile name for display */
  profileName?: string;
  /** Suggested alternative profile */
  suggestedProfile?: {
    id: string;
    name: string;
  };
  /** When detected */
  detectedAt: Date;
  /** Original error message */
  originalError?: string;

  // Auto-swap information (NEW)
  /** Whether this rate limit was automatically handled via account swap */
  wasAutoSwapped?: boolean;
  /** Profile that was swapped to (if auto-swapped) */
  swappedToProfile?: {
    id: string;
    name: string;
  };
  /** Why the swap occurred: 'proactive' (before limit) or 'reactive' (after limit hit) */
  swapReason?: 'proactive' | 'reactive';
}

/**
 * Request to retry a rate-limited operation with a different profile
 */
export interface RetryWithProfileRequest {
  /** Source of the original operation */
  source: SDKRateLimitInfo['source'];
  /** Project ID */
  projectId: string;
  /** Task ID if applicable */
  taskId?: string;
  /** Profile ID to retry with */
  profileId: string;
}
