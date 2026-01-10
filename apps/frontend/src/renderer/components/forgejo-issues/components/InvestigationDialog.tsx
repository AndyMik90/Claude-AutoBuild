import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2, CheckCircle2, MessageCircle } from 'lucide-react';
import { Button } from '../../ui/button';
import { Progress } from '../../ui/progress';
import { Checkbox } from '../../ui/checkbox';
import { ScrollArea } from '../../ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../../ui/dialog';
import type { InvestigationDialogProps } from '../types';
import { formatDate } from '../utils';

interface ForgejoComment {
  id: number;
  body: string;
  author: { login: string; avatarUrl?: string };
  createdAt: string;
}

export function InvestigationDialog({
  open,
  onOpenChange,
  selectedIssue,
  investigationStatus,
  onStartInvestigation,
  onClose,
  projectId
}: InvestigationDialogProps) {
  const { t } = useTranslation('forgejo');
  const [comments, setComments] = useState<ForgejoComment[]>([]);
  const [selectedCommentIds, setSelectedCommentIds] = useState<number[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [fetchCommentsError, setFetchCommentsError] = useState<string | null>(null);

  // Fetch comments when dialog opens
  useEffect(() => {
    if (open && selectedIssue && projectId) {
      let isMounted = true;

      setLoadingComments(true);
      setComments([]);
      setSelectedCommentIds([]);
      setFetchCommentsError(null);

      window.electronAPI.forgejo.getForgejoIssueComments(projectId, selectedIssue.number)
        .then((result) => {
          if (!isMounted) return;
          if (result.success && result.data) {
            setComments(result.data);
            // By default, select all comments
            setSelectedCommentIds(result.data.map((c: ForgejoComment) => c.id));
          }
        })
        .catch((err: unknown) => {
          if (!isMounted) return;
          console.error('Failed to fetch comments:', err);
          setFetchCommentsError(
            err instanceof Error ? err.message : 'Failed to load comments'
          );
        })
        .finally(() => {
          if (isMounted) {
            setLoadingComments(false);
          }
        });

      return () => {
        isMounted = false;
      };
    }
  }, [open, selectedIssue, projectId]);

  const toggleComment = (commentId: number) => {
    setSelectedCommentIds(prev =>
      prev.includes(commentId)
        ? prev.filter(id => id !== commentId)
        : [...prev, commentId]
    );
  };

  const toggleAllComments = () => {
    if (selectedCommentIds.length === comments.length) {
      setSelectedCommentIds([]);
    } else {
      setSelectedCommentIds(comments.map(c => c.id));
    }
  };

  const handleStartInvestigation = () => {
    onStartInvestigation(selectedCommentIds);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-info" />
            {t('investigation.title')}
          </DialogTitle>
          <DialogDescription>
            {selectedIssue && (
              <span>
                {t('investigation.issuePrefix')} #{selectedIssue.number}: {selectedIssue.title}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {investigationStatus.phase === 'idle' ? (
          <div className="space-y-4 flex-1 min-h-0 flex flex-col">
            <p className="text-sm text-muted-foreground">
              {t('investigation.description')}
            </p>

            {/* Comments section */}
            {loadingComments ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : fetchCommentsError ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4">
                <p className="text-sm text-destructive font-medium">{t('investigation.failedToLoadComments')}</p>
                <p className="text-xs text-destructive/80 mt-1">{fetchCommentsError}</p>
              </div>
            ) : comments.length > 0 ? (
              <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    {t('investigation.selectComments')} ({selectedCommentIds.length}/{comments.length})
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleAllComments}
                    className="text-xs"
                  >
                    {selectedCommentIds.length === comments.length ? t('investigation.deselectAll') : t('investigation.selectAll')}
                  </Button>
                </div>
                <ScrollArea
                  className="flex min-h-0 border rounded-md"
                  viewportClassName="h-auto"
                >
                  <div className="p-2 space-y-2">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        role="button"
                        tabIndex={0}
                        className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer w-full text-left"
                        onClick={() => toggleComment(comment.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleComment(comment.id);
                          }
                        }}
                      >
                        <Checkbox
                          checked={selectedCommentIds.includes(comment.id)}
                          onCheckedChange={() => toggleComment(comment.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">{comment.author.login}</span>
                            <span>•</span>
                            <span>{formatDate(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-foreground whitespace-pre-wrap break-words line-clamp-3">
                            {comment.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h4 className="text-sm font-medium mb-2">{t('investigation.willInclude')}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t('investigation.includeTitle')}</li>
                  <li>• {t('investigation.includeLink')}</li>
                  <li>• {t('investigation.includeLabels')}</li>
                  <li>• {t('investigation.noComments')}</li>
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{investigationStatus.message}</span>
                <span className="text-foreground">{investigationStatus.progress}%</span>
              </div>
              <Progress value={investigationStatus.progress} className="h-2" />
            </div>

            {investigationStatus.phase === 'error' && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {investigationStatus.error}
              </div>
            )}

            {investigationStatus.phase === 'complete' && (
              <div className="rounded-lg bg-success/10 border border-success/30 p-3 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                {t('investigation.taskCreated')}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {investigationStatus.phase === 'idle' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t('investigation.cancel')}
              </Button>
              <Button onClick={handleStartInvestigation}>
                <Sparkles className="h-4 w-4 mr-2" />
                {t('detail.createTask')}
              </Button>
            </>
          )}
          {investigationStatus.phase !== 'idle' && investigationStatus.phase !== 'complete' && investigationStatus.phase !== 'error' && (
            <Button variant="outline" disabled>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('investigation.creating')}
            </Button>
          )}
          {investigationStatus.phase === 'error' && (
            <Button variant="outline" onClick={onClose}>
              {t('investigation.close')}
            </Button>
          )}
          {investigationStatus.phase === 'complete' && (
            <Button onClick={onClose}>
              {t('investigation.done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
