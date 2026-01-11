// Main export for the gitlab-issues module
export { GitLabIssues } from '../GitLabIssues';

// Re-export types for external usage if needed
export type {
  GitLabIssuesProps,
  FilterState,
  IssueListItemProps,
  IssueDetailProps,
  InvestigationDialogProps,
  IssueListHeaderProps,
  IssueListProps
} from './types';

// Re-export hooks for external usage if needed
export {
  useGitLabIssues,
  useGitLabInvestigation,
  useIssueFiltering
} from './hooks';

// Re-export components for external usage if needed
export {
  IssueListItem,
  IssueDetail,
  InvestigationDialog,
  EmptyState,
  NotConnectedState,
  IssueListHeader,
  IssueList
} from './components';

// Re-export utils for external usage if needed
export { formatDate, filterIssuesBySearch } from './utils';
