import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  User,
  Clock,
  GitBranch,
  FileDiff,
  Sparkles,
  Send,
  XCircle,
  Loader2,
  GitMerge,
  CheckCircle,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  AlertTriangle,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  Circle,
  CircleDot,
  Play
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { ScrollArea } from '../../ui/scroll-area';
import { Progress } from '../../ui/progress';
import { ReviewFindings } from './ReviewFindings';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../../ui/collapsible';
import { cn } from '../../../lib/utils';
import type { PRData, PRReviewResult, PRReviewProgress } from '../hooks/useGitHubPRs';
import type { NewCommitsCheck } from '../../../../preload/api/modules/github-api';

interface PRDetailProps {
  pr: PRData;
  reviewResult: PRReviewResult | null;
  reviewProgress: PRReviewProgress | null;
  isReviewing: boolean;
  onRunReview: () => void;
  onRunFollowupReview: () => void;
  onCheckNewCommits: () => Promise<NewCommitsCheck>;
  onCancelReview: () => void;
  onPostReview: (selectedFindingIds?: string[]) => Promise<boolean>;
  onPostComment: (body: string) => void;
  onMergePR: (mergeMethod?: 'merge' | 'squash' | 'rebase') => void;
  onAssignPR: (username: string) => void;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

// Compact Tree View for Review Process
function ReviewStatusTree({
  status,
  isReviewing,
  reviewResult,
  postedCount,
  onRunReview,
  onRunFollowupReview,
  onCancelReview,
  newCommitsCheck,
  lastPostedAt
}: {
  status: 'not_reviewed' | 'reviewed_pending_post' | 'waiting_for_changes' | 'ready_to_merge' | 'needs_attention' | 'ready_for_followup' | 'followup_issues_remain';
  isReviewing: boolean;
  reviewResult: PRReviewResult | null;
  postedCount: number;
  onRunReview: () => void;
  onRunFollowupReview: () => void;
  onCancelReview: () => void;
  newCommitsCheck: NewCommitsCheck | null;
  lastPostedAt?: number | null;
}) {
  const { t } = useTranslation('common');
  const [isOpen, setIsOpen] = useState(true);

  // If not reviewed, show simple status
  if (status === 'not_reviewed' && !isReviewing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-y-3 p-4 border rounded-lg bg-card shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
          <span className="font-medium text-muted-foreground truncate">{t('prReview.notReviewed')}</span>
        </div>
        <Button onClick={onRunReview} size="sm" className="gap-2 shrink-0 ml-auto sm:ml-0">
          <Play className="h-3.5 w-3.5" />
          {t('prReview.runAIReview')}
        </Button>
      </div>
    );
  }

  // Determine steps for the tree
  const steps: { id: string; label: string; status: string; date?: string | null; action?: React.ReactNode }[] = [];

  // Step 1: Start
  steps.push({
    id: 'start',
    label: t('prReview.reviewStarted'),
    status: 'completed',
    date: reviewResult?.reviewedAt || new Date().toISOString()
  });

  // Step 2: AI Analysis
  if (isReviewing) {
    steps.push({
      id: 'analysis',
      label: t('prReview.analysisInProgress'),
      status: 'current',
      date: null
    });
  } else if (reviewResult) {
    steps.push({
      id: 'analysis',
      label: t('prReview.analysisComplete', { count: reviewResult.findings.length }),
      status: 'completed',
      date: reviewResult.reviewedAt
    });
  }

  // Step 3: Posting
  if (postedCount > 0 || reviewResult?.hasPostedFindings) {
    steps.push({
      id: 'posted',
      label: t('prReview.findingsPostedToGitHub'),
      status: 'completed',
      date: reviewResult?.postedAt || (lastPostedAt ? new Date(lastPostedAt).toISOString() : null)
    });
  } else if (reviewResult && reviewResult.findings.length > 0) {
    steps.push({
      id: 'posted',
      label: t('prReview.pendingPost'),
      status: 'pending',
      date: null
    });
  }

