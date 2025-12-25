import { IPC_CHANNELS } from '../../../shared/constants';
import type {
  GitHubRepository,
  GitHubIssue,
  GitHubSyncStatus,
  GitHubImportResult,
  GitHubInvestigationStatus,
  GitHubInvestigationResult,
  IPCResult,
  VersionSuggestion
} from '../../../shared/types';
import { createIpcListener, invokeIpc, sendIpc, IpcListenerCleanup } from './ipc-utils';

/**
 * Auto-fix configuration
 */
export interface AutoFixConfig {
  enabled: boolean;
  labels: string[];
  requireHumanApproval: boolean;
  botToken?: string;
  model: string;
  thinkingLevel: string;
}

/**
 * Auto-fix queue item
 */
export interface AutoFixQueueItem {
  issueNumber: number;
  repo: string;
  status: 'pending' | 'analyzing' | 'creating_spec' | 'building' | 'qa_review' | 'pr_created' | 'completed' | 'failed';
  specId?: string;
  prNumber?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Auto-fix progress status
 */
export interface AutoFixProgress {
  phase: 'checking' | 'fetching' | 'analyzing' | 'batching' | 'creating_spec' | 'building' | 'qa_review' | 'creating_pr' | 'complete';
  issueNumber: number;
  progress: number;
  message: string;
}

/**
 * Issue batch for grouped fixing
 */
export interface IssueBatch {
  batchId: string;
  repo: string;
  primaryIssue: number;
  issues: Array<{
    issueNumber: number;
    title: string;
    similarityToPrimary: number;
  }>;
  commonThemes: string[];
  status: 'pending' | 'analyzing' | 'creating_spec' | 'building' | 'qa_review' | 'pr_created' | 'completed' | 'failed';
  specId?: string;
  prNumber?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Batch progress status
 */
export interface BatchProgress {
  phase: 'analyzing' | 'batching' | 'creating_specs' | 'complete';
  progress: number;
  message: string;
  totalIssues: number;
  batchCount: number;
}

/**
 * Analyze preview progress (proactive workflow)
 */
export interface AnalyzePreviewProgress {
  phase: 'analyzing' | 'complete';
  progress: number;
  message: string;
}

/**
 * Proposed batch from analyze-preview
 */
export interface ProposedBatch {
  primaryIssue: number;
  issues: Array<{
    issueNumber: number;
    title: string;
    labels: string[];
    similarityToPrimary: number;
  }>;
  issueCount: number;
  commonThemes: string[];
  validated: boolean;
  confidence: number;
  reasoning: string;
  theme: string;
}

/**
 * Analyze preview result (proactive batch workflow)
 */
export interface AnalyzePreviewResult {
  success: boolean;
  totalIssues: number;
  analyzedIssues: number;
  alreadyBatched: number;
  proposedBatches: ProposedBatch[];
  singleIssues: Array<{
    issueNumber: number;
    title: string;
    labels: string[];
  }>;
  message: string;
  error?: string;
}

/**
 * GitHub Integration API operations
 */
export interface GitHubAPI {
  // Operations
  getGitHubRepositories: (projectId: string) => Promise<IPCResult<GitHubRepository[]>>;
  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all') => Promise<IPCResult<GitHubIssue[]>>;
  getGitHubIssue: (projectId: string, issueNumber: number) => Promise<IPCResult<GitHubIssue>>;
  getIssueComments: (projectId: string, issueNumber: number) => Promise<IPCResult<any[]>>;
  checkGitHubConnection: (projectId: string) => Promise<IPCResult<GitHubSyncStatus>>;
  investigateGitHubIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]) => void;
  importGitHubIssues: (projectId: string, issueNumbers: number[]) => Promise<IPCResult<GitHubImportResult>>;
  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ) => Promise<IPCResult<{ url: string }>>;

  /** AI-powered version suggestion based on commits since last release */
  suggestReleaseVersion: (projectId: string) => Promise<IPCResult<VersionSuggestion>>;

  // OAuth operations (gh CLI)
  checkGitHubCli: () => Promise<IPCResult<{ installed: boolean; version?: string }>>;
  checkGitHubAuth: () => Promise<IPCResult<{ authenticated: boolean; username?: string }>>;
  startGitHubAuth: () => Promise<IPCResult<{ success: boolean; message?: string }>>;
  getGitHubToken: () => Promise<IPCResult<{ token: string }>>;
  getGitHubUser: () => Promise<IPCResult<{ username: string; name?: string }>>;
  listGitHubUserRepos: () => Promise<IPCResult<{ repos: Array<{ fullName: string; description: string | null; isPrivate: boolean }> }>>;

  // Repository detection and management
  detectGitHubRepo: (projectPath: string) => Promise<IPCResult<string>>;
  getGitHubBranches: (repo: string, token: string) => Promise<IPCResult<string[]>>;
  createGitHubRepo: (
    repoName: string,
    options: { description?: string; isPrivate?: boolean; projectPath: string; owner?: string }
  ) => Promise<IPCResult<{ fullName: string; url: string }>>;
  addGitRemote: (
    projectPath: string,
    repoFullName: string
  ) => Promise<IPCResult<{ remoteUrl: string }>>;
  listGitHubOrgs: () => Promise<IPCResult<{ orgs: Array<{ login: string; avatarUrl?: string }> }>>;

  // Event Listeners
  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ) => IpcListenerCleanup;
  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ) => IpcListenerCleanup;
  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ) => IpcListenerCleanup;

  // Auto-fix operations
  getAutoFixConfig: (projectId: string) => Promise<AutoFixConfig | null>;
  saveAutoFixConfig: (projectId: string, config: AutoFixConfig) => Promise<boolean>;
  getAutoFixQueue: (projectId: string) => Promise<AutoFixQueueItem[]>;
  checkAutoFixLabels: (projectId: string) => Promise<number[]>;
  checkNewIssues: (projectId: string) => Promise<Array<{number: number}>>;
  startAutoFix: (projectId: string, issueNumber: number) => void;

  // Batch auto-fix operations
  batchAutoFix: (projectId: string, issueNumbers?: number[]) => void;
  getBatches: (projectId: string) => Promise<IssueBatch[]>;

  // Auto-fix event listeners
  onAutoFixProgress: (
    callback: (projectId: string, progress: AutoFixProgress) => void
  ) => IpcListenerCleanup;
  onAutoFixComplete: (
    callback: (projectId: string, result: AutoFixQueueItem) => void
  ) => IpcListenerCleanup;
  onAutoFixError: (
    callback: (projectId: string, error: { issueNumber: number; error: string }) => void
  ) => IpcListenerCleanup;

  // Batch auto-fix event listeners
  onBatchProgress: (
    callback: (projectId: string, progress: BatchProgress) => void
  ) => IpcListenerCleanup;
  onBatchComplete: (
    callback: (projectId: string, batches: IssueBatch[]) => void
  ) => IpcListenerCleanup;
  onBatchError: (
    callback: (projectId: string, error: { error: string }) => void
  ) => IpcListenerCleanup;

  // Analyze & Group Issues (proactive batch workflow)
  analyzeIssuesPreview: (projectId: string, issueNumbers?: number[], maxIssues?: number) => void;
  approveBatches: (projectId: string, approvedBatches: ProposedBatch[]) => Promise<{ success: boolean; batches?: IssueBatch[]; error?: string }>;

  // Analyze preview event listeners
  onAnalyzePreviewProgress: (
    callback: (projectId: string, progress: AnalyzePreviewProgress) => void
  ) => IpcListenerCleanup;
  onAnalyzePreviewComplete: (
    callback: (projectId: string, result: AnalyzePreviewResult) => void
  ) => IpcListenerCleanup;
  onAnalyzePreviewError: (
    callback: (projectId: string, error: { error: string }) => void
  ) => IpcListenerCleanup;

  // PR operations
  listPRs: (projectId: string) => Promise<PRData[]>;
  runPRReview: (projectId: string, prNumber: number) => void;
  cancelPRReview: (projectId: string, prNumber: number) => Promise<boolean>;
  postPRReview: (projectId: string, prNumber: number, selectedFindingIds?: string[]) => Promise<boolean>;
  deletePRReview: (projectId: string, prNumber: number) => Promise<boolean>;
  postPRComment: (projectId: string, prNumber: number, body: string) => Promise<boolean>;
  mergePR: (projectId: string, prNumber: number, mergeMethod?: 'merge' | 'squash' | 'rebase') => Promise<boolean>;
  assignPR: (projectId: string, prNumber: number, username: string) => Promise<boolean>;
  getPRReview: (projectId: string, prNumber: number) => Promise<PRReviewResult | null>;

  // Follow-up review operations
  checkNewCommits: (projectId: string, prNumber: number) => Promise<NewCommitsCheck>;
  runFollowupReview: (projectId: string, prNumber: number) => void;

  // PR event listeners
  onPRReviewProgress: (
    callback: (projectId: string, progress: PRReviewProgress) => void
  ) => IpcListenerCleanup;
  onPRReviewComplete: (
    callback: (projectId: string, result: PRReviewResult) => void
  ) => IpcListenerCleanup;
  onPRReviewError: (
    callback: (projectId: string, error: { prNumber: number; error: string }) => void
  ) => IpcListenerCleanup;
}

