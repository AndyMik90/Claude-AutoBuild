import { ipcMain } from 'electron';
import { readdirSync, readFileSync, writeFileSync, realpathSync, existsSync, statSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult, FileNode } from '../../shared/types';

// Directories to ignore when listing
const IGNORED_DIRS = new Set([
  'node_modules', '.git', '__pycache__', 'dist', 'build',
  '.next', '.nuxt', 'coverage', '.cache', '.venv', 'venv',
  'out', '.turbo', '.worktrees',
  'vendor', 'target', '.gradle', '.maven'
]);

/**
 * Register all file-related IPC handlers
 */
export function registerFileHandlers(): void {
  // ============================================
  // File Explorer Operations
  // ============================================

  ipcMain.handle(
    IPC_CHANNELS.FILE_EXPLORER_LIST,
    async (_, dirPath: string): Promise<IPCResult<FileNode[]>> => {
      try {
        const entries = readdirSync(dirPath, { withFileTypes: true });

        // Filter and map entries
        const nodes: FileNode[] = [];
        for (const entry of entries) {
          // Skip hidden files (not directories) except useful ones like .env, .gitignore
          if (!entry.isDirectory() && entry.name.startsWith('.') &&
              !['.env', '.gitignore', '.env.example', '.env.local'].includes(entry.name)) {
            continue;
          }
          // Skip ignored directories
          if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;

          nodes.push({
            path: path.join(dirPath, entry.name),
            name: entry.name,
            isDirectory: entry.isDirectory()
          });
        }

        // Sort: directories first, then alphabetically
        nodes.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        return { success: true, data: nodes };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list directory'
        };
      }
    }
  );

  // ============================================
  // Code Editor Operations (Workspace-scoped)
  // ============================================

  // Additional ignored patterns for code editor
  const CODE_EDITOR_IGNORED = new Set([
    ...IGNORED_DIRS,
    'Library',  // Unity
    'Temp',     // Unity
    'Obj',      // Unity
    'Logs',     // Unity
    'Build'     // Unity (case-insensitive already covered by 'build')
  ]);

  /**
   * Validates that a path is within the workspace root.
   * Prevents directory traversal and symlink escape attacks.
   */
  function validateWorkspacePath(workspaceRoot: string, relPath: string): { valid: boolean; absPath?: string; error?: string } {
    try {
      // Resolve workspace root to canonical path
      const workspaceRootResolved = realpathSync(workspaceRoot);

      // Resolve the target path
      const absPath = path.resolve(workspaceRootResolved, relPath);

      // Check if path starts with workspace root
      if (!absPath.startsWith(workspaceRootResolved + path.sep) && absPath !== workspaceRootResolved) {
        return { valid: false, error: 'Path escapes workspace root' };
      }

      return { valid: true, absPath };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Invalid path' };
    }
  }

  /**
   * Validates that a resolved path (following symlinks) is within workspace.
   * Used for targets that exist (read operations).
   */
  function validateResolvedPath(workspaceRoot: string, absPath: string): { valid: boolean; error?: string } {
    try {
      const workspaceRootResolved = realpathSync(workspaceRoot);

      if (!existsSync(absPath)) {
        return { valid: false, error: 'Path does not exist' };
      }

      const targetReal = realpathSync(absPath);

      if (!targetReal.startsWith(workspaceRootResolved + path.sep) && targetReal !== workspaceRootResolved) {
        return { valid: false, error: 'Symlink resolves outside workspace root' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : 'Invalid path' };
    }
  }

  interface CodeEditorFileNode {
    name: string;
    relPath: string;
    isDir: boolean;
  }

  // List directory (workspace-scoped, lazy-loaded)
  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_LIST_DIR,
    async (_, workspaceRoot: string, relPath: string): Promise<IPCResult<CodeEditorFileNode[]>> => {
      try {
        // Validate workspace path
        const validation = validateWorkspacePath(workspaceRoot, relPath);
        if (!validation.valid || !validation.absPath) {
          return { success: false, error: validation.error || 'Invalid path' };
        }

        const absPath = validation.absPath;

        // Validate resolved path (prevent symlink escape)
        const resolvedValidation = validateResolvedPath(workspaceRoot, absPath);
        if (!resolvedValidation.valid) {
          return { success: false, error: resolvedValidation.error };
        }

        // Check if it's a directory
        if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
          return { success: false, error: 'Not a directory' };
        }

        // Read directory
        const entries = readdirSync(absPath, { withFileTypes: true });
        const workspaceRootResolved = realpathSync(workspaceRoot);

        const nodes: CodeEditorFileNode[] = [];

        for (const entry of entries) {
          // Skip ignored directories
          if (entry.isDirectory() && CODE_EDITOR_IGNORED.has(entry.name)) {
            continue;
          }

          // Skip hidden files (but allow hidden directories)
          if (!entry.isDirectory() && entry.name.startsWith('.')) {
            continue;
          }

          const entryAbsPath = path.join(absPath, entry.name);
          const entryRelPath = relPath ? path.join(relPath, entry.name) : entry.name;

          // Validate that symlinks resolve within workspace
          try {
            if (existsSync(entryAbsPath)) {
              const entryReal = realpathSync(entryAbsPath);

              // Skip if resolves outside workspace
              if (!entryReal.startsWith(workspaceRootResolved + path.sep) && entryReal !== workspaceRootResolved) {
                continue;
              }
            }
          } catch {
            // Skip entries that can't be resolved
            continue;
          }

          nodes.push({
            name: entry.name,
            relPath: entryRelPath,
            isDir: entry.isDirectory()
          });
        }

        // Sort: directories first, then files
        nodes.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });

        return { success: true, data: nodes };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list directory'
        };
      }
    }
  );

  // Read file (workspace-scoped)
  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_READ_FILE,
    async (_, workspaceRoot: string, relPath: string): Promise<IPCResult<string>> => {
      try {
        // Validate workspace path
        const validation = validateWorkspacePath(workspaceRoot, relPath);
        if (!validation.valid || !validation.absPath) {
          return { success: false, error: validation.error || 'Invalid path' };
        }

        const absPath = validation.absPath;

        // Validate resolved path (prevent symlink escape)
        const resolvedValidation = validateResolvedPath(workspaceRoot, absPath);
        if (!resolvedValidation.valid) {
          return { success: false, error: resolvedValidation.error };
        }

        // Check if it's a file
        if (!existsSync(absPath)) {
          return { success: false, error: 'File does not exist' };
        }

        if (!statSync(absPath).isFile()) {
          return { success: false, error: 'Not a file' };
        }

        // Read file
        const content = readFileSync(absPath, 'utf-8');

        return { success: true, data: content };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read file'
        };
      }
    }
  );

  // Write file (workspace-scoped)
  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_WRITE_FILE,
    async (_, workspaceRoot: string, relPath: string, content: string): Promise<IPCResult<void>> => {
      try {
        // Validate workspace path
        const validation = validateWorkspacePath(workspaceRoot, relPath);
        if (!validation.valid || !validation.absPath) {
          return { success: false, error: validation.error || 'Invalid path' };
        }

        const absPath = validation.absPath;
        const workspaceRootResolved = realpathSync(workspaceRoot);

        // For write operations, validate differently based on whether file exists
        if (existsSync(absPath)) {
          // File exists: validate its real path
          const targetReal = realpathSync(absPath);

          if (!targetReal.startsWith(workspaceRootResolved + path.sep) && targetReal !== workspaceRootResolved) {
            return { success: false, error: 'Symlink resolves outside workspace root' };
          }

          // Verify it's a file
          if (!statSync(absPath).isFile()) {
            return { success: false, error: 'Not a file' };
          }
        } else {
          // File doesn't exist: validate parent directory
          const parentDir = path.dirname(absPath);

          if (!existsSync(parentDir)) {
            return { success: false, error: 'Parent directory does not exist' };
          }

          const parentReal = realpathSync(parentDir);

          if (!parentReal.startsWith(workspaceRootResolved + path.sep) && parentReal !== workspaceRootResolved) {
            return { success: false, error: 'Parent directory resolves outside workspace root' };
          }
        }

        // Write file
        writeFileSync(absPath, content, 'utf-8');

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to write file'
        };
      }
    }
  );
}
