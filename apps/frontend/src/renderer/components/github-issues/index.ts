// Main export for the github-issues module
export { GitHubIssues } from '../GitHubIssues';

// Re-export types for external usage if needed
export type {
  GitHubIssuesProps,
  FilterState,
  IssueListItemProps,
  IssueDetailProps,
  InvestigationDialogProps,
  IssueListHeaderProps,
  IssueListProps
} from './types';

// Re-export hooks for external usage if needed
export {
  useGitHubIssues,
  useGitHubInvestigation,
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