  // Step 4: Follow-up
  if (newCommitsCheck?.hasNewCommits) {
    steps.push({
      id: 'new_commits',
      label: t('prReview.newCommits', { count: newCommitsCheck.newCommitCount }),
      status: 'alert',
      date: null
    });
    steps.push({
      id: 'followup',
      label: t('prReview.readyForFollowup'),
      status: 'pending',
      action: (
        <Button size="sm" variant="outline" onClick={onRunFollowupReview} className="ml-2 h-6 text-xs px-2">
          {t('prReview.runFollowup')}
        </Button>
      )
    });
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border rounded-lg bg-card shadow-sm overflow-hidden"
    >
      {/* Header / Status Bar */}
      <div className="p-4 flex flex-wrap items-center justify-between gap-y-2 bg-muted/30">
        <div className="flex items-center gap-3 min-w-0 pr-2">
          <div className={cn("h-2.5 w-2.5 shrink-0 rounded-full",
            isReviewing ? "bg-blue-500 animate-pulse" :
            status === 'ready_to_merge' ? "bg-success" :
            status === 'waiting_for_changes' ? "bg-warning" :
            status === 'reviewed_pending_post' ? "bg-primary" :
            status === 'ready_for_followup' ? "bg-info" :
            "bg-muted-foreground"
          )} />
          <span className="font-medium truncate">
            {isReviewing ? t('prReview.aiReviewInProgress') :
             status === 'ready_to_merge' ? t('prReview.readyToMerge') :
             status === 'waiting_for_changes' ? t('prReview.waitingForChanges') :
             status === 'reviewed_pending_post' ? t('prReview.reviewComplete') :
             status === 'ready_for_followup' ? t('prReview.readyForFollowup') :
             t('prReview.reviewStatus')}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-auto sm:ml-0">
           {isReviewing && (
             <Button variant="ghost" size="sm" onClick={onCancelReview} className="h-7 text-destructive hover:text-destructive">
               {t('buttons.cancel')}
             </Button>
           )}
           <CollapsibleTrigger asChild>
             <Button variant="ghost" size="icon" className="h-6 w-6">
               {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
             </Button>
           </CollapsibleTrigger>
        </div>
      </div>

      {/* Collapsible Tree */}
      <CollapsibleContent>
        <div className="p-4 pt-0">
          <div className="relative pl-2 ml-2 border-l border-border/50 space-y-4 pt-4">
            {steps.map((step) => (
              <div key={step.id} className="relative flex items-start gap-3 pl-4">
                 {/* Node Dot */}
                 <div className={cn("absolute -left-[13px] top-1 bg-background rounded-full p-0.5 border",
                    step.status === 'completed' ? "border-success text-success" :
                    step.status === 'current' ? "border-primary text-primary animate-pulse" :
                    step.status === 'alert' ? "border-warning text-warning" :
                    "border-muted-foreground text-muted-foreground"
                 )}>
                    {step.status === 'completed' ? <CheckCircle className="h-3 w-3" /> :
                     step.status === 'current' ? <CircleDot className="h-3 w-3" /> :
                     <Circle className="h-3 w-3" />}
                 </div>

                 <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("text-sm font-medium truncate max-w-full",
                        step.status === 'completed' ? "text-foreground" :
                        step.status === 'current' ? "text-primary" :
                        "text-muted-foreground"
                      )}>
                        {step.label}
                      </span>
                      {step.action}
                    </div>
                    {step.date && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                         {formatDate(step.date)}
                      </div>
                    )}
                 </div>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Modern Header Component
function PRHeader({ pr }: { pr: PRData }) {
  const { t } = useTranslation('common');
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
         <div className="flex items-center gap-3">
            <Badge variant={pr.state.toLowerCase() === 'open' ? 'success' : 'secondary'} className={cn(
              "capitalize px-2.5 py-0.5",
              pr.state.toLowerCase() === 'open' ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-emerald-500/20" : ""
            )}>
              {pr.state}
            </Badge>
            <span className="text-muted-foreground text-sm font-mono">#{pr.number}</span>
         </div>
         <Button variant="ghost" size="icon" asChild className="h-8 w-8 text-muted-foreground hover:text-foreground">
           <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer">
             <ExternalLink className="h-4 w-4" />
           </a>
         </Button>
      </div>

      <h1 className="text-xl font-bold mb-4 leading-tight">{pr.title}</h1>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground border-b border-border/40 pb-5">
        <div className="flex items-center gap-2">
          <div className="bg-muted rounded-full p-1">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="font-medium text-foreground">{pr.author.login}</span>
        </div>

        <div className="flex items-center gap-2">
           <Clock className="h-4 w-4 opacity-70" />
           <span>{formatDate(pr.createdAt)}</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 font-mono text-xs border border-border/50">
           <GitBranch className="h-3 w-3" />
           <span className="text-foreground">{pr.headRefName}</span>
           <span className="text-muted-foreground/50 mx-1">→</span>
           <span className="text-foreground">{pr.baseRefName}</span>
        </div>

        <div className="flex items-center gap-4 ml-auto">
           <div className="flex items-center gap-1.5" title={t('prReview.filesChanged', { count: pr.changedFiles })}>
              <FileDiff className="h-4 w-4" />
              <span className="font-medium text-foreground">{pr.changedFiles}</span>
              <span className="text-xs">{t('prReview.files')}</span>
           </div>
           <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">+{pr.additions}</span>
              <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">-{pr.deletions}</span>
           </div>
        </div>
      </div>
    </div>
  );
}

export function PRDetail({
  pr,
  reviewResult,
  reviewProgress,
  isReviewing,
  onRunReview,
  onRunFollowupReview,
  onCheckNewCommits,
  onCancelReview,
  onPostReview,
  onPostComment,
  onMergePR,
  onAssignPR: _onAssignPR,
}: PRDetailProps) {
  const { t } = useTranslation('common');
  // Selection state for findings
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [postedFindingIds, setPostedFindingIds] = useState<Set<string>>(new Set());
  const [isPostingFindings, setIsPostingFindings] = useState(false);
  const [postSuccess, setPostSuccess] = useState<{ count: number; timestamp: number } | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [newCommitsCheck, setNewCommitsCheck] = useState<NewCommitsCheck | null>(null);
  const [, setIsCheckingNewCommits] = useState(false);

  // Auto-select critical and high findings when review completes (excluding already posted)
  useEffect(() => {
    if (reviewResult?.success && reviewResult.findings.length > 0) {
      const importantFindings = reviewResult.findings
        .filter(f => (f.severity === 'critical' || f.severity === 'high') && !postedFindingIds.has(f.id))
        .map(f => f.id);
      setSelectedFindingIds(new Set(importantFindings));
    }
  }, [reviewResult, postedFindingIds]);

  // Check for new commits only when findings have been posted to GitHub
  // Follow-up review only makes sense after initial findings are shared with the contributor
  const hasPostedFindings = postedFindingIds.size > 0 || reviewResult?.hasPostedFindings;

  const checkForNewCommits = useCallback(async () => {
    // Only check for new commits if we have a review AND findings have been posted
    if (reviewResult?.success && reviewResult.reviewedCommitSha && hasPostedFindings) {
      setIsCheckingNewCommits(true);
      try {
        const result = await onCheckNewCommits();
        setNewCommitsCheck(result);
      } finally {
        setIsCheckingNewCommits(false);
      }
    } else {
      // Clear any existing new commits check if we haven't posted yet
      setNewCommitsCheck(null);
    }
  }, [reviewResult, onCheckNewCommits, hasPostedFindings]);

  useEffect(() => {
    checkForNewCommits();
  }, [checkForNewCommits]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (postSuccess) {
      const timer = setTimeout(() => setPostSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [postSuccess]);

  // Count selected findings by type for the button label
  const selectedCount = selectedFindingIds.size;

  // Check if PR is ready to merge based on review
  const isReadyToMerge = useMemo(() => {
    if (!reviewResult || !reviewResult.success) return false;
    // Check if the summary contains "READY TO MERGE"
    return reviewResult.summary?.includes('READY TO MERGE') || reviewResult.overallStatus === 'approve';
  }, [reviewResult]);

  // Compute the overall PR review status for visual display
  type PRStatus = 'not_reviewed' | 'reviewed_pending_post' | 'waiting_for_changes' | 'ready_to_merge' | 'needs_attention' | 'ready_for_followup' | 'followup_issues_remain';
  const prStatus: { status: PRStatus; label: string; description: string; icon: React.ReactNode; color: string } = useMemo(() => {
    if (!reviewResult || !reviewResult.success) {
      return {
        status: 'not_reviewed',
        label: 'Not Reviewed',
        description: 'Run an AI review to analyze this PR',
        icon: <Sparkles className="h-5 w-5" />,
        color: 'bg-muted text-muted-foreground border-muted',
      };
    }

    const totalPosted = postedFindingIds.size + (reviewResult.postedFindingIds?.length ?? 0);
    const hasPosted = totalPosted > 0 || reviewResult.hasPostedFindings;
    const hasBlockers = reviewResult.findings.some(f => f.severity === 'critical' || f.severity === 'high');
    const unpostedFindings = reviewResult.findings.filter(f => !postedFindingIds.has(f.id) && !reviewResult.postedFindingIds?.includes(f.id));
    const hasUnpostedBlockers = unpostedFindings.some(f => f.severity === 'critical' || f.severity === 'high');
    const hasNewCommits = newCommitsCheck?.hasNewCommits ?? false;
    const newCommitCount = newCommitsCheck?.newCommitCount ?? 0;

    // Follow-up review specific statuses
    if (reviewResult.isFollowupReview) {
      const resolvedCount = reviewResult.resolvedFindings?.length ?? 0;
      const unresolvedCount = reviewResult.unresolvedFindings?.length ?? 0;
      const newIssuesCount = reviewResult.newFindingsSinceLastReview?.length ?? 0;

      // Check if any remaining issues are blockers (HIGH/CRITICAL)
      const hasBlockingIssuesRemaining = reviewResult.findings.some(
        f => (f.severity === 'critical' || f.severity === 'high')
      );

      // Check if ready for another follow-up (new commits after this follow-up)
      if (hasNewCommits) {
        return {
          status: 'ready_for_followup',
          label: 'Ready for Follow-up',
          description: `${newCommitCount} new commit${newCommitCount !== 1 ? 's' : ''} since follow-up. Run another follow-up review.`,
          icon: <RefreshCw className="h-5 w-5" />,
          color: 'bg-info/20 text-info border-info/50',
        };
      }

      // All issues resolved - ready to merge
      if (unresolvedCount === 0 && newIssuesCount === 0) {
        return {
          status: 'ready_to_merge',
          label: 'Ready to Merge',
          description: `All ${resolvedCount} issue${resolvedCount !== 1 ? 's' : ''} resolved. This PR can be merged.`,
          icon: <CheckCheck className="h-5 w-5" />,
          color: 'bg-success/20 text-success border-success/50',
        };
      }

      // No blocking issues (only MEDIUM/LOW) - can merge with suggestions
      if (!hasBlockingIssuesRemaining) {
        const suggestionsCount = unresolvedCount + newIssuesCount;
        return {
          status: 'ready_to_merge',
          label: 'Ready to Merge',
          description: `${resolvedCount} resolved. ${suggestionsCount} non-blocking suggestion${suggestionsCount !== 1 ? 's' : ''} remain.`,
          icon: <CheckCheck className="h-5 w-5" />,
          color: 'bg-success/20 text-success border-success/50',
        };
      }

      // Blocking issues still remain after follow-up
      return {
        status: 'followup_issues_remain',
        label: 'Blocking Issues',
        description: `${resolvedCount} resolved, ${unresolvedCount} blocking issue${unresolvedCount !== 1 ? 's' : ''} still open.`,
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    // Initial review statuses (non-follow-up)

    // Priority 1: Ready for follow-up review (posted findings + new commits)
    if (hasPosted && hasNewCommits) {
      return {
        status: 'ready_for_followup',
        label: 'Ready for Follow-up',
        description: `${newCommitCount} new commit${newCommitCount !== 1 ? 's' : ''} since review. Run follow-up to check if issues are resolved.`,
        icon: <RefreshCw className="h-5 w-5" />,
        color: 'bg-info/20 text-info border-info/50',
      };
    }

    // Priority 2: Ready to merge (no blockers)
    if (isReadyToMerge && hasPosted) {
      return {
        status: 'ready_to_merge',
        label: 'Ready to Merge',
        description: 'No blocking issues found. This PR can be merged.',
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    // Priority 3: Waiting for changes (posted but has blockers, no new commits yet)
    if (hasPosted && hasBlockers) {
      return {
        status: 'waiting_for_changes',
        label: 'Waiting for Changes',
        description: `${totalPosted} finding${totalPosted !== 1 ? 's' : ''} posted. Waiting for contributor to address issues.`,
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    // Priority 4: Ready to merge (posted, no blockers)
    if (hasPosted && !hasBlockers) {
      return {
        status: 'ready_to_merge',
        label: 'Ready to Merge',
        description: `${totalPosted} finding${totalPosted !== 1 ? 's' : ''} posted. No blocking issues remain.`,
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    // Priority 5: Needs attention (unposted blockers)
    if (hasUnpostedBlockers) {
      return {
        status: 'needs_attention',
        label: 'Needs Attention',
        description: `${unpostedFindings.length} finding${unpostedFindings.length !== 1 ? 's' : ''} need to be posted to GitHub.`,
        icon: <AlertCircle className="h-5 w-5" />,
        color: 'bg-destructive/20 text-destructive border-destructive/50',
      };
    }

    // Default: Review complete, pending post
    return {
      status: 'reviewed_pending_post',
      label: 'Review Complete',
      description: `${reviewResult.findings.length} finding${reviewResult.findings.length !== 1 ? 's' : ''} found. Select and post to GitHub.`,
      icon: <MessageSquare className="h-5 w-5" />,
      color: 'bg-primary/20 text-primary border-primary/50',
    };
  }, [reviewResult, postedFindingIds, isReadyToMerge, newCommitsCheck]);

  const handlePostReview = async () => {
    const idsToPost = Array.from(selectedFindingIds);
    if (idsToPost.length === 0) return;

    setIsPostingFindings(true);
    try {
      const success = await onPostReview(idsToPost);
      if (success) {
        // Mark these findings as posted
        setPostedFindingIds(prev => new Set([...prev, ...idsToPost]));
        // Clear selection
        setSelectedFindingIds(new Set());
        // Show success message
        setPostSuccess({ count: idsToPost.length, timestamp: Date.now() });
        // After posting, check for new commits (follow-up review now available)
        // Use a small delay to allow the backend to save the posted state
        setTimeout(() => checkForNewCommits(), 500);
      }
    } finally {
      setIsPostingFindings(false);
    }
  };

  const handleApprove = async () => {
    if (!reviewResult) return;

    setIsPosting(true);
    try {
      // Auto-assign current user (you can get from GitHub config)
      // For now, we'll just post the comment
      const approvalMessage = `## ✅ Auto Claude PR Review - APPROVED\n\n${reviewResult.summary}\n\n---\n*This approval was generated by Auto Claude.*`;
      await onPostComment(approvalMessage);
    } finally {
      setIsPosting(false);
    }
  };

  const handleMerge = async () => {
    setIsMerging(true);
    try {
      await onMergePR('squash'); // Default to squash merge
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <ScrollArea className="flex-1">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        
        {/* Refactored Header */}
        <PRHeader pr={pr} />

        {/* Review Status & Actions */}
        <ReviewStatusTree
          status={prStatus.status}
          isReviewing={isReviewing}
          reviewResult={reviewResult}
          postedCount={postedFindingIds.size + (reviewResult?.postedFindingIds?.length ?? 0)}
          onRunReview={onRunReview}
          onRunFollowupReview={onRunFollowupReview}
          onCancelReview={onCancelReview}
          newCommitsCheck={newCommitsCheck}
          lastPostedAt={postSuccess?.timestamp}
        />

        {/* Action Bar (Legacy Actions that fit under the tree context) */}
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

        {/* Review Result / Findings */}
        {reviewResult && reviewResult.success && (
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b bg-muted/20">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {reviewResult.isFollowupReview ? (
                    <RefreshCw className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-purple-500" />
                  )}
                  {reviewResult.isFollowupReview ? 'Follow-up Review Details' : 'AI Analysis Results'}
                </span>
                <Badge variant="outline" className={getStatusColor(reviewResult.overallStatus)}>
                  {reviewResult.overallStatus === 'approve' && 'Approve'}
                  {reviewResult.overallStatus === 'request_changes' && 'Changes Requested'}
                  {reviewResult.overallStatus === 'comment' && 'Comment'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
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

              {/* Interactive Findings with Selection */}
              <ReviewFindings
                findings={reviewResult.findings}
                selectedIds={selectedFindingIds}
                postedIds={postedFindingIds}
                onSelectionChange={setSelectedFindingIds}
              />
            </CardContent>
          </Card>
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

        {/* Description */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('prReview.description')}</CardTitle>
          </CardHeader>
          <CardContent>
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
