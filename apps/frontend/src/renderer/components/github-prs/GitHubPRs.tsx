import { useState, useCallback, useMemo } from 'react';
import { GitPullRequest, Settings } from 'lucide-react';
import { useProjectStore } from '../../stores/project-store';
import { useGitHubPRs } from './hooks';
import { PRList, PRDetail, PRListHeader, PRListControls } from './components';
import { Button } from '../ui/button';
import type { PRStatusFilter } from './components/StatusTabs';
import type { SortOption } from './components/FilterDropdowns';

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
    openCount,
    closedCount,
    getPRsByStatus,
  } = useGitHubPRs(selectedProject?.id);

  // State for status tab (open/closed)
  const [activeTab, setActiveTab] = useState<PRStatusFilter>('open');
  // State for search query
  const [searchQuery, setSearchQuery] = useState('');
  // State for filter dropdowns
  const [selectedAuthor, setSelectedAuthor] = useState<string | undefined>(undefined);
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(undefined);
  const [selectedSort, setSelectedSort] = useState<SortOption>('newest');

  // Get PRs for current status tab
  const currentPRs = useMemo(() => getPRsByStatus(activeTab), [getPRsByStatus, activeTab]);

  // Apply filters and search to current PRs
  const filteredPRs = useMemo(() => {
    let result = currentPRs;

    // Filter by author
    if (selectedAuthor) {
      result = result.filter(pr => pr.author.login === selectedAuthor);
    }

    // Note: Label filtering is a placeholder - PRData doesn't include labels currently
    // The UI shows the Label dropdown but it won't filter until the API includes labels

    // Filter by search query (simple title/author/branch search)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(pr =>
        pr.title.toLowerCase().includes(query) ||
        pr.author.login.toLowerCase().includes(query) ||
        pr.headRefName.toLowerCase().includes(query) ||
        `#${pr.number}`.includes(query)
      );
    }

    // Sort PRs
    result = [...result].sort((a, b) => {
      switch (selectedSort) {
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'recently-updated':
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case 'least-recently-updated':
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        // Note: Comment-based sorting is a placeholder - PRData doesn't include comment count
        // Fallback to newest for unsupported sort options
        case 'most-commented':
        case 'least-commented':
        case 'newest':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [currentPRs, selectedAuthor, searchQuery, selectedSort]);

  // Derive unique authors from all PRs (both open and closed) for filter dropdown
  const uniqueAuthors = useMemo(() => {
    const allPRs = [...getPRsByStatus('open'), ...getPRsByStatus('closed')];
    const authors = new Set(allPRs.map(pr => pr.author.login));
    return Array.from(authors).sort();
  }, [getPRsByStatus]);

  // Note: Labels are a placeholder - PRData doesn't include labels currently
  // Return empty array for now; dropdown will show "No labels found"
  const uniqueLabels: string[] = [];

  const selectedPR = filteredPRs.find(pr => pr.number === selectedPRNumber) || prs.find(pr => pr.number === selectedPRNumber);

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
      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* PR List Panel */}
        <div className="w-1/2 border-r border-border flex flex-col">
          {/* Header with search, badges, and New PR button */}
          <PRListHeader
            repoFullName={repoFullName || undefined}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isLoading={isLoading}
            onRefresh={refresh}
          />

          {/* Controls with status tabs and filter dropdowns */}
          <PRListControls
            activeTab={activeTab}
            openCount={openCount}
            closedCount={closedCount}
            onTabChange={setActiveTab}
            authors={uniqueAuthors}
            labels={uniqueLabels}
            selectedAuthor={selectedAuthor}
            selectedLabel={selectedLabel}
            selectedSort={selectedSort}
            onAuthorChange={setSelectedAuthor}
            onLabelChange={setSelectedLabel}
            onSortChange={setSelectedSort}
          />

          {/* PR List */}
          <PRList
            prs={filteredPRs}
            selectedPRNumber={selectedPRNumber}
            isLoading={isLoading}
            error={error}
            activePRReviews={activePRReviews}
            getReviewStateForPR={getReviewStateForPR}
            onSelectPR={selectPR}
            statusFilter={activeTab}
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
