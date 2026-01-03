import { useState } from 'react';
import { GitMerge, Copy, Check, Sparkles, GitCommit, Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { Textarea } from '../../ui/textarea';
import { useTranslation } from 'react-i18next';

interface StagedSuccessMessageProps {
  stagedSuccess: string;
  suggestedCommitMessage?: string;
  taskId?: string;
  onClose?: () => void;
}

/**
 * Displays success message after changes have been staged in the main project
 */
export function StagedSuccessMessage({
  stagedSuccess,
  suggestedCommitMessage,
  taskId,
  onClose
}: StagedSuccessMessageProps) {
  const { t } = useTranslation('taskReview');
  const [commitMessage, setCommitMessage] = useState(suggestedCommitMessage || '');
  const [copied, setCopied] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

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
    if (!taskId) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      const result = await window.electronAPI.commitStagedChanges(taskId, commitMessage);

      if (result.success && result.data?.committed) {
        // Close the modal after successful commit
        if (onClose) {
          onClose();
        }
      } else {
        setCommitError(result.data?.message || result.error || t('staged.commitFailed'));
      }
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : t('staged.commitError'));
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-success/30 bg-success/10 p-4">
      <h3 className="font-medium text-sm text-foreground mb-2 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-success" />
        {t('staged.title')}
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        {stagedSuccess}
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
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {t('staged.editHint')} <code className="bg-background px-1 rounded">git commit -m "..."</code>
          </p>
        </div>
      )}

      {/* Commit button and error message */}
      {taskId && (
        <div className="space-y-3">
          {commitError && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
              <p className="text-xs text-destructive">{commitError}</p>
            </div>
          )}
          <Button
            onClick={handleCommit}
            disabled={isCommitting}
            className="w-full"
            variant="default"
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
        </div>
      )}

      <div className="bg-background/50 rounded-lg p-3">
        <p className="text-xs text-muted-foreground mb-2">
          {taskId ? t('staged.manualCommit') : t('staged.nextSteps')}
        </p>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>{t('staged.step1')}</li>
          <li>{t('staged.step2')} <code className="bg-background px-1 rounded">{t('staged.step2Code')}</code> {t('staged.step2And')} <code className="bg-background px-1 rounded">{t('staged.step2DiffCode')}</code></li>
          <li>{t('staged.step3')} <code className="bg-background px-1 rounded">{t('staged.step3Code')}</code></li>
        </ol>
      </div>
    </div>
  );
}
