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
  AlertCircle,
  RotateCcw,
  Search,
  CheckCircle,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import type { Task, WorktreeStatus, WorktreeDiff, MergeConflict, MergeStats, GitConflictInfo } from '../../../shared/types';

interface TaskReviewProps {
  task: Task;
  feedback: string;
  isSubmitting: boolean;
  worktreeStatus: WorktreeStatus | null;
  worktreeDiff: WorktreeDiff | null;
  isLoadingWorktree: boolean;
  isMerging: boolean;
  isDiscarding: boolean;
  showDiscardDialog: boolean;
  showDiffDialog: boolean;
  workspaceError: string | null;
  stageOnly: boolean;
  stagedSuccess: string | null;
  stagedProjectPath: string | undefined;
  mergePreview: { files: string[]; conflicts: MergeConflict[]; summary: MergeStats; gitConflicts?: GitConflictInfo } | null;
  isLoadingPreview: boolean;
  showConflictDialog: boolean;
  onFeedbackChange: (value: string) => void;
  onReject: () => void;
  onMerge: () => void;
  onDiscard: () => void;
  onShowDiscardDialog: (show: boolean) => void;
  onShowDiffDialog: (show: boolean) => void;
  onStageOnlyChange: (value: boolean) => void;
  onShowConflictDialog: (show: boolean) => void;
  onLoadMergePreview: () => void;
}

