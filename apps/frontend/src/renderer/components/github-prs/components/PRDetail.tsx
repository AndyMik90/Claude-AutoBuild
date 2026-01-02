import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bot,
  Send,
  XCircle,
  Loader2,
  GitMerge,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCheck,
  MessageSquare,
  FileText,
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { ScrollArea } from '../../ui/scroll-area';
import { Progress } from '../../ui/progress';
import { formatDate } from '../utils/formatDate';

import { CollapsibleCard } from './CollapsibleCard';
import { ReviewStatusTree } from './ReviewStatusTree';
import { PRHeader } from './PRHeader';
import { ReviewFindings } from './ReviewFindings';
import { PRLogs } from './PRLogs';

import type { PRData, PRReviewResult, PRReviewProgress } from '../hooks/useGitHubPRs';
import type { NewCommitsCheck, PRLogs as PRLogsType } from '../../../../preload/api/modules/github-api';

interface PRDetailProps {
  pr: PRData;
  reviewResult: PRReviewResult | null;
  previousReviewResult: PRReviewResult | null;
  reviewProgress: PRReviewProgress | null;
  isReviewing: boolean;
  initialNewCommitsCheck?: NewCommitsCheck | null;
  isActive?: boolean;
  onRunReview: () => void;
  onRunFollowupReview: () => void;
  onCheckNewCommits: () => Promise<NewCommitsCheck>;
  onCancelReview: () => void;
  onPostReview: (selectedFindingIds?: string[]) => Promise<boolean>;
  onPostComment: (body: string) => void;
  onMergePR: (mergeMethod?: 'merge' | 'squash' | 'rebase') => void;
  onAssignPR: (username: string) => void;
  onGetLogs: () => Promise<PRLogsType | null>;
}

function getStatusColor(status: PRReviewResult['overallStatus']): string {
  switch (status) {
    case 'approve':
      return 'bg-success/20 text-success border-success/50';
    case 'request_changes':
      return 'bg-destructive/20 text-destructive border-destructive/50';
    default:
      return 'bg-muted';
  }
}

