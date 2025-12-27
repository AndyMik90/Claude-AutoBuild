/**
 * Changelog-related constants
 * Format options, audience types, and generation configuration
 */

// ============================================
// Changelog Formats
// ============================================

export const CHANGELOG_FORMAT_LABELS: Record<string, string> = {
  'keep-a-changelog': 'Keep a Changelog',
  'simple-list': 'Simple List',
  'github-release': 'GitHub Release'
};

export const CHANGELOG_FORMAT_DESCRIPTIONS: Record<string, string> = {
  'keep-a-changelog': 'Structured format with Added/Changed/Fixed/Removed sections',
  'simple-list': 'Clean bulleted list with categories',
  'github-release': 'GitHub-style release notes'
};

// ============================================
// Changelog Audience
// ============================================

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

// ============================================
// Changelog Emoji Level
// ============================================

export const CHANGELOG_EMOJI_LEVEL_LABELS: Record<string, string> = {
  'none': 'None',
  'little': 'Headings Only',
  'medium': 'Headings + Highlights',
  'high': 'Everything'
};

export const CHANGELOG_EMOJI_LEVEL_DESCRIPTIONS: Record<string, string> = {
  'none': 'No emojis',
  'little': 'Emojis on section headings only',
  'medium': 'Emojis on headings and key items',
  'high': 'Emojis on headings and every line'
};

// ============================================
// Changelog Source Mode
// ============================================

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

// ============================================
// Git History Types
// ============================================

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

// ============================================
// Changelog Generation Stages
// ============================================

export const CHANGELOG_STAGE_LABELS: Record<string, string> = {
  'loading_specs': 'Loading spec files...',
  'loading_commits': 'Loading commits...',
  'generating': 'Generating changelog...',
  'formatting': 'Formatting output...',
  'complete': 'Complete',
  'error': 'Error'
};

// ============================================
// Default Configuration
// ============================================

// Default changelog file path
export const DEFAULT_CHANGELOG_PATH = 'CHANGELOG.md';
