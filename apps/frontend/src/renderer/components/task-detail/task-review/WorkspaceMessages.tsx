import { AlertCircle, GitMerge, Loader2, Trash2, Check, Copy, Sparkles, GitCommit } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { persistTaskStatus } from '../../../stores/task-store';
import { useTranslation } from 'react-i18next';
import type { Task } from '../../../../shared/types';

interface LoadingMessageProps {
  message?: string;
}

/**
 * Displays a loading indicator while workspace info is being fetched
 */
export function LoadingMessage({ message }: LoadingMessageProps) {
  const { t } = useTranslation('taskReview');
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{message || t('loading.message')}</span>
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
  const { t } = useTranslation('taskReview');

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

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        {t('noWorkspace.title')}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {t('noWorkspace.description')}
      </p>

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
              {t('noWorkspace.updating')}
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              {t('noWorkspace.markDone')}
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
  suggestedCommitMessage?: string;
  onClose?: () => void;
}

/**
 * Displays message when changes have already been staged in the main project
 */
export function StagedInProjectMessage({ task, projectPath, hasWorktree = false, suggestedCommitMessage, onClose }: StagedInProjectMessageProps) {
  const { t } = useTranslation('taskReview');
  const [commitMessage, setCommitMessage] = useState(suggestedCommitMessage || '');
  const [copied, setCopied] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!commitMessage) return;
    try {
      await navigator.clipboard.writeText(commitMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCommit = async () => {
    setIsCommitting(true);
    setError(null);

    try {
      const result = await window.electronAPI.commitStagedChanges(task.id, commitMessage);

      if (result.success && result.data?.committed) {
        // Close the modal after successful commit
        onClose?.();
      } else {
        setError(result.data?.message || result.error || t('stagedInProject.commitFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('stagedInProject.unknownError'));
    } finally {
      setIsCommitting(false);
    }
  };

  const handleDeleteWorktreeAndMarkDone = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      // Call the discard/delete worktree command
      const result = await window.electronAPI.discardWorktree(task.id);

      if (!result.success) {
        setError(result.error || t('stagedInProject.deleteFailed'));
        return;
      }

      // Mark task as done
      await persistTaskStatus(task.id, 'done');

      // Auto-close modal after marking as done
      onClose?.();
    } catch (err) {
      console.error('Error deleting worktree:', err);
      setError(err instanceof Error ? err.message : t('stagedInProject.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-success" />
        {t('stagedInProject.title')}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {task.stagedAt ? t('stagedInProject.descriptionWithDate', { date: new Date(task.stagedAt).toLocaleDateString() }) : t('stagedInProject.description')}
      </p>

      {/* Commit Message Section */}
      {suggestedCommitMessage && (
        <div className="bg-background/50 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-purple-400" />
              {t('staged.aiCommitMessage')}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 px-2 text-xs"
              disabled={!commitMessage}
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1 text-success" />
                  {t('staged.copied')}
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1" />
                  {t('staged.copy')}
                </>
              )}
            </Button>
          </div>
          <Textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            className="font-mono text-xs min-h-[100px] bg-background/80 resize-y"
            placeholder={t('staged.commitPlaceholder')}
          />
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {/* Commit button - always show if there's a suggested message */}
        {suggestedCommitMessage && (
          <Button
            onClick={handleCommit}
            disabled={isCommitting || isDeleting}
            variant="default"
            className="w-full"
          >
            {isCommitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('staged.committing')}
              </>
            ) : (
              <>
                <GitCommit className="mr-2 h-4 w-4" />
                {t('staged.commitButton')}
              </>
            )}
          </Button>
        )}

        {/* Delete worktree button */}
        {hasWorktree && (
          <Button
            onClick={handleDeleteWorktreeAndMarkDone}
            disabled={isDeleting || isCommitting}
            size="sm"
            variant={suggestedCommitMessage ? "outline" : "default"}
            className="w-full"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('stagedInProject.cleaningUp')}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {t('stagedInProject.deleteWorktree')}
              </>
            )}
          </Button>
        )}
      </div>

      {/* Manual instructions */}
      <div className="bg-background/50 rounded-lg p-3 mt-3">
        <p className="text-xs text-muted-foreground mb-2">{t('stagedInProject.manualSteps')}</p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>{t('staged.step2')} <code className="bg-background px-1 rounded">{t('staged.step2Code')}</code> {t('staged.step2And')} <code className="bg-background px-1 rounded">{t('staged.step2DiffCode')}</code></li>
          <li>{t('staged.step3')} <code className="bg-background px-1 rounded">{t('staged.step3Code')}</code></li>
        </ol>
      </div>
    </div>
  );
}
