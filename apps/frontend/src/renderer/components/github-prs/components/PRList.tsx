import { GitPullRequest, User, Clock, FileDiff, Loader2, CheckCircle2, AlertCircle, MessageSquare, RefreshCw } from 'lucide-react';
import { ScrollArea } from '../../ui/scroll-area';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import type { PRData, PRReviewProgress, PRReviewResult } from '../hooks/useGitHubPRs';
import type { NewCommitsCheck } from '../../../../preload/api/modules/github-api';
import { useTranslation } from 'react-i18next';

/**
 * Determine the secondary status label for a PR based on its review state
 * and cached new commits check from the store.
 *
 * Status priority:
 * 1. "Ready for Follow-up" - new commits detected since last review (highest priority)
 * 2. "Changes Requested" - review posted with blocking issues
 * 3. "Ready to Merge" - review posted with no blocking issues
 *
 * Note: We only show "Changes Requested" or "Ready to Merge" AFTER the review
 * has been posted to GitHub (reviewId exists or hasPostedFindings is true).
 * Before posting, we just show "Reviewed" via the primary badge.
 */
function getSecondaryStatus(
  reviewResult: PRReviewResult | null | undefined,
  newCommitsCheck: NewCommitsCheck | null | undefined
): {
  type: 'changes_requested' | 'ready_to_merge' | 'ready_for_followup' | 'pending_post' | null;
  label: string;
  description?: string;
} | null {
  if (!reviewResult) return null;

  const hasFindings = reviewResult.findings && reviewResult.findings.length > 0;
  const hasBlockingFindings = reviewResult.findings?.some(
    f => f.severity === 'critical' || f.severity === 'high'
  );
  // Check if review has been posted to GitHub
  const hasBeenPosted = Boolean(reviewResult.reviewId) || Boolean(reviewResult.hasPostedFindings);

  // If we have cached new commits check and there are new commits - ready for follow-up
  // Only show this if the review was previously posted
  if (hasBeenPosted && newCommitsCheck?.hasNewCommits && hasFindings) {
    return {
      type: 'ready_for_followup',
      label: 'Ready for Follow-up',
      description: `${newCommitsCheck.newCommitCount} new commit(s)`
    };
  }

  // Only show status badges AFTER the review has been posted to GitHub
  if (!hasBeenPosted) {
    // If there are findings but not yet posted, show "pending post" indicator
    if (hasFindings) {
      return {
        type: 'pending_post',
        label: 'Pending Post',
        description: `${reviewResult.findings.length} finding(s) to post`
      };
    }
    return null;
  }

  // Review has been posted - show appropriate status

  // If there are blocking findings (critical/high) - show changes requested
  if (hasFindings && hasBlockingFindings) {
    const blockingCount = reviewResult.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length;
    return {
      type: 'changes_requested',
      label: 'Changes Requested',
      description: `${blockingCount} blocking issue(s)`
    };
  }

  // If only non-blocking findings - can merge with suggestions
  if (hasFindings && !hasBlockingFindings) {
    return {
      type: 'ready_to_merge',
      label: 'Ready to Merge',
      description: `${reviewResult.findings.length} suggestion(s)`
    };
  }

  // No findings - ready to merge
  if (!hasFindings && reviewResult.success) {
    return {
      type: 'ready_to_merge',
      label: 'Ready to Merge'
    };
  }

  return null;
}

interface PRReviewInfo {
  isReviewing: boolean;
  progress: PRReviewProgress | null;
  result: PRReviewResult | null;
  error: string | null;
  newCommitsCheck?: NewCommitsCheck | null;
}

