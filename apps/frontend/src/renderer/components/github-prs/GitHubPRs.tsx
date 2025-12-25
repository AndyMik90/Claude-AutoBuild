import { useState, useCallback } from 'react';
import { GitPullRequest, RefreshCw, ExternalLink, Settings } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { useGitHubPRs } from './hooks';
import { PRList, PRDetail } from './components';
import { Button } from '../ui/button';

interface GitHubPRsProps {
  onOpenSettings?: () => void;
}

function NotConnectedState({
  error,
  onOpenSettings
}: {
  error: string | null;
  onOpenSettings?: () => void;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <GitPullRequest className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-medium mb-2">GitHub Not Connected</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {error || 'Connect your GitHub account to view and review pull requests.'}
        </p>
        {onOpenSettings && (
          <Button onClick={onOpenSettings} variant="outline">
            <Settings className="h-4 w-4 mr-2" />
            Open Settings
          </Button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-muted-foreground">
        <GitPullRequest className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>{message}</p>
      </div>
    </div>
  );
}

export function GitHubPRs({ onOpenSettings }: GitHubPRsProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const {
    prs,
    isLoading,
    error,
    selectedPRNumber,
    reviewResult,
    reviewProgress,
    isReviewing,
    activePRReviews,
    selectPR,
    runReview,
    runFollowupReview,
    checkNewCommits,
    cancelReview,
    postReview,
    postComment,
    mergePR,
    assignPR,
    refresh,
    isConnected,
    repoFullName,
    getReviewStateForPR,
  } = useGitHubPRs(selectedProject?.id);

  const selectedPR = prs.find(pr => pr.number === selectedPRNumber);

  const handleRunReview = useCallback(() => {
    if (selectedPRNumber) {
      runReview(selectedPRNumber);
    }
  }, [selectedPRNumber, runReview]);

  const handleRunFollowupReview = useCallback(() => {
    if (selectedPRNumber) {
      runFollowupReview(selectedPRNumber);
    }
  }, [selectedPRNumber, runFollowupReview]);

  const handleCheckNewCommits = useCallback(async () => {
    if (selectedPRNumber) {
      return await checkNewCommits(selectedPRNumber);
    }
    return { hasNewCommits: false, newCommitCount: 0 };
  }, [selectedPRNumber, checkNewCommits]);

  const handleCancelReview = useCallback(() => {
    if (selectedPRNumber) {
      cancelReview(selectedPRNumber);
    }
  }, [selectedPRNumber, cancelReview]);

  const handlePostReview = useCallback(async (selectedFindingIds?: string[]): Promise<boolean> => {
    if (selectedPRNumber && reviewResult) {
      return await postReview(selectedPRNumber, selectedFindingIds);
    }
    return false;
  }, [selectedPRNumber, reviewResult, postReview]);

  const handlePostComment = useCallback(async (body: string) => {
    if (selectedPRNumber) {
      await postComment(selectedPRNumber, body);
    }
  }, [selectedPRNumber, postComment]);

  const handleMergePR = useCallback(async (mergeMethod?: 'merge' | 'squash' | 'rebase') => {
    if (selectedPRNumber) {
      await mergePR(selectedPRNumber, mergeMethod);
    }
  }, [selectedPRNumber, mergePR]);

  const handleAssignPR = useCallback(async (username: string) => {
    if (selectedPRNumber) {
      await assignPR(selectedPRNumber, username);
    }
  }, [selectedPRNumber, assignPR]);

  // Not connected state
  if (!isConnected) {
    return <NotConnectedState error={error} onOpenSettings={onOpenSettings} />;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <GitPullRequest className="h-4 w-4" />
            Pull Requests
          </h2>
          {repoFullName && (
            <a
              href={`https://github.com/${repoFullName}/pulls`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              {repoFullName}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <span className="text-xs text-muted-foreground">
            {prs.length} open
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={refresh}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* PR List */}
        <div className="w-1/2 border-r border-border flex flex-col">
          <PRList
            prs={prs}
            selectedPRNumber={selectedPRNumber}
            isLoading={isLoading}
            error={error}
            activePRReviews={activePRReviews}
            getReviewStateForPR={getReviewStateForPR}
            onSelectPR={selectPR}
          />
        </div>

        {/* PR Detail */}
        <div className="w-1/2 flex flex-col">
          {selectedPR ? (
            <PRDetail
              pr={selectedPR}
              reviewResult={reviewResult}
              reviewProgress={reviewProgress}
              isReviewing={isReviewing}
              onRunReview={handleRunReview}
              onRunFollowupReview={handleRunFollowupReview}
              onCheckNewCommits={handleCheckNewCommits}
              onCancelReview={handleCancelReview}
              onPostReview={handlePostReview}
              onPostComment={handlePostComment}
              onMergePR={handleMergePR}
              onAssignPR={handleAssignPR}
            />
          ) : (
            <EmptyState message="Select a pull request to view details" />
          )}
        </div>
      </div>
    </div>
  );
}
