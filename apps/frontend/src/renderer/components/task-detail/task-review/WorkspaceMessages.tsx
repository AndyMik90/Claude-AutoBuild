import { AlertCircle, GitMerge, Loader2, Check, RotateCcw, GitBranch } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { persistTaskStatus } from '../../../stores/task-store';
import type { Task } from '../../../../shared/types';

interface LoadingMessageProps {
  message?: string;
}

/**
 * Displays a loading indicator while workspace info is being fetched
 */
export function LoadingMessage({ message = 'Loading workspace info...' }: LoadingMessageProps) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
}

interface NoWorkspaceMessageProps {
  task?: Task;
  onClose?: () => void;
}

/**
 * Displays message when no workspace is found for the task
 */
export function NoWorkspaceMessage({ task, onClose }: NoWorkspaceMessageProps) {
  const [isMarkingDone, setIsMarkingDone] = useState(false);

  const handleMarkDone = async () => {
    if (!task) return;

    setIsMarkingDone(true);
    try {
      await persistTaskStatus(task.id, 'done');
      // Auto-close modal after marking as done
      onClose?.();
    } catch (err) {
      console.error('Error marking task as done:', err);
    } finally {
      setIsMarkingDone(false);
    }
  };

  // Different messaging for read-only vs regular tasks
  const isReadOnly = task?.isReadOnly || false;

  return (
    <div className={`rounded-xl border p-4 ${
      isReadOnly
        ? 'border-blue-500/30 bg-blue-500/10'
        : 'border-border bg-secondary/30'
    }`}>
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <AlertCircle className={`h-4 w-4 ${isReadOnly ? 'text-blue-500' : 'text-muted-foreground'}`} />
        {isReadOnly ? 'Read-Only Task' : 'No Workspace Found'}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {isReadOnly
          ? 'This task was executed in read-only mode without modifying your project files. It ran directly in your project directory for verification or analysis purposes.'
          : 'No isolated workspace was found for this task. The changes may have been made directly in your project.'}
      </p>

      {/* Branch Information - show if task has an associated branch */}
      {task?.branch && (
        <div className="mb-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary">Git Branch (DIRECT Mode)</span>
          </div>
          <Badge
            variant="outline"
            className="font-mono bg-background/50 text-primary border-primary/30"
          >
            {task.branch}
          </Badge>
          <p className="text-xs text-muted-foreground mt-2">
            Changes were made directly on this branch without using an isolated worktree.
          </p>
        </div>
      )}

      {/* Allow marking as done */}
      {task && task.status === 'human_review' && (
        <Button
          onClick={handleMarkDone}
          disabled={isMarkingDone}
          size="sm"
          variant="default"
          className="w-full"
        >
          {isMarkingDone ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Mark as Done
            </>
          )}
        </Button>
      )}
    </div>
  );
}

interface StagedInProjectMessageProps {
  task: Task;
  projectPath?: string;
  hasWorktree?: boolean;
  onClose?: () => void;
  onReviewAgain?: () => void;
}

/**
 * Displays message when changes have already been staged in the main project
 */
export function StagedInProjectMessage({ task, projectPath, hasWorktree = false, onClose, onReviewAgain }: StagedInProjectMessageProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteWorktreeAndMarkDone = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      // Call the discard/delete worktree command
      const result = await window.electronAPI.discardWorktree(task.id);

      if (!result.success) {
        setError(result.error || 'Failed to delete worktree');
        return;
      }

      // Mark task as done
      await persistTaskStatus(task.id, 'done');

      // Auto-close modal after marking as done
      onClose?.();
    } catch (err) {
      console.error('Error deleting worktree:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete worktree');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMarkDoneOnly = async () => {
    setIsMarkingDone(true);
    setError(null);

    try {
      await persistTaskStatus(task.id, 'done');
      onClose?.();
    } catch (err) {
      console.error('Error marking task as done:', err);
      setError(err instanceof Error ? err.message : 'Failed to mark as done');
    } finally {
      setIsMarkingDone(false);
    }
  };

  const handleReviewAgain = async () => {
    if (!onReviewAgain) return;
    
    setIsResetting(true);
    setError(null);

    try {
      // Clear the staged flag via IPC
      const result = await window.electronAPI.clearStagedState(task.id);
      
      if (!result.success) {
        setError(result.error || 'Failed to reset staged state');
        return;
      }

      // Trigger re-render by calling parent callback
      onReviewAgain();
    } catch (err) {
      console.error('Error resetting staged state:', err);
      setError(err instanceof Error ? err.message : 'Failed to reset staged state');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-success" />
        Changes Staged in Project
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        This task's changes have been staged in your main project{task.stagedAt ? ` on ${new Date(task.stagedAt).toLocaleDateString()}` : ''}.
      </p>
      <div className="bg-background/50 rounded-lg p-3 mb-3">
        <p className="text-xs text-muted-foreground mb-2">Next steps:</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Review staged changes with <code className="bg-background px-1 rounded">git status</code> and <code className="bg-background px-1 rounded">git diff --staged</code></li>
          <li>Commit when ready: <code className="bg-background px-1 rounded">git commit -m "your message"</code></li>
          <li>Push to remote when satisfied</li>
        </ol>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {/* Primary action: Mark Done or Delete Worktree & Mark Done */}
          {hasWorktree ? (
            <Button
              onClick={handleDeleteWorktreeAndMarkDone}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="default"
              className="flex-1"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cleaning up...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Delete Worktree & Mark Done
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleMarkDoneOnly}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="default"
              className="flex-1"
            >
              {isMarkingDone ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Marking done...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Mark as Done
                </>
              )}
            </Button>
          )}
        </div>
        
        {/* Secondary actions row */}
        <div className="flex gap-2">
          {/* Mark Done Only (when worktree exists) - allows keeping worktree */}
          {hasWorktree && (
            <Button
              onClick={handleMarkDoneOnly}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              {isMarkingDone ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Marking done...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Mark Done Only
                </>
              )}
            </Button>
          )}
          
          {/* Review Again button - only show if worktree exists and callback provided */}
          {hasWorktree && onReviewAgain && (
            <Button
              onClick={handleReviewAgain}
              disabled={isDeleting || isMarkingDone || isResetting}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Review Again
                </>
              )}
            </Button>
          )}
        </div>
        
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        
        {hasWorktree && (
          <p className="text-xs text-muted-foreground">
            "Delete Worktree & Mark Done" cleans up the isolated workspace. "Mark Done Only" keeps it for reference.
          </p>
        )}
      </div>
    </div>
  );
}
