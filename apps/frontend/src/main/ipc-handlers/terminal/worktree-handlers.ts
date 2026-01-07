import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  IPCResult,
  CreateTerminalWorktreeRequest,
  TerminalWorktreeConfig,
  TerminalWorktreeResult,
} from '../../../shared/types';
import path from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { debugLog, debugError } from '../../../shared/utils/debug-logger';
import { projectStore } from '../../project-store';
import { parseEnvFile } from '../utils';
import {
  getTerminalWorktreeDir,
  getTerminalWorktreePath,
} from '../../worktree-paths';

// Shared validation regex for worktree names - lowercase alphanumeric with dashes/underscores
// Must start and end with alphanumeric character
const WORKTREE_NAME_REGEX = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z0-9]$/;

// Validation regex for git branch names - allows alphanumeric, dots, slashes, dashes, underscores
const GIT_BRANCH_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

/**
 * Validate that projectPath is a registered project
 */
function isValidProjectPath(projectPath: string): boolean {
  const projects = projectStore.getProjects();
  return projects.some(p => p.path === projectPath);
}

const MAX_TERMINAL_WORKTREES = 12;

/**
 * Get the default branch from project settings OR env config
 */
function getDefaultBranch(projectPath: string): string {
  const project = projectStore.getProjects().find(p => p.path === projectPath);
  if (project?.settings?.mainBranch) {
    debugLog('[TerminalWorktree] Using mainBranch from project settings:', project.settings.mainBranch);
    return project.settings.mainBranch;
  }

  const envPath = path.join(projectPath, '.auto-claude', '.env');
  if (existsSync(envPath)) {
    try {
      const content = readFileSync(envPath, 'utf-8');
      const vars = parseEnvFile(content);
      if (vars['DEFAULT_BRANCH']) {
        debugLog('[TerminalWorktree] Using DEFAULT_BRANCH from env config:', vars['DEFAULT_BRANCH']);
        return vars['DEFAULT_BRANCH'];
      }
    } catch (error) {
      debugError('[TerminalWorktree] Error reading env file:', error);
    }
  }

  for (const branch of ['main', 'master']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', branch], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      debugLog('[TerminalWorktree] Auto-detected branch:', branch);
      return branch;
    } catch {
      // Branch doesn't exist, try next
    }
  }

  // Fallback to current branch - wrap in try-catch
  try {
    const currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    debugLog('[TerminalWorktree] Falling back to current branch:', currentBranch);
    return currentBranch;
  } catch (error) {
    debugError('[TerminalWorktree] Error detecting current branch:', error);
    return 'main'; // Safe default
  }
}

function saveWorktreeConfig(worktreePath: string, config: TerminalWorktreeConfig): void {
  writeFileSync(path.join(worktreePath, 'config.json'), JSON.stringify(config, null, 2));
}

function loadWorktreeConfig(worktreePath: string): TerminalWorktreeConfig | null {
  const configPath = path.join(worktreePath, 'config.json');
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (error) {
      debugError('[TerminalWorktree] Corrupted config.json in:', configPath, error);
      return null;
    }
  }
  return null;
}