export function TaskReview({
  task,
  feedback,
  isSubmitting,
  worktreeStatus,
  worktreeDiff,
  isLoadingWorktree,
  isMerging,
  isDiscarding,
  showDiscardDialog,
  showDiffDialog,
  workspaceError,
  stageOnly,
  stagedSuccess,
  stagedProjectPath,
  mergePreview,
  isLoadingPreview,
  showConflictDialog,
  onFeedbackChange,
  onReject,
  onMerge,
  onDiscard,
  onShowDiscardDialog,
  onShowDiffDialog,
  onStageOnlyChange,
  onShowConflictDialog,
  onLoadMergePreview
}: TaskReviewProps) {
  // Helper function to get severity icon
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'none':
      case 'low':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'high':
      case 'critical':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Helper to get severity badge variant
  const getSeverityVariant = (severity: string) => {
    switch (severity) {
      case 'none':
      case 'low':
        return 'bg-success/10 text-success';
      case 'medium':
        return 'bg-warning/10 text-warning';
      case 'high':
      case 'critical':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };
  return (
    <div className="space-y-4">
      {/* Section divider */}
      <div className="section-divider-gradient" />

      {/* Staged Success Message */}
      {stagedSuccess && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-4">
          <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-success" />
            Changes Staged Successfully
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            {stagedSuccess}
          </p>
          <div className="bg-background/50 rounded-lg p-3 mb-3">
            <p className="text-xs text-muted-foreground mb-2">Next steps:</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Open your project in your IDE or terminal</li>
              <li>Review the staged changes with <code className="bg-background px-1 rounded">git status</code> and <code className="bg-background px-1 rounded">git diff --staged</code></li>
              <li>Commit when ready: <code className="bg-background px-1 rounded">git commit -m "your message"</code></li>
            </ol>
          </div>
          {stagedProjectPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.electronAPI.createTerminal({
                  id: `project-${task.id}`,
                  cwd: stagedProjectPath
                });
              }}
              className="w-full"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Project in Terminal
            </Button>
          )}
        </div>
      )}

      {/* Workspace Status - hide if staging was successful (worktree is deleted after staging) */}
      {isLoadingWorktree ? (
        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading workspace info...</span>
          </div>
        </div>
      ) : worktreeStatus?.exists && !stagedSuccess ? (
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
            {/* Refresh conflicts button - conflicts are auto-loaded but user can refresh */}
            {mergePreview && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  console.log('[TaskReview] Refresh conflicts clicked');
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
            <div className={cn(
              "rounded-lg p-3 mb-3 border",
              mergePreview.gitConflicts?.hasConflicts
                ? "bg-warning/10 border-warning/30"  // AI will resolve - show warning not error
                : mergePreview.conflicts.length === 0
                  ? "bg-success/10 border-success/30"
                  : mergePreview.conflicts.some(c => c.severity === 'high' || c.severity === 'critical')
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-warning/10 border-warning/30"
            )}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-2">
                  {mergePreview.gitConflicts?.hasConflicts ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      Branch Diverged - AI Will Resolve
                    </>
                  ) : mergePreview.conflicts.length === 0 ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-success" />
                      No Conflicts Detected
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-warning" />
                      {mergePreview.conflicts.length} Conflict{mergePreview.conflicts.length !== 1 ? 's' : ''} Found
                    </>
                  )}
                </span>
                {mergePreview.conflicts.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onShowConflictDialog(true)}
                    className="h-7 text-xs"
                  >
                    View Details
                  </Button>
                )}
              </div>
              {/* Show git conflict details if present */}
              {mergePreview.gitConflicts?.hasConflicts && (
                <div className="mb-3 p-2 bg-warning/10 rounded text-xs border border-warning/30">
                  <p className="font-medium text-warning mb-1">Branch has diverged - AI will resolve</p>
                  <p className="text-muted-foreground mb-2">
                    The main branch has {mergePreview.gitConflicts.commitsBehind} new commit{mergePreview.gitConflicts.commitsBehind !== 1 ? 's' : ''} since this worktree was created.
                    {mergePreview.gitConflicts.conflictingFiles.length} file{mergePreview.gitConflicts.conflictingFiles.length !== 1 ? 's' : ''} will need intelligent merging:
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground">
                    {mergePreview.gitConflicts.conflictingFiles.map((file, idx) => (
                      <li key={idx} className="truncate">{file}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-muted-foreground">
                    AI will automatically merge these conflicts when you click Stage Changes.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Files to merge: {mergePreview.summary.totalFiles}</div>
                {mergePreview.gitConflicts?.hasConflicts ? (
                  <div className="text-warning">AI will resolve conflicts</div>
                ) : mergePreview.conflicts.length > 0 ? (
                  <>
                    <div>Auto-mergeable: {mergePreview.summary.autoMergeable}</div>
                    {mergePreview.summary.aiResolved !== undefined && (
                      <div>AI resolved: {mergePreview.summary.aiResolved}</div>
                    )}
                    {mergePreview.summary.humanRequired !== undefined && mergePreview.summary.humanRequired > 0 && (
                      <div className="text-warning">Manual review: {mergePreview.summary.humanRequired}</div>
                    )}
                  </>
                ) : (
                  <div className="text-success">Ready to merge</div>
                )}
              </div>
            </div>
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
              variant={mergePreview?.gitConflicts?.hasConflicts ? "warning" : "success"}
              onClick={onMerge}
              disabled={isMerging || isDiscarding}
              className="flex-1"
              title={mergePreview?.gitConflicts?.hasConflicts ? "AI will resolve conflicts automatically" : undefined}
            >
              {isMerging ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {mergePreview?.gitConflicts?.hasConflicts
                    ? 'AI Resolving Conflicts...'
                    : stageOnly ? 'Staging...' : 'Merging...'}
                </>
              ) : mergePreview?.gitConflicts?.hasConflicts ? (
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
      ) : (
        <div className="rounded-xl border border-border bg-secondary/30 p-4">
          <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
            No Workspace Found
          </h3>
          <p className="text-sm text-muted-foreground">
            No isolated workspace was found for this task. The changes may have been made directly in your project.
          </p>
        </div>
      )}

      {/* QA Feedback Section */}
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-4">
        <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-warning" />
          Request Changes
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Found issues? Describe what needs to be fixed and the AI will continue working on it.
        </p>
        <Textarea
          placeholder="Describe the issues or changes needed..."
          value={feedback}
          onChange={(e) => onFeedbackChange(e.target.value)}
          className="mb-3"
          rows={3}
        />
        <Button
          variant="warning"
          onClick={onReject}
          disabled={isSubmitting || !feedback.trim()}
          className="w-full"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <RotateCcw className="mr-2 h-4 w-4" />
              Request Changes
            </>
          )}
        </Button>
      </div>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={onShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FolderX className="h-5 w-5 text-destructive" />
              Discard Build
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  Are you sure you want to discard all changes for <strong className="text-foreground">"{task.title}"</strong>?
                </p>
                <p className="text-destructive">
                  This will permanently delete the isolated workspace and all uncommitted changes.
                  The task will be moved back to Planning status.
                </p>
                {worktreeStatus?.exists && (
                  <div className="bg-muted/50 rounded-lg p-3 text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="text-muted-foreground">Files changed:</span>
                      <span>{worktreeStatus.filesChanged || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lines:</span>
                      <span className="text-success">+{worktreeStatus.additions || 0}</span>
                      <span className="text-destructive">-{worktreeStatus.deletions || 0}</span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDiscarding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDiscard();
              }}
              disabled={isDiscarding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDiscarding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Discarding...
                </>
              ) : (
                <>
                  <FolderX className="mr-2 h-4 w-4" />
                  Discard Build
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diff View Dialog */}
      <AlertDialog open={showDiffDialog} onOpenChange={onShowDiffDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-purple-400" />
              Changed Files
            </AlertDialogTitle>
            <AlertDialogDescription>
              {worktreeDiff?.summary || 'No changes found'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
            {worktreeDiff?.files && worktreeDiff.files.length > 0 ? (
              <div className="space-y-2">
                {worktreeDiff.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileCode className={cn(
                        'h-4 w-4 shrink-0',
                        file.status === 'added' && 'text-success',
                        file.status === 'deleted' && 'text-destructive',
                        file.status === 'modified' && 'text-info',
                        file.status === 'renamed' && 'text-warning'
                      )} />
                      <span className="text-sm font-mono truncate">{file.path}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-xs',
                          file.status === 'added' && 'bg-success/10 text-success',
                          file.status === 'deleted' && 'bg-destructive/10 text-destructive',
                          file.status === 'modified' && 'bg-info/10 text-info',
                          file.status === 'renamed' && 'bg-warning/10 text-warning'
                        )}
                      >
                        {file.status}
                      </Badge>
                      <span className="text-xs text-success">+{file.additions}</span>
                      <span className="text-xs text-destructive">-{file.deletions}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No changed files found
              </div>
            )}
          </div>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflict Details Dialog */}
      <AlertDialog open={showConflictDialog} onOpenChange={onShowConflictDialog}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Merge Conflicts Preview
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mergePreview?.conflicts.length || 0} potential conflict{(mergePreview?.conflicts.length || 0) !== 1 ? 's' : ''} detected.
              {mergePreview && mergePreview.summary.autoMergeable > 0 && (
                <span className="text-success ml-1">
                  {mergePreview.summary.autoMergeable} can be auto-merged.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex-1 overflow-auto min-h-0 -mx-6 px-6">
            {mergePreview?.conflicts && mergePreview.conflicts.length > 0 ? (
              <div className="space-y-3">
                {mergePreview.conflicts.map((conflict, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "p-3 rounded-lg border",
                      conflict.canAutoMerge
                        ? "bg-secondary/30 border-border"
                        : conflict.severity === 'high' || conflict.severity === 'critical'
                          ? "bg-destructive/10 border-destructive/30"
                          : "bg-warning/10 border-warning/30"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {getSeverityIcon(conflict.severity)}
                        <span className="text-sm font-mono truncate">{conflict.file}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className={cn('text-xs', getSeverityVariant(conflict.severity))}
                        >
                          {conflict.severity}
                        </Badge>
                        {conflict.canAutoMerge && (
                          <Badge variant="secondary" className="text-xs bg-success/10 text-success">
                            auto-merge
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {conflict.location && (
                        <div><span className="text-foreground/70">Location:</span> {conflict.location}</div>
                      )}
                      {conflict.reason && (
                        <div><span className="text-foreground/70">Reason:</span> {conflict.reason}</div>
                      )}
                      {conflict.strategy && (
                        <div><span className="text-foreground/70">Strategy:</span> {conflict.strategy}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No conflicts detected
              </div>
            )}
          </div>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel>Close</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onShowConflictDialog(false);
                onMerge();
              }}
              className="bg-warning text-warning-foreground hover:bg-warning/90"
            >
              <GitMerge className="mr-2 h-4 w-4" />
              {stageOnly ? 'Stage with AI Merge' : 'Merge with AI'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
