/**
 * WSL-Aware Git Command Wrapper
 *
 * Provides functions to execute git commands that automatically detect
 * when the working directory is in WSL and run git through wsl.exe.
 *
 * This allows Auto-Claude on Windows to work seamlessly with git repositories
 * stored in the WSL filesystem.
 */

import { execFileSync, execFile, ChildProcess, spawn, SpawnOptions } from 'child_process';
import { promisify } from 'util';
import { isWSLPath, getWSLDistroFromPath, windowsToWSLPath } from '../shared/utils/wsl-utils';
import { getToolPath } from './cli-tool-manager';
import { getDefaultWSLDistro } from './wsl-detector';

const execFileAsync = promisify(execFile);

export interface GitExecOptions {
  cwd: string;
  encoding?: BufferEncoding;
  timeout?: number;
  env?: NodeJS.ProcessEnv;
}

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Determine the WSL context for a given path
 */
function getWSLGitContext(cwd: string): {
  useWSL: boolean;
  distro: string | null;
  linuxCwd: string;
} {
  if (process.platform !== 'win32') {
    return { useWSL: false, distro: null, linuxCwd: cwd };
  }

  const isWSL = isWSLPath(cwd);

  if (!isWSL) {
    return { useWSL: false, distro: null, linuxCwd: cwd };
  }

  // Extract distro from path, fall back to default
  const distro = getWSLDistroFromPath(cwd) || getDefaultWSLDistro();
  const linuxCwd = windowsToWSLPath(cwd);

  return {
    useWSL: true,
    distro,
    linuxCwd,
  };
}

/**
 * Execute a git command synchronously, automatically using WSL when needed
 *
 * @param args - Git command arguments (without 'git' prefix)
 * @param options - Execution options including cwd
 * @returns Command output as string
 *
 * @example
 * // For Windows path - uses native git
 * execGitSync(['status'], { cwd: 'C:\\projects\\myrepo' })
 *
 * // For WSL path - uses wsl.exe git
 * execGitSync(['status'], { cwd: '\\\\wsl$\\Ubuntu\\home\\user\\myrepo' })
 */
