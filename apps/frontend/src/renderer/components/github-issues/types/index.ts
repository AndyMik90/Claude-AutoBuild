import type { GitHubIssue, GitHubInvestigationResult } from '../../../../shared/types';
import type { AutoFixConfig, AutoFixQueueItem } from '../../../../preload/api/modules/github-api';

export type FilterState = 'open' | 'closed' | 'all';

export interface GitHubIssuesProps {
  onOpenSettings?: () => void;
  /** Navigate to view a task in the kanban board */
  onNavigateToTask?: (taskId: string) => void;
}

export interface IssueListItemProps {
  issue: GitHubIssue;
  isSelected: boolean;
  onClick: () => void;
  onInvestigate: () => void;
}

export interface IssueDetailProps {
  issue: GitHubIssue;
  onInvestigate: () => void;
  investigationResult: GitHubInvestigationResult | null;
  /** ID of existing task linked to this issue (from metadata.githubIssueNumber) */
  linkedTaskId?: string;
  /** Handler to navigate to view the linked task */
  onViewTask?: (taskId: string) => void;
  /** Project ID for auto-fix functionality */
  projectId?: string;
  /** Auto-fix configuration */
  autoFixConfig?: AutoFixConfig | null;
  /** Auto-fix queue item for this issue */
  autoFixQueueItem?: AutoFixQueueItem | null;
}

export interface InvestigationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIssue: GitHubIssue | null;
  investigationStatus: {
    phase: string;
    progress: number;
    message: string;
    error?: string;
  };
  onStartInvestigation: (selectedCommentIds: number[]) => void;
  onClose: () => void;
  projectId?: string;
}

export interface IssueListHeaderProps {
  repoFullName: string;
  openIssuesCount: number;
  isLoading: boolean;
  searchQuery: string;
  filterState: FilterState;
  onSearchChange: (query: string) => void;
  onFilterChange: (state: FilterState) => void;
  onRefresh: () => void;
  // Auto-fix toggle (reactive - for new issues)
  autoFixEnabled?: boolean;
  autoFixRunning?: boolean;
  autoFixProcessing?: number; // Number of issues being processed
  onAutoFixToggle?: (enabled: boolean) => void;
  // Analyze & Group (proactive - for existing issues)
  onAnalyzeAndGroup?: () => void;
  isAnalyzing?: boolean;
}

export interface IssueListProps {
  issues: GitHubIssue[];
  selectedIssueNumber: number | null;
  isLoading: boolean;
  error: string | null;
  onSelectIssue: (issueNumber: number) => void;
  onInvestigate: (issue: GitHubIssue) => void;
}

export interface EmptyStateProps {
  searchQuery?: string;
  icon?: React.ComponentType<{ className?: string }>;
  message: string;
}

export interface NotConnectedStateProps {
  error: string | null;
  onOpenSettings?: () => void;
}
