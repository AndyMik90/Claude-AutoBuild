/**
 * Application configuration constants
 * Default settings, file paths, and project structure
 */

// ============================================
// Default App Settings
// ============================================

export const DEFAULT_APP_SETTINGS = {
  theme: 'system' as const,
  colorTheme: 'default' as const,
  defaultModel: 'opus',
  agentFramework: 'auto-claude',
  pythonPath: undefined as string | undefined,
  autoBuildPath: undefined as string | undefined,
  autoUpdateAutoBuild: true,
  autoNameTerminals: true,
  onboardingCompleted: false,
  notifications: {
    onTaskComplete: true,
    onTaskFailed: true,
    onReviewNeeded: true,
    sound: false
  },
  // Global API keys (used as defaults for all projects)
  globalClaudeOAuthToken: undefined as string | undefined,
  globalOpenAIApiKey: undefined as string | undefined,
  // Selected agent profile - defaults to 'auto' for per-phase optimized model selection
  selectedAgentProfile: 'auto',
  // Changelog preferences (persisted between sessions)
  changelogFormat: 'keep-a-changelog' as const,
  changelogAudience: 'user-facing' as const,
  changelogEmojiLevel: 'none' as const
};

// ============================================
// Default Project Settings
// ============================================

export const DEFAULT_PROJECT_SETTINGS = {
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

// ============================================
// Auto Build File Paths
// ============================================

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
  COMPETITOR_ANALYSIS: 'competitor_analysis.json',
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
