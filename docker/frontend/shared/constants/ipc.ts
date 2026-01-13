/**
 * IPC Channel names for Electron communication
 * Main process <-> Renderer process communication
 */

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
  TASK_WORKTREE_MERGE_PREVIEW: 'task:worktreeMergePreview',  // Preview merge conflicts before merging
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
  TERMINAL_GENERATE_NAME: 'terminal:generateName',

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

  // Usage monitoring (proactive account switching)
  USAGE_UPDATED: 'claude:usageUpdated',  // Event: usage data updated (main -> renderer)
  USAGE_REQUEST: 'claude:usageRequest',  // Request current usage snapshot
  PROACTIVE_SWAP_NOTIFICATION: 'claude:proactiveSwapNotification',  // Event: proactive swap occurred

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',

  // Dialogs
  DIALOG_SELECT_DIRECTORY: 'dialog:selectDirectory',
  DIALOG_CREATE_PROJECT_FOLDER: 'dialog:createProjectFolder',
  DIALOG_GET_DEFAULT_PROJECT_LOCATION: 'dialog:getDefaultProjectLocation',

  // App info
  APP_VERSION: 'app:version',

  // Shell operations
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',

  // Roadmap operations
  ROADMAP_GET: 'roadmap:get',
  ROADMAP_GET_STATUS: 'roadmap:getStatus',
  ROADMAP_SAVE: 'roadmap:save',
  ROADMAP_GENERATE: 'roadmap:generate',
  ROADMAP_GENERATE_WITH_COMPETITOR: 'roadmap:generateWithCompetitor',
  ROADMAP_REFRESH: 'roadmap:refresh',
  ROADMAP_STOP: 'roadmap:stop',
  ROADMAP_UPDATE_FEATURE: 'roadmap:updateFeature',
  ROADMAP_CONVERT_TO_SPEC: 'roadmap:convertToSpec',

  // Roadmap events (main -> renderer)
  ROADMAP_PROGRESS: 'roadmap:progress',
  ROADMAP_COMPLETE: 'roadmap:complete',
  ROADMAP_ERROR: 'roadmap:error',
  ROADMAP_STOPPED: 'roadmap:stopped',

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
  IDEATION_ARCHIVE: 'ideation:archive',
  IDEATION_DELETE: 'ideation:delete',
  IDEATION_DELETE_MULTIPLE: 'ideation:deleteMultiple',

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
  GITHUB_GET_ISSUE_COMMENTS: 'github:getIssueComments',
  GITHUB_CHECK_CONNECTION: 'github:checkConnection',
  GITHUB_INVESTIGATE_ISSUE: 'github:investigateIssue',
  GITHUB_IMPORT_ISSUES: 'github:importIssues',
  GITHUB_CREATE_RELEASE: 'github:createRelease',

  // GitHub OAuth (gh CLI authentication)
  GITHUB_CHECK_CLI: 'github:checkCli',
  GITHUB_CHECK_AUTH: 'github:checkAuth',
  GITHUB_START_AUTH: 'github:startAuth',
  GITHUB_GET_TOKEN: 'github:getToken',
  GITHUB_GET_USER: 'github:getUser',
  GITHUB_LIST_USER_REPOS: 'github:listUserRepos',
  GITHUB_DETECT_REPO: 'github:detectRepo',
  GITHUB_GET_BRANCHES: 'github:getBranches',

  // GitHub events (main -> renderer)
  GITHUB_INVESTIGATION_PROGRESS: 'github:investigationProgress',
  GITHUB_INVESTIGATION_COMPLETE: 'github:investigationComplete',
  GITHUB_INVESTIGATION_ERROR: 'github:investigationError',

  // Docker & Infrastructure status
  DOCKER_STATUS: 'docker:status',
  DOCKER_START_FALKORDB: 'docker:startFalkordb',
  DOCKER_STOP_FALKORDB: 'docker:stopFalkordb',
  DOCKER_OPEN_DESKTOP: 'docker:openDesktop',
  DOCKER_GET_DOWNLOAD_URL: 'docker:getDownloadUrl',

  // Graphiti validation
  GRAPHITI_VALIDATE_FALKORDB: 'graphiti:validateFalkordb',
  GRAPHITI_VALIDATE_OPENAI: 'graphiti:validateOpenai',
  GRAPHITI_TEST_CONNECTION: 'graphiti:testConnection',

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
  CHANGELOG_SUGGEST_VERSION_FROM_COMMITS: 'changelog:suggestVersionFromCommits',

  // Changelog git operations (for git-based changelog generation)
  CHANGELOG_GET_BRANCHES: 'changelog:getBranches',
  CHANGELOG_GET_TAGS: 'changelog:getTags',
  CHANGELOG_GET_COMMITS_PREVIEW: 'changelog:getCommitsPreview',
  CHANGELOG_SAVE_IMAGE: 'changelog:saveImage',

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
  INSIGHTS_UPDATE_MODEL_CONFIG: 'insights:updateModelConfig',

  // Insights events (main -> renderer)
  INSIGHTS_STREAM_CHUNK: 'insights:streamChunk',
  INSIGHTS_STATUS: 'insights:status',
  INSIGHTS_ERROR: 'insights:error',

  // File explorer operations
  FILE_EXPLORER_LIST: 'fileExplorer:list',

  // Git operations
  GIT_GET_BRANCHES: 'git:getBranches',
  GIT_GET_CURRENT_BRANCH: 'git:getCurrentBranch',
  GIT_DETECT_MAIN_BRANCH: 'git:detectMainBranch',
  GIT_CHECK_STATUS: 'git:checkStatus',
  GIT_INITIALIZE: 'git:initialize',

  // App auto-update operations
  APP_UPDATE_CHECK: 'app-update:check',
  APP_UPDATE_DOWNLOAD: 'app-update:download',
  APP_UPDATE_INSTALL: 'app-update:install',
  APP_UPDATE_GET_VERSION: 'app-update:get-version',

  // App auto-update events (main -> renderer)
  APP_UPDATE_AVAILABLE: 'app-update:available',
  APP_UPDATE_DOWNLOADED: 'app-update:downloaded',
  APP_UPDATE_PROGRESS: 'app-update:progress',
  APP_UPDATE_ERROR: 'app-update:error',

  // Release operations
  RELEASE_SUGGEST_VERSION: 'release:suggestVersion',
  RELEASE_CREATE: 'release:create',
  RELEASE_PREFLIGHT: 'release:preflight',
  RELEASE_GET_VERSIONS: 'release:getVersions',

  // Release events (main -> renderer)
  RELEASE_PROGRESS: 'release:progress'
} as const;
