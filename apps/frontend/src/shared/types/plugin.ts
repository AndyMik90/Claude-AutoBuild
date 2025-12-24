/**
 * Plugin system types
 *
 * Defines types for the plugin management system including:
 * - Plugin manifest and metadata
 * - Plugin installation and updates
 * - GitHub authentication for private repos
 */

// ============================================
// Plugin Source Types
// ============================================

/** Source type for plugin installation */
export type PluginSourceType = 'github' | 'local';

/** Plugin installation status */
export type PluginInstallStatus = 'installed' | 'installing' | 'failed' | 'uninstalling';

/** Plugin update status */
export type PluginUpdateStatus = 'up_to_date' | 'update_available' | 'checking' | 'updating';

// ============================================
// Core Plugin Types
// ============================================

/** Individual skill definition from a plugin */
export interface PluginSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  domain: string;
  /** Path to skill definition file relative to plugin root */
  path: string;
  /** Version of the skill */
  version?: string;
}

/** Pattern definition from a plugin */
export interface PluginPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Path to pattern definition file relative to plugin root */
  path: string;
}

/** Convention definition from a plugin */
export interface PluginConvention {
  id: string;
  name: string;
  description: string;
  /** Path to convention file relative to plugin root */
  path: string;
}

/** Plugin content structure (skills, patterns, conventions) */
export interface PluginContent {
  skills: PluginSkill[];
  patterns: PluginPattern[];
  conventions: PluginConvention[];
}

/** Plugin metadata stored in plugin.json */
export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  repository?: string;
  /** Domains covered by this plugin (e.g., 'backend', 'frontend', 'testing') */
  domains: string[];
  /** Categories of skills provided */
  categories: string[];
  /** Total number of skills */
  skillCount: number;
  /** Plugin content definitions */
  content?: PluginContent;
  /** When the plugin was last updated */
  updatedAt?: string;
}

/** Installed plugin information */
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  /** Source type (github or local) */
  sourceType: PluginSourceType;
  /** Source URL or path */
  source: string;
  /** Absolute path to plugin directory */
  path: string;
  /** Plugin metadata from plugin.json */
  metadata: PluginMetadata;
  /** Installation status */
  status: PluginInstallStatus;
  /** Update status */
  updateStatus: PluginUpdateStatus;
  /** When the plugin was installed */
  installedAt: string;
  /** When the plugin was last updated */
  updatedAt: string;
  /** Latest available version (if update available) */
  latestVersion?: string;
}

// ============================================
// Plugin Manifest Types
// ============================================

/** Plugin manifest entry (stored in manifest.json) */
export interface PluginManifestEntry {
  id: string;
  name: string;
  version: string;
  sourceType: PluginSourceType;
  source: string;
  path: string;
  installedAt: string;
  updatedAt: string;
}

/** Global plugin manifest stored in ~/.auto-claude/plugins/manifest.json */
export interface PluginManifest {
  version: string;
  plugins: PluginManifestEntry[];
  updatedAt: string;
}

// ============================================
// Installation Types
// ============================================

/** Options for installing a plugin */
export interface PluginInstallOptions {
  source: string;
  sourceType: PluginSourceType;
  /** GitHub Personal Access Token (for private repos) */
  token?: string;
}

/** Progress during plugin installation */
export interface PluginInstallProgress {
  stage: 'validating' | 'cloning' | 'copying' | 'registering' | 'complete' | 'error';
  percent: number;
  message: string;
}

/** Result of plugin installation */
export interface PluginInstallResult {
  success: boolean;
  plugin?: Plugin;
  error?: string;
}

// ============================================
// Update Types
// ============================================

/** Category of files in an update */
export interface UpdateCategory {
  id: string;
  name: string;
  description: string;
  files: UpdateFile[];
  /** Number of files with conflicts in this category */
  conflictCount: number;
}

/** File change in an update */
export interface UpdateFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** True if file has local modifications */
  hasConflict: boolean;
  /** Diff content (unified format) */
  diff?: string;
  /** Old path (for renamed files) */
  oldPath?: string;
}

/** Result of checking for plugin updates */
export interface PluginUpdateCheck {
  pluginId: string;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  /** Categorized list of changes */
  categories: UpdateCategory[];
  /** Summary of changes */
  summary: UpdateSummary;
  error?: string;
}

/** Summary of update changes */
export interface UpdateSummary {
  totalFiles: number;
  addedFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  conflictFiles: number;
}

/** Options for applying updates */
export interface PluginUpdateOptions {
  pluginId: string;
  /** Files to update (paths) */
  selectedFiles: string[];
  /** Create backup before updating */
  createBackup: boolean;
}

/** Result of applying updates */
export interface PluginUpdateResult {
  success: boolean;
  appliedFiles: string[];
  skippedFiles: string[];
  /** Path to backup directory */
  backupPath?: string;
  error?: string;
}

/** Backup information for rollback */
export interface PluginBackup {
  pluginId: string;
  timestamp: string;
  path: string;
  version: string;
  files: string[];
}

// ============================================
// GitHub Authentication Types
// ============================================

/** Result of GitHub token validation */
export interface GitHubTokenValidation {
  valid: boolean;
  username?: string;
  scopes?: string[];
  error?: string;
}

/** Result of GitHub repository access check */
export interface GitHubRepoAccess {
  hasAccess: boolean;
  owner: string;
  repo: string;
  isPrivate: boolean;
  error?: string;
}

/** Parsed GitHub URL */
export interface ParsedGitHubUrl {
  owner: string;
  repo: string;
  isSSH: boolean;
  originalUrl: string;
}

// ============================================
// Git Availability Types
// ============================================

/** Result of checking git availability */
export interface GitAvailability {
  available: boolean;
  version?: string;
  meetsMinimum: boolean;
  minimumRequired: string;
  error?: string;
}
