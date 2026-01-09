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
  ExternalLink,
  Play,
  Clock,
} from 'lucide-react';
import { Badge } from '../../ui/badge';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { ScrollArea } from '../../ui/scroll-area';
import { Progress } from '../../ui/progress';

// Local components
import { CollapsibleCard } from './CollapsibleCard';
import { ReviewStatusTree } from './ReviewStatusTree';
import { PRHeader } from './PRHeader';
import { ReviewFindings } from './ReviewFindings';
import { PRLogs } from './PRLogs';

import type { PRData, PRReviewResult, PRReviewProgress } from '../hooks/useGitHubPRs';
import type { NewCommitsCheck, MergeReadiness, PRLogs as PRLogsType, WorkflowsAwaitingApprovalResult } from '../../../../preload/api/modules/github-api';

interface PRDetailProps {
  pr: PRData;
  projectId: string;
  reviewResult: PRReviewResult | null;
  previousReviewResult: PRReviewResult | null;
  reviewProgress: PRReviewProgress | null;
  isReviewing: boolean;
  initialNewCommitsCheck?: NewCommitsCheck | null;
  isActive?: boolean;
  isLoadingFiles?: boolean;
  onRunReview: () => void;
  onRunFollowupReview: () => void;
  onCheckNewCommits: () => Promise<NewCommitsCheck>;
  onCancelReview: () => void;
  onPostReview: (selectedFindingIds?: string[], options?: { forceApprove?: boolean }) => Promise<boolean>;
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
  projectId,
  reviewResult,
  previousReviewResult,
  reviewProgress,
  isReviewing,
  initialNewCommitsCheck,
  isActive: _isActive = false,
  isLoadingFiles = false,
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
  const { t } = useTranslation('common');
  // Selection state for findings
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [postedFindingIds, setPostedFindingIds] = useState<Set<string>>(new Set());
  const [isPostingFindings, setIsPostingFindings] = useState(false);
  const [postSuccess, setPostSuccess] = useState<{ count: number; timestamp: number } | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  // Initialize with store value, then sync and update via local checks
  const [newCommitsCheck, setNewCommitsCheck] = useState<NewCommitsCheck | null>(initialNewCommitsCheck ?? null);
  const [analysisExpanded, setAnalysisExpanded] = useState(true);
  const checkNewCommitsAbortRef = useRef<AbortController | null>(null);
  // Ref to track checking state without causing callback recreation
  const isCheckingNewCommitsRef = useRef(false);
  // Logs state
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [prLogs, setPrLogs] = useState<PRLogsType | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const logsLoadedRef = useRef(false);
  
  // Merge readiness state (real-time validation of AI verdict freshness)
  const [mergeReadiness, setMergeReadiness] = useState<MergeReadiness | null>(null);
  const mergeReadinessAbortRef = useRef<AbortController | null>(null);

  // Workflows awaiting approval state (for fork PRs)
  const [workflowsAwaiting, setWorkflowsAwaiting] = useState<WorkflowsAwaitingApprovalResult | null>(null);
  const [isApprovingWorkflow, setIsApprovingWorkflow] = useState<number | null>(null);
  const [workflowsExpanded, setWorkflowsExpanded] = useState(true);

  // Sync with store's newCommitsCheck when it changes (e.g., when switching PRs or after refresh)
  // Always sync to keep local state in sync with store, including null values
  useEffect(() => {
    setNewCommitsCheck(initialNewCommitsCheck ?? null);
  }, [initialNewCommitsCheck]);

  // Sync local postedFindingIds with reviewResult.postedFindingIds when it changes
  useEffect(() => {
    if (reviewResult?.postedFindingIds) {
      setPostedFindingIds(new Set(reviewResult.postedFindingIds));
    } else {
      setPostedFindingIds(new Set());
    }
  }, [reviewResult?.postedFindingIds, pr.number]);

  // Auto-select ALL findings when review completes (excluding already posted)
  // All findings should reach the contributor - even LOW suggestions are valuable feedback
  useEffect(() => {
    if (reviewResult?.success && reviewResult.findings.length > 0) {
      const allFindings = reviewResult.findings
        .filter(f => !postedFindingIds.has(f.id))
        .map(f => f.id);
      setSelectedFindingIds(new Set(allFindings));
    }
  }, [reviewResult, postedFindingIds]);

