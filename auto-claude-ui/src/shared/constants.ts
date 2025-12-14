/**
 * Shared constants for Auto Claude UI
 */

// Task status columns in Kanban board order
export const TASK_STATUS_COLUMNS = [
  'backlog',
  'in_progress',
  'ai_review',
  'human_review',
  'done'
] as const;

// Human-readable status labels
export const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: 'Planning',
  in_progress: 'In Progress',
  ai_review: 'AI Review',
  human_review: 'Human Review',
  done: 'Done'
};

// Status colors for UI
export const TASK_STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/10 text-info',
  ai_review: 'bg-warning/10 text-warning',
  human_review: 'bg-purple-500/10 text-purple-400',
  done: 'bg-success/10 text-success'
};

// Subtask status colors
export const SUBTASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-muted',
  in_progress: 'bg-info',
  completed: 'bg-success',
  failed: 'bg-destructive'
};

// Execution phase labels
export const EXECUTION_PHASE_LABELS: Record<string, string> = {
  idle: 'Idle',
  planning: 'Planning',
  coding: 'Coding',
  qa_review: 'AI Review',
  qa_fixing: 'Fixing Issues',
  complete: 'Complete',
  failed: 'Failed'
};

// Execution phase colors (for progress bars and indicators)
export const EXECUTION_PHASE_COLORS: Record<string, string> = {
  idle: 'bg-muted text-muted-foreground',
  planning: 'bg-amber-500 text-amber-50',
  coding: 'bg-info text-info-foreground',
  qa_review: 'bg-purple-500 text-purple-50',
  qa_fixing: 'bg-warning text-warning-foreground',
  complete: 'bg-success text-success-foreground',
  failed: 'bg-destructive text-destructive-foreground'
};

// Execution phase badge colors (outline style)
export const EXECUTION_PHASE_BADGE_COLORS: Record<string, string> = {
  idle: 'bg-muted/50 text-muted-foreground border-muted',
  planning: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  coding: 'bg-info/10 text-info border-info/30',
  qa_review: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  qa_fixing: 'bg-warning/10 text-warning border-warning/30',
  complete: 'bg-success/10 text-success border-success/30',
  failed: 'bg-destructive/10 text-destructive border-destructive/30'
};

// Execution phase progress weights (for overall progress calculation)
export const EXECUTION_PHASE_WEIGHTS: Record<string, { start: number; end: number }> = {
  idle: { start: 0, end: 0 },
  planning: { start: 0, end: 20 },
  coding: { start: 20, end: 80 },
  qa_review: { start: 80, end: 95 },
  qa_fixing: { start: 80, end: 95 },  // Same range as qa_review, cycles back
  complete: { start: 100, end: 100 },
  failed: { start: 0, end: 0 }
};

// Default app settings
export const DEFAULT_APP_SETTINGS = {
  theme: 'system' as const,
  defaultModel: 'opus',
  agentFramework: 'auto-claude',
  pythonPath: undefined as string | undefined,
  autoBuildPath: undefined as string | undefined,
  autoUpdateAutoBuild: true,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  // Global API keys (used as defaults for all projects)
  globalClaudeOAuthToken: undefined as string | undefined,
  globalOpenAIApiKey: undefined as string | undefined
};

// Default project settings
export const DEFAULT_PROJECT_SETTINGS = {
  parallelEnabled: false,
  maxWorkers: 2,
  model: 'opus',
  memoryBackend: 'file' as const,
  linearSync: false,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  // Graphiti MCP server for agent-accessible knowledge graph (enabled by default)
  graphitiMcpEnabled: true,
  graphitiMcpUrl: 'http://localhost:8000/mcp/'
};

