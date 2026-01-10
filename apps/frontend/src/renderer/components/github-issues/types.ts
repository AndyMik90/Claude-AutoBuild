/**
 * GitHub Issues Component Types
 *
 * This module exports TypeScript interfaces and types used by the
 * github-issues components, including Auto-PR-Review related types.
 *
 * Types are centralized here to:
 * 1. Avoid circular dependencies between components and hooks
 * 2. Provide a single source of truth for component props
 * 3. Enable easier refactoring and type reuse
 */

// =============================================================================
// Re-exports from Preload API
// =============================================================================

// =============================================================================
// Auto-PR-Review Types (defined locally to avoid electron import chain)
// =============================================================================

/**
 * Configuration for the autonomous PR review system.
 * IMPORTANT: requireHumanApproval MUST always be true - system NEVER auto-merges.
 */
export interface AutoPRReviewConfig {
  /** Maximum number of review/fix iterations before requiring manual intervention */
  maxPRReviewIterations: number;
  /** Timeout in milliseconds for CI checks to complete (default: 1800000 = 30 min) */
  ciCheckTimeout: number;
  /** Timeout in milliseconds for external bot comments (default: 900000 = 15 min) */
  externalBotTimeout: number;
  /** Poll interval in milliseconds for checking status (default: 60000 = 1 min) */
  pollInterval: number;
  /** Whether human approval is required before merging - MUST ALWAYS BE TRUE */
  requireHumanApproval: true;
  /** List of GitHub usernames allowed to trigger auto-PR-review */
  allowedUsers: string[];
}

/** Default configuration values for Auto-PR-Review */
export const DEFAULT_AUTO_PR_REVIEW_CONFIG: AutoPRReviewConfig = {
  maxPRReviewIterations: 5,
  ciCheckTimeout: 1800000,
  externalBotTimeout: 900000,
  pollInterval: 60000,
  requireHumanApproval: true,
  allowedUsers: [],
};

/** Status values for Auto-PR-Review workflow */
export type AutoPRReviewStatus =
  | 'idle'
  | 'awaiting_checks'
  | 'pr_reviewing'
  | 'pr_fixing'
  | 'pr_ready_to_merge'
  | 'needs_human_review'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'max_iterations';

/** CI check status for Auto-PR-Review */
export interface CICheckStatus {
  name: string;
  /** Status from frontend or backend:
   * Frontend: 'pending' | 'in_progress' | 'success' | 'failure' | 'cancelled' | 'skipped'
   * Backend: 'pending' | 'running' | 'passed' | 'failed' | 'skipped' | 'timed_out' | 'unknown'
   */
  status: 'pending' | 'in_progress' | 'success' | 'failure' | 'cancelled' | 'skipped' | 'running' | 'passed' | 'failed' | 'timed_out' | 'unknown';
  startedAt?: string;
  completedAt?: string;
  detailsUrl?: string;
  conclusion?: string;
}

/** External bot status for Auto-PR-Review */
export interface ExternalBotStatus {
  botName: string;
  accountId?: number;
  hasCommented: boolean;
  commentedAt?: string;
  isVerified: boolean;
  findingsCount?: number;
}

/** Progress information for an active Auto-PR-Review operation */
export interface AutoPRReviewProgress {
  prNumber: number;
  repository: string;
  status: AutoPRReviewStatus;
  currentIteration: number;
  maxIterations: number;
  startedAt: string;
  elapsedMs: number;
  ciChecks: CICheckStatus[];
  ciSummary: { total: number; passed: number; failed: number; pending: number };
  /** Whether CI checks have completed (regardless of pass/fail) */
  ciCompleted?: boolean;
  /** Whether all CI checks passed (only meaningful when ciCompleted is true) */
  ciPassed?: boolean;
  externalBots: ExternalBotStatus[];
  fixedFindingsCount: number;
  remainingFindingsCount: number;
  isCancellable: boolean;
  currentActivity?: string;
  errorMessage?: string;
  currentSha?: string;
  originalSha?: string;
}

/** Request to start Auto-PR-Review for a specific PR */
export interface AutoPRReviewStartRequest {
  repository: string;
  prNumber: number;
  configOverrides?: Partial<Omit<AutoPRReviewConfig, 'requireHumanApproval'>>;
}

/** Response from starting Auto-PR-Review */
export interface AutoPRReviewStartResponse {
  success: boolean;
  message: string;
  reviewId?: string;
  error?: string;
}

/** Request to stop/cancel an active Auto-PR-Review */
export interface AutoPRReviewStopRequest {
  repository: string;
  prNumber: number;
  reason?: string;
}

/** Response from stopping Auto-PR-Review */
export interface AutoPRReviewStopResponse {
  success: boolean;
  message: string;
  error?: string;
}

/** Request to get status of an Auto-PR-Review operation */
export interface AutoPRReviewStatusRequest {
  repository: string;
  prNumber: number;
}

/** Response with Auto-PR-Review status */
export interface AutoPRReviewStatusResponse {
  isActive: boolean;
  progress?: AutoPRReviewProgress;
  error?: string;
}

/** Type guard to check if a status is a terminal state */
export function isTerminalStatus(status: AutoPRReviewStatus): boolean {
  return ['completed', 'failed', 'cancelled', 'pr_ready_to_merge', 'max_iterations', 'needs_human_review'].includes(status);
}

