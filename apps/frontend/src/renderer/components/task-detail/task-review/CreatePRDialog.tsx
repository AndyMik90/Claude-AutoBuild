import { ExternalLink, GitPullRequest, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/dialog';
import type { WorktreeCreatePRResult, WorktreeStatus } from '../../../../shared/types';

interface CreatePRDialogProps {
  open: boolean;
  worktreeStatus: WorktreeStatus;
  isCreatingPR: boolean;
  result: WorktreeCreatePRResult | null;
  onOpenChange: (open: boolean) => void;
  onCreatePR: () => void;
}

export function CreatePRDialog({
  open,
  worktreeStatus,
  isCreatingPR,
  result,
  onOpenChange,
  onCreatePR
}: CreatePRDialogProps) {
  const { t } = useTranslation('taskReview');

  const hasResult = Boolean(result);
  const isSuccess = Boolean(result?.success);

  const title = hasResult
    ? (isSuccess
      ? (result?.alreadyExists ? t('pr.result.alreadyExistsTitle') : t('pr.result.successTitle'))
      : t('pr.result.failureTitle'))
    : t('pr.title');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitPullRequest className="h-5 w-5" />
            {title}
          </DialogTitle>
          {!hasResult && (
            <DialogDescription>{t('pr.description')}</DialogDescription>
          )}
        </DialogHeader>

        {!hasResult && (
          <div className="py-2 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('pr.source')}</span>
              <span className="font-mono text-info">{worktreeStatus.branch || '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('pr.target')}</span>
              <span className="font-mono">{worktreeStatus.baseBranch || 'main'}</span>
            </div>
          </div>
        )}

        {result?.error && (
          <div className="text-sm text-destructive">{result.error}</div>
        )}

        {result?.prUrl && (
          <Button
            variant="link"
            size="sm"
            className="p-0 h-auto text-info"
            onClick={() => window.electronAPI.openExternal(result.prUrl!)}
          >
            <ExternalLink className="h-3.5 w-3.5 mr-1" />
            {t('pr.result.view')}
          </Button>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {hasResult ? t('pr.actions.close') : t('pr.actions.cancel')}
          </Button>
          {!hasResult && (
            <Button onClick={onCreatePR} disabled={isCreatingPR}>
              {isCreatingPR ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('pr.actions.creating')}
                </>
              ) : (
                <>
                  <GitPullRequest className="h-4 w-4 mr-2" />
                  {t('pr.actions.create')}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