// IPC Channel names
export const IPC_CHANNELS = {
  // Project operations
  PROJECT_ADD: 'project:add',
  PROJECT_REMOVE: 'project:remove',
  PROJECT_LIST: 'project:list',
  PROJECT_UPDATE_SETTINGS: 'project:updateSettings',
  PROJECT_INITIALIZE: 'project:initialize',
  PROJECT_UPDATE_AUTOBUILD: 'project:updateAutoBuild',
  PROJECT_CHECK_VERSION: 'project:checkVersion',

  // Task operations
  TASK_LIST: 'task:list',
  TASK_CREATE: 'task:create',
  TASK_DELETE: 'task:delete',
  TASK_UPDATE: 'task:update',
  TASK_START: 'task:start',
  TASK_STOP: 'task:stop',
  TASK_REVIEW: 'task:review',
  TASK_UPDATE_STATUS: 'task:updateStatus',
  TASK_RECOVER_STUCK: 'task:recoverStuck',
  TASK_CHECK_RUNNING: 'task:checkRunning',

  // Workspace management (for human review)
  // Per-spec architecture: Each spec has its own worktree at .worktrees/{spec-name}/
  TASK_WORKTREE_STATUS: 'task:worktreeStatus',
  TASK_WORKTREE_DIFF: 'task:worktreeDiff',
  TASK_WORKTREE_MERGE: 'task:worktreeMerge',
  TASK_WORKTREE_DISCARD: 'task:worktreeDiscard',
  TASK_LIST_WORKTREES: 'task:listWorktrees',
  TASK_ARCHIVE: 'task:archive',
  TASK_UNARCHIVE: 'task:unarchive',

  // Task events (main -> renderer)
  TASK_PROGRESS: 'task:progress',
  TASK_ERROR: 'task:error',
  TASK_LOG: 'task:log',
  TASK_STATUS_CHANGE: 'task:statusChange',
  TASK_EXECUTION_PROGRESS: 'task:executionProgress',

  // Task phase logs (persistent, collapsible logs by phase)
  TASK_LOGS_GET: 'task:logsGet',           // Load logs from spec dir
  TASK_LOGS_WATCH: 'task:logsWatch',       // Start watching for log changes
  TASK_LOGS_UNWATCH: 'task:logsUnwatch',   // Stop watching for log changes
  TASK_LOGS_CHANGED: 'task:logsChanged',   // Event: logs changed (main -> renderer)
  TASK_LOGS_STREAM: 'task:logsStream',     // Event: streaming log chunk (main -> renderer)

  // Terminal operations
  TERMINAL_CREATE: 'terminal:create',
  TERMINAL_DESTROY: 'terminal:destroy',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_RESIZE: 'terminal:resize',
  TERMINAL_INVOKE_CLAUDE: 'terminal:invokeClaude',

  // Terminal session management
  TERMINAL_GET_SESSIONS: 'terminal:getSessions',
  TERMINAL_RESTORE_SESSION: 'terminal:restoreSession',
  TERMINAL_CLEAR_SESSIONS: 'terminal:clearSessions',
  TERMINAL_RESUME_CLAUDE: 'terminal:resumeClaude',
  TERMINAL_GET_SESSION_DATES: 'terminal:getSessionDates',
  TERMINAL_GET_SESSIONS_FOR_DATE: 'terminal:getSessionsForDate',
  TERMINAL_RESTORE_FROM_DATE: 'terminal:restoreFromDate',

  // Terminal events (main -> renderer)
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_EXIT: 'terminal:exit',
  TERMINAL_TITLE_CHANGE: 'terminal:titleChange',
  TERMINAL_CLAUDE_SESSION: 'terminal:claudeSession',  // Claude session ID captured
  TERMINAL_RATE_LIMIT: 'terminal:rateLimit',  // Claude Code rate limit detected
  TERMINAL_OAUTH_TOKEN: 'terminal:oauthToken',  // OAuth token captured from setup-token output

  // Claude profile management (multi-account support)
  CLAUDE_PROFILES_GET: 'claude:profilesGet',
  CLAUDE_PROFILE_SAVE: 'claude:profileSave',
  CLAUDE_PROFILE_DELETE: 'claude:profileDelete',
  CLAUDE_PROFILE_RENAME: 'claude:profileRename',
  CLAUDE_PROFILE_SET_ACTIVE: 'claude:profileSetActive',
  CLAUDE_PROFILE_SWITCH: 'claude:profileSwitch',
  CLAUDE_PROFILE_INITIALIZE: 'claude:profileInitialize',
  CLAUDE_PROFILE_SET_TOKEN: 'claude:profileSetToken',  // Set OAuth token for a profile
  CLAUDE_PROFILE_AUTO_SWITCH_SETTINGS: 'claude:autoSwitchSettings',
  CLAUDE_PROFILE_UPDATE_AUTO_SWITCH: 'claude:updateAutoSwitch',
  CLAUDE_PROFILE_FETCH_USAGE: 'claude:fetchUsage',
  CLAUDE_PROFILE_GET_BEST_PROFILE: 'claude:getBestProfile',

  // SDK/CLI rate limit event (for non-terminal Claude invocations)
  CLAUDE_SDK_RATE_LIMIT: 'claude:sdkRateLimit',
  // Retry a rate-limited operation with a different profile
  CLAUDE_RETRY_WITH_PROFILE: 'claude:retryWithProfile',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',

  // Dialogs
  DIALOG_SELECT_DIRECTORY: 'dialog:selectDirectory',
  DIALOG_CREATE_PROJECT_FOLDER: 'dialog:createProjectFolder',
  DIALOG_GET_DEFAULT_PROJECT_LOCATION: 'dialog:getDefaultProjectLocation',

  // App info
  APP_VERSION: 'app:version',

  // Roadmap operations
  ROADMAP_GET: 'roadmap:get',
  ROADMAP_GENERATE: 'roadmap:generate',
  ROADMAP_REFRESH: 'roadmap:refresh',
  ROADMAP_UPDATE_FEATURE: 'roadmap:updateFeature',
  ROADMAP_CONVERT_TO_SPEC: 'roadmap:convertToSpec',

  // Roadmap events (main -> renderer)
  ROADMAP_PROGRESS: 'roadmap:progress',
  ROADMAP_COMPLETE: 'roadmap:complete',
  ROADMAP_ERROR: 'roadmap:error',

  // Context operations
  CONTEXT_GET: 'context:get',
  CONTEXT_REFRESH_INDEX: 'context:refreshIndex',
  CONTEXT_MEMORY_STATUS: 'context:memoryStatus',
  CONTEXT_SEARCH_MEMORIES: 'context:searchMemories',
  CONTEXT_GET_MEMORIES: 'context:getMemories',

  // Environment configuration
  ENV_GET: 'env:get',
  ENV_UPDATE: 'env:update',
  ENV_CHECK_CLAUDE_AUTH: 'env:checkClaudeAuth',
  ENV_INVOKE_CLAUDE_SETUP: 'env:invokeClaudeSetup',

  // Ideation operations
  IDEATION_GET: 'ideation:get',
  IDEATION_GENERATE: 'ideation:generate',
  IDEATION_REFRESH: 'ideation:refresh',
  IDEATION_STOP: 'ideation:stop',
  IDEATION_UPDATE_IDEA: 'ideation:updateIdea',
  IDEATION_CONVERT_TO_TASK: 'ideation:convertToTask',
  IDEATION_DISMISS: 'ideation:dismiss',
  IDEATION_DISMISS_ALL: 'ideation:dismissAll',

  // Ideation events (main -> renderer)
  IDEATION_PROGRESS: 'ideation:progress',
  IDEATION_LOG: 'ideation:log',
  IDEATION_COMPLETE: 'ideation:complete',
  IDEATION_ERROR: 'ideation:error',
  IDEATION_STOPPED: 'ideation:stopped',
  IDEATION_TYPE_COMPLETE: 'ideation:typeComplete',
  IDEATION_TYPE_FAILED: 'ideation:typeFailed',

  // Linear integration
  LINEAR_GET_TEAMS: 'linear:getTeams',
  LINEAR_GET_PROJECTS: 'linear:getProjects',
  LINEAR_GET_ISSUES: 'linear:getIssues',
  LINEAR_IMPORT_ISSUES: 'linear:importIssues',
  LINEAR_CHECK_CONNECTION: 'linear:checkConnection',

  // GitHub integration
  GITHUB_GET_REPOSITORIES: 'github:getRepositories',
  GITHUB_GET_ISSUES: 'github:getIssues',
  GITHUB_GET_ISSUE: 'github:getIssue',
  GITHUB_CHECK_CONNECTION: 'github:checkConnection',
  GITHUB_INVESTIGATE_ISSUE: 'github:investigateIssue',
  GITHUB_IMPORT_ISSUES: 'github:importIssues',
  GITHUB_CREATE_RELEASE: 'github:createRelease',

  // GitHub events (main -> renderer)
  GITHUB_INVESTIGATION_PROGRESS: 'github:investigationProgress',
  GITHUB_INVESTIGATION_COMPLETE: 'github:investigationComplete',
  GITHUB_INVESTIGATION_ERROR: 'github:investigationError',

  // Auto Claude source updates
  AUTOBUILD_SOURCE_CHECK: 'autobuild:source:check',
  AUTOBUILD_SOURCE_DOWNLOAD: 'autobuild:source:download',
  AUTOBUILD_SOURCE_VERSION: 'autobuild:source:version',
  AUTOBUILD_SOURCE_PROGRESS: 'autobuild:source:progress',

  // Auto Claude source environment configuration
  AUTOBUILD_SOURCE_ENV_GET: 'autobuild:source:env:get',
  AUTOBUILD_SOURCE_ENV_UPDATE: 'autobuild:source:env:update',
  AUTOBUILD_SOURCE_ENV_CHECK_TOKEN: 'autobuild:source:env:checkToken',

  // Changelog operations
  CHANGELOG_GET_DONE_TASKS: 'changelog:getDoneTasks',
  CHANGELOG_LOAD_TASK_SPECS: 'changelog:loadTaskSpecs',
  CHANGELOG_GENERATE: 'changelog:generate',
  CHANGELOG_SAVE: 'changelog:save',
  CHANGELOG_READ_EXISTING: 'changelog:readExisting',
  CHANGELOG_SUGGEST_VERSION: 'changelog:suggestVersion',

  // Changelog git operations (for git-based changelog generation)
  CHANGELOG_GET_BRANCHES: 'changelog:getBranches',
  CHANGELOG_GET_TAGS: 'changelog:getTags',
  CHANGELOG_GET_COMMITS_PREVIEW: 'changelog:getCommitsPreview',

  // Changelog events (main -> renderer)
  CHANGELOG_GENERATION_PROGRESS: 'changelog:generationProgress',
  CHANGELOG_GENERATION_COMPLETE: 'changelog:generationComplete',
  CHANGELOG_GENERATION_ERROR: 'changelog:generationError',

  // Insights operations
  INSIGHTS_GET_SESSION: 'insights:getSession',
  INSIGHTS_SEND_MESSAGE: 'insights:sendMessage',
  INSIGHTS_CLEAR_SESSION: 'insights:clearSession',
  INSIGHTS_CREATE_TASK: 'insights:createTask',
  INSIGHTS_LIST_SESSIONS: 'insights:listSessions',
  INSIGHTS_NEW_SESSION: 'insights:newSession',
  INSIGHTS_SWITCH_SESSION: 'insights:switchSession',
  INSIGHTS_DELETE_SESSION: 'insights:deleteSession',
  INSIGHTS_RENAME_SESSION: 'insights:renameSession',

  // Insights events (main -> renderer)
  INSIGHTS_STREAM_CHUNK: 'insights:streamChunk',
  INSIGHTS_STATUS: 'insights:status',
  INSIGHTS_ERROR: 'insights:error',

  // File explorer operations
  FILE_EXPLORER_LIST: 'fileExplorer:list'
} as const;