export function execGitSync(args: string[], options: GitExecOptions): string {
  const { cwd, encoding = 'utf-8', timeout = 60000 } = options;
  const wslContext = getWSLGitContext(cwd);

  if (wslContext.useWSL && wslContext.distro) {
    // Run git through WSL using -e with shell command
    // This is more reliable than --cd which can timeout on WSL cold start
    const gitCommand = `cd '${wslContext.linuxCwd}' && git ${args.map(a => `'${a}'`).join(' ')}`;
    const wslArgs = ['-d', wslContext.distro, '-e', 'sh', '-c', gitCommand];

    return execFileSync('wsl.exe', wslArgs, {
      encoding,
      timeout,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  // Standard git execution
  const gitPath = getToolPath('git');
  return execFileSync(gitPath, args, {
    cwd,
    encoding,
    timeout,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/**
 * Execute a git command asynchronously, automatically using WSL when needed
 *
 * @param args - Git command arguments (without 'git' prefix)
 * @param options - Execution options including cwd
 * @returns Promise with stdout and stderr
 */
export async function execGitAsync(args: string[], options: GitExecOptions): Promise<GitExecResult> {
  const { cwd, encoding = 'utf-8', timeout = 60000 } = options;
  const wslContext = getWSLGitContext(cwd);

  if (wslContext.useWSL && wslContext.distro) {
    // Run git through WSL using -e with shell command
    const gitCommand = `cd '${wslContext.linuxCwd}' && git ${args.map(a => `'${a}'`).join(' ')}`;
    const wslArgs = ['-d', wslContext.distro, '-e', 'sh', '-c', gitCommand];

    const result = await execFileAsync('wsl.exe', wslArgs, {
      encoding,
      timeout,
      windowsHide: true,
    });

    return { stdout: result.stdout, stderr: result.stderr };
  }

  // Standard git execution
  const gitPath = getToolPath('git');
  const result = await execFileAsync(gitPath, args, {
    cwd,
    encoding,
    timeout,
    windowsHide: true,
  });

  return { stdout: result.stdout, stderr: result.stderr };
}

/**
 * Spawn a git process, automatically using WSL when needed
 * Returns a ChildProcess for streaming output
 *
 * @param args - Git command arguments (without 'git' prefix)
 * @param options - Spawn options including cwd
 * @returns ChildProcess
 */
export function spawnGit(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; stdio?: SpawnOptions['stdio'] }
): ChildProcess {
  const { cwd, env, stdio } = options;
  const wslContext = getWSLGitContext(cwd);

  if (wslContext.useWSL && wslContext.distro) {
    // Spawn git through WSL using -e with shell command
    const gitCommand = `cd '${wslContext.linuxCwd}' && git ${args.map(a => `'${a}'`).join(' ')}`;
    const wslArgs = ['-d', wslContext.distro, '-e', 'sh', '-c', gitCommand];

    return spawn('wsl.exe', wslArgs, {
      env,
      stdio,
      windowsHide: true,
    });
  }

  // Standard git spawn
  const gitPath = getToolPath('git');
  return spawn(gitPath, args, {
    cwd,
    env,
    stdio,
    windowsHide: true,
  });
}

/**
 * Check if a directory is a valid git repository, WSL-aware
 *
 * @param projectPath - Path to check
 * @returns true if the path is inside a git work tree
 */
export function isGitRepository(projectPath: string): boolean {
  try {
    const result = execGitSync(['rev-parse', '--is-inside-work-tree'], { cwd: projectPath });
    return result.trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Get the current branch name, WSL-aware
 *
 * @param projectPath - Repository path
 * @returns Branch name or null if not in a git repo
 */
export function getCurrentBranch(projectPath: string): string | null {
  try {
    const result = execGitSync(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectPath });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Get git status output, WSL-aware
 *
 * @param projectPath - Repository path
 * @returns Status output
 */
export function getGitStatus(projectPath: string): string {
  return execGitSync(['status', '--porcelain'], { cwd: projectPath });
}

/**
 * Check if the repository has uncommitted changes, WSL-aware
 *
 * @param projectPath - Repository path
 * @returns true if there are uncommitted changes
 */
export function hasUncommittedChanges(projectPath: string): boolean {
  try {
    const status = getGitStatus(projectPath);
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get diff stats between two references, WSL-aware
 *
 * @param projectPath - Repository path
 * @param base - Base reference
 * @param head - Head reference (default: HEAD)
 * @returns Diff stats string
 */
export function getDiffStats(projectPath: string, base: string, head: string = 'HEAD'): string {
  try {
    return execGitSync(['diff', '--stat', `${base}...${head}`], { cwd: projectPath });
  } catch {
    return '';
  }
}

/**
 * Count commits between two references, WSL-aware
 *
 * @param projectPath - Repository path
 * @param base - Base reference
 * @param head - Head reference (default: HEAD)
 * @returns Number of commits
 */
export function getCommitCount(projectPath: string, base: string, head: string = 'HEAD'): number {
  try {
    const result = execGitSync(['rev-list', '--count', `${base}..${head}`], { cwd: projectPath });
    return parseInt(result.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Create a git worktree, WSL-aware
 *
 * @param projectPath - Main repository path
 * @param worktreePath - Path for the new worktree
 * @param branchName - Branch name for the worktree
 * @param startPoint - Starting point (commit/branch) for the new branch
 */
export function createWorktree(
  projectPath: string,
  worktreePath: string,
  branchName: string,
  startPoint: string
): void {
  const wslContext = getWSLGitContext(projectPath);

  if (wslContext.useWSL && wslContext.distro) {
    // Convert worktree path to Linux path too
    const linuxWorktreePath = windowsToWSLPath(worktreePath);
    execGitSync(['worktree', 'add', '-b', branchName, linuxWorktreePath, startPoint], {
      cwd: projectPath,
    });
  } else {
    execGitSync(['worktree', 'add', '-b', branchName, worktreePath, startPoint], {
      cwd: projectPath,
    });
  }
}

/**
 * Remove a git worktree, WSL-aware
 *
 * @param projectPath - Main repository path
 * @param worktreePath - Path of the worktree to remove
 * @param force - Force removal even if dirty
 */
export function removeWorktree(projectPath: string, worktreePath: string, force: boolean = false): void {
  const wslContext = getWSLGitContext(projectPath);
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');

  if (wslContext.useWSL && wslContext.distro) {
    // Convert worktree path to Linux path
    const linuxWorktreePath = windowsToWSLPath(worktreePath);
    args.push(linuxWorktreePath);
    execGitSync(args, { cwd: projectPath });
  } else {
    args.push(worktreePath);
    execGitSync(args, { cwd: projectPath });
  }
}

/**
 * List git worktrees, WSL-aware
 *
 * @param projectPath - Main repository path
 * @returns Array of worktree info objects
 */
export function listWorktrees(
  projectPath: string
): Array<{ path: string; head: string; branch: string | null }> {
  try {
    const output = execGitSync(['worktree', 'list', '--porcelain'], { cwd: projectPath });
    const worktrees: Array<{ path: string; head: string; branch: string | null }> = [];
    let current: { path: string; head: string; branch: string | null } | null = null;

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current) worktrees.push(current);
        current = { path: line.slice(9), head: '', branch: null };
      } else if (line.startsWith('HEAD ') && current) {
        current.head = line.slice(5);
      } else if (line.startsWith('branch ') && current) {
        current.branch = line.slice(7);
      }
    }

    if (current) worktrees.push(current);
    return worktrees;
  } catch {
    return [];
  }
}
