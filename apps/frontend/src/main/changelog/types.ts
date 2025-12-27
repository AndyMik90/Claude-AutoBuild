/**
 * Changelog-specific types
 * These types extend the base types from shared/types.ts
 */

export interface ChangelogConfig {
  pythonPath: string;
  claudePath: string;
  autoBuildSourcePath: string;
}

export interface PromptBuildOptions {
  version: string;
  date: string;
  audience: 'technical' | 'user-facing' | 'marketing';
  format: 'keep-a-changelog' | 'simple-list' | 'github-release';
  customInstructions?: string;
}

export interface VersionSuggestion {
  suggested: string;
  reason: string;
  hasBreakingChanges: boolean;
  hasNewFeatures: boolean;
}

export interface GenerationScriptParams {
  prompt: string;
  claudePath: string;
}