// File paths relative to project
// IMPORTANT: All paths use .auto-claude/ (the installed instance), NOT auto-claude/ (source code)
export const AUTO_BUILD_PATHS = {
  SPECS_DIR: '.auto-claude/specs',
  ROADMAP_DIR: '.auto-claude/roadmap',
  IDEATION_DIR: '.auto-claude/ideation',
  IMPLEMENTATION_PLAN: 'implementation_plan.json',
  SPEC_FILE: 'spec.md',
  QA_REPORT: 'qa_report.md',
  BUILD_PROGRESS: 'build-progress.txt',
  CONTEXT: 'context.json',
  REQUIREMENTS: 'requirements.json',
  ROADMAP_FILE: 'roadmap.json',
  ROADMAP_DISCOVERY: 'roadmap_discovery.json',
  IDEATION_FILE: 'ideation.json',
  IDEATION_CONTEXT: 'ideation_context.json',
  PROJECT_INDEX: '.auto-claude/project_index.json',
  GRAPHITI_STATE: '.graphiti_state.json'
} as const;

/**
 * Get the specs directory path.
 * All specs go to .auto-claude/specs/ (the project's data directory).
 */
export function getSpecsDir(autoBuildPath: string | undefined): string {
  const basePath = autoBuildPath || '.auto-claude';
  return `${basePath}/specs`;
}

