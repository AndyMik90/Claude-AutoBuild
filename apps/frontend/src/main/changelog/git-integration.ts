import { execFileSync } from 'child_process';
import type {
  GitBranchInfo,
  GitTagInfo,
  GitCommit,
  GitHistoryOptions,
  BranchDiffOptions
} from '../../shared/types';
import { parseGitLogOutput } from './parser';
import { getToolPath } from '../cli-tool-manager';

/**
 * Debug logging helper
 */
function debug(enabled: boolean, ...args: unknown[]): void {
  if (enabled) {
    console.warn('[GitIntegration]', ...args);
  }
}

/**
 * Get list of branches for changelog git mode
 */
export function getBranches(projectPath: string, debugEnabled = false): GitBranchInfo[] {
  try {
    // Get current branch
    let currentBranch = '';
    try {
      currentBranch = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: projectPath,
        encoding: 'utf-8'
      }).trim();
    } catch {
      // Ignore - might be in detached HEAD
    }

    // Get all branches (local and remote)
    const output = execFileSync(getToolPath('git'), ['branch', '-a', '--format=%(refname:short)|%(HEAD)'], {
      cwd: projectPath,
      encoding: 'utf-8'
    });

    const branches: GitBranchInfo[] = [];
    const seenNames = new Set<string>();

    // Handle both Unix (\n) and Windows (\r\n) line endings
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const [name, head] = trimmed.split('|');
      if (!name) continue;

      // Skip HEAD references
      if (name === 'HEAD' || name.includes('HEAD')) continue;

      // Parse remote branches (origin/xxx) and mark as remote
      const isRemote = name.startsWith('origin/') || name.includes('/');
      const displayName = isRemote ? name.replace(/^origin\//, '') : name;

      // Skip duplicates (prefer local over remote)
      if (seenNames.has(displayName) && isRemote) continue;
      seenNames.add(displayName);

      branches.push({
        name: displayName,
        isRemote,
        isCurrent: head === '*' || displayName === currentBranch
      });
    }

    // Sort: current first, then local branches, then remote
    return branches.sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      if (!a.isRemote && b.isRemote) return -1;
      if (a.isRemote && !b.isRemote) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    debug(debugEnabled, 'Error getting branches:', error);
    return [];
  }
}

/**
 * Get list of tags for changelog git mode
 */
export function getTags(projectPath: string, debugEnabled = false): GitTagInfo[] {
  try {
    // Get tags sorted by creation date (newest first)
    const output = execFileSync(
      getToolPath('git'),
      ['tag', '-l', '--sort=-creatordate', '--format=%(refname:short)|%(creatordate:iso-strict)|%(objectname:short)'],
      {
        cwd: projectPath,
        encoding: 'utf-8'
      }
    );

    const tags: GitTagInfo[] = [];

    // Handle both Unix (\n) and Windows (\r\n) line endings
    for (const line of output.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parts = trimmed.split('|');
      const name = parts[0];
      const date = parts[1] || undefined;
      const commit = parts[2] || undefined;

      if (name) {
        tags.push({ name, date, commit });
      }
    }

    return tags;
  } catch (error) {
    debug(debugEnabled, 'Error getting tags:', error);
    return [];
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(projectPath: string): string {
  try {
    return execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8'
    }).trim();
  } catch {
    return 'main';
  }
}

/**
 * Get the default/main branch name
 */
export function getDefaultBranch(projectPath: string): string {
  try {
    // Try to get from origin/HEAD
    const result = execFileSync(getToolPath('git'), ['rev-parse', '--abbrev-ref', 'origin/HEAD'], {
      cwd: projectPath,
      encoding: 'utf-8'
    }).trim();
    return result.replace('origin/', '');
  } catch {
    // Fallback: check if main or master exists
    try {
      execFileSync(getToolPath('git'), ['rev-parse', '--verify', 'main'], {
        cwd: projectPath,
        encoding: 'utf-8'
      });
      return 'main';
    } catch {
      try {
        execFileSync(getToolPath('git'), ['rev-parse', '--verify', 'master'], {
          cwd: projectPath,
          encoding: 'utf-8'
        });
        return 'master';
      } catch {
        return 'main';
      }
    }
  }
}

/**
 * Get commits for git-history mode
 */
export function getCommits(
  projectPath: string,
  options: GitHistoryOptions,
  debugEnabled = false
): GitCommit[] {
  try {
    // Build the git log command based on options
    const format = '%h|%H|%s|%an|%ae|%aI';
    const args = ['log', `--pretty=format:${format}`];

    // Add merge commit handling
    if (!options.includeMergeCommits) {
      args.push('--no-merges');
    }

    // Add range/filters based on type
    switch (options.type) {
      case 'recent':
        args.push('-n', String(options.count || 25));
        break;
      case 'since-date':
        if (options.sinceDate) {
          args.push(`--since=${options.sinceDate}`);
        }
        break;
      case 'tag-range':
        if (options.fromTag) {
          const toRef = options.toTag || 'HEAD';
          args.push(`${options.fromTag}..${toRef}`);
        }
        break;
      case 'since-version':
        // Get all commits since the specified version/tag up to HEAD
        if (options.fromTag) {
          args.push(`${options.fromTag}..HEAD`);
        }
        break;
    }

    debug(debugEnabled, 'Getting commits with args:', args);

    const output = execFileSync(getToolPath('git'), args, {
      cwd: projectPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large histories
    });

    return parseGitLogOutput(output);
  } catch (error) {
    debug(debugEnabled, 'Error getting commits:', error);
    return [];
  }
}

/**
 * Get commits between two branches (for branch-diff mode)
 */
export function getBranchDiffCommits(
  projectPath: string,
  options: BranchDiffOptions,
  debugEnabled = false
): GitCommit[] {
  try {
    const format = '%h|%H|%s|%an|%ae|%aI';
    // Get commits in compareBranch that are not in baseBranch
    const args = ['log', `--pretty=format:${format}`, '--no-merges', `${options.baseBranch}..${options.compareBranch}`];

    debug(debugEnabled, 'Getting branch diff commits with args:', args);

    const output = execFileSync(getToolPath('git'), args, {
      cwd: projectPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });

    return parseGitLogOutput(output);
  } catch (error) {
    debug(debugEnabled, 'Error getting branch diff commits:', error);
    return [];
  }
}
