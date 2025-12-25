import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ExternalLink,
  User,
  Users,
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
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { ScrollArea } from '../../ui/scroll-area';
import { Progress } from '../../ui/progress';
import { ReviewFindings } from './ReviewFindings';
import type { PRData, PRReviewResult, PRReviewProgress, PRReviewFinding } from '../hooks/useGitHubPRs';
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
  onAssignPR,
}: PRDetailProps) {
  // Selection state for findings
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [postedFindingIds, setPostedFindingIds] = useState<Set<string>>(new Set());
  const [isPostingFindings, setIsPostingFindings] = useState(false);
  const [postSuccess, setPostSuccess] = useState<{ count: number; timestamp: number } | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [newCommitsCheck, setNewCommitsCheck] = useState<NewCommitsCheck | null>(null);
  const [isCheckingNewCommits, setIsCheckingNewCommits] = useState(false);

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
  const hasImportantSelected = useMemo(() => {
    if (!reviewResult?.findings) return false;
    return reviewResult.findings
      .filter(f => f.severity === 'critical' || f.severity === 'high')
      .some(f => selectedFindingIds.has(f.id));
  }, [reviewResult?.findings, selectedFindingIds]);

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
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-success/20 text-success border-success/50">
                Open
              </Badge>
              <span className="text-sm text-muted-foreground">#{pr.number}</span>
            </div>
            <Button variant="ghost" size="icon" asChild>
              <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <h2 className="text-lg font-semibold text-foreground">{pr.title}</h2>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <User className="h-4 w-4" />
            {pr.author.login}
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {formatDate(pr.createdAt)}
          </div>
          <div className="flex items-center gap-1">
            <GitBranch className="h-4 w-4" />
            {pr.headRefName} → {pr.baseRefName}
          </div>
          {pr.assignees && pr.assignees.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {pr.assignees.map(a => a.login).join(', ')}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="flex items-center gap-1">
            <FileDiff className="h-3 w-3" />
            {pr.changedFiles} files
          </Badge>
          <span className="text-sm text-success">+{pr.additions}</span>
          <span className="text-sm text-destructive">-{pr.deletions}</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {/* Show Follow-up Review button if there are new commits since last review */}
            {newCommitsCheck?.hasNewCommits && !isReviewing ? (
              <Button
                onClick={onRunFollowupReview}
                disabled={isReviewing}
                className="flex-1"
                variant="secondary"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Follow-up Review ({newCommitsCheck.newCommitCount} new commit{newCommitsCheck.newCommitCount !== 1 ? 's' : ''})
              </Button>
            ) : (
              <Button
                onClick={onRunReview}
                disabled={isReviewing}
                className="flex-1"
              >
                {isReviewing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Reviewing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Run AI Review
                  </>
                )}
              </Button>
            )}
            {isReviewing && (
              <Button onClick={onCancelReview} variant="destructive">
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            )}
            {reviewResult && reviewResult.success && selectedCount > 0 && !isReviewing && (
              <Button onClick={handlePostReview} variant="secondary" disabled={isPostingFindings}>
                {isPostingFindings ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Post {selectedCount} Finding{selectedCount !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            )}
            {/* Success message */}
            {postSuccess && (
              <div className="flex items-center gap-2 text-success text-sm">
                <CheckCircle className="h-4 w-4" />
                Posted {postSuccess.count} finding{postSuccess.count !== 1 ? 's' : ''} to GitHub
              </div>
            )}
          </div>

          {/* Approval and Merge buttons */}
          {reviewResult && reviewResult.success && isReadyToMerge && (
            <div className="flex items-center gap-2">
              <Button
                onClick={handleApprove}
                disabled={isPosting}
                variant="default"
                className="flex-1 bg-success hover:bg-success/90"
              >
                {isPosting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve
                  </>
                )}
              </Button>
              <Button
                onClick={handleMerge}
                disabled={isMerging}
                variant="outline"
                className="flex-1"
              >
                {isMerging ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="h-4 w-4 mr-2" />
                    Merge PR
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* PR Review Status Banner */}
        <Card className={`border-2 ${prStatus.color} ${prStatus.status === 'ready_for_followup' ? 'animate-pulse-subtle' : ''}`}>
          <CardContent className="py-3">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${prStatus.color}`}>
                {prStatus.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{prStatus.label}</div>
                <div className="text-sm text-muted-foreground truncate">{prStatus.description}</div>
              </div>
              {prStatus.status === 'ready_for_followup' && (
                <Button
                  onClick={onRunFollowupReview}
                  disabled={isReviewing}
                  className="bg-info hover:bg-info/90 text-info-foreground shrink-0"
                >
                  {isReviewing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Reviewing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Run Follow-up Review
                    </>
                  )}
                </Button>
              )}
              {prStatus.status === 'waiting_for_changes' && newCommitsCheck?.hasNewCommits && (
                <Badge variant="outline" className="bg-primary/20 text-primary border-primary/50 shrink-0">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  {newCommitsCheck.newCommitCount} new commit{newCommitsCheck.newCommitCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Review Progress */}
        {reviewProgress && (
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{reviewProgress.message}</span>
                  <span className="text-muted-foreground">{reviewProgress.progress}%</span>
                </div>
                <Progress value={reviewProgress.progress} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Review Result */}
        {reviewResult && reviewResult.success && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  {reviewResult.isFollowupReview ? (
                    <RefreshCw className="h-4 w-4" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {reviewResult.isFollowupReview ? 'Follow-up Review' : 'AI Review Result'}
                </span>
                <Badge variant="outline" className={getStatusColor(reviewResult.overallStatus)}>
                  {reviewResult.overallStatus === 'approve' && 'Approve'}
                  {reviewResult.overallStatus === 'request_changes' && 'Changes Requested'}
                  {reviewResult.overallStatus === 'comment' && 'Comment'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 overflow-hidden">
              {/* Follow-up Review Resolution Status */}
              {reviewResult.isFollowupReview && (
                <div className="flex flex-wrap gap-2 pb-2 border-b border-border">
                  {(reviewResult.resolvedFindings?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-success/20 text-success border-success/50">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {reviewResult.resolvedFindings?.length} resolved
                    </Badge>
                  )}
                  {(reviewResult.unresolvedFindings?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-warning/20 text-warning border-warning/50">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      {reviewResult.unresolvedFindings?.length} still open
                    </Badge>
                  )}
                  {(reviewResult.newFindingsSinceLastReview?.length ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/50">
                      <XCircle className="h-3 w-3 mr-1" />
                      {reviewResult.newFindingsSinceLastReview?.length} new issue{reviewResult.newFindingsSinceLastReview?.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              )}

              <p className="text-sm text-muted-foreground break-words">{reviewResult.summary}</p>

              {/* Interactive Findings with Selection */}
              <ReviewFindings
                findings={reviewResult.findings}
                selectedIds={selectedFindingIds}
                postedIds={postedFindingIds}
                onSelectionChange={setSelectedFindingIds}
              />

              {reviewResult.reviewedAt && (
                <p className="text-xs text-muted-foreground">
                  Reviewed: {formatDate(reviewResult.reviewedAt)}
                  {reviewResult.reviewedCommitSha && (
                    <> at commit {reviewResult.reviewedCommitSha.substring(0, 7)}</>
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Review Error */}
        {reviewResult && !reviewResult.success && reviewResult.error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" />
                <span className="text-sm">{reviewResult.error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Description */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Description</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            {pr.body ? (
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans break-words max-w-full overflow-hidden">
                {pr.body}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No description provided.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Changed Files */}
        {pr.files && pr.files.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Changed Files ({pr.files.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {pr.files.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <code className="text-muted-foreground truncate flex-1">
                      {file.path}
                    </code>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-success">+{file.additions}</span>
                      <span className="text-destructive">-{file.deletions}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ScrollArea>
  );
}