// Roadmap feature priority colors
export const ROADMAP_PRIORITY_COLORS: Record<string, string> = {
  must: 'bg-destructive/10 text-destructive border-destructive/30',
  should: 'bg-warning/10 text-warning border-warning/30',
  could: 'bg-info/10 text-info border-info/30',
  wont: 'bg-muted text-muted-foreground border-muted'
};

// Roadmap feature priority labels
export const ROADMAP_PRIORITY_LABELS: Record<string, string> = {
  must: 'Must Have',
  should: 'Should Have',
  could: 'Could Have',
  wont: "Won't Have"
};

// Roadmap complexity colors
export const ROADMAP_COMPLEXITY_COLORS: Record<string, string> = {
  low: 'bg-success/10 text-success',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-destructive/10 text-destructive'
};

// Roadmap impact colors
export const ROADMAP_IMPACT_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-info/10 text-info',
  high: 'bg-success/10 text-success'
};

// Models available for selection
export const AVAILABLE_MODELS = [
  { value: 'opus', label: 'Claude Opus 4.5' },
  { value: 'sonnet', label: 'Claude Sonnet 4' },
  { value: 'haiku', label: 'Claude Haiku 3.5' }
] as const;

// Memory backends
export const MEMORY_BACKENDS = [
  { value: 'file', label: 'File-based (default)' },
  { value: 'graphiti', label: 'Graphiti (FalkorDB)' }
] as const;