/**
 * PR data from GitHub API
 */
export interface PRData {
  number: number;
  title: string;
  body: string;
  state: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  assignees: Array<{ login: string }>;
  files: Array<{
    path: string;
    additions: number;
    deletions: number;
    status: string;
  }>;
  createdAt: string;
  updatedAt: string;
  htmlUrl: string;
}

/**
 * PR review finding
 */
export interface PRReviewFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'security' | 'quality' | 'style' | 'test' | 'docs' | 'pattern' | 'performance';
  title: string;
  description: string;
  file: string;
  line: number;
  endLine?: number;
  suggestedFix?: string;
  fixable: boolean;
}

/**
 * PR review result
 */
export interface PRReviewResult {
  prNumber: number;
  repo: string;
  success: boolean;
  findings: PRReviewFinding[];
  summary: string;
  overallStatus: 'approve' | 'request_changes' | 'comment';
  reviewId?: number;
  reviewedAt: string;
  error?: string;
  // Follow-up review fields
  reviewedCommitSha?: string;
  isFollowupReview?: boolean;
  previousReviewId?: number;
  resolvedFindings?: string[];
  unresolvedFindings?: string[];
  newFindingsSinceLastReview?: string[];
  // Track if findings have been posted to GitHub (enables follow-up review)
  hasPostedFindings?: boolean;
  postedFindingIds?: string[];
}

