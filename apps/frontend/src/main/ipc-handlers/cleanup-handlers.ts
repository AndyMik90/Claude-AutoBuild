import { ipcMain } from 'electron';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { IPC_CHANNELS } from '../../shared/constants';
import type { IPCResult } from '../../shared/types';
import { PythonEnvManager } from '../python-env-manager';

interface CleanupItem {
  name: string;
  size: number;
  type: 'file' | 'directory';
  specCount?: number;
  worktreeCount?: number;
}

interface CleanupPreview {
  items: CleanupItem[];
  totalSize: number;
  archiveLocation: string;
}

interface CleanupPreviewResult extends IPCResult {
  preview?: CleanupPreview;
}

interface CleanupExecuteResult extends IPCResult {
  count?: number;
  size?: number;
  duration?: number;
}

/**
 * Parse Python script output for cleanup preview
 *
 * Extracts cleanup items, sizes, and archive location from the script's stdout.
 *
 * @param output - Raw stdout from the Python cleanup script
 * @returns Parsed cleanup preview with items and totals, or null if parsing fails
 */
function parseCleanupPreview(output: string): CleanupPreview | null {
  try {
    const lines = output.split('\n');
    const items: CleanupItem[] = [];
    let totalSize = 0;
    let archiveLocation = '';
    let inItemsList = false;

    for (const line of lines) {
      // Check if we're in the items list section
      if (line.includes('The following will be cleaned:')) {
        inItemsList = true;
        continue;
      }

      // Parse total size
      if (line.includes('Total space to be freed:')) {
        const sizeMatch = line.match(/(\d+\.?\d*)\s+(B|KB|MB|GB|TB)/);
        if (sizeMatch) {
          totalSize = parseSizeString(`${sizeMatch[1]} ${sizeMatch[2]}`);
        }
        inItemsList = false;
        continue;
      }

      // Parse archive location
      if (line.includes('Archive location:')) {
        archiveLocation = line.split('Archive location:')[1].trim();
        continue;
      }

      // Parse individual items
      if (inItemsList && line.trim().startsWith('✓')) {
        const itemMatch = line.match(/✓\s+([^\(]+)\(([^\)]+)\)/);
        if (itemMatch) {
          const name = itemMatch[1].trim();
          const details = itemMatch[2];

          // Extract size
          const sizeMatch = details.match(/(\d+\.?\d*)\s+(B|KB|MB|GB|TB)/);
          const size = sizeMatch ? parseSizeString(`${sizeMatch[1]} ${sizeMatch[2]}`) : 0;

          // Extract spec count
          const specMatch = details.match(/(\d+)\s+specs/);
          const specCount = specMatch ? parseInt(specMatch[1], 10) : undefined;

          // Extract worktree count
          const worktreeMatch = details.match(/(\d+)\s+worktrees/);
          const worktreeCount = worktreeMatch ? parseInt(worktreeMatch[1], 10) : undefined;

          items.push({
            name,
            size,
            type: name.endsWith('/') ? 'directory' : 'file',
            specCount,
            worktreeCount,
          });
        }
      }
    }

    if (items.length === 0) {
      return null;
    }

    return { items, totalSize, archiveLocation };
  } catch (error) {
    console.error('Error parsing cleanup preview:', error);
    return null;
  }
}

/**
 * Parse size string to bytes
 *
 * Converts human-readable size strings (e.g., "1.5 MB") to bytes.
 *
 * @param sizeStr - Size string in format "N.N UNIT" (e.g., "1.5 MB")
 * @returns Size in bytes, or 0 if parsing fails
 */
function parseSizeString(sizeStr: string): number {
  const match = sizeStr.match(/(\d+\.?\d*)\s+(B|KB|MB|GB|TB)/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    TB: 1024 * 1024 * 1024 * 1024,
  };

  return value * (multipliers[unit] || 1);
}

/**
 * Parse Python script output for cleanup execution
 *
 * Extracts the count of cleaned items, total size freed, and execution duration.
 *
 * @param output - Raw stdout from the Python cleanup script execution
 * @returns Object with count, size (bytes), and duration (seconds), or null if parsing fails
 */
function parseCleanupResult(output: string): { count: number; size: number; duration: number } | null {
  try {
    const lines = output.split('\n');
    let count = 0;
    let size = 0;
    let duration = 0;
    let foundAnyData = false;

    for (const line of lines) {
      // Parse archived/deleted count and size
      const countMatch = line.match(/(Archived|Deleted)\s+(\d+)\s+items?\s+\(([^\)]+)\)/);
      if (countMatch) {
        foundAnyData = true;
        count = parseInt(countMatch[2], 10);
        const sizeStr = countMatch[3];
        const sizeMatch = sizeStr.match(/(\d+\.?\d*)\s+(B|KB|MB|GB|TB)/);
        if (sizeMatch) {
          size = parseSizeString(`${sizeMatch[1]} ${sizeMatch[2]}`);
        }
      }

      // Parse duration
      const durationMatch = line.match(/Cleanup completed in\s+(\d+\.?\d*)\s+seconds/);
      if (durationMatch) {
        foundAnyData = true;
        duration = parseFloat(durationMatch[1]);
      }
    }

    // Only return data if we found at least one match
    if (!foundAnyData) {
      return null;
    }

    return { count, size, duration };
  } catch (error) {
    console.error('Error parsing cleanup result:', error);
    return null;
  }
}

// Timeout constants for cleanup operations
const CLEANUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes for actual cleanup
const PREVIEW_TIMEOUT_MS = 30 * 1000; // 30 seconds for preview