// ============================================
// Ideation Constants
// ============================================

// Ideation type labels and descriptions
// Note: high_value_features removed - strategic features belong to Roadmap
// low_hanging_fruit renamed to code_improvements to cover all code-revealed opportunities
export const IDEATION_TYPE_LABELS: Record<string, string> = {
  code_improvements: 'Code Improvements',
  ui_ux_improvements: 'UI/UX Improvements',
  documentation_gaps: 'Documentation',
  security_hardening: 'Security',
  performance_optimizations: 'Performance',
  code_quality: 'Code Quality'
};

export const IDEATION_TYPE_DESCRIPTIONS: Record<string, string> = {
  code_improvements: 'Code-revealed opportunities from patterns, architecture, and infrastructure analysis',
  ui_ux_improvements: 'Visual and interaction improvements identified through app analysis',
  documentation_gaps: 'Missing or outdated documentation that needs attention',
  security_hardening: 'Security vulnerabilities and hardening opportunities',
  performance_optimizations: 'Performance bottlenecks and optimization opportunities',
  code_quality: 'Refactoring opportunities, large files, code smells, and best practice violations'
};

// Ideation type colors
export const IDEATION_TYPE_COLORS: Record<string, string> = {
  code_improvements: 'bg-success/10 text-success border-success/30',
  ui_ux_improvements: 'bg-info/10 text-info border-info/30',
  documentation_gaps: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  security_hardening: 'bg-destructive/10 text-destructive border-destructive/30',
  performance_optimizations: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  code_quality: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
};

// Ideation type icons (Lucide icon names)
export const IDEATION_TYPE_ICONS: Record<string, string> = {
  code_improvements: 'Zap',
  ui_ux_improvements: 'Palette',
  documentation_gaps: 'BookOpen',
  security_hardening: 'Shield',
  performance_optimizations: 'Gauge',
  code_quality: 'Code2'
};

// Ideation status colors
export const IDEATION_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  selected: 'bg-primary/10 text-primary',
  converted: 'bg-success/10 text-success',
  dismissed: 'bg-destructive/10 text-destructive line-through'
};

// Ideation effort colors (full spectrum for code_improvements)
export const IDEATION_EFFORT_COLORS: Record<string, string> = {
  trivial: 'bg-success/10 text-success',
  small: 'bg-info/10 text-info',
  medium: 'bg-warning/10 text-warning',
  large: 'bg-orange-500/10 text-orange-400',
  complex: 'bg-destructive/10 text-destructive'
};

// Ideation impact colors
export const IDEATION_IMPACT_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-info/10 text-info',
  high: 'bg-warning/10 text-warning',
  critical: 'bg-destructive/10 text-destructive'
};

// Security severity colors
export const SECURITY_SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-info/10 text-info',
  medium: 'bg-warning/10 text-warning',
  high: 'bg-orange-500/10 text-orange-500',
  critical: 'bg-destructive/10 text-destructive'
};