/**
 * Result of checking for new commits since last review
 */
export interface NewCommitsCheck {
  hasNewCommits: boolean;
  newCommitCount: number;
  lastReviewedCommit?: string;
  currentHeadCommit?: string;
}

/**
 * Review progress status
 */
export interface PRReviewProgress {
  phase: 'fetching' | 'analyzing' | 'generating' | 'posting' | 'complete';
  prNumber: number;
  progress: number;
  message: string;
}

/**
 * Creates the GitHub Integration API implementation
 */
export const createGitHubAPI = (): GitHubAPI => ({
  // Operations
  getGitHubRepositories: (projectId: string): Promise<IPCResult<GitHubRepository[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_REPOSITORIES, projectId),

  getGitHubIssues: (projectId: string, state?: 'open' | 'closed' | 'all'): Promise<IPCResult<GitHubIssue[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_ISSUES, projectId, state),

  getGitHubIssue: (projectId: string, issueNumber: number): Promise<IPCResult<GitHubIssue>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_ISSUE, projectId, issueNumber),

  getIssueComments: (projectId: string, issueNumber: number): Promise<IPCResult<any[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_ISSUE_COMMENTS, projectId, issueNumber),

  checkGitHubConnection: (projectId: string): Promise<IPCResult<GitHubSyncStatus>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CHECK_CONNECTION, projectId),

  investigateGitHubIssue: (projectId: string, issueNumber: number, selectedCommentIds?: number[]): void =>
    sendIpc(IPC_CHANNELS.GITHUB_INVESTIGATE_ISSUE, projectId, issueNumber, selectedCommentIds),

  importGitHubIssues: (projectId: string, issueNumbers: number[]): Promise<IPCResult<GitHubImportResult>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_IMPORT_ISSUES, projectId, issueNumbers),

  createGitHubRelease: (
    projectId: string,
    version: string,
    releaseNotes: string,
    options?: { draft?: boolean; prerelease?: boolean }
  ): Promise<IPCResult<{ url: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CREATE_RELEASE, projectId, version, releaseNotes, options),

  suggestReleaseVersion: (projectId: string): Promise<IPCResult<VersionSuggestion>> =>
    invokeIpc(IPC_CHANNELS.RELEASE_SUGGEST_VERSION, projectId),

  // OAuth operations (gh CLI)
  checkGitHubCli: (): Promise<IPCResult<{ installed: boolean; version?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CHECK_CLI),

  checkGitHubAuth: (): Promise<IPCResult<{ authenticated: boolean; username?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CHECK_AUTH),

  startGitHubAuth: (): Promise<IPCResult<{ success: boolean; message?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_START_AUTH),

  getGitHubToken: (): Promise<IPCResult<{ token: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_TOKEN),

  getGitHubUser: (): Promise<IPCResult<{ username: string; name?: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_USER),

  listGitHubUserRepos: (): Promise<IPCResult<{ repos: Array<{ fullName: string; description: string | null; isPrivate: boolean }> }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_LIST_USER_REPOS),

  // Repository detection and management
  detectGitHubRepo: (projectPath: string): Promise<IPCResult<string>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_DETECT_REPO, projectPath),

  getGitHubBranches: (repo: string, token: string): Promise<IPCResult<string[]>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_GET_BRANCHES, repo, token),

  createGitHubRepo: (
    repoName: string,
    options: { description?: string; isPrivate?: boolean; projectPath: string; owner?: string }
  ): Promise<IPCResult<{ fullName: string; url: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_CREATE_REPO, repoName, options),

  addGitRemote: (
    projectPath: string,
    repoFullName: string
  ): Promise<IPCResult<{ remoteUrl: string }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_ADD_REMOTE, projectPath, repoFullName),

  listGitHubOrgs: (): Promise<IPCResult<{ orgs: Array<{ login: string; avatarUrl?: string }> }>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_LIST_ORGS),

  // Event Listeners
  onGitHubInvestigationProgress: (
    callback: (projectId: string, status: GitHubInvestigationStatus) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_INVESTIGATION_PROGRESS, callback),

  onGitHubInvestigationComplete: (
    callback: (projectId: string, result: GitHubInvestigationResult) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_INVESTIGATION_COMPLETE, callback),

  onGitHubInvestigationError: (
    callback: (projectId: string, error: string) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_INVESTIGATION_ERROR, callback),

  // Auto-fix operations
  getAutoFixConfig: (projectId: string): Promise<AutoFixConfig | null> =>
    invokeIpc(IPC_CHANNELS.GITHUB_AUTOFIX_GET_CONFIG, projectId),

  saveAutoFixConfig: (projectId: string, config: AutoFixConfig): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITHUB_AUTOFIX_SAVE_CONFIG, projectId, config),

  getAutoFixQueue: (projectId: string): Promise<AutoFixQueueItem[]> =>
    invokeIpc(IPC_CHANNELS.GITHUB_AUTOFIX_GET_QUEUE, projectId),

  checkAutoFixLabels: (projectId: string): Promise<number[]> =>
    invokeIpc(IPC_CHANNELS.GITHUB_AUTOFIX_CHECK_LABELS, projectId),

  checkNewIssues: (projectId: string): Promise<Array<{number: number}>> =>
    invokeIpc(IPC_CHANNELS.GITHUB_AUTOFIX_CHECK_NEW, projectId),

  startAutoFix: (projectId: string, issueNumber: number): void =>
    sendIpc(IPC_CHANNELS.GITHUB_AUTOFIX_START, projectId, issueNumber),

  // Batch auto-fix operations
  batchAutoFix: (projectId: string, issueNumbers?: number[]): void =>
    sendIpc(IPC_CHANNELS.GITHUB_AUTOFIX_BATCH, projectId, issueNumbers),

  getBatches: (projectId: string): Promise<IssueBatch[]> =>
    invokeIpc(IPC_CHANNELS.GITHUB_AUTOFIX_GET_BATCHES, projectId),

  // Auto-fix event listeners
  onAutoFixProgress: (
    callback: (projectId: string, progress: AutoFixProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_PROGRESS, callback),

  onAutoFixComplete: (
    callback: (projectId: string, result: AutoFixQueueItem) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_COMPLETE, callback),

  onAutoFixError: (
    callback: (projectId: string, error: { issueNumber: number; error: string }) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_ERROR, callback),

  // Batch auto-fix event listeners
  onBatchProgress: (
    callback: (projectId: string, progress: BatchProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_PROGRESS, callback),

  onBatchComplete: (
    callback: (projectId: string, batches: IssueBatch[]) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_COMPLETE, callback),

  onBatchError: (
    callback: (projectId: string, error: { error: string }) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_BATCH_ERROR, callback),

  // Analyze & Group Issues (proactive batch workflow)
  analyzeIssuesPreview: (projectId: string, issueNumbers?: number[], maxIssues?: number): void =>
    sendIpc(IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW, projectId, issueNumbers, maxIssues),

  approveBatches: (projectId: string, approvedBatches: ProposedBatch[]): Promise<{ success: boolean; batches?: IssueBatch[]; error?: string }> =>
    invokeIpc(IPC_CHANNELS.GITHUB_AUTOFIX_APPROVE_BATCHES, projectId, approvedBatches),

  // Analyze preview event listeners
  onAnalyzePreviewProgress: (
    callback: (projectId: string, progress: AnalyzePreviewProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_PROGRESS, callback),

  onAnalyzePreviewComplete: (
    callback: (projectId: string, result: AnalyzePreviewResult) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_COMPLETE, callback),

  onAnalyzePreviewError: (
    callback: (projectId: string, error: { error: string }) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_AUTOFIX_ANALYZE_PREVIEW_ERROR, callback),

  // PR operations
  listPRs: (projectId: string): Promise<PRData[]> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_LIST, projectId),

  runPRReview: (projectId: string, prNumber: number): void =>
    sendIpc(IPC_CHANNELS.GITHUB_PR_REVIEW, projectId, prNumber),

  cancelPRReview: (projectId: string, prNumber: number): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_REVIEW_CANCEL, projectId, prNumber),

  postPRReview: (projectId: string, prNumber: number, selectedFindingIds?: string[]): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_POST_REVIEW, projectId, prNumber, selectedFindingIds),

  deletePRReview: (projectId: string, prNumber: number): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_DELETE_REVIEW, projectId, prNumber),

  postPRComment: (projectId: string, prNumber: number, body: string): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_POST_COMMENT, projectId, prNumber, body),

  mergePR: (projectId: string, prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_MERGE, projectId, prNumber, mergeMethod),

  assignPR: (projectId: string, prNumber: number, username: string): Promise<boolean> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_ASSIGN, projectId, prNumber, username),

  getPRReview: (projectId: string, prNumber: number): Promise<PRReviewResult | null> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_GET_REVIEW, projectId, prNumber),

  // Follow-up review operations
  checkNewCommits: (projectId: string, prNumber: number): Promise<NewCommitsCheck> =>
    invokeIpc(IPC_CHANNELS.GITHUB_PR_CHECK_NEW_COMMITS, projectId, prNumber),

  runFollowupReview: (projectId: string, prNumber: number): void =>
    sendIpc(IPC_CHANNELS.GITHUB_PR_FOLLOWUP_REVIEW, projectId, prNumber),

  // PR event listeners
  onPRReviewProgress: (
    callback: (projectId: string, progress: PRReviewProgress) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_PR_REVIEW_PROGRESS, callback),

  onPRReviewComplete: (
    callback: (projectId: string, result: PRReviewResult) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_PR_REVIEW_COMPLETE, callback),

  onPRReviewError: (
    callback: (projectId: string, error: { prNumber: number; error: string }) => void
  ): IpcListenerCleanup =>
    createIpcListener(IPC_CHANNELS.GITHUB_PR_REVIEW_ERROR, callback)
});
