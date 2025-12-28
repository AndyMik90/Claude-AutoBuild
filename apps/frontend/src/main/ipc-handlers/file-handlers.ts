import { ipcMain } from 'electron';
import { readdirSync, readFileSync, writeFileSync, realpathSync, existsSync, statSync, lstatSync, openSync, fstatSync, closeSync, constants } from 'fs';
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

      // Normalize paths for comparison on case-insensitive file systems
      const isCaseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';
      const workspaceRootForCompare = isCaseInsensitiveFs
        ? workspaceRootResolved.toLowerCase()
        : workspaceRootResolved;
      const absPathForCompare = isCaseInsensitiveFs
        ? absPath.toLowerCase()
        : absPath;

      // Check if path starts with workspace root
      if (
        !absPathForCompare.startsWith(workspaceRootForCompare + path.sep) &&
        absPathForCompare !== workspaceRootForCompare
      ) {
        return { valid: false, error: 'Path escapes workspace root' };
      }

      return { valid: true, absPath };
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
        const workspaceRootResolved = realpathSync(workspaceRoot);

        // Use lstat to check without following symlinks (atomic check)
        let stats;
        try {
          stats = lstatSync(absPath);
        } catch {
          return { success: false, error: 'Path does not exist' };
        }

        // If it's a symlink, resolve it and validate
        if (stats.isSymbolicLink()) {
          try {
            const targetReal = realpathSync(absPath);

            // Normalize paths for comparison on case-insensitive file systems
            const isCaseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';
            const workspaceRootForCompare = isCaseInsensitiveFs
              ? workspaceRootResolved.toLowerCase()
              : workspaceRootResolved;
            const targetRealForCompare = isCaseInsensitiveFs
              ? targetReal.toLowerCase()
              : targetReal;

            // Validate symlink target is within workspace
            if (!targetRealForCompare.startsWith(workspaceRootForCompare + path.sep) && targetRealForCompare !== workspaceRootForCompare) {
              return { success: false, error: 'Symlink target is outside workspace root' };
            }
            // Re-stat the resolved target
            stats = lstatSync(targetReal);
          } catch {
            return { success: false, error: 'Cannot resolve symlink' };
          }
        }

        // Verify it's a directory
        if (!stats.isDirectory()) {
          return { success: false, error: 'Not a directory' };
        }

        // Read directory
        const entries = readdirSync(absPath, { withFileTypes: true });

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

          // For symlinks, validate they resolve within workspace
          if (entry.isSymbolicLink()) {
            try {
              const entryReal = realpathSync(entryAbsPath);

              // Normalize paths for comparison on case-insensitive file systems
              const isCaseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';
              const workspaceRootForCompare = isCaseInsensitiveFs
                ? workspaceRootResolved.toLowerCase()
                : workspaceRootResolved;
              const entryRealForCompare = isCaseInsensitiveFs
                ? entryReal.toLowerCase()
                : entryReal;

              // Skip if resolves outside workspace
              if (!entryRealForCompare.startsWith(workspaceRootForCompare + path.sep) && entryRealForCompare !== workspaceRootForCompare) {
                continue;
              }
            } catch {
              // Skip entries that can't be resolved
              continue;
            }
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
      let fd: number | undefined;
      try {
        // Validate workspace path
        const validation = validateWorkspacePath(workspaceRoot, relPath);
        if (!validation.valid || !validation.absPath) {
          return { success: false, error: validation.error || 'Invalid path' };
        }

        const absPath = validation.absPath;
        const workspaceRootResolved = realpathSync(workspaceRoot);

        // Normalize paths for comparison on case-insensitive file systems
        const isCaseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';
        const workspaceRootForCompare = isCaseInsensitiveFs
          ? workspaceRootResolved.toLowerCase()
          : workspaceRootResolved;

        // Open file atomically - this is the ONLY check-and-use operation
        // Using O_RDONLY | O_NOFOLLOW ensures we don't follow symlinks
        try {
          fd = openSync(absPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        } catch (err) {
          const error = err as NodeJS.ErrnoException;
          if (error.code === 'ENOENT') {
            return { success: false, error: 'File does not exist' };
          }
          if (error.code === 'ELOOP' || error.code === 'EMLINK') {
            return { success: false, error: 'Symlinks are not allowed' };
          }
          throw err;
        }

        // Use fstat on the file descriptor to verify it's a regular file
        // This is atomic - we're checking the SAME file we just opened
        const stats = fstatSync(fd);

        if (!stats.isFile()) {
          closeSync(fd);
          return { success: false, error: 'Not a file' };
        }

        // Verify parent directory is within workspace
        // (protects against hardlinks to files outside workspace)
        const parentDir = path.dirname(absPath);
        const parentReal = realpathSync(parentDir);
        const parentRealForCompare = isCaseInsensitiveFs
          ? parentReal.toLowerCase()
          : parentReal;

        if (!parentRealForCompare.startsWith(workspaceRootForCompare + path.sep) && parentRealForCompare !== workspaceRootForCompare) {
          closeSync(fd);
          return { success: false, error: 'Parent directory resolves outside workspace root' };
        }

        // Read file using the file descriptor
        const content = readFileSync(fd, 'utf-8');

        // Close file descriptor
        closeSync(fd);
        fd = undefined;

        return { success: true, data: content };
      } catch (error) {
        // Ensure file descriptor is closed on error
        if (fd !== undefined) {
          try {
            closeSync(fd);
          } catch {
            // Ignore close errors
          }
        }

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
      let fd: number | undefined;
      try {
        // Validate workspace path
        const validation = validateWorkspacePath(workspaceRoot, relPath);
        if (!validation.valid || !validation.absPath) {
          return { success: false, error: validation.error || 'Invalid path' };
        }

        const absPath = validation.absPath;
        const workspaceRootResolved = realpathSync(workspaceRoot);

        // Normalize paths for comparison on case-insensitive file systems
        const isCaseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';
        const workspaceRootForCompare = isCaseInsensitiveFs
          ? workspaceRootResolved.toLowerCase()
          : workspaceRootResolved;

        // Try to open file atomically without following symlinks
        // First attempt: open existing file for writing
        try {
          fd = openSync(absPath, constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW);
        } catch (err) {
          const error = err as NodeJS.ErrnoException;

          // If file doesn't exist, try to create it
          if (error.code === 'ENOENT') {
            try {
              // O_CREAT | O_EXCL ensures atomic creation (fails if exists)
              // O_NOFOLLOW prevents following symlinks
              fd = openSync(absPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
            } catch (createErr) {
              const createError = createErr as NodeJS.ErrnoException;
              if (createError.code === 'EEXIST') {
                return { success: false, error: 'File was created by another process' };
              }
              if (createError.code === 'ENOENT') {
                return { success: false, error: 'Parent directory does not exist' };
              }
              throw createErr;
            }
          } else if (error.code === 'ELOOP' || error.code === 'EMLINK') {
            return { success: false, error: 'Cannot write to symlinks' };
          } else {
            throw err;
          }
        }

        // Use fstat to verify it's a regular file
        // This is atomic - we're checking the SAME file we just opened
        const stats = fstatSync(fd);

        if (!stats.isFile()) {
          closeSync(fd);
          return { success: false, error: 'Not a regular file' };
        }

        // Verify parent directory is within workspace
        // (protects against hardlinks to files outside workspace)
        const parentDir = path.dirname(absPath);
        const parentReal = realpathSync(parentDir);
        const parentRealForCompare = isCaseInsensitiveFs
          ? parentReal.toLowerCase()
          : parentReal;

        if (!parentRealForCompare.startsWith(workspaceRootForCompare + path.sep) && parentRealForCompare !== workspaceRootForCompare) {
          closeSync(fd);
          return { success: false, error: 'Parent directory resolves outside workspace root' };
        }

        // Write content using the file descriptor
        writeFileSync(fd, content, 'utf-8');

        // Close the file descriptor
        closeSync(fd);
        fd = undefined;

        return { success: true };
      } catch (error) {
        // Ensure file descriptor is closed on error
        if (fd !== undefined) {
          try {
            closeSync(fd);
          } catch {
            // Ignore close errors
          }
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to write file'
        };
      }
    }
  );
}
