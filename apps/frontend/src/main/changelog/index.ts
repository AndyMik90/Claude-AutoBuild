/**
 * Changelog module - clean exports
 *
 * Architecture:
 * - changelog-service.ts: Main service facade (orchestrates all operations)
 * - generator.ts: AI-powered changelog generation
 * - version-suggester.ts: AI-powered version bump suggestions
 * - parser.ts: Changelog and spec parsing logic
 * - formatter.ts: Prompt building and formatting
 * - git-integration.ts: Git operations (branches, tags, commits)
 * - types.ts: Module-specific types
 */

export { ChangelogService, changelogService } from './changelog-service';
export { ChangelogGenerator } from './generator';
export { VersionSuggester } from './version-suggester';
export * from './parser';
export * from './formatter';
export * from './git-integration';
export * from './types';