export function PRDetail({
  pr,
  reviewResult,
  previousReviewResult,
  reviewProgress,
  isReviewing,
  initialNewCommitsCheck,
  isActive = false,
  onRunReview,
  onRunFollowupReview,
  onCheckNewCommits,
  onCancelReview,
  onPostReview,
  onPostComment,
  onMergePR,
  onAssignPR: _onAssignPR,
  onGetLogs,
}: PRDetailProps) {
  const { t, i18n } = useTranslation('common');

  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [postedFindingIds, setPostedFindingIds] = useState<Set<string>>(new Set());
  const [isPostingFindings, setIsPostingFindings] = useState(false);
  const [postSuccess, setPostSuccess] = useState<{ count: number; timestamp: number } | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [newCommitsCheck, setNewCommitsCheck] = useState<NewCommitsCheck | null>(initialNewCommitsCheck ?? null);
  const [analysisExpanded, setAnalysisExpanded] = useState(true);
  const checkNewCommitsAbortRef = useRef<AbortController | null>(null);
  const isCheckingNewCommitsRef = useRef(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [prLogs, setPrLogs] = useState<PRLogsType | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const logsLoadedRef = useRef(false);

  useEffect(() => {
    if (initialNewCommitsCheck !== undefined) {
      setNewCommitsCheck(initialNewCommitsCheck);
    }
  }, [initialNewCommitsCheck]);

  useEffect(() => {
    if (reviewResult?.postedFindingIds) {
      setPostedFindingIds(new Set(reviewResult.postedFindingIds));
    } else {
      setPostedFindingIds(new Set());
    }
  }, [reviewResult?.postedFindingIds, pr.number]);

  useEffect(() => {
    if (reviewResult?.success && reviewResult.findings.length > 0) {
      const allFindings = reviewResult.findings
        .filter(f => !postedFindingIds.has(f.id))
        .map(f => f.id);
      setSelectedFindingIds(new Set(allFindings));
    }
  }, [reviewResult, postedFindingIds]);

  const hasPostedFindings = postedFindingIds.size > 0 || reviewResult?.hasPostedFindings;

  const checkForNewCommits = useCallback(async () => {
    if (isCheckingNewCommitsRef.current) {
      return;
    }

    if (checkNewCommitsAbortRef.current) {
      checkNewCommitsAbortRef.current.abort();
    }
    checkNewCommitsAbortRef.current = new AbortController();

    if (reviewResult?.success && reviewResult.reviewedCommitSha) {
      isCheckingNewCommitsRef.current = true;
      try {
        const result = await onCheckNewCommits();
        if (!checkNewCommitsAbortRef.current?.signal.aborted) {
          setNewCommitsCheck(result);
        }
      } finally {
        if (!checkNewCommitsAbortRef.current?.signal.aborted) {
          isCheckingNewCommitsRef.current = false;
        }
      }
    }
  }, [reviewResult, onCheckNewCommits]);

  useEffect(() => {
    checkForNewCommits();
    return () => {
      if (checkNewCommitsAbortRef.current) {
        checkNewCommitsAbortRef.current.abort();
      }
    };
  }, [checkForNewCommits]);

  useEffect(() => {
    if (postSuccess) {
      const timer = setTimeout(() => setPostSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [postSuccess]);

  useEffect(() => {
    if (isReviewing) {
      setLogsExpanded(true);
    }
  }, [isReviewing]);

  useEffect(() => {
    if (logsExpanded && !logsLoadedRef.current && !isLoadingLogs) {
      logsLoadedRef.current = true;
      setIsLoadingLogs(true);
      onGetLogs()
        .then(logs => setPrLogs(logs))
        .catch(() => setPrLogs(null))
        .finally(() => setIsLoadingLogs(false));
    }
  }, [logsExpanded, onGetLogs, isLoadingLogs]);

  const wasReviewingRef = useRef(false);

  useEffect(() => {
    const wasReviewing = wasReviewingRef.current;
    wasReviewingRef.current = isReviewing;

    if (wasReviewing && !isReviewing) {
      onGetLogs()
        .then(logs => setPrLogs(logs))
        .catch(err => console.error('Failed to fetch final logs:', err));
      return;
    }

    if (!wasReviewing && isReviewing) {
      setPrLogs(null);
    }

    if (!isReviewing) return;

    const refreshLogs = async () => {
      try {
        const logs = await onGetLogs();
        setPrLogs(logs);
      } catch {
        // Ignore refresh errors
      }
    };

    refreshLogs();
    const interval = setInterval(refreshLogs, 1500);
    return () => clearInterval(interval);
  }, [isReviewing, onGetLogs]);

  useEffect(() => {
    logsLoadedRef.current = false;
    setPrLogs(null);
    setLogsExpanded(false);
  }, [pr.number]);

  const selectedCount = selectedFindingIds.size;

  const isReadyToMerge = useMemo(() => {
    if (!reviewResult || !reviewResult.success) return false;
    return reviewResult.summary?.includes('READY TO MERGE') || reviewResult.overallStatus === 'approve';
  }, [reviewResult]);

  const isCleanReview = useMemo(() => {
    if (!reviewResult || !reviewResult.success) return false;
    return !reviewResult.findings.some(f =>
      f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium'
    );
  }, [reviewResult]);

  const hasFindings = useMemo(() => {
    return reviewResult?.findings && reviewResult.findings.length > 0;
  }, [reviewResult]);

  const lowSeverityFindings = useMemo(() => {
    if (!reviewResult?.findings) return [];
    return reviewResult.findings.filter(f => f.severity === 'low');
  }, [reviewResult]);

  type PRStatus = 'not_reviewed' | 'reviewed_pending_post' | 'waiting_for_changes' | 'ready_to_merge' | 'needs_attention' | 'ready_for_followup' | 'followup_issues_remain';
  const prStatus: { status: PRStatus; label: string; description: string; icon: React.ReactNode; color: string } = useMemo(() => {
    if (!reviewResult || !reviewResult.success) {
      return {
        status: 'not_reviewed',
        label: t('prReview.notReviewed'),
        description: t('prReview.runAIReviewDesc'),
        icon: <Bot className="h-5 w-5" />,
        color: 'bg-muted text-muted-foreground border-muted',
      };
    }

    const allPostedIds = new Set([...postedFindingIds, ...(reviewResult.postedFindingIds ?? [])]);
    const totalPosted = allPostedIds.size;
    const hasPosted = totalPosted > 0 || reviewResult.hasPostedFindings;
    const hasBlockers = reviewResult.findings.some(f => f.severity === 'critical' || f.severity === 'high');
    const unpostedFindings = reviewResult.findings.filter(f => !allPostedIds.has(f.id));
    const hasUnpostedBlockers = unpostedFindings.some(f => f.severity === 'critical' || f.severity === 'high');
    const hasNewCommits = newCommitsCheck?.hasNewCommits ?? false;
    const newCommitCount = newCommitsCheck?.newCommitCount ?? 0;
    const hasCommitsAfterPosting = newCommitsCheck?.hasCommitsAfterPosting ?? false;

    if (reviewResult.isFollowupReview) {
      const resolvedCount = reviewResult.resolvedFindings?.length ?? 0;
      const unresolvedCount = reviewResult.unresolvedFindings?.length ?? 0;
      const newIssuesCount = reviewResult.newFindingsSinceLastReview?.length ?? 0;

      const hasBlockingIssuesRemaining = reviewResult.findings.some(
        f => (f.severity === 'critical' || f.severity === 'high')
      );

      if (hasNewCommits && hasCommitsAfterPosting) {
        return {
          status: 'ready_for_followup',
          label: t('prReview.readyForFollowup'),
          description: t('prReview.newCommitsSinceFollowup', { count: newCommitCount }),
          icon: <RefreshCw className="h-5 w-5" />,
          color: 'bg-info/20 text-info border-info/50',
        };
      }

      if (unresolvedCount === 0 && newIssuesCount === 0) {
        return {
          status: 'ready_to_merge',
          label: t('prReview.readyToMerge'),
          description: t('prReview.allIssuesResolved', { count: resolvedCount }),
          icon: <CheckCheck className="h-5 w-5" />,
          color: 'bg-success/20 text-success border-success/50',
        };
      }

      if (!hasBlockingIssuesRemaining) {
        const suggestionsCount = unresolvedCount + newIssuesCount;
        return {
          status: 'ready_to_merge',
          label: t('prReview.readyToMerge'),
          description: t('prReview.nonBlockingSuggestions', { resolved: resolvedCount, suggestions: suggestionsCount }),
          icon: <CheckCheck className="h-5 w-5" />,
          color: 'bg-success/20 text-success border-success/50',
        };
      }

      return {
        status: 'followup_issues_remain',
        label: t('prReview.blockingIssues'),
        description: t('prReview.blockingIssuesDesc', { resolved: resolvedCount, unresolved: unresolvedCount }),
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    if (hasPosted && hasNewCommits && hasCommitsAfterPosting) {
      return {
        status: 'ready_for_followup',
        label: t('prReview.readyForFollowup'),
        description: t('prReview.newCommitsSinceReview', { count: newCommitCount }),
        icon: <RefreshCw className="h-5 w-5" />,
        color: 'bg-info/20 text-info border-info/50',
      };
    }

    if (isReadyToMerge && hasPosted) {
      return {
        status: 'ready_to_merge',
        label: t('prReview.readyToMerge'),
        description: t('prReview.noBlockingIssues'),
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    if (hasPosted && hasBlockers) {
      return {
        status: 'waiting_for_changes',
        label: t('prReview.waitingForChanges'),
        description: t('prReview.findingsPostedWaiting', { count: totalPosted }),
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    if (hasPosted && !hasBlockers) {
      return {
        status: 'ready_to_merge',
        label: t('prReview.readyToMerge'),
        description: t('prReview.findingsPostedNoBlockers', { count: totalPosted }),
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    if (hasUnpostedBlockers) {
      return {
        status: 'needs_attention',
        label: t('prReview.needsAttention'),
        description: t('prReview.findingsNeedPosting', { count: unpostedFindings.length }),
        icon: <AlertCircle className="h-5 w-5" />,
        color: 'bg-destructive/20 text-destructive border-destructive/50',
      };
    }

    return {
      status: 'reviewed_pending_post',
      label: t('prReview.reviewComplete'),
      description: t('prReview.findingsFoundSelectPost', { count: reviewResult.findings.length }),
      icon: <MessageSquare className="h-5 w-5" />,
      color: 'bg-primary/20 text-primary border-primary/50',
    };
  }, [reviewResult, postedFindingIds, isReadyToMerge, newCommitsCheck, t]);

  const handlePostReview = async () => {
    const idsToPost = Array.from(selectedFindingIds);
    if (idsToPost.length === 0) return;

    setIsPostingFindings(true);
    try {
      const success = await onPostReview(idsToPost);
      if (success) {
        setPostedFindingIds(prev => new Set([...prev, ...idsToPost]));
        setSelectedFindingIds(new Set());
        setPostSuccess({ count: idsToPost.length, timestamp: Date.now() });
        checkForNewCommits();
      }
    } finally {
      setIsPostingFindings(false);
    }
  };

  const handleApprove = async () => {
    if (!reviewResult) return;

    setIsPosting(true);
    try {
      const success = await onPostReview([]);
      if (success) {
        checkForNewCommits();
      }
    } finally {
      setIsPosting(false);
    }
  };

  // Auto-approval: posts LOW findings as suggestions, then approves
  const handleAutoApprove = async () => {
    if (!reviewResult) return;
    setIsPosting(true);
    try {
      const lowFindingIds = lowSeverityFindings.map(f => f.id);
      if (lowFindingIds.length > 0) {
        const success = await onPostReview(lowFindingIds);
        if (!success) return;
        setPostedFindingIds(prev => new Set([...prev, ...lowFindingIds]));
      }

      const approvalSuccess = await onPostReview([]);
      if (approvalSuccess) {
        checkForNewCommits();
      }
    } finally {
      setIsPosting(false);
    }
  };

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await onMergePR('squash');
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 max-w-5xl mx-auto space-y-6">

        <PRHeader pr={pr} />

        {/* Review Status & Actions */}
        <ReviewStatusTree
          status={prStatus.status}
          isReviewing={isReviewing}
          reviewResult={reviewResult}
          previousReviewResult={previousReviewResult}
          postedCount={new Set([...postedFindingIds, ...(reviewResult?.postedFindingIds ?? [])]).size}
          onRunReview={onRunReview}
          onRunFollowupReview={onRunFollowupReview}
          onCancelReview={onCancelReview}
          newCommitsCheck={newCommitsCheck}
          lastPostedAt={postSuccess?.timestamp || (reviewResult?.postedAt ? new Date(reviewResult.postedAt).getTime() : null)}
        />

        {/* Action Bar */}
        {reviewResult && reviewResult.success && !isReviewing && (
          <div className="flex flex-wrap items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
             {selectedCount > 0 && (
                <Button onClick={handlePostReview} variant="secondary" disabled={isPostingFindings} className="flex-1 sm:flex-none">
                  {isPostingFindings ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('prReview.posting')}
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      {t('prReview.postFindings', { count: selectedCount })}
                    </>
                  )}
                </Button>
             )}

             {isCleanReview && (
                <Button
                  onClick={handleAutoApprove}
                  disabled={isPosting}
                  variant="default"
                  className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPosting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('prReview.postingApproval')}
                    </>
                  ) : (
                    <>
                      <CheckCheck className="h-4 w-4 mr-2" />
                      {t('prReview.autoApprovePR')}
                      {hasFindings && lowSeverityFindings.length > 0 && (
                        <span className="ml-1 text-xs opacity-80">
                          {t('prReview.suggestions', { count: lowSeverityFindings.length })}
                        </span>
                      )}
                    </>
                  )}
                </Button>
             )}

             {isReadyToMerge && (
                <>
                  <Button
                    onClick={handleApprove}
                    disabled={isPosting}
                    variant="default"
                    className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {isPosting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                    {t('prReview.approve')}
                  </Button>
                  <Button
                    onClick={handleMerge}
                    disabled={isMerging}
                    variant="outline"
                    className="flex-1 sm:flex-none"
                  >
                    {isMerging ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <GitMerge className="h-4 w-4 mr-2" />}
                    {t('prReview.merge')}
                  </Button>
                </>
             )}

             {postSuccess && (
               <div className="ml-auto flex items-center gap-2 text-emerald-600 text-sm font-medium animate-pulse">
                 <CheckCircle className="h-4 w-4" />
                 {t('prReview.postedFindings', { count: postSuccess.count })}
               </div>
             )}
          </div>
        )}

        {/* Review Progress */}
        {reviewProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{reviewProgress.message}</span>
              <span className="text-muted-foreground">{reviewProgress.progress}%</span>
            </div>
            <Progress value={reviewProgress.progress} className="h-2" />
          </div>
        )}

        {/* Review Result */}
        {reviewResult && reviewResult.success && (
          <CollapsibleCard
            title={reviewResult.isFollowupReview ? t('prReview.followupReviewDetails') : t('prReview.aiAnalysisResults')}
            icon={reviewResult.isFollowupReview ? (
              <RefreshCw className="h-4 w-4 text-blue-500" />
            ) : (
              <Bot className="h-4 w-4 text-purple-500" />
            )}
            badge={
              <Badge variant="outline" className={getStatusColor(reviewResult.overallStatus)}>
                {reviewResult.overallStatus === 'approve' && t('prReview.approve')}
                {reviewResult.overallStatus === 'request_changes' && t('prReview.changesRequested')}
                {reviewResult.overallStatus === 'comment' && t('prReview.commented')}
              </Badge>
            }
            open={analysisExpanded}
            onOpenChange={setAnalysisExpanded}
          >
            <div className="p-4 space-y-6">
              {/* Follow-up Review Resolution Status */}
              {reviewResult.isFollowupReview && (
                <div className="flex flex-wrap gap-3 pb-4 border-b border-border/50">
                  {(reviewResult.resolvedFindings?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-success/10 text-success border-success/30 px-3 py-1">
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                      {t('prReview.resolved', { count: reviewResult.resolvedFindings?.length ?? 0 })}
                    </Badge>
                  )}
                  {(reviewResult.unresolvedFindings?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 px-3 py-1">
                      <AlertCircle className="h-3.5 w-3.5 mr-1.5" />
                      {t('prReview.stillOpen', { count: reviewResult.unresolvedFindings?.length ?? 0 })}
                    </Badge>
                  )}
                  {(reviewResult.newFindingsSinceLastReview?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30 px-3 py-1">
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      {t('prReview.newIssue', { count: reviewResult.newFindingsSinceLastReview?.length ?? 0 })}
                    </Badge>
                  )}
                </div>
              )}

              <div className="bg-muted/30 p-4 rounded-lg text-sm text-muted-foreground leading-relaxed">
                {reviewResult.summary}
              </div>

              <ReviewFindings
                findings={reviewResult.findings}
                selectedIds={selectedFindingIds}
                postedIds={postedFindingIds}
                onSelectionChange={setSelectedFindingIds}
              />
            </div>
          </CollapsibleCard>
        )}

        {/* Review Error */}
        {reviewResult && !reviewResult.success && reviewResult.error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 text-destructive">
                <XCircle className="h-5 w-5 mt-0.5" />
                <div className="space-y-1">
                   <p className="font-semibold">{t('prReview.reviewFailed')}</p>
                   <p className="text-sm opacity-90">{reviewResult.error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review Logs */}
        {(reviewResult || isReviewing) && (
          <CollapsibleCard
            title={t('prReview.reviewLogs')}
            icon={<FileText className="h-4 w-4 text-muted-foreground" />}
            badge={
              isReviewing ? (
                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  {t('prReview.aiReviewInProgress')}
                </Badge>
              ) : prLogs ? (
                <Badge variant="outline" className="text-xs">
                  {prLogs.is_followup ? t('prReview.followup') : t('prReview.initial')}
                </Badge>
              ) : null
            }
            open={logsExpanded}
            onOpenChange={setLogsExpanded}
          >
            <PRLogs
              prNumber={pr.number}
              logs={prLogs}
              isLoading={isLoadingLogs}
              isStreaming={isReviewing}
            />
          </CollapsibleCard>
        )}

        {/* Description */}
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{t('prReview.description')}</h3>
             <ScrollArea className="h-[400px] w-full rounded-md border p-4 bg-muted/10">
              {pr.body ? (
                <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans break-words">
                  {pr.body}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground italic">{t('prReview.noDescription')}</p>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
