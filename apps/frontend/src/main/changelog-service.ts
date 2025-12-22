/**
 * Changelog Service - Re-export facade
 *
 * This file maintains backward compatibility by re-exporting from the modular changelog directory.
 * The actual implementation has been split into focused modules:
 *
 * - changelog/changelog-service.ts: Main orchestrator
 * - changelog/generator.ts: AI generation logic
 * - changelog/parser.ts: Parsing and extraction
 * - changelog/formatter.ts: Prompt building and formatting
 * - changelog/git-integration.ts: Git operations
 * - changelog/types.ts: Type definitions
 */

export { ChangelogService, changelogService } from './changelog/changelog-service';
export type { ChangelogConfig, PromptBuildOptions, VersionSuggestion, GenerationScriptParams } from './changelog/types';
