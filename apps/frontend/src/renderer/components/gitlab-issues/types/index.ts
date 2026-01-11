import type { ComponentType } from 'react';
import type { GitLabIssue, GitLabInvestigationResult } from '../../../../shared/types';

export type FilterState = 'opened' | 'closed' | 'all';

export interface GitLabIssuesProps {
  onOpenSettings?: () => void;
  /** Navigate to view a task in the kanban board */
  onNavigateToTask?: (taskId: string) => void;
}

export interface IssueListItemProps {
  issue: GitLabIssue;
  isSelected: boolean;
  onClick: () => void;
  onInvestigate: () => void;
}

export interface IssueDetailProps {
  issue: GitLabIssue;
  onInvestigate: () => void;
  investigationResult: GitLabInvestigationResult | null;
  /** ID of existing task linked to this issue (from metadata.gitlabIssueIid) */
  linkedTaskId?: string;
  /** Handler to navigate to view the linked task */
  onViewTask?: (taskId: string) => void;
}

export interface InvestigationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIssue: GitLabIssue | null;
  investigationStatus: {
    phase: string;
    progress: number;
    message: string;
    error?: string;
  };
  onStartInvestigation: (selectedNoteIds: number[]) => void;
  onClose: () => void;
  projectId?: string;
}

export interface IssueListHeaderProps {
  projectPath: string;
  openIssuesCount: number;
  isLoading: boolean;
  searchQuery: string;
  filterState: FilterState;
  onSearchChange: (query: string) => void;
  onFilterChange: (state: FilterState) => void;
  onRefresh: () => void;
}

export interface IssueListProps {
  issues: GitLabIssue[];
  selectedIssueIid: number | null;
  isLoading: boolean;
  error: string | null;
  onSelectIssue: (issueIid: number) => void;
  onInvestigate: (issue: GitLabIssue) => void;
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
