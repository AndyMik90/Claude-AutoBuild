import {
  GitBranch,
  FileCode,
  Plus,
  Minus,
  Eye,
  ExternalLink,
  GitMerge,
  FolderX,
  Loader2,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  GitCommit,
  Terminal
} from 'lucide-react';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { cn } from '../../../lib/utils';
import type { Task, WorktreeStatus, MergeConflict, MergeStats, GitConflictInfo } from '../../../../shared/types';

interface WorkspaceStatusProps {
  task: Task;
  worktreeStatus: WorktreeStatus;
  workspaceError: string | null;
  stageOnly: boolean;
  mergePreview: { files: string[]; conflicts: MergeConflict[]; summary: MergeStats; gitConflicts?: GitConflictInfo; uncommittedChanges?: { hasChanges: boolean; files: string[]; count: number } | null } | null;
  isLoadingPreview: boolean;
  isMerging: boolean;
  isDiscarding: boolean;
  onShowDiffDialog: (show: boolean) => void;
  onShowDiscardDialog: (show: boolean) => void;
  onShowConflictDialog: (show: boolean) => void;
  onLoadMergePreview: () => void;
  onStageOnlyChange: (value: boolean) => void;
  onMerge: () => void;
}

/**
 * Displays the workspace status including change summary, merge preview, and action buttons
 */
