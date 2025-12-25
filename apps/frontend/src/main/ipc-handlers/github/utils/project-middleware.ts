/**
 * Project validation middleware for GitHub handlers
 *
 * Provides consistent project validation and error handling across all handlers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { projectStore } from '../../../project-store';
import type { Project } from '../../../../shared/types';

/**
 * Validate that a project path is safe for file operations
 * Prevents path traversal attacks and ensures path exists
 */
function validateProjectPath(projectPath: string): void {
  // Ensure path is absolute
  if (!path.isAbsolute(projectPath)) {
    throw new Error(`Project path must be absolute: ${projectPath}`);
  }

  // Normalize path and check for traversal attempts
  const normalizedPath = path.normalize(projectPath);
  if (normalizedPath.includes('..')) {
    throw new Error(`Invalid project path (contains traversal): ${projectPath}`);
  }

  // Verify path exists and is a directory
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  const stats = fs.statSync(normalizedPath);
  if (!stats.isDirectory()) {
    throw new Error(`Project path is not a directory: ${projectPath}`);
  }
}

/**
 * Execute a handler with automatic project validation
 *
 * Usage:
 * ```ts
 * ipcMain.handle('channel', async (_, projectId: string) => {
 *   return withProject(projectId, async (project) => {
 *     // Your handler logic here - project is guaranteed to exist
 *     return someResult;
 *   });
 * });
 * ```
 */
export async function withProject<T>(
  projectId: string,
  handler: (project: Project) => Promise<T>
): Promise<T> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  // Validate project path before passing to handler
  validateProjectPath(project.path);

  return handler(project);
}

/**
 * Execute a handler with project validation, returning null on missing project
 *
 * Usage for handlers that should return null instead of throwing:
 * ```ts
 * ipcMain.handle('channel', async (_, projectId: string) => {
 *   return withProjectOrNull(projectId, async (project) => {
 *     // Your handler logic here
 *     return someResult;
 *   });
 * });
 * ```
 */
export async function withProjectOrNull<T>(
  projectId: string,
  handler: (project: Project) => Promise<T>
): Promise<T | null> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return null;
  }

  // Validate project path before passing to handler
  try {
    validateProjectPath(project.path);
  } catch {
    return null;
  }

  return handler(project);
}

/**
 * Execute a handler with project validation, returning a default value on missing project
 */
export async function withProjectOrDefault<T>(
  projectId: string,
  defaultValue: T,
  handler: (project: Project) => Promise<T>
): Promise<T> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return defaultValue;
  }
  return handler(project);
}

/**
 * Synchronous version of withProject for non-async handlers
 */
export function withProjectSync<T>(
  projectId: string,
  handler: (project: Project) => T
): T {
  const project = projectStore.getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }
  return handler(project);
}

/**
 * Synchronous version that returns null on missing project
 */
export function withProjectSyncOrNull<T>(
  projectId: string,
  handler: (project: Project) => T
): T | null {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return null;
  }
  return handler(project);
}
