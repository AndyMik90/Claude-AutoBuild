import { ipcMain } from 'electron';
import { readdirSync, readFileSync, writeFileSync, realpathSync, lstatSync, openSync, fstatSync, closeSync, constants, existsSync, statSync } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
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
      // Check if workspace root exists before calling realpathSync
      if (!existsSync(workspaceRoot)) {
        return { valid: false, error: 'Workspace root does not exist' };
      }

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
            // Re-stat the resolved target (use statSync since targetReal is already resolved)
            stats = statSync(targetReal);
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

          // Skip hidden files and directories (names starting with '.')
          if (entry.name.startsWith('.')) {
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
          if (error.code === 'ELOOP') {
            // Provide more informative error by checking where symlink points
            // (safe to do since we're NOT using it, just for error message)
            try {
              const targetReal = realpathSync(absPath);
              const targetRealForCompare = isCaseInsensitiveFs
                ? targetReal.toLowerCase()
                : targetReal;
              if (!targetRealForCompare.startsWith(workspaceRootForCompare + path.sep) && targetRealForCompare !== workspaceRootForCompare) {
                return { success: false, error: 'Symlink target is outside workspace root' };
              }
            } catch {
              // If we can't resolve it, just say symlinks not allowed
            }
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
          } else if (error.code === 'EISDIR') {
            return { success: false, error: 'Not a file' };
          } else if (error.code === 'ELOOP') {
            // Provide more informative error by checking where symlink points
            // (safe to do since we're NOT using it, just for error message)
            try {
              const targetReal = realpathSync(absPath);
              const targetRealForCompare = isCaseInsensitiveFs
                ? targetReal.toLowerCase()
                : targetReal;
              if (!targetRealForCompare.startsWith(workspaceRootForCompare + path.sep) && targetRealForCompare !== workspaceRootForCompare) {
                return { success: false, error: 'Symlink target is outside workspace root' };
              }
            } catch {
              // If we can't resolve it, just say symlinks not allowed
            }
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

  // ============================================
  // Code Editor Search (using ripgrep)
  // ============================================

  interface SearchMatch {
    line: number;
    column: number;
    preview: string;
  }

  interface SearchResult {
    relPath: string;
    matches: SearchMatch[];
  }

  interface SearchOptions {
    glob?: string;
    caseSensitive?: boolean;
    maxResults?: number;
  }

  // Search text using ripgrep (workspace-scoped)
  ipcMain.handle(
    IPC_CHANNELS.CODE_EDITOR_SEARCH_TEXT,
    async (_, workspaceRoot: string, query: string, options: SearchOptions = {}): Promise<IPCResult<SearchResult[]>> => {
      try {
        // Validate workspace root exists
        if (!existsSync(workspaceRoot)) {
          return { success: false, error: 'Workspace root does not exist' };
        }

        const workspaceRootResolved = realpathSync(workspaceRoot);

        // Validate query
        if (!query || query.trim() === '') {
          return { success: true, data: [] };
        }

        const maxResults = options.maxResults ?? 2000;
        const caseSensitive = options.caseSensitive ?? false;

        // Build ripgrep arguments
        const args: string[] = [
          '--json',              // Output JSON for structured parsing
          '--max-count', '100',  // Max 100 matches per file
        ];

        if (!caseSensitive) {
          args.push('--ignore-case');
        }

        // Add ignore patterns for common directories
        const ignorePatterns = [
          'node_modules/**',
          '.git/**',
          '.worktrees/**',
          '__pycache__/**',
          'dist/**',
          'build/**',
          'Library/**',   // Unity
          'Temp/**',      // Unity
          'Obj/**',       // Unity
          'Logs/**',      // Unity
          '.venv/**',
          'venv/**',
          '.cache/**',
          'coverage/**',
          'out/**',
          '.turbo/**',
        ];

        ignorePatterns.forEach(pattern => {
          args.push('--glob', `!${pattern}`);
        });

        const isSafeGlob = (pattern: string): boolean => {
          // Basic sanity checks to avoid excessively complex or malformed patterns
          // Limit overall length
          if (pattern.length > 256) {
            return false;
          }

          // Disallow control characters
          if (/[\0-\x1F]/.test(pattern)) {
            return false;
          }

          // Limit the total number of wildcard-like characters
          const wildcardMatches = pattern.match(/[*?\[\]]/g);
          if (wildcardMatches && wildcardMatches.length > 50) {
            return false;
          }

          // Limit the number of double-star segments
          const doubleStarMatches = pattern.match(/\*\*/g);
          if (doubleStarMatches && doubleStarMatches.length > 10) {
            return false;
          }

          return true;
        };

        // Add user-provided glob filter if specified
        if (options.glob) {
          const userGlob = options.glob;
          if (typeof userGlob === 'string' && isSafeGlob(userGlob)) {
            args.push('--glob', userGlob);
          }
        }

        // Add the search query
        args.push('--', query);

        // Spawn ripgrep process
        return new Promise((resolve) => {
          const rg = spawn('rg', args, {
            cwd: workspaceRootResolved,
            timeout: 10000, // 10 second timeout
          });

          const results: SearchResult[] = [];
          const resultsByFile = new Map<string, SearchMatch[]>();
          let totalMatches = 0;
          const MAX_SEARCH_OUTPUT_BYTES = 5 * 1024 * 1024; // 5 MB cap per stream
          let stdout = '';
          let stderr = '';
          let stdoutBytes = 0;
          let stderrBytes = 0;

          rg.stdout.on('data', (data: Buffer) => {
            if (stdoutBytes >= MAX_SEARCH_OUTPUT_BYTES) {
              return;
            }
            const remaining = MAX_SEARCH_OUTPUT_BYTES - stdoutBytes;
            const chunk = remaining >= data.length ? data : data.subarray(0, remaining);
            stdout += chunk.toString();
            stdoutBytes += chunk.length;
          });

          rg.stderr.on('data', (data: Buffer) => {
            if (stderrBytes >= MAX_SEARCH_OUTPUT_BYTES) {
              return;
            }
            const remaining = MAX_SEARCH_OUTPUT_BYTES - stderrBytes;
            const chunk = remaining >= data.length ? data : data.subarray(0, remaining);
            stderr += chunk.toString();
            stderrBytes += chunk.length;
          });

          rg.on('close', (code) => {
            // rg returns 0 for matches found, 1 for no matches, 2 for error
            if (code === 2) {
              // Check if rg is not installed
              if (stderr.includes('command not found') || stderr.includes('not recognized')) {
                resolve({ success: false, error: 'ripgrep (rg) is not installed. Please install ripgrep to use search.' });
              } else {
                resolve({ success: false, error: `Search error: ${stderr}` });
              }
              return;
            }

            // Parse JSON output
            const lines = stdout.trim().split('\n');
            for (const line of lines) {
              if (!line || totalMatches >= maxResults) break;

              try {
                const parsed = JSON.parse(line);

                // rg --json outputs different message types
                if (parsed.type === 'match') {
                  const data = parsed.data;
                  const filePath = data.path.text;

                  // Validate path is within workspace
                  const absPath = path.resolve(workspaceRootResolved, filePath);

                  // Normalize paths for comparison
                  const isCaseInsensitiveFs = process.platform === 'win32' || process.platform === 'darwin';
                  const workspaceForCompare = isCaseInsensitiveFs
                    ? workspaceRootResolved.toLowerCase()
                    : workspaceRootResolved;
                  const absPathForCompare = isCaseInsensitiveFs
                    ? absPath.toLowerCase()
                    : absPath;

                  // Skip if path escapes workspace
                  if (!absPathForCompare.startsWith(workspaceForCompare + path.sep) && absPathForCompare !== workspaceForCompare) {
                    continue;
                  }

                  // Get relative path (use forward slashes for consistency)
                  const relPath = path.relative(workspaceRootResolved, absPath).split(path.sep).join('/');

                  // Extract match details
                  const lineNumber = data.line_number;
                  const lineText = data.lines.text.trimEnd();

                  // Get column from submatch if available
                  let column = 1;
                  if (data.submatches && data.submatches.length > 0) {
                    column = data.submatches[0].start + 1; // rg uses 0-based, we use 1-based
                  }

                  // Add to results
                  if (!resultsByFile.has(relPath)) {
                    resultsByFile.set(relPath, []);
                  }

                  resultsByFile.get(relPath)!.push({
                    line: lineNumber,
                    column,
                    preview: lineText
                  });

                  totalMatches++;
                }
              } catch (err) {
                // Skip malformed JSON lines
                continue;
              }
            }

            // Convert map to array
            for (const [relPath, matches] of resultsByFile.entries()) {
              results.push({
                relPath,
                matches
              });
            }

            // Sort results by file path
            results.sort((a, b) => a.relPath.localeCompare(b.relPath));

            resolve({ success: true, data: results });
          });

          rg.on('error', (error) => {
            if ((error as any).code === 'ENOENT') {
              resolve({ success: false, error: 'ripgrep (rg) is not installed. Please install ripgrep to use search.' });
            } else {
              resolve({ success: false, error: error.message });
            }
          });
        });
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Search failed'
        };
      }
    }
  );
}