export function WorkspaceStatus({
  task,
  worktreeStatus,
  workspaceError,
  stageOnly,
  mergePreview,
  isLoadingPreview,
  isMerging,
  isDiscarding,
  onShowDiffDialog,
  onShowDiscardDialog,
  onShowConflictDialog,
  onLoadMergePreview,
  onStageOnlyChange,
  onMerge
}: WorkspaceStatusProps) {
  const hasGitConflicts = mergePreview?.gitConflicts?.hasConflicts;
  const hasUncommittedChanges = mergePreview?.uncommittedChanges?.hasChanges;
  const uncommittedCount = mergePreview?.uncommittedChanges?.count || 0;
  const hasAIConflicts = mergePreview && mergePreview.conflicts.length > 0;

  // Determine overall status
  const statusColor = hasGitConflicts
    ? 'warning'
    : hasUncommittedChanges
      ? 'warning'
      : mergePreview && !hasAIConflicts
        ? 'success'
        : 'info';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header with stats */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm text-foreground flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-purple-400" />
            Build Ready for Review
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onShowDiffDialog(true)}
              className="h-7 px-2 text-xs"
            >
              <Eye className="h-3.5 w-3.5 mr-1" />
              View
            </Button>
            {worktreeStatus.worktreePath && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.electronAPI.createTerminal({
                    id: `open-${task.id}`,
                    cwd: worktreeStatus.worktreePath!
                  });
                }}
                className="h-7 px-2"
                title="Open in terminal"
              >
                <Terminal className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Compact stats row */}
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <FileCode className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{worktreeStatus.filesChanged || 0}</span> files
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <GitCommit className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">{worktreeStatus.commitCount || 0}</span> commits
          </span>
          <span className="flex items-center gap-1 text-success">
            <Plus className="h-3.5 w-3.5" />
            <span className="font-medium">{worktreeStatus.additions || 0}</span>
          </span>
          <span className="flex items-center gap-1 text-destructive">
            <Minus className="h-3.5 w-3.5" />
            <span className="font-medium">{worktreeStatus.deletions || 0}</span>
          </span>
        </div>

        {/* Branch info */}
        {worktreeStatus.branch && (
          <div className="mt-2 text-xs text-muted-foreground">
            <code className="bg-background/80 px-1.5 py-0.5 rounded text-[11px]">{worktreeStatus.branch}</code>
            <span className="mx-1.5">→</span>
            <code className="bg-background/80 px-1.5 py-0.5 rounded text-[11px]">{worktreeStatus.baseBranch || 'main'}</code>
          </div>
        )}
      </div>

      {/* Status/Warnings Section */}
      <div className="px-4 py-3 space-y-3">
        {/* Workspace Error */}
        {workspaceError && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{workspaceError}</p>
          </div>
        )}

        {/* Uncommitted Changes Warning */}
        {hasUncommittedChanges && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-warning/10 border border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">
                {uncommittedCount} uncommitted {uncommittedCount === 1 ? 'change' : 'changes'} in main project
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Commit or stash them before staging to avoid conflicts.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.electronAPI.createTerminal({
                    id: `stash-${task.id}`,
                    cwd: worktreeStatus.worktreePath?.replace('.worktrees/' + task.specId, '') || undefined
                  });
                }}
                className="text-xs h-6 mt-2"
              >
                <Terminal className="h-3 w-3 mr-1" />
                Open Terminal
              </Button>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {isLoadingPreview && !mergePreview && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking for conflicts...
          </div>
        )}

        {/* Merge Status */}
        {mergePreview && (
          <div className={cn(
            "flex items-center justify-between p-2.5 rounded-lg border",
            hasGitConflicts
              ? "bg-warning/10 border-warning/20"
              : !hasAIConflicts
                ? "bg-success/10 border-success/20"
                : "bg-warning/10 border-warning/20"
          )}>
            <div className="flex items-center gap-2">
              {hasGitConflicts ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <div>
                    <span className="text-sm font-medium text-warning">Branch Diverged</span>
                    <span className="text-xs text-muted-foreground ml-2">AI will resolve</span>
                  </div>
                </>
              ) : !hasAIConflicts ? (
                <>
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">Ready to merge</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {mergePreview.summary.totalFiles} files
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium text-warning">
                    {mergePreview.conflicts.length} conflict{mergePreview.conflicts.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {(hasGitConflicts || hasAIConflicts) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onShowConflictDialog(true)}
                  className="h-7 text-xs"
                >
                  Details
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadMergePreview}
                disabled={isLoadingPreview}
                className="h-7 px-2"
                title="Refresh"
              >
                {isLoadingPreview ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Git Conflicts Details */}
        {hasGitConflicts && mergePreview?.gitConflicts && (
          <div className="text-xs text-muted-foreground pl-6">
            Main branch has {mergePreview.gitConflicts.commitsBehind} new commit{mergePreview.gitConflicts.commitsBehind !== 1 ? 's' : ''}.
            {mergePreview.gitConflicts.conflictingFiles.length > 0 && (
              <span className="text-warning">
                {' '}{mergePreview.gitConflicts.conflictingFiles.length} file{mergePreview.gitConflicts.conflictingFiles.length !== 1 ? 's' : ''} need merging.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions Footer */}
      <div className="px-4 py-3 bg-muted/20 border-t border-border space-y-3">
        {/* Stage Only Option */}
        <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer select-none px-3 py-2 rounded-lg border border-border bg-background/50 hover:bg-background/80 transition-colors">
          <Checkbox
            checked={stageOnly}
            onCheckedChange={(checked) => onStageOnlyChange(checked === true)}
            className="border-muted-foreground/50 data-[state=checked]:border-primary"
          />
          <span className={cn(
            "transition-colors",
            stageOnly ? "text-foreground" : "text-muted-foreground"
          )}>Stage only (review in IDE before committing)</span>
        </label>

        {/* Primary Actions */}
        <div className="flex gap-2">
          <Button
            variant={hasGitConflicts ? "warning" : "success"}
            onClick={onMerge}
            disabled={isMerging || isDiscarding}
            className="flex-1"
          >
            {isMerging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {hasGitConflicts ? 'Resolving...' : stageOnly ? 'Staging...' : 'Merging...'}
              </>
            ) : (
              <>
                <GitMerge className="mr-2 h-4 w-4" />
                {hasGitConflicts
                  ? (stageOnly ? 'Stage with AI Merge' : 'Merge with AI')
                  : (stageOnly ? 'Stage Changes' : 'Merge to Main')}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onShowDiscardDialog(true)}
            disabled={isMerging || isDiscarding}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
            title="Discard build"
          >
            <FolderX className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