// UI/UX category labels
export const UIUX_CATEGORY_LABELS: Record<string, string> = {
  usability: 'Usability',
  accessibility: 'Accessibility',
  performance: 'Performance',
  visual: 'Visual Design',
  interaction: 'Interaction'
};

// Documentation category labels
export const DOCUMENTATION_CATEGORY_LABELS: Record<string, string> = {
  readme: 'README',
  api_docs: 'API Documentation',
  inline_comments: 'Inline Comments',
  examples: 'Examples & Tutorials',
  architecture: 'Architecture Docs',
  troubleshooting: 'Troubleshooting Guide'
};

// Security category labels
export const SECURITY_CATEGORY_LABELS: Record<string, string> = {
  authentication: 'Authentication',
  authorization: 'Authorization',
  input_validation: 'Input Validation',
  data_protection: 'Data Protection',
  dependencies: 'Dependencies',
  configuration: 'Configuration',
  secrets_management: 'Secrets Management'
};

// Performance category labels
export const PERFORMANCE_CATEGORY_LABELS: Record<string, string> = {
  bundle_size: 'Bundle Size',
  runtime: 'Runtime Performance',
  memory: 'Memory Usage',
  database: 'Database Queries',
  network: 'Network Requests',
  rendering: 'Rendering',
  caching: 'Caching'
};

// Code quality category labels
export const CODE_QUALITY_CATEGORY_LABELS: Record<string, string> = {
  large_files: 'Large Files',
  code_smells: 'Code Smells',
  complexity: 'High Complexity',
  duplication: 'Code Duplication',
  naming: 'Naming Conventions',
  structure: 'File Structure',
  linting: 'Linting Issues',
  testing: 'Test Coverage',
  types: 'Type Safety',
  dependencies: 'Dependency Issues',
  dead_code: 'Dead Code',
  git_hygiene: 'Git Hygiene'
};

// Code quality severity colors
export const CODE_QUALITY_SEVERITY_COLORS: Record<string, string> = {
  suggestion: 'bg-info/10 text-info',
  minor: 'bg-warning/10 text-warning',
  major: 'bg-orange-500/10 text-orange-500',
  critical: 'bg-destructive/10 text-destructive'
};

// Default ideation config
// Note: high_value_features removed, low_hanging_fruit renamed to code_improvements
export const DEFAULT_IDEATION_CONFIG = {
  enabledTypes: ['code_improvements', 'ui_ux_improvements', 'security_hardening'] as const,
  includeRoadmapContext: true,
  includeKanbanContext: true,
  maxIdeasPerType: 5
};

// ============================================
// Task Metadata Constants
// ============================================

// Task category labels
export const TASK_CATEGORY_LABELS: Record<string, string> = {
  feature: 'Feature',
  bug_fix: 'Bug Fix',
  refactoring: 'Refactoring',
  documentation: 'Docs',
  security: 'Security',
  performance: 'Performance',
  ui_ux: 'UI/UX',
  infrastructure: 'Infrastructure',
  testing: 'Testing'
};

// Task category colors
export const TASK_CATEGORY_COLORS: Record<string, string> = {
  feature: 'bg-primary/10 text-primary border-primary/30',
  bug_fix: 'bg-destructive/10 text-destructive border-destructive/30',
  refactoring: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  documentation: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  security: 'bg-red-500/10 text-red-400 border-red-500/30',
  performance: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  ui_ux: 'bg-info/10 text-info border-info/30',
  infrastructure: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  testing: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
};

// Task complexity colors
export const TASK_COMPLEXITY_COLORS: Record<string, string> = {
  trivial: 'bg-success/10 text-success',
  small: 'bg-info/10 text-info',
  medium: 'bg-warning/10 text-warning',
  large: 'bg-orange-500/10 text-orange-400',
  complex: 'bg-destructive/10 text-destructive'
};

// Task complexity labels
export const TASK_COMPLEXITY_LABELS: Record<string, string> = {
  trivial: 'Trivial',
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  complex: 'Complex'
};

// Task impact colors
export const TASK_IMPACT_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-info/10 text-info',
  high: 'bg-warning/10 text-warning',
  critical: 'bg-destructive/10 text-destructive'
};

