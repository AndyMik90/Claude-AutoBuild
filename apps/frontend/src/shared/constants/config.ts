/**
 * Application configuration constants
 * Default settings, file paths, and project structure
 */

import type { TerminalFontSettings, TerminalFontFamily } from '../types/settings';

// ============================================
// UI Scale Constants
// ============================================

export const UI_SCALE_MIN = 75;
export const UI_SCALE_MAX = 200;
export const UI_SCALE_DEFAULT = 100;
export const UI_SCALE_STEP = 5;

// ============================================
// Terminal Font Constants
// ============================================

export const TERMINAL_FONT_SIZE_MIN = 10;
export const TERMINAL_FONT_SIZE_MAX = 20;
export const TERMINAL_FONT_SIZE_DEFAULT = 13;
export const TERMINAL_FONT_SIZE_STEP = 1;

export const TERMINAL_LINE_HEIGHT_MIN = 1.0;
export const TERMINAL_LINE_HEIGHT_MAX = 1.5;
export const TERMINAL_LINE_HEIGHT_DEFAULT = 1.2;
export const TERMINAL_LINE_HEIGHT_STEP = 0.05;

export const TERMINAL_LETTER_SPACING_MIN = -2;
export const TERMINAL_LETTER_SPACING_MAX = 2;
export const TERMINAL_LETTER_SPACING_DEFAULT = 0;
export const TERMINAL_LETTER_SPACING_STEP = 0.5;

// Map TerminalFontFamily to CSS font stacks for xterm.js
export const TERMINAL_FONT_FAMILY_MAP: Record<TerminalFontFamily, string> = {
  system: 'var(--font-mono), "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  jetbrainsMono: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  firaCode: '"Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  cascadiaCode: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  consolas: 'Consolas, "Courier New", monospace',
  monaco: 'Monaco, "Courier New", monospace',
  sfMono: '"SF Mono", Monaco, "Courier New", monospace',
  sourceCodePro: '"Source Code Pro", "Courier New", monospace',
  ubuntuMono: '"Ubuntu Mono", "Courier New", monospace',
  dejaVuSansMono: '"DejaVu Sans Mono", "Courier New", monospace'
};

// Terminal font family options with display labels and CSS font stacks
export const TERMINAL_FONT_FAMILY_OPTIONS: Record<TerminalFontFamily, { label: string; fontStack: string }> = {
  system: { label: 'System Default', fontStack: TERMINAL_FONT_FAMILY_MAP.system },
  jetbrainsMono: { label: 'JetBrains Mono', fontStack: TERMINAL_FONT_FAMILY_MAP.jetbrainsMono },
  firaCode: { label: 'Fira Code', fontStack: TERMINAL_FONT_FAMILY_MAP.firaCode },
  cascadiaCode: { label: 'Cascadia Code', fontStack: TERMINAL_FONT_FAMILY_MAP.cascadiaCode },
  consolas: { label: 'Consolas', fontStack: TERMINAL_FONT_FAMILY_MAP.consolas },
  monaco: { label: 'Monaco', fontStack: TERMINAL_FONT_FAMILY_MAP.monaco },
  sfMono: { label: 'SF Mono', fontStack: TERMINAL_FONT_FAMILY_MAP.sfMono },
  sourceCodePro: { label: 'Source Code Pro', fontStack: TERMINAL_FONT_FAMILY_MAP.sourceCodePro },
  ubuntuMono: { label: 'Ubuntu Mono', fontStack: TERMINAL_FONT_FAMILY_MAP.ubuntuMono },
  dejaVuSansMono: { label: 'DejaVu Sans Mono', fontStack: TERMINAL_FONT_FAMILY_MAP.dejaVuSansMono }
};

export const DEFAULT_TERMINAL_FONT_SETTINGS: TerminalFontSettings = {
  fontFamily: 'system',
  fontSize: TERMINAL_FONT_SIZE_DEFAULT,
  lineHeight: TERMINAL_LINE_HEIGHT_DEFAULT,
  letterSpacing: TERMINAL_LETTER_SPACING_DEFAULT
};

// ============================================
// Default App Settings
// ============================================

export const DEFAULT_APP_SETTINGS = {
  theme: 'system' as const,
  colorTheme: 'default' as const,
  defaultModel: 'opus',
  agentFramework: 'auto-claude',
  pythonPath: undefined as string | undefined,
  gitPath: undefined as string | undefined,
  githubCLIPath: undefined as string | undefined,
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
  changelogEmojiLevel: 'none' as const,
  // UI Scale (default 100% - standard size)
  uiScale: UI_SCALE_DEFAULT,
  // Beta updates opt-in (receive pre-release versions)
  betaUpdates: false,
  // Language preference (default to English)
  language: 'en' as const,
  // Terminal font settings
  terminalFont: DEFAULT_TERMINAL_FONT_SETTINGS,
  // Anonymous error reporting (Sentry) - enabled by default to help improve the app
  sentryEnabled: true
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
  graphitiMcpUrl: 'http://localhost:8000/mcp/',
  // Include CLAUDE.md instructions in agent context (enabled by default)
  useClaudeMd: true
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
