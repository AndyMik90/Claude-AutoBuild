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
  AlertTriangle
} from 'lucide-react';
import { Button } from '../../ui/button';
import { MergePreviewSummary } from './MergePreviewSummary';
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

  return (
    <div className="review-section-highlight">
      <h3 className="font-medium text-sm text-foreground mb-3 flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-purple-400" />
        Build Ready for Review
      </h3>

      {/* Change Summary */}
      <div className="bg-background/50 rounded-lg p-3 mb-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Files changed:</span>
            <span className="text-foreground font-medium">{worktreeStatus.filesChanged || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Commits:</span>
            <span className="text-foreground font-medium">{worktreeStatus.commitCount || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-success" />
            <span className="text-muted-foreground">Additions:</span>
            <span className="text-success font-medium">+{worktreeStatus.additions || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <Minus className="h-4 w-4 text-destructive" />
            <span className="text-muted-foreground">Deletions:</span>
            <span className="text-destructive font-medium">-{worktreeStatus.deletions || 0}</span>
          </div>
        </div>
        {worktreeStatus.branch && (
          <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
            Branch: <code className="bg-background px-1 rounded">{worktreeStatus.branch}</code>
            {' → '}
            <code className="bg-background px-1 rounded">{worktreeStatus.baseBranch || 'main'}</code>
          </div>
        )}
      </div>

      {/* Workspace Error */}
      {workspaceError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-3">
          <p className="text-sm text-destructive">{workspaceError}</p>
        </div>
      )}

      {/* Uncommitted Changes Warning */}
      {hasUncommittedChanges && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 mb-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">
                Uncommitted Changes Detected
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Your main project has {uncommittedCount} uncommitted {uncommittedCount === 1 ? 'change' : 'changes'}.
                Please commit or stash them before staging to avoid conflicts.
              </p>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.electronAPI.createTerminal({
                      id: `stash-${task.id}`,
                      cwd: worktreeStatus.worktreePath?.replace('.worktrees/' + task.specId, '') || undefined
                    });
                  }}
                  className="text-xs h-7"
                >
                  Open Terminal to Stash
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onShowDiffDialog(true)}
          className="flex-1"
        >
          <Eye className="mr-2 h-4 w-4" />
          View Changes
        </Button>
        {mergePreview && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              console.warn('[WorkspaceStatus] Refresh conflicts clicked');
              onLoadMergePreview();
            }}
            disabled={isLoadingPreview}
            className="flex-none"
            title="Refresh conflict check"
          >
            {isLoadingPreview ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
          </Button>
        )}
        {worktreeStatus.worktreePath && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.electronAPI.createTerminal({
                id: `open-${task.id}`,
                cwd: worktreeStatus.worktreePath!
              });
            }}
            className="flex-none"
            title="Open worktree in terminal"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Loading indicator while checking conflicts */}
      {isLoadingPreview && !mergePreview && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm mb-3">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking for conflicts...
        </div>
      )}

      {/* Merge Preview Summary */}
      {mergePreview && (
        <MergePreviewSummary
          mergePreview={mergePreview}
          onShowConflictDialog={onShowConflictDialog}
        />
      )}

      {/* Stage Only Option */}
      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={stageOnly}
          onChange={(e) => onStageOnlyChange(e.target.checked)}
          className="rounded border-border"
        />
        <span>Stage only (review in IDE before committing)</span>
      </label>

      {/* Primary Actions */}
      <div className="flex gap-2">
        <Button
          variant={hasGitConflicts ? "warning" : "success"}
          onClick={onMerge}
          disabled={isMerging || isDiscarding}
          className="flex-1"
          title={hasGitConflicts ? "AI will resolve conflicts automatically" : undefined}
        >
          {isMerging ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {hasGitConflicts
                ? 'AI Resolving Conflicts...'
                : stageOnly ? 'Staging...' : 'Merging...'}
            </>
          ) : hasGitConflicts ? (
            <>
              <GitMerge className="mr-2 h-4 w-4" />
              {stageOnly ? 'Stage with AI Merge' : 'Merge with AI'}
            </>
          ) : (
            <>
              <GitMerge className="mr-2 h-4 w-4" />
              {stageOnly ? 'Stage Changes' : 'Merge to Main'}
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => onShowDiscardDialog(true)}
          disabled={isMerging || isDiscarding}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <FolderX className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