interface PRListProps {
  prs: PRData[];
  selectedPRNumber: number | null;
  isLoading: boolean;
  error: string | null;
  activePRReviews: number[];
  getReviewStateForPR: (prNumber: number) => PRReviewInfo | null;
  onSelectPR: (prNumber: number) => void;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
    return `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

export function PRList({ prs, selectedPRNumber, isLoading, error, activePRReviews, getReviewStateForPR, onSelectPR }: PRListProps) {
  const { t } = useTranslation('common');

  if (isLoading && prs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <GitPullRequest className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          <p>Loading pull requests...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-destructive">
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (prs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <GitPullRequest className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No open pull requests</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border">
        {prs.map((pr) => {
          const reviewState = getReviewStateForPR(pr.number);
          const isReviewingPR = reviewState?.isReviewing ?? false;
          const hasReviewResult = reviewState?.result !== null && reviewState?.result !== undefined;
          const secondaryStatus = hasReviewResult ? getSecondaryStatus(reviewState?.result, reviewState?.newCommitsCheck) : null;

          return (
            <button
              key={pr.number}
              onClick={() => onSelectPR(pr.number)}
              className={cn(
                'w-full p-4 text-left transition-colors hover:bg-accent/50',
                selectedPRNumber === pr.number && 'bg-accent'
              )}
            >
              <div className="flex items-start gap-3">
                <GitPullRequest className="h-5 w-5 mt-0.5 text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm text-muted-foreground">#{pr.number}</span>
                    <Badge variant="outline" className="text-xs">
                      {pr.headRefName}
                    </Badge>
                    {/* Review status indicator */}
                    {isReviewingPR && (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {t('prReview.reviewing')}
                      </Badge>
                    )}
                    {!isReviewingPR && hasReviewResult && reviewState?.result && (
                      <>
                        {/* Show "Reviewed" if AI review is complete but not yet posted to GitHub */}
                        {!reviewState.result.reviewId && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 text-blue-500 border-blue-500/50">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('prReview.reviewed')}
                          </Badge>
                        )}
                        {/* Show actual status only after posted to GitHub (has reviewId) */}
                        {reviewState.result.reviewId && reviewState.result.overallStatus === 'approve' && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 text-success border-success/50">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('prReview.approved')}
                          </Badge>
                        )}
                        {reviewState.result.reviewId && reviewState.result.overallStatus === 'request_changes' && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 text-destructive border-destructive/50">
                            <AlertCircle className="h-3 w-3" />
                            {t('prReview.changesRequested')}
                          </Badge>
                        )}
                        {reviewState.result.reviewId && reviewState.result.overallStatus === 'comment' && (
                          <Badge variant="outline" className="text-xs flex items-center gap-1 text-blue-500 border-blue-500/50">
                            <MessageSquare className="h-3 w-3" />
                            {t('prReview.commented')}
                          </Badge>
                        )}
                      </>
                    )}
                    {/* Secondary status badge - shows action needed */}
                    {!isReviewingPR && secondaryStatus && (
                      <>
                        {secondaryStatus.type === 'ready_for_followup' && (
                          <Badge className="text-xs flex items-center gap-1 bg-info/20 text-info border-info/50">
                            <RefreshCw className="h-3 w-3" />
                            {t('prReview.readyForFollowup')}
                          </Badge>
                        )}
                        {secondaryStatus.type === 'pending_post' && (
                          <Badge className="text-xs flex items-center gap-1 bg-muted/50 text-muted-foreground border-muted-foreground/50">
                            <Clock className="h-3 w-3" />
                            {t('prReview.pendingPost')}
                          </Badge>
                        )}
                        {secondaryStatus.type === 'ready_to_merge' && (
                          <Badge className="text-xs flex items-center gap-1 bg-success/20 text-success border-success/50">
                            <CheckCircle2 className="h-3 w-3" />
                            {t('prReview.readyToMerge')}
                          </Badge>
                        )}
                      </>
                    )}
                  </div>
                  <h3 className="font-medium text-sm truncate">{pr.title}</h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {pr.author.login}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(pr.updatedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <FileDiff className="h-3 w-3" />
                      <span className="text-success">+{pr.additions}</span>
                      <span className="text-destructive">-{pr.deletions}</span>
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
