/**
 * Worktree Setup Executor
 *
 * Executes user-defined setup commands in worktree directories when tasks
 * transition to Human Review status. Similar to Cursor's worktree setup feature.
 *
 * Available environment variables in commands:
 * - $ROOT_WORKTREE_PATH: Path to .worktrees directory
 * - $WORKTREE_PATH: Full path to this specific worktree
 * - $SPEC_NAME: Name of the spec (e.g., "001-feature-name")
 * - $PROJECT_PATH: Path to the main project directory
 *
 * Variables are passed as environment variables, so paths with spaces work correctly.
 * Use "$VAR" (with quotes) in your commands for paths that may contain spaces.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import type {
  WorktreeSetupConfig,
  WorktreeSetupResult,
  WorktreeSetupCommandResult
} from '../shared/types';
import {
  DEFAULT_WORKTREE_SETUP_TIMEOUT_MS,
  MAX_COMMAND_OUTPUT_LENGTH
} from '../shared/constants';

/**
 * Variables available for substitution in setup commands
 */
interface SetupVariables {
  ROOT_WORKTREE_PATH: string;
  WORKTREE_PATH: string;
  SPEC_NAME: string;
  PROJECT_PATH: string;
}

/**
 * Context for executing worktree setup
 */
export interface WorktreeSetupContext {
  projectPath: string;
  specId: string;
  config: WorktreeSetupConfig;
}

/**
 * Truncate output string to maximum length, preserving tail
 */
function truncateOutput(output: string, maxLength: number = MAX_COMMAND_OUTPUT_LENGTH): string {
  if (output.length <= maxLength) {
    return output;
  }
  const truncatedPrefix = '[...truncated...]\n';
  return truncatedPrefix + output.slice(-(maxLength - truncatedPrefix.length));
}

/**
 * Validates that a worktree path is within the expected project boundaries.
 * Prevents path traversal attacks via "../" sequences.
 */
function validateWorktreePath(worktreePath: string, projectPath: string): boolean {
  const resolvedWorktree = path.resolve(worktreePath);
  const resolvedProject = path.resolve(projectPath);
  const worktreesDir = path.join(resolvedProject, '.worktrees');

  // Worktree must be within .worktrees directory
  return (
    resolvedWorktree.startsWith(worktreesDir + path.sep) ||
    resolvedWorktree === worktreesDir
  );
}

/**
 * Patterns that indicate sensitive data in command output.
 * These will be redacted from logs (but kept in the actual result).
 */
const SENSITIVE_PATTERNS = [
  /(?:api[_-]?key|apikey|secret|password|token|credential|auth)[=:]\s*['"]?[\w\-.]+['"]?/gi,
  /Bearer\s+[\w\-.]+/gi,
  /sk-[a-zA-Z0-9]{20,}/g,
  /ghp_[a-zA-Z0-9]{36}/g,
  /npm_[a-zA-Z0-9]{36}/g,
];

/**
 * Redact sensitive information from output for logging purposes.
 * The original output is preserved in the result, only console logs are sanitized.
 */
function sanitizeForLogging(output: string): string {
  let sanitized = output;
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}



async function executeCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  variables: SetupVariables
): Promise<WorktreeSetupCommandResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    const proc = spawn(shell, shellArgs, {
      cwd,
      env: {
        ...process.env,
        ROOT_WORKTREE_PATH: variables.ROOT_WORKTREE_PATH,
        WORKTREE_PATH: variables.WORKTREE_PATH,
        SPEC_NAME: variables.SPEC_NAME,
        PROJECT_PATH: variables.PROJECT_PATH,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let killTimeoutId: NodeJS.Timeout | null = null;

    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill('SIGTERM');

        killTimeoutId = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // Process may already be dead
          }
          killTimeoutId = null;
        }, 5000);

        const durationMs = Date.now() - startTime;
        resolve({
          command,
          success: false,
          exitCode: null,
          stdout: truncateOutput(stdout),
          stderr: truncateOutput(stderr + '\n[Command timed out]'),
          durationMs
        });
      }
    }, timeoutMs);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (killTimeoutId) clearTimeout(killTimeoutId);

      const durationMs = Date.now() - startTime;
      resolve({
        command,
        success: code === 0,
        exitCode: code,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        durationMs
      });
    });

    proc.on('error', (err: Error) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (killTimeoutId) clearTimeout(killTimeoutId);

      const durationMs = Date.now() - startTime;

      let errorMessage = `Failed to spawn process: ${err.message}`;
      const nodeError = err as NodeJS.ErrnoException;
      if (nodeError.code === 'EMFILE' || nodeError.code === 'ENFILE') {
        errorMessage = `System file descriptor limit reached. Close other apps or increase ulimit. (${nodeError.code})`;
      } else if (nodeError.code === 'ENOENT') {
        errorMessage = 'Command not found. Ensure it is installed and in PATH.';
      } else if (nodeError.code === 'EACCES') {
        errorMessage = 'Permission denied. Check file permissions.';
      }

      resolve({
        command,
        success: false,
        exitCode: null,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(errorMessage),
        durationMs
      });
    });
  });
}