/** Type guard to check if a status indicates the review is in progress */
export function isInProgressStatus(status: AutoPRReviewStatus): boolean {
  return ['awaiting_checks', 'pr_reviewing', 'pr_fixing'].includes(status);
}

// =============================================================================
// Auto-PR-Review Component Types
// =============================================================================

/**
 * Props for the AutoPRReviewProgressCard component.
 *
 * This component displays real-time progress of an autonomous PR review,
 * including CI check status, external bot reviews, and iteration progress.
 *
 * CRITICAL: The system NEVER auto-merges. Human approval is always required.
 */
export interface AutoPRReviewProgressCardProps {
  /** Progress data for the PR review operation */
  progress: AutoPRReviewProgress;

  /**
   * Callback invoked when user requests to cancel the review.
   * @param repository - Repository in "owner/repo" format
   * @param prNumber - Pull request number
   * @param reason - Optional reason for cancellation (for audit logging)
   */
  onCancel?: (repository: string, prNumber: number, reason?: string) => Promise<void>;

  /** Optional CSS class name for custom styling */
  className?: string;

  /**
   * Translation function for internationalization.
   * If not provided, falls back to returning the last segment of the key.
   * @param key - Translation key (e.g., "autoPRReview.status.idle")
   * @returns Translated string
   */
  t?: (key: string) => string;
}

/**
 * Configuration for status visual styling in the progress card.
 * Maps each status to consistent colors and labels.
 */
export interface StatusConfig {
  /** i18n key for the status label */
  label: string;

  /** Text color class (e.g., "text-blue-600") */
  color: string;

  /** Background color class (e.g., "bg-blue-50") */
  bgColor: string;

  /** Border color class (e.g., "border-blue-300") */
  borderColor: string;
}

/**
 * Status configuration mapping for all Auto-PR-Review states.
 * Used by AutoPRReviewProgressCard to determine visual styling.
 */
export type AutoPRReviewStatusConfigMap = Record<AutoPRReviewStatus, StatusConfig>;

// =============================================================================
// GitHub Issues Component Types
// =============================================================================

import type { LucideIcon } from 'lucide-react';
import type {
  GitHubIssue,
  GitHubInvestigationStatus,
  GitHubInvestigationResult,
} from '../../../shared/types/integrations';

// Re-export shared types
export type { GitHubIssue, GitHubInvestigationResult };

// Import actual AutoFix types from preload API
import type { AutoFixConfig, AutoFixQueueItem } from '../../../preload/api/modules/github-api';

// Re-export for component use
export type { AutoFixConfig, AutoFixQueueItem };

/**
 * Filter state for issue list filtering
 */
export type FilterState = 'open' | 'closed' | 'all';

/**
 * Props for the main GitHubIssues component
 */
export interface GitHubIssuesProps {
  onOpenSettings?: () => void;
  isActive?: boolean;
  onNavigateToTask?: (taskId: string) => void;
}

/**
 * Props for the EmptyState component
 */
export interface EmptyStateProps {
  searchQuery?: string;
  icon?: LucideIcon;
  message: string;
}

/**
 * Props for the NotConnectedState component
 */
export interface NotConnectedStateProps {
  error?: string | null;
  onOpenSettings?: () => void;
}

/**
 * Props for the IssueListItem component
 */
export interface IssueListItemProps {
  issue: GitHubIssue;
  isSelected: boolean;
  onClick: () => void;
  onInvestigate?: () => void;
}

/**
 * Props for the IssueDetail component
 */
export interface IssueDetailProps {
  issue: GitHubIssue;
  onInvestigate: () => void;
  investigationResult?: GitHubInvestigationResult | null;
  linkedTaskId?: string | null;
  onViewTask?: (taskId: string) => void;
  projectId?: string;
  autoFixConfig?: AutoFixConfig | null;
  autoFixQueueItem?: AutoFixQueueItem | null;
  // Optional investigation state props (for progress indicators)
  isInvestigating?: boolean;
  investigationProgress?: number;
  onCancelInvestigation?: () => void;
  onShowInvestigationResult?: () => void;
  hasInvestigationResult?: boolean;
}

/**
 * Props for the InvestigationDialog component
 */
export interface InvestigationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueNumber?: number;
  issueTitle?: string;
  investigationResult?: string | null;
  isLoading?: boolean;
  selectedIssue: GitHubIssue | null;
  investigationStatus: GitHubInvestigationStatus;
  onStartInvestigation: (selectedCommentIds: number[]) => void;
  onClose: () => void;
  projectId?: string;
}

/**
 * Props for the IssueListHeader component
 */
export interface IssueListHeaderProps {
  repoFullName: string;
  openIssuesCount: number;
  isLoading: boolean;
  searchQuery: string;
  filterState: FilterState;
  onSearchChange: (query: string) => void;
  onFilterChange: (state: FilterState) => void;
  onRefresh: () => void;
  autoFixEnabled?: boolean;
  autoFixRunning?: boolean;
  autoFixProcessing?: number;
  onAutoFixToggle?: (enabled: boolean) => void;
  onAnalyzeAndGroup?: () => void;
  isAnalyzing?: boolean;
}

/**
 * Props for the IssueList component
 */
export interface IssueListProps {
  issues: GitHubIssue[];
  selectedIssueNumber: number | null;
  isLoading: boolean;
  searchQuery?: string;
  onSelectIssue: (issueNumber: number | null) => void;
  error?: string | null;
  onInvestigate?: (issue: GitHubIssue) => void;
}