// Task impact labels
export const TASK_IMPACT_LABELS: Record<string, string> = {
  low: 'Low Impact',
  medium: 'Medium Impact',
  high: 'High Impact',
  critical: 'Critical Impact'
};

// Task priority colors
export const TASK_PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-info/10 text-info',
  high: 'bg-warning/10 text-warning',
  urgent: 'bg-destructive/10 text-destructive'
};

// Task priority labels
export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent'
};

// ============================================
// GitHub Constants
// ============================================

// GitHub issue state colors
export const GITHUB_ISSUE_STATE_COLORS: Record<string, string> = {
  open: 'bg-success/10 text-success border-success/30',
  closed: 'bg-purple-500/10 text-purple-400 border-purple-500/30'
};

// GitHub issue state labels
export const GITHUB_ISSUE_STATE_LABELS: Record<string, string> = {
  open: 'Open',
  closed: 'Closed'
};

// GitHub complexity colors (for investigation results)
export const GITHUB_COMPLEXITY_COLORS: Record<string, string> = {
  simple: 'bg-success/10 text-success',
  standard: 'bg-warning/10 text-warning',
  complex: 'bg-destructive/10 text-destructive'
};

// ============================================
// Changelog Constants
// ============================================

// Changelog format labels and descriptions
export const CHANGELOG_FORMAT_LABELS: Record<string, string> = {
  'keep-a-changelog': 'Keep a Changelog',
  'simple-list': 'Simple List',
  'github-release': 'GitHub Release'
};

export const CHANGELOG_FORMAT_DESCRIPTIONS: Record<string, string> = {
  'keep-a-changelog': 'Structured format with Added/Changed/Fixed/Removed sections',
  'simple-list': 'Clean bulleted list with categories',
  'github-release': 'GitHub-style release notes with emojis'
};

// Changelog audience labels and descriptions
export const CHANGELOG_AUDIENCE_LABELS: Record<string, string> = {
  'technical': 'Technical',
  'user-facing': 'User-Facing',
  'marketing': 'Marketing'
};

export const CHANGELOG_AUDIENCE_DESCRIPTIONS: Record<string, string> = {
  'technical': 'Detailed technical changes for developers',
  'user-facing': 'Clear, non-technical descriptions for end users',
  'marketing': 'Value-focused copy emphasizing benefits'
};

// Changelog generation stage labels
export const CHANGELOG_STAGE_LABELS: Record<string, string> = {
  'loading_specs': 'Loading spec files...',
  'loading_commits': 'Loading commits...',
  'generating': 'Generating changelog...',
  'formatting': 'Formatting output...',
  'complete': 'Complete',
  'error': 'Error'
};

// Changelog source mode labels and descriptions
export const CHANGELOG_SOURCE_MODE_LABELS: Record<string, string> = {
  'tasks': 'Completed Tasks',
  'git-history': 'Git History',
  'branch-diff': 'Branch Comparison'
};

export const CHANGELOG_SOURCE_MODE_DESCRIPTIONS: Record<string, string> = {
  'tasks': 'Generate from completed spec tasks',
  'git-history': 'Generate from recent commits or tag range',
  'branch-diff': 'Generate from commits between two branches'
};

// Git history type labels
export const GIT_HISTORY_TYPE_LABELS: Record<string, string> = {
  'recent': 'Recent Commits',
  'since-date': 'Since Date',
  'tag-range': 'Between Tags'
};

export const GIT_HISTORY_TYPE_DESCRIPTIONS: Record<string, string> = {
  'recent': 'Last N commits from HEAD',
  'since-date': 'All commits since a specific date',
  'tag-range': 'Commits between two tags'
};

// Default changelog file path
export const DEFAULT_CHANGELOG_PATH = 'CHANGELOG.md';

// ============================================
// Image Upload Constants
// ============================================

// Maximum image file size (10 MB)
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Maximum number of images per task
export const MAX_IMAGES_PER_TASK = 10;

// Allowed image MIME types
export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml'
] as const;

// Allowed image file extensions (for display)
export const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] as const;

// Human-readable allowed types for error messages
export const ALLOWED_IMAGE_TYPES_DISPLAY = 'PNG, JPEG, GIF, WebP, SVG';

// Attachments directory name within spec folder
export const ATTACHMENTS_DIR = 'attachments';
