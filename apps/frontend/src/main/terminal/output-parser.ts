/**
 * Output Parser Module
 * Handles parsing and pattern detection in terminal output
 */

/**
 * Regex patterns to capture Claude session ID from output
 */
const CLAUDE_SESSION_PATTERNS = [
  /Session(?:\s+ID)?:\s*([a-zA-Z0-9_-]+)/i,
  /session[_-]?id["\s:=]+([a-zA-Z0-9_-]+)/i,
  /Resuming session:\s*([a-zA-Z0-9_-]+)/i,
  /conversation[_-]?id["\s:=]+([a-zA-Z0-9_-]+)/i,
];

/**
 * Regex pattern to detect Claude Code rate limit messages
 * Matches: "Limit reached · resets Dec 17 at 6am (Europe/Oslo)"
 */
const RATE_LIMIT_PATTERN = /Limit reached\s*[·•]\s*resets\s+(.+?)$/m;

/**
 * Regex pattern to capture OAuth token from `claude setup-token` output
 */
const OAUTH_TOKEN_PATTERN = /(sk-ant-oat01-[A-Za-z0-9_-]+)/;

/**
 * Pattern to detect email in Claude output
 */
const EMAIL_PATTERN = /(?:Authenticated as|Logged in as|email[:\s]+)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;

/**
 * Extract Claude session ID from output
 */
export function extractClaudeSessionId(data: string): string | null {
  for (const pattern of CLAUDE_SESSION_PATTERNS) {
    const match = data.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Extract rate limit reset time from output
 */
export function extractRateLimitReset(data: string): string | null {
  const match = data.match(RATE_LIMIT_PATTERN);
  return match ? match[1].trim() : null;
}

/**
 * Extract OAuth token from output
 */
export function extractOAuthToken(data: string): string | null {
  const match = data.match(OAUTH_TOKEN_PATTERN);
  return match ? match[1] : null;
}

/**
 * Extract email from output
 */
export function extractEmail(data: string): string | null {
  const match = data.match(EMAIL_PATTERN);
  return match ? match[1] : null;
}

/**
 * Check if output contains a rate limit message
 */
export function hasRateLimitMessage(data: string): boolean {
  return RATE_LIMIT_PATTERN.test(data);
}

/**
 * Check if output contains an OAuth token
 */
export function hasOAuthToken(data: string): boolean {
  return OAUTH_TOKEN_PATTERN.test(data);
}

/**
 * Patterns indicating Claude Code is busy/processing
 * These appear when Claude is actively thinking or working
 *
 * IMPORTANT: These must be universal patterns that work for ALL users,
 * not just custom terminal configurations with progress bars.
 */
const CLAUDE_BUSY_PATTERNS = [
  // Universal Claude Code indicators
  /^●/m,                            // Claude's response bullet point (appears when Claude is responding)
  /\u25cf/,                         // Unicode bullet point (●)

  // Tool execution indicators (Claude is running tools)
  /^(Read|Write|Edit|Bash|Grep|Glob|Task|WebFetch|WebSearch|TodoWrite)\(/m,
  /^\s*\d+\s*[│|]\s*/m,            // Line numbers in file output (Claude reading/showing files)

  // Streaming/thinking indicators
  /Loading\.\.\./i,
  /Thinking\.\.\./i,
  /Analyzing\.\.\./i,
  /Processing\.\.\./i,
  /Working\.\.\./i,
  /Searching\.\.\./i,
  /Creating\.\.\./i,
  /Updating\.\.\./i,
  /Running\.\.\./i,

  // Custom progress bar patterns (for users who have them)
  /\[Opus\s*\d*\.?\d*\].*\d+%/i,   // Opus model progress
  /\[Sonnet\s*\d*\.?\d*\].*\d+%/i, // Sonnet model progress
  /\[Haiku\s*\d*\.?\d*\].*\d+%/i,  // Haiku model progress
  /\[Claude\s*\d*\.?\d*\].*\d+%/i, // Generic Claude progress
  /░+/,                             // Progress bar characters
  /▓+/,                             // Progress bar characters
  /█+/,                             // Progress bar characters (filled)
];

/**
 * Patterns indicating Claude Code is idle/ready for input
 * The prompt character at the start of a line indicates Claude is waiting
 */
const CLAUDE_IDLE_PATTERNS = [
  /^>\s*$/m,                        // Just "> " prompt on its own line
  /\n>\s*$/,                        // "> " at end after newline
  /^\s*>\s+$/m,                     // "> " with possible whitespace
];

/**
 * Check if output indicates Claude is busy (processing)
 */
export function isClaudeBusyOutput(data: string): boolean {
  return CLAUDE_BUSY_PATTERNS.some(pattern => pattern.test(data));
}

/**
 * Check if output indicates Claude is idle (ready for input)
 */
export function isClaudeIdleOutput(data: string): boolean {
  return CLAUDE_IDLE_PATTERNS.some(pattern => pattern.test(data));
}

/**
 * Determine Claude busy state from output
 * Returns: 'busy' | 'idle' | null (no change detected)
 */
export function detectClaudeBusyState(data: string): 'busy' | 'idle' | null {
  // Check for busy indicators FIRST - they're more definitive
  // Progress bars and "Loading..." mean Claude is definitely working,
  // even if there's a ">" prompt visible elsewhere in the output
  if (isClaudeBusyOutput(data)) {
    return 'busy';
  }
  // Only check for idle if no busy indicators found
  // The ">" prompt alone at end of output means Claude is waiting for input
  if (isClaudeIdleOutput(data)) {
    return 'idle';
  }
  return null;
}