/**
 * Execute all worktree setup commands for a task
 *
 * Commands are executed sequentially in the worktree directory.
 * If any command fails, subsequent commands are still executed.
 *
 * @param context - The setup context with project path, spec ID, and config
 * @returns The result of all command executions
 */
export async function executeWorktreeSetup(
  context: WorktreeSetupContext
): Promise<WorktreeSetupResult> {
  const { projectPath, specId, config } = context;
  const startTime = Date.now();

  if (!config.enabled) {
    return {
      success: true,
      executedAt: new Date().toISOString(),
      commands: [],
      totalDurationMs: 0
    };
  }

  if (!config.commands || config.commands.length === 0) {
    return {
      success: true,
      executedAt: new Date().toISOString(),
      commands: [],
      totalDurationMs: 0
    };
  }

  // Calculate paths
  const rootWorktreePath = path.join(projectPath, '.worktrees');
  const worktreePath = path.join(rootWorktreePath, specId);

  // Verify worktree exists
  if (!existsSync(worktreePath)) {
    return {
      success: false,
      executedAt: new Date().toISOString(),
      commands: [],
      totalDurationMs: Date.now() - startTime,
      error: `Worktree directory not found: ${worktreePath}`
    };
  }

  if (!validateWorktreePath(worktreePath, projectPath)) {
    return {
      success: false,
      executedAt: new Date().toISOString(),
      commands: [],
      totalDurationMs: Date.now() - startTime,
      error: 'Security error: Worktree path outside project boundaries'
    };
  }

  // Prepare variables for substitution
  const variables: SetupVariables = {
    ROOT_WORKTREE_PATH: rootWorktreePath,
    WORKTREE_PATH: worktreePath,
    SPEC_NAME: specId,
    PROJECT_PATH: projectPath
  };

  const totalTimeout = config.timeout || DEFAULT_WORKTREE_SETUP_TIMEOUT_MS;
  const MIN_COMMAND_TIMEOUT_MS = 30_000;
  const calculatedPerCommand = Math.floor(totalTimeout / config.commands.length);
  const perCommandTimeout = Math.max(calculatedPerCommand, MIN_COMMAND_TIMEOUT_MS);

  // Execute commands sequentially
  const commandResults: WorktreeSetupCommandResult[] = [];
  let allSucceeded = true;

  console.log(`[WorktreeSetup] Executing ${config.commands.length} commands in ${worktreePath}`);

  for (const command of config.commands) {
    console.log(`[WorktreeSetup] Running: ${command}`);

    const result = await executeCommand(command, worktreePath, perCommandTimeout, variables);
    commandResults.push(result);

    if (!result.success) {
      allSucceeded = false;
      console.warn(`[WorktreeSetup] Command failed: ${command}`);
      console.warn(`[WorktreeSetup] Exit code: ${result.exitCode}`);
      if (result.stderr) {
        console.warn(`[WorktreeSetup] Stderr: ${sanitizeForLogging(result.stderr).substring(0, 500)}`);
      }
    } else {
      console.log(`[WorktreeSetup] Command succeeded: ${command} (${result.durationMs}ms)`);
    }
  }

  const totalDurationMs = Date.now() - startTime;
  console.log(`[WorktreeSetup] Completed. Success: ${allSucceeded}, Duration: ${totalDurationMs}ms`);

  return {
    success: allSucceeded,
    executedAt: new Date().toISOString(),
    commands: commandResults,
    totalDurationMs
  };
}

/**
 * Check if worktree setup should be executed for a task
 */
export function shouldExecuteSetup(config: WorktreeSetupConfig | undefined): boolean {
  return !!(config?.enabled && config.commands && config.commands.length > 0);
}

export const _testExports = {
  truncateOutput,
  validateWorktreePath,
  sanitizeForLogging,
  SENSITIVE_PATTERNS
};
