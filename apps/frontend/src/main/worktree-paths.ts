/**
 * Shared worktree path utilities
 *
 * Centralizes all worktree path constants and helper functions to avoid duplication
 * and ensure consistent path handling across the application.
 */

import path from 'path';
import { existsSync } from 'fs';

// Path constants for worktree directories
export const TASK_WORKTREE_DIR = '.auto-claude/worktrees/tasks';
export const TERMINAL_WORKTREE_DIR = '.auto-claude/worktrees/terminal';

// Metadata directories (separate from git worktrees to avoid uncommitted files)
export const TERMINAL_WORKTREE_METADATA_DIR = '.auto-claude/terminal/metadata';

// Legacy path for backwards compatibility
export const LEGACY_WORKTREE_DIR = '.worktrees';

/**
 * Get the task worktrees directory path
 */
export function getTaskWorktreeDir(projectPath: string): string {
  return path.join(projectPath, TASK_WORKTREE_DIR);
}

/**
 * Get the full path for a specific task worktree
 */
export function getTaskWorktreePath(projectPath: string, specId: string): string {
  return path.join(projectPath, TASK_WORKTREE_DIR, specId);
}

/**
 * Find a task worktree path, checking new location first then legacy
 * Returns the path if found, null otherwise
 */
export function findTaskWorktree(projectPath: string, specId: string): string | null {
  // Check new path first
  const newPath = path.join(projectPath, TASK_WORKTREE_DIR, specId);
  if (existsSync(newPath)) return newPath;

  // Legacy fallback
  const legacyPath = path.join(projectPath, LEGACY_WORKTREE_DIR, specId);
  if (existsSync(legacyPath)) return legacyPath;

  return null;
}

/**
 * Get the terminal worktrees directory path
 */
export function getTerminalWorktreeDir(projectPath: string): string {
  return path.join(projectPath, TERMINAL_WORKTREE_DIR);
}

/**
 * Get the full path for a specific terminal worktree
 */
export function getTerminalWorktreePath(projectPath: string, name: string): string {
  return path.join(projectPath, TERMINAL_WORKTREE_DIR, name);
}

/**
 * Find a terminal worktree path, checking new location first then legacy
 * Returns the path if found, null otherwise
 */
export function findTerminalWorktree(projectPath: string, name: string): string | null {
  // Check new path first
  const newPath = path.join(projectPath, TERMINAL_WORKTREE_DIR, name);
  if (existsSync(newPath)) return newPath;

  // Legacy fallback (terminal worktrees used terminal-{name} prefix)
  const legacyPath = path.join(projectPath, LEGACY_WORKTREE_DIR, `terminal-${name}`);
  if (existsSync(legacyPath)) return legacyPath;

  return null;
}

/**
 * Get the terminal worktree metadata directory path
 * This is separate from the git worktree to avoid uncommitted files
 */
export function getTerminalWorktreeMetadataDir(projectPath: string): string {
  return path.join(projectPath, TERMINAL_WORKTREE_METADATA_DIR);
}

/**
 * Get the metadata file path for a specific terminal worktree
 */
export function getTerminalWorktreeMetadataPath(projectPath: string, name: string): string {
  return path.join(projectPath, TERMINAL_WORKTREE_METADATA_DIR, `${name}.json`);
}
