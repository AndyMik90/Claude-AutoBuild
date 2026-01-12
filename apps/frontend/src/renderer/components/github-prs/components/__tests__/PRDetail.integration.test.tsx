/**
 * Integration tests for PRDetail clean review state reset on PR change
 * Tests that cleanReviewPosted state resets when pr.number changes
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../../../../shared/i18n';
import { PRDetail } from '../PRDetail';
import type { PRData, PRReviewResult } from '../../hooks/useGitHubPRs';

// Mock window.electronAPI
type PostCommentFn = (body: string) => void | Promise<void>;
const mockOnPostComment = vi.fn<PostCommentFn>();
const mockOnPostReview = vi.fn();
const mockOnRunReview = vi.fn();
const mockOnRunFollowupReview = vi.fn();
const mockOnCheckNewCommits = vi.fn();
const mockOnCancelReview = vi.fn();
const mockOnMergePR = vi.fn();
const mockOnAssignPR = vi.fn();
const mockOnGetLogs = vi.fn();

Object.defineProperty(window, 'electronAPI', {
  value: {
    github: {
      getWorkflowsAwaitingApproval: vi.fn().mockResolvedValue({
        awaiting_approval: 0,
        workflow_runs: []
      }),
      checkMergeReadiness: vi.fn().mockResolvedValue({
        blockers: []
      })
    }
  }
});

// Create a mock PR data
function createMockPR(overrides: Partial<PRData> = {}): PRData {
  return {
    number: 123,
    title: 'Test PR',
    body: 'Test PR body',
    state: 'open',
    author: { login: 'testuser' },
    headRefName: 'feature-branch',
    baseRefName: 'main',
    additions: 100,
    deletions: 50,
    changedFiles: 5,
    assignees: [],
    files: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    htmlUrl: 'https://github.com/test/repo/pull/123',
    ...overrides
  };
}

// Create a mock clean review result
function createMockCleanReviewResult(overrides: Partial<PRReviewResult> = {}): PRReviewResult {
  return {
    prNumber: 123,
    repo: 'test/repo',
    success: true,
    overallStatus: 'approve',
    summary: 'All code passes review. No issues found.',
    findings: [],
    reviewedAt: '2024-01-01T00:00:00Z',
    reviewedCommitSha: 'abc123',
    ...overrides
  };
}

// Wrapper component for i18n
function I18nWrapper({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

describe('PRDetail - Clean Review State Reset Integration', () => {
  const mockProjectId = 'test-project-id';

  // Helper function to render PRDetail with common default props
  function renderPRDetail(overrides: {
    pr?: PRData;
    reviewResult?: PRReviewResult;
    onPostComment?: PostCommentFn;
  } = {}) {
    const defaultPR = createMockPR({ number: 123 });
    const defaultReviewResult = createMockCleanReviewResult();

    return render(
      <I18nWrapper>
        <PRDetail
          pr={overrides.pr ?? defaultPR}
          projectId={mockProjectId}
          reviewResult={overrides.reviewResult ?? defaultReviewResult}
          previousReviewResult={null}
          reviewProgress={null}
          startedAt={null}
          isReviewing={false}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCheckNewCommits={mockOnCheckNewCommits}
          onCancelReview={mockOnCancelReview}
          onPostReview={mockOnPostReview}
          onPostComment={overrides.onPostComment ?? mockOnPostComment}
          onMergePR={mockOnMergePR}
          onAssignPR={mockOnAssignPR}
          onGetLogs={mockOnGetLogs}
        />
      </I18nWrapper>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock return values
    mockOnGetLogs.mockResolvedValue(null);
    mockOnCheckNewCommits.mockResolvedValue({
      hasNewCommits: false,
      hasCommitsAfterPosting: false,
      newCommitCount: 0
    });
    // Resolve successfully by default
    mockOnPostComment.mockResolvedValue(undefined);
  });

  it('should reset cleanReviewPosted state when pr.number changes', async () => {
    const initialPR = createMockPR({ number: 123 });
    const cleanReviewResult = createMockCleanReviewResult();

    const { rerender, unmount } = renderPRDetail({
      pr: initialPR,
      reviewResult: cleanReviewResult
    });

    // The "Post Clean Review" button should be visible initially
    const postCleanReviewButton = screen.getByRole('button', { name: /post clean review/i });
    expect(postCleanReviewButton).toBeInTheDocument();

    // Click the button to post clean review
    fireEvent.click(postCleanReviewButton);

    // Wait for success message to appear (confirms cleanReviewPosted is true)
    await waitFor(() => {
      expect(screen.getByText(/clean review posted/i)).toBeInTheDocument();
    });

    // Button should be hidden after posting
    expect(screen.queryByRole('button', { name: /post clean review/i })).not.toBeInTheDocument();

    // Rerender with a different PR (number 456)
    const differentPR = createMockPR({ number: 456 });
    rerender(
      <I18nWrapper>
        <PRDetail
          pr={differentPR}
          projectId={mockProjectId}
          reviewResult={cleanReviewResult}
          previousReviewResult={null}
          reviewProgress={null}
          startedAt={null}
          isReviewing={false}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCheckNewCommits={mockOnCheckNewCommits}
          onCancelReview={mockOnCancelReview}
          onPostReview={mockOnPostReview}
          onPostComment={mockOnPostComment}
          onMergePR={mockOnMergePR}
          onAssignPR={mockOnAssignPR}
          onGetLogs={mockOnGetLogs}
        />
      </I18nWrapper>
    );

    // After PR change, the "Post Clean Review" button should be visible again
    // because cleanReviewPosted state was reset by useEffect when pr.number changed
    const postCleanReviewButtonAfterChange = screen.queryByRole('button', { name: /post clean review/i });
    expect(postCleanReviewButtonAfterChange).toBeInTheDocument();
    unmount();
  });

  it('should show clean review success message after posting clean review', async () => {
    const { unmount } = renderPRDetail();

    // Initially, the success message should not be present
    const successMessage = screen.queryByText(/clean review posted/i);
    expect(successMessage).not.toBeInTheDocument();

    // The "Post Clean Review" button should be visible
    const postCleanReviewButton = screen.getByRole('button', { name: /post clean review/i });
    expect(postCleanReviewButton).toBeInTheDocument();

    // Click the button to post clean review
    fireEvent.click(postCleanReviewButton);

    // Wait for success message to appear
    await waitFor(() => {
      expect(screen.getByText(/clean review posted/i)).toBeInTheDocument();
    });

    // Button should be hidden after posting
    expect(screen.queryByRole('button', { name: /post clean review/i })).not.toBeInTheDocument();

    unmount();
  });

  it('should not show Post Clean Review button when review has HIGH severity findings', async () => {
    const reviewWithHighFindings: PRReviewResult = {
      prNumber: 123,
      repo: 'test/repo',
      success: true,
      overallStatus: 'request_changes',
      summary: 'Found high severity issues.',
      reviewedAt: '2024-01-01T00:00:00Z',
      findings: [
        {
          id: 'finding-1',
          severity: 'high',
          category: 'security',
          title: 'Security Issue',
          file: 'src/test.ts',
          line: 10,
          description: 'High severity issue',
          fixable: true
        }
      ],
      reviewedCommitSha: 'abc123'
    };

    const { unmount } = renderPRDetail({ reviewResult: reviewWithHighFindings });

    // The "Post Clean Review" button should NOT be visible for dirty reviews
    const postCleanReviewButton = screen.queryByRole('button', { name: /post clean review/i });
    expect(postCleanReviewButton).not.toBeInTheDocument();

    unmount();
  });

  it('should show correct button state based on review cleanliness', async () => {
    const cleanReviewResult = createMockCleanReviewResult();
    const initialPR = createMockPR({ number: 123 });

    // Test 1: Clean review (no findings)
    const { rerender, unmount } = renderPRDetail({
      pr: initialPR,
      reviewResult: cleanReviewResult
    });

    // Clean review: Post Clean Review button should be visible
    const postCleanReviewButton = screen.queryByRole('button', { name: /post clean review/i });
    expect(postCleanReviewButton).toBeInTheDocument();

    // Test 2: Dirty review (HIGH findings)
    const dirtyReviewResult: PRReviewResult = {
      prNumber: 123,
      repo: 'test/repo',
      success: true,
      overallStatus: 'request_changes',
      summary: 'Found issues.',
      reviewedAt: '2024-01-01T00:00:00Z',
      findings: [
        {
          id: 'finding-1',
          severity: 'high',
          category: 'security',
          title: 'Security Issue',
          file: 'src/test.ts',
          line: 10,
          description: 'High severity issue',
          fixable: true
        }
      ],
      reviewedCommitSha: 'abc123'
    };

    rerender(
      <I18nWrapper>
        <PRDetail
          pr={initialPR}
          projectId={mockProjectId}
          reviewResult={dirtyReviewResult}
          previousReviewResult={null}
          reviewProgress={null}
          startedAt={null}
          isReviewing={false}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCheckNewCommits={mockOnCheckNewCommits}
          onCancelReview={mockOnCancelReview}
          onPostReview={mockOnPostReview}
          onPostComment={mockOnPostComment}
          onMergePR={mockOnMergePR}
          onAssignPR={mockOnAssignPR}
          onGetLogs={mockOnGetLogs}
        />
      </I18nWrapper>
    );

    // Dirty review: Post Clean Review button should NOT be visible
    const postCleanReviewButtonDirty = screen.queryByRole('button', { name: /post clean review/i });
    expect(postCleanReviewButtonDirty).not.toBeInTheDocument();

    unmount();
  });

  it('should show error message when posting clean review fails', async () => {
    // Mock onPostComment to reject
    const testError = new Error('Failed to post comment: Rate limit exceeded');
    mockOnPostComment.mockRejectedValue(testError);

    const { unmount } = renderPRDetail({
      onPostComment: mockOnPostComment
    });

    // The "Post Clean Review" button should be visible initially
    const postCleanReviewButton = screen.getByRole('button', { name: /post clean review/i });
    expect(postCleanReviewButton).toBeInTheDocument();

    // Click the button to attempt posting clean review
    fireEvent.click(postCleanReviewButton);

    // Wait for normalized error message to appear (shows friendly message, not raw error)
    await waitFor(() => {
      expect(screen.getByText(/Failed to post clean review/i)).toBeInTheDocument();
    });

    // "View details" button should be available
    await waitFor(() => {
      expect(screen.getByText(/View details/i)).toBeInTheDocument();
    });

    // Button should still be visible for retry after error
    expect(screen.queryByRole('button', { name: /post clean review/i })).toBeInTheDocument();

    // Success message should NOT be shown
    expect(screen.queryByText(/clean review posted/i)).not.toBeInTheDocument();

    unmount();
  });
});
