import type { ChangelogTask, ChangelogSourceMode, GitCommit } from '../../../shared/types';

export interface SummaryInfo {
  count: number;
  label: string;
  details: string;
}

export function getSummaryInfo(
  sourceMode: ChangelogSourceMode,
  selectedTaskIds: string[],
  selectedTasks: ChangelogTask[],
  previewCommits: GitCommit[]
): SummaryInfo {
  switch (sourceMode) {
    case 'tasks':
      return {
        count: selectedTaskIds.length,
        label: 'task',
        details: selectedTasks.slice(0, 3).map((t) => t.title).join(', ') +
          (selectedTasks.length > 3 ? ` +${selectedTasks.length - 3} more` : '')
      };
    case 'git-history':
    case 'branch-diff':
      return {
        count: previewCommits.length,
        label: 'commit',
        details: previewCommits.slice(0, 3).map((c) => c.subject.substring(0, 40)).join(', ') +
          (previewCommits.length > 3 ? ` +${previewCommits.length - 3} more` : '')
      };
    default:
      return { count: 0, label: 'item', details: '' };
  }
}

export function formatVersionTag(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function getVersionBumpDescription(versionReason: string | null): string | null {
  if (!versionReason) return null;

  switch (versionReason) {
    case 'breaking':
      return 'Major version bump (breaking changes detected)';
    case 'feature':
      return 'Minor version bump (new features detected)';
    default:
      return 'Patch version bump (fixes/improvements)';
  }
}
