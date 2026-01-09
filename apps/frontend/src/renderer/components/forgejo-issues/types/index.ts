import type { ComponentType } from 'react';
import type { ForgejoIssue, ForgejoInvestigationResult } from '../../../../shared/types';

export type FilterState = 'open' | 'closed' | 'all';

export interface ForgejoIssuesProps {
  onOpenSettings?: () => void;
  /** Navigate to view a task in the kanban board */
  onNavigateToTask?: (taskId: string) => void;
}

export interface IssueListItemProps {
  issue: ForgejoIssue;
  isSelected: boolean;
  onClick: () => void;
  onInvestigate: () => void;
}

export interface IssueDetailProps {
  issue: ForgejoIssue;
  onInvestigate: () => void;
  investigationResult: ForgejoInvestigationResult | null;
  /** ID of existing task linked to this issue (from metadata.forgejoIssueNumber) */
  linkedTaskId?: string;
  /** Handler to navigate to view the linked task */
  onViewTask?: (taskId: string) => void;
}

export interface InvestigationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIssue: ForgejoIssue | null;
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
  repoName: string;
  instanceUrl: string;
  openIssuesCount: number;
  isLoading: boolean;
  searchQuery: string;
  filterState: FilterState;
  onSearchChange: (query: string) => void;
  onFilterChange: (state: FilterState) => void;
  onRefresh: () => void;
}

export interface IssueListProps {
  issues: ForgejoIssue[];
  selectedIssueNumber: number | null;
  isLoading: boolean;
  error: string | null;
  onSelectIssue: (issueNumber: number) => void;
  onInvestigate: (issue: ForgejoIssue) => void;
}

export interface EmptyStateProps {
  searchQuery?: string;
  icon?: ComponentType<{ className?: string }>;
  message: string;
}

export interface NotConnectedStateProps {
  error: string | null;
  onOpenSettings?: () => void;
}