/**
 * Run Python cleanup command
 *
 * @param pythonEnvManager - Python environment manager instance
 * @param projectPath - Path to the project directory to clean
 * @param dryRun - If true, only preview changes without executing
 * @param preserveArchive - If true, archive data instead of deleting
 * @returns Promise resolving to command output, error, and exit code
 */
async function runCleanupCommand(
  pythonEnvManager: PythonEnvManager,
  projectPath: string,
  dryRun: boolean,
  preserveArchive: boolean
): Promise<{ output: string; error: string; exitCode: number }> {
  return new Promise((resolve) => {
    const pythonPath = pythonEnvManager.getPythonPath();
    if (!pythonPath) {
      resolve({
        output: '',
        error: 'Python environment not ready',
        exitCode: 1,
      });
      return;
    }

    // Find backend directory more robustly by searching for run.py
    // pythonPath is typically: <backend>/.venv/Scripts/python.exe (Windows)
    // or <backend>/.venv/bin/python (Unix)
    let backendPath = path.dirname(pythonPath);

    // Navigate up until we find run.py or reach root
    let runPyPath: string | null = null;
    for (let i = 0; i < 5; i++) {
      backendPath = path.dirname(backendPath);
      const testPath = path.join(backendPath, 'run.py');
      try {
        if (existsSync(testPath)) {
          runPyPath = testPath;
          break;
        }
      } catch {
        // Continue searching
      }
    }

    if (!runPyPath) {
      resolve({
        output: '',
        error: 'Could not locate run.py in backend directory',
        exitCode: 1,
      });
      return;
    }

    // Build command arguments
    const args = [runPyPath, '--clean'];
    if (!dryRun) {
      args.push('--execute');
      args.push('--yes'); // Auto-confirm instead of using stdin timeout
    }
    if (!preserveArchive) {
      args.push('--no-archive');
    }

    args.push('--project-dir', projectPath);

    let output = '';
    let errorOutput = '';
    let resolved = false;

    const cleanupProcess = spawn(pythonPath, args, {
      cwd: backendPath,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    // Set timeout to prevent indefinite hangs
    const timeoutMs = dryRun ? PREVIEW_TIMEOUT_MS : CLEANUP_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanupProcess.kill('SIGTERM');
        resolve({
          output: '',
          error: `Cleanup process timed out after ${timeoutMs / 1000} seconds`,
          exitCode: 1,
        });
      }
    }, timeoutMs);

    cleanupProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    cleanupProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    cleanupProcess.on('close', (code) => {
      clearTimeout(timeoutId);
      if (!resolved) {
        resolved = true;
        resolve({
          output,
          error: errorOutput,
          exitCode: code || 0,
        });
      }
    });

    cleanupProcess.on('error', (err) => {
      clearTimeout(timeoutId);
      if (!resolved) {
        resolved = true;
        resolve({
          output: '',
          error: err.message,
          exitCode: 1,
        });
      }
    });

    // Note: We use --yes flag in args instead of stdin confirmation to avoid race conditions
  });
}

/**
 * Register cleanup IPC handlers
 */
export function registerCleanupHandlers(pythonEnvManager: PythonEnvManager): void {
  console.log('[IPC] Registering cleanup handlers');

  /**
   * Get cleanup preview (dry-run)
   */
  ipcMain.handle(
    IPC_CHANNELS.CLEANUP_PREVIEW,
    async (_, projectPath: string): Promise<CleanupPreviewResult> => {
      try {
        console.log(`[IPC] CLEANUP_PREVIEW called for: ${projectPath}`);

        const { output, error, exitCode } = await runCleanupCommand(
          pythonEnvManager,
          projectPath,
          true, // dry-run
          true  // preserve archive (doesn't matter for dry-run)
        );

        if (exitCode !== 0) {
          console.error(`[IPC] Cleanup preview failed:`, error);
          return {
            success: false,
            error: error || 'Failed to get cleanup preview',
          };
        }

        const preview = parseCleanupPreview(output);
        if (!preview) {
          return {
            success: true,
            preview: {
              items: [],
              totalSize: 0,
              archiveLocation: '',
            },
          };
        }

        console.log(`[IPC] CLEANUP_PREVIEW returning ${preview.items.length} items`);
        return {
          success: true,
          preview,
        };
      } catch (error) {
        console.error('[IPC] CLEANUP_PREVIEW error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  /**
   * Execute cleanup
   */
  ipcMain.handle(
    IPC_CHANNELS.CLEANUP_EXECUTE,
    async (_, projectPath: string, preserveArchive: boolean): Promise<CleanupExecuteResult> => {
      try {
        console.log(
          `[IPC] CLEANUP_EXECUTE called for: ${projectPath}, preserveArchive: ${preserveArchive}`
        );

        const { output, error, exitCode } = await runCleanupCommand(
          pythonEnvManager,
          projectPath,
          false, // not dry-run
          preserveArchive
        );

        if (exitCode !== 0) {
          console.error(`[IPC] Cleanup execution failed:`, error);
          return {
            success: false,
            error: error || 'Failed to execute cleanup',
          };
        }

        const result = parseCleanupResult(output);
        if (!result) {
          return {
            success: false,
            error: 'Failed to parse cleanup result',
          };
        }

        console.log(`[IPC] CLEANUP_EXECUTE completed: ${result.count} items, ${result.size} bytes`);
        return {
          success: true,
          count: result.count ?? 0,
          size: result.size ?? 0,
          duration: result.duration ?? 0,
        };
      } catch (error) {
        console.error('[IPC] CLEANUP_EXECUTE error:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }
  );

  console.log('[IPC] Cleanup handlers registered');
}