async function createTerminalWorktree(
  request: CreateTerminalWorktreeRequest
): Promise<TerminalWorktreeResult> {
  const { terminalId, name, taskId, createGitBranch, projectPath, baseBranch: customBaseBranch } = request;

  debugLog('[TerminalWorktree] Creating worktree:', { name, taskId, createGitBranch, projectPath, customBaseBranch });

  // Validate projectPath against registered projects
  if (!isValidProjectPath(projectPath)) {
    return {
      success: false,
      error: 'Invalid project path',
    };
  }

  // Validate worktree name - use shared regex (lowercase only)
  if (!WORKTREE_NAME_REGEX.test(name)) {
    return {
      success: false,
      error: 'Invalid worktree name. Use lowercase letters, numbers, dashes, and underscores. Must start and end with alphanumeric.',
    };
  }

  // CRITICAL: Validate customBaseBranch to prevent command injection
  if (customBaseBranch && !GIT_BRANCH_REGEX.test(customBaseBranch)) {
    return {
      success: false,
      error: 'Invalid base branch name',
    };
  }

  const existing = await listTerminalWorktrees(projectPath);
  if (existing.length >= MAX_TERMINAL_WORKTREES) {
    return {
      success: false,
      error: `Maximum of ${MAX_TERMINAL_WORKTREES} terminal worktrees reached.`,
    };
  }

  const worktreePath = getTerminalWorktreePath(projectPath, name);
  const branchName = `terminal/${name}`;
  let directoryCreated = false;

  try {
    if (existsSync(worktreePath)) {
      return { success: false, error: `Worktree '${name}' already exists.` };
    }

    mkdirSync(getTerminalWorktreeDir(projectPath), { recursive: true });
    directoryCreated = true;

    // Use custom base branch if provided, otherwise detect default
    const baseBranch = customBaseBranch || getDefaultBranch(projectPath);
    debugLog('[TerminalWorktree] Using base branch:', baseBranch, customBaseBranch ? '(custom)' : '(default)');

    // Check if baseBranch is already a remote ref (e.g., "origin/feature-x")
    const isRemoteRef = baseBranch.startsWith('origin/');
    const remoteBranchName = isRemoteRef ? baseBranch.replace('origin/', '') : baseBranch;

    // Fetch the branch from remote
    try {
      execFileSync('git', ['fetch', 'origin', remoteBranchName], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      debugLog('[TerminalWorktree] Fetched latest from origin/' + remoteBranchName);
    } catch {
      debugLog('[TerminalWorktree] Could not fetch from remote, continuing with local branch');
    }

    // Determine the base ref to use for worktree creation
    let baseRef = baseBranch;
    if (isRemoteRef) {
      // Already a remote ref, use as-is
      baseRef = baseBranch;
      debugLog('[TerminalWorktree] Using remote ref directly:', baseRef);
    } else {
      // Check if remote version exists and use it for latest code
      try {
        execFileSync('git', ['rev-parse', '--verify', `origin/${baseBranch}`], {
          cwd: projectPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        baseRef = `origin/${baseBranch}`;
        debugLog('[TerminalWorktree] Using remote ref:', baseRef);
      } catch {
        debugLog('[TerminalWorktree] Remote ref not found, using local branch:', baseBranch);
      }
    }

    if (createGitBranch) {
      execFileSync('git', ['worktree', 'add', '-b', branchName, worktreePath, baseRef], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      debugLog('[TerminalWorktree] Created worktree with branch:', branchName, 'from', baseRef);
    } else {
      execFileSync('git', ['worktree', 'add', '--detach', worktreePath, baseRef], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      debugLog('[TerminalWorktree] Created worktree in detached HEAD mode from', baseRef);
    }

    const config: TerminalWorktreeConfig = {
      name,
      worktreePath,
      branchName: createGitBranch ? branchName : '',
      baseBranch,
      hasGitBranch: createGitBranch,
      taskId,
      createdAt: new Date().toISOString(),
      terminalId,
    };

    saveWorktreeConfig(worktreePath, config);
    debugLog('[TerminalWorktree] Saved config for worktree:', name);

    return { success: true, config };
  } catch (error) {
    debugError('[TerminalWorktree] Error creating worktree:', error);

    // Cleanup: remove the worktree directory if git worktree creation failed
    if (directoryCreated && existsSync(worktreePath)) {
      try {
        rmSync(worktreePath, { recursive: true, force: true });
        debugLog('[TerminalWorktree] Cleaned up failed worktree directory:', worktreePath);
        // Also prune stale worktree registrations in case git worktree add partially succeeded
        try {
          execFileSync('git', ['worktree', 'prune'], {
            cwd: projectPath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          debugLog('[TerminalWorktree] Pruned stale worktree registrations');
        } catch {
          // Ignore prune errors - not critical
        }
      } catch (cleanupError) {
        debugError('[TerminalWorktree] Failed to cleanup worktree directory:', cleanupError);
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create worktree',
    };
  }
}

async function listTerminalWorktrees(projectPath: string): Promise<TerminalWorktreeConfig[]> {
  // Validate projectPath against registered projects
  if (!isValidProjectPath(projectPath)) {
    debugError('[TerminalWorktree] Invalid project path for listing:', projectPath);
    return [];
  }

  const configs: TerminalWorktreeConfig[] = [];
  const worktreeDir = getTerminalWorktreeDir(projectPath);

  if (existsSync(worktreeDir)) {
    try {
      for (const dir of readdirSync(worktreeDir, { withFileTypes: true })) {
        if (dir.isDirectory()) {
          const worktreePath = path.join(worktreeDir, dir.name);
          const config = loadWorktreeConfig(worktreePath);
          if (config) {
            configs.push(config);
          }
        }
      }
    } catch (error) {
      debugError('[TerminalWorktree] Error listing worktrees:', error);
    }
  }

  return configs;
}

async function removeTerminalWorktree(
  projectPath: string,
  name: string,
  deleteBranch: boolean = false
): Promise<IPCResult> {
  debugLog('[TerminalWorktree] Removing worktree:', { name, deleteBranch, projectPath });

  // Validate projectPath against registered projects
  if (!isValidProjectPath(projectPath)) {
    return { success: false, error: 'Invalid project path' };
  }

  // Validate worktree name to prevent path traversal
  if (!WORKTREE_NAME_REGEX.test(name)) {
    return { success: false, error: 'Invalid worktree name' };
  }

  const worktreePath = getTerminalWorktreePath(projectPath, name);
  const config = loadWorktreeConfig(worktreePath);

  if (!config) {
    return { success: false, error: 'Worktree not found' };
  }

  try {
    if (existsSync(worktreePath)) {
      execFileSync('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: projectPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      debugLog('[TerminalWorktree] Removed git worktree');
    }

    if (deleteBranch && config.hasGitBranch && config.branchName) {
      // Re-validate branch name from config file (defense in depth - config could be modified)
      if (!GIT_BRANCH_REGEX.test(config.branchName)) {
        debugError('[TerminalWorktree] Invalid branch name in config:', config.branchName);
      } else {
        try {
          execFileSync('git', ['branch', '-D', config.branchName], {
            cwd: projectPath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          debugLog('[TerminalWorktree] Deleted branch:', config.branchName);
        } catch {
          debugLog('[TerminalWorktree] Branch not found or already deleted:', config.branchName);
        }
      }
    }

    return { success: true };
  } catch (error) {
    debugError('[TerminalWorktree] Error removing worktree:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove worktree',
    };
  }
}

export function registerTerminalWorktreeHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_WORKTREE_CREATE,
    async (_, request: CreateTerminalWorktreeRequest): Promise<TerminalWorktreeResult> => {
      return createTerminalWorktree(request);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_WORKTREE_LIST,
    async (_, projectPath: string): Promise<IPCResult<TerminalWorktreeConfig[]>> => {
      try {
        const configs = await listTerminalWorktrees(projectPath);
        return { success: true, data: configs };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list worktrees',
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.TERMINAL_WORKTREE_REMOVE,
    async (
      _,
      projectPath: string,
      name: string,
      deleteBranch: boolean
    ): Promise<IPCResult> => {
      return removeTerminalWorktree(projectPath, name, deleteBranch);
    }
  );
}