  // Check for new commits after any review has been completed
  // This allows detecting new work pushed after ANY review (initial or follow-up)
  const hasPostedFindings = postedFindingIds.size > 0 || reviewResult?.hasPostedFindings;

  const checkForNewCommits = useCallback(async () => {
    // Prevent duplicate concurrent calls using ref (avoids callback recreation)
    if (isCheckingNewCommitsRef.current) {
      return;
    }

    // Cancel any pending check
    if (checkNewCommitsAbortRef.current) {
      checkNewCommitsAbortRef.current.abort();
    }
    checkNewCommitsAbortRef.current = new AbortController();

    // Check for new commits if we have ANY successful review with a commit SHA
    // This includes follow-up reviews that resolved all issues (no new findings)
    // New commits = new code that needs to be reviewed, regardless of posting status
    if (reviewResult?.success && reviewResult.reviewedCommitSha) {
      isCheckingNewCommitsRef.current = true;
      try {
        const result = await onCheckNewCommits();
        // Only update state if not aborted
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
      // Cleanup abort controller on unmount
      if (checkNewCommitsAbortRef.current) {
        checkNewCommitsAbortRef.current.abort();
      }
    };
  }, [checkForNewCommits]);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (postSuccess) {
      const timer = setTimeout(() => setPostSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [postSuccess]);

  // Auto-expand logs section when review starts
  useEffect(() => {
    if (isReviewing) {
      setLogsExpanded(true);
    }
  }, [isReviewing]);

  // Load logs when logs section is expanded or when reviewing (for live logs)
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

  // Track previous reviewing state to detect transitions
  const wasReviewingRef = useRef(false);

  // Refresh logs periodically while reviewing (even faster during active review)
  useEffect(() => {
    const wasReviewing = wasReviewingRef.current;
    wasReviewingRef.current = isReviewing;

    // Do one final refresh when review just completed to get final phase status
    if (wasReviewing && !isReviewing) {
      onGetLogs()
        .then(logs => setPrLogs(logs))
        .catch(err => console.error('Failed to fetch final logs:', err));
      return;
    }

    // Clear old logs when a new review starts to avoid showing stale status
    if (!wasReviewing && isReviewing) {
      setPrLogs(null);
    }

    if (!isReviewing) return;

    const refreshLogs = async () => {
      try {
        const logs = await onGetLogs();
        setPrLogs(logs);
      } catch {
        // Ignore errors during refresh
      }
    };

    // Refresh immediately, then every 1.5 seconds while reviewing for smoother streaming
    refreshLogs();
    const interval = setInterval(refreshLogs, 1500);
    return () => clearInterval(interval);
  }, [isReviewing, onGetLogs]);

  // Reset logs state when PR changes
  useEffect(() => {
    logsLoadedRef.current = false;
    setPrLogs(null);
    setLogsExpanded(false);
  }, [pr.number]);

  // Check for workflows awaiting approval (fork PRs) when PR changes or review completes
  useEffect(() => {
    const checkWorkflows = async () => {
      try {
        const result = await window.electronAPI.github.getWorkflowsAwaitingApproval(
          '', // projectId will be resolved from active project
          pr.number
        );
        setWorkflowsAwaiting(result);
      } catch {
        setWorkflowsAwaiting(null);
      }
    };

    checkWorkflows();
    // Re-check when a review is completed (CI status might have changed)
  }, [pr.number, reviewResult]);

  // Check merge readiness (real-time validation) when PR is selected
  // This runs on every PR selection to catch stale verdicts
  useEffect(() => {
    // Cancel any pending check
    if (mergeReadinessAbortRef.current) {
      mergeReadinessAbortRef.current.abort();
    }
    mergeReadinessAbortRef.current = new AbortController();

    const checkMergeReadiness = async () => {
      if (!projectId) {
        setMergeReadiness(null);
        return;
      }

      try {
        const result = await window.electronAPI.github.checkMergeReadiness(projectId, pr.number);
        // Only update if not aborted
        if (!mergeReadinessAbortRef.current?.signal.aborted) {
          setMergeReadiness(result);
        }
      } catch {
        if (!mergeReadinessAbortRef.current?.signal.aborted) {
          setMergeReadiness(null);
        }
      }
    };

    checkMergeReadiness();

    return () => {
      if (mergeReadinessAbortRef.current) {
        mergeReadinessAbortRef.current.abort();
      }
    };
  }, [pr.number, projectId]);

  // Handler to approve a workflow
  const handleApproveWorkflow = useCallback(async (runId: number) => {
    setIsApprovingWorkflow(runId);
    try {
      const success = await window.electronAPI.github.approveWorkflow('', runId);
      if (success) {
        // Refresh the workflows list after approval
        const result = await window.electronAPI.github.getWorkflowsAwaitingApproval('', pr.number);
        setWorkflowsAwaiting(result);
      }
    } finally {
      setIsApprovingWorkflow(null);
    }
  }, [pr.number]);

  // Handler to approve all workflows at once
  const handleApproveAllWorkflows = useCallback(async () => {
    if (!workflowsAwaiting?.workflow_runs.length) return;

    for (const workflow of workflowsAwaiting.workflow_runs) {
      setIsApprovingWorkflow(workflow.id);
      try {
        await window.electronAPI.github.approveWorkflow('', workflow.id);
      } catch {
        // Continue with other workflows even if one fails
      }
    }
    setIsApprovingWorkflow(null);

    // Refresh the workflows list
    const result = await window.electronAPI.github.getWorkflowsAwaitingApproval('', pr.number);
    setWorkflowsAwaiting(result);
  }, [pr.number, workflowsAwaiting]);

  // Count selected findings by type for the button label
  const selectedCount = selectedFindingIds.size;

  // Check if PR is ready to merge based on review
  const isReadyToMerge = useMemo(() => {
    if (!reviewResult || !reviewResult.success) return false;
    // Check if the summary contains "READY TO MERGE"
    return reviewResult.summary?.includes('READY TO MERGE') || reviewResult.overallStatus === 'approve';
  }, [reviewResult]);

  // Check if review is "clean" - only LOW severity findings (no MEDIUM, HIGH, or CRITICAL)
  // Requires at least having a successful review to be considered clean
  const isCleanReview = useMemo(() => {
    if (!reviewResult || !reviewResult.success) return false;
    // Only LOW findings allowed - no medium, high, or critical
    // A review with zero findings is also considered clean
    return !reviewResult.findings.some(f =>
      f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium'
    );
  }, [reviewResult]);

  // Check if there are any findings at all (for auto-approve button label)
  const hasFindings = useMemo(() => {
    return reviewResult?.findings && reviewResult.findings.length > 0;
  }, [reviewResult]);

  // Get LOW severity findings for auto-posting
  const lowSeverityFindings = useMemo(() => {
    if (!reviewResult?.findings) return [];
    return reviewResult.findings.filter(f => f.severity === 'low');
  }, [reviewResult]);

  // Compute the overall PR review status for visual display
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

    // Use a merged Set to avoid double-counting (local state may overlap with backend state)
    const allPostedIds = new Set([...postedFindingIds, ...(reviewResult.postedFindingIds ?? [])]);
    const totalPosted = allPostedIds.size;
    const hasPosted = totalPosted > 0 || reviewResult.hasPostedFindings;
    const hasBlockers = reviewResult.findings.some(f => f.severity === 'critical' || f.severity === 'high');
    const unpostedFindings = reviewResult.findings.filter(f => !allPostedIds.has(f.id));
    const hasUnpostedBlockers = unpostedFindings.some(f => f.severity === 'critical' || f.severity === 'high');
    const hasNewCommits = newCommitsCheck?.hasNewCommits ?? false;
    const newCommitCount = newCommitsCheck?.newCommitCount ?? 0;
    // Only consider commits that happened AFTER findings were posted for "Ready for Follow-up"
    const hasCommitsAfterPosting = newCommitsCheck?.hasCommitsAfterPosting ?? false;

    // Follow-up review specific statuses
    if (reviewResult.isFollowupReview) {
      const resolvedCount = reviewResult.resolvedFindings?.length ?? 0;
      const unresolvedCount = reviewResult.unresolvedFindings?.length ?? 0;
      const newIssuesCount = reviewResult.newFindingsSinceLastReview?.length ?? 0;

      // Check if any remaining issues are blockers (HIGH/CRITICAL)
      const hasBlockingIssuesRemaining = reviewResult.findings.some(
        f => (f.severity === 'critical' || f.severity === 'high')
      );

      // Check if ready for another follow-up (new commits AFTER this follow-up was posted)
      if (hasNewCommits && hasCommitsAfterPosting) {
        return {
          status: 'ready_for_followup',
          label: t('prReview.readyForFollowup'),
          description: t('prReview.newCommitsSinceFollowup', { count: newCommitCount }),
          icon: <RefreshCw className="h-5 w-5" />,
          color: 'bg-info/20 text-info border-info/50',
        };
      }

      // All issues resolved - ready to merge
      if (unresolvedCount === 0 && newIssuesCount === 0) {
        return {
          status: 'ready_to_merge',
          label: t('prReview.readyToMerge'),
          description: t('prReview.allIssuesResolved', { count: resolvedCount }),
          icon: <CheckCheck className="h-5 w-5" />,
          color: 'bg-success/20 text-success border-success/50',
        };
      }

      // No blocking issues (only MEDIUM/LOW) - can merge with suggestions
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

      // Blocking issues still remain after follow-up
      return {
        status: 'followup_issues_remain',
        label: t('prReview.blockingIssues'),
        description: t('prReview.blockingIssuesDesc', { resolved: resolvedCount, unresolved: unresolvedCount }),
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    // Initial review statuses (non-follow-up)

    // Priority 1: Ready for follow-up review (posted findings + new commits AFTER posting)
    if (hasPosted && hasNewCommits && hasCommitsAfterPosting) {
      return {
        status: 'ready_for_followup',
        label: t('prReview.readyForFollowup'),
        description: t('prReview.newCommitsSinceReview', { count: newCommitCount }),
        icon: <RefreshCw className="h-5 w-5" />,
        color: 'bg-info/20 text-info border-info/50',
      };
    }

    // Priority 2: Ready to merge (no blockers)
    if (isReadyToMerge && hasPosted) {
      return {
        status: 'ready_to_merge',
        label: t('prReview.readyToMerge'),
        description: t('prReview.noBlockingIssues'),
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    // Priority 3: Waiting for changes (posted but has blockers, no new commits yet)
    if (hasPosted && hasBlockers) {
      return {
        status: 'waiting_for_changes',
        label: t('prReview.waitingForChanges'),
        description: t('prReview.findingsPostedWaiting', { count: totalPosted }),
        icon: <AlertTriangle className="h-5 w-5" />,
        color: 'bg-warning/20 text-warning border-warning/50',
      };
    }

    // Priority 4: Ready to merge (posted, no blockers)
    if (hasPosted && !hasBlockers) {
      return {
        status: 'ready_to_merge',
        label: t('prReview.readyToMerge'),
        description: t('prReview.findingsPostedNoBlockers', { count: totalPosted }),
        icon: <CheckCheck className="h-5 w-5" />,
        color: 'bg-success/20 text-success border-success/50',
      };
    }

    // Priority 5: Needs attention (unposted blockers)
    if (hasUnpostedBlockers) {
      return {
        status: 'needs_attention',
        label: t('prReview.needsAttention'),
        description: t('prReview.findingsNeedPosting', { count: unpostedFindings.length }),
        icon: <AlertCircle className="h-5 w-5" />,
        color: 'bg-destructive/20 text-destructive border-destructive/50',
      };
    }

    // Default: Review complete, pending post
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

  // Auto-approval for clean PRs - posts approval with LOW findings as suggestions in a SINGLE comment
  // NOTE: GitHub PR comments are intentionally in English as it's the lingua franca
  // for code reviews and GitHub's international developer community. The comment
  // content is meant to be read by contributors who may have different locales.
  const handleAutoApprove = async () => {
    if (!reviewResult) return;
    setIsPosting(true);
    try {
      // Post approval with suggestions in a single review comment
      // This uses forceApprove to set APPROVE status even with LOW findings
      const lowFindingIds = lowSeverityFindings.map(f => f.id);

      const success = await onPostReview(lowFindingIds, { forceApprove: true });
      if (success && lowFindingIds.length > 0) {
        // Mark findings as posted locally
        setPostedFindingIds(prev => new Set([...prev, ...lowFindingIds]));
      }
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
        <PRHeader pr={pr} isLoadingFiles={isLoadingFiles} />

        {/* Merge Readiness Warning Banner - shows when real-time status contradicts AI verdict */}
        {mergeReadiness && mergeReadiness.blockers.length > 0 && reviewResult?.success && (
          prStatus.status === 'ready_to_merge' || prStatus.status === 'reviewed_pending_post'
        ) && (
          <Card className="border-warning/50 bg-warning/10 animate-in fade-in slide-in-from-top-2 duration-300">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="font-semibold text-warning">
                    {t('prReview.verdictOutdated', 'AI verdict may be outdated')}
                  </p>
                  <ul className="text-sm text-warning/90 space-y-1">
                    {mergeReadiness.blockers.map((blocker, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning/70" />
                        {blocker}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-warning/70 mt-2">
                    {t('prReview.rerunReviewSuggestion', 'Consider re-running the review after resolving these issues.')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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

             {/* Approve button - consolidated logic to avoid duplicate buttons */}
             {/* Don't show when overallStatus is 'request_changes' (e.g., workflows blocked, or other issues) */}
             {isCleanReview && !hasPostedFindings && reviewResult?.overallStatus !== 'request_changes' && (
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

             {/* Manual approve button - only show for non-clean reviews that are ready to merge */}
             {/* isReadyToMerge already checks for 'approve' status, so no need for additional check */}
             {isReadyToMerge && !isCleanReview && !hasPostedFindings && (
                <Button
                  onClick={handleApprove}
                  disabled={isPosting}
                  variant="default"
                  className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isPosting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {t('prReview.approve')}
                </Button>
             )}

             {/* Merge button - only show after approval has been posted */}
             {hasPostedFindings && (
                <Button
                  onClick={handleMerge}
                  disabled={isMerging}
                  variant="outline"
                  className="flex-1 sm:flex-none gap-1.5 text-muted-foreground hover:text-foreground"
                  title={t('prReview.mergeViaGitHub')}
                >
                  {isMerging ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <GitMerge className="h-4 w-4" />
                      <span>{t('prReview.merge')}</span>
                      <ExternalLink className="h-3 w-3 opacity-50" />
                    </>
                  )}
                </Button>
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
                <div className="flex flex-wrap items-center gap-3 pb-4 border-b border-border/50">
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
                  {/* Re-run follow-up review button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 ml-auto text-muted-foreground hover:text-foreground"
                    onClick={onRunFollowupReview}
                    disabled={isReviewing}
                    title={t('prReview.rerunFollowup')}
                  >
                    {isReviewing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
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

        {/* Workflows Awaiting Approval - for fork PRs */}
        {workflowsAwaiting && workflowsAwaiting.awaiting_approval > 0 && (
          <CollapsibleCard
            title={t('prReview.workflowsAwaitingApproval', { count: workflowsAwaiting.awaiting_approval })}
            icon={<Clock className="h-4 w-4 text-warning" />}
            badge={
              <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {t('prReview.blockedByWorkflows')}
              </Badge>
            }
            open={workflowsExpanded}
            onOpenChange={setWorkflowsExpanded}
          >
            <div className="p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t('prReview.workflowsAwaitingDescription')}
              </p>

              <div className="space-y-2">
                {workflowsAwaiting.workflow_runs.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="h-4 w-4 text-warning shrink-0" />
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate block">
                          {workflow.workflow_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {workflow.name}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => window.open(workflow.html_url, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {t('prReview.viewOnGitHub')}
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs"
                        onClick={() => handleApproveWorkflow(workflow.id)}
                        disabled={isApprovingWorkflow !== null}
                      >
                        {isApprovingWorkflow === workflow.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-3 w-3 mr-1" />
                            {t('prReview.approveWorkflow')}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {workflowsAwaiting.workflow_runs.length > 1 && (
                <div className="flex justify-end pt-2 border-t border-border/50">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleApproveAllWorkflows}
                    disabled={isApprovingWorkflow !== null}
                  >
                    {isApprovingWorkflow !== null ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    {t('prReview.approveAllWorkflows')}
                  </Button>
                </div>
              )}
            </div>
          </CollapsibleCard>
        )}

        {/* Review Logs - show during review or after completion */}
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
