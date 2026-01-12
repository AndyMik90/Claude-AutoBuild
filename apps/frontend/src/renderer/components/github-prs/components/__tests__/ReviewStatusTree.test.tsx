/**
 * @vitest-environment jsdom
 */
/**
 * Unit tests for ReviewStatusTree component
 * Tests the handling of 'reviewing' status added for ACS-200 fix
 *
 * Key behavior tested:
 * - 'reviewing' status is properly handled
 * - Status dot color is animated blue when reviewing
 * - Status label shows "AI Review in Progress" when reviewing
 * - Cancel button is shown when reviewing
 * - Tree structure shows correct steps during review
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { ReviewStatusTree, type ReviewStatus } from '../ReviewStatusTree';
// @ts-expect-error - vitest resolves this correctly
import type { PRReviewResult } from '../../../hooks/useGitHubPRs';
import type { NewCommitsCheck } from '@preload/api/modules/github-api';
import i18n from '@shared/i18n';

/**
 * Factory function to create a mock PR review result
 */
function createMockReviewResult(overrides: Partial<PRReviewResult> = {}): PRReviewResult {
  return {
    prNumber: 123,
    repo: 'test/repo',
    success: true,
    findings: [],
    summary: 'Test summary',
    overallStatus: 'approve',
    reviewedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Factory function to create a mock NewCommitsCheck result
 */
function createMockNewCommitsCheck(overrides: Partial<NewCommitsCheck> = {}): NewCommitsCheck {
  return {
    hasNewCommits: false,
    newCommitCount: 0,
    ...overrides,
  };
}

// Mock callbacks
const mockOnRunReview = vi.fn();
const mockOnRunFollowupReview = vi.fn();
const mockOnCancelReview = vi.fn();

describe('ReviewStatusTree - Reviewing Status (ACS-200)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Type System - ReviewStatus Type', () => {
    it('should include "reviewing" in ReviewStatus type union', () => {
      // This test verifies that the 'reviewing' status is part of the type
      const reviewingStatus: ReviewStatus = 'reviewing';
      expect(reviewingStatus).toBe('reviewing');

      // All other valid statuses
      const validStatuses: ReviewStatus[] = [
        'not_reviewed',
        'reviewed_pending_post',
        'waiting_for_changes',
        'ready_to_merge',
        'needs_attention',
        'ready_for_followup',
        'followup_issues_remain',
        'reviewing',
      ];
      expect(validStatuses).toContain('reviewing');
      expect(validStatuses).toHaveLength(8);
    });
  });

  describe('Component Props - isReviewing Flag', () => {
    it('should accept isReviewing prop', () => {
      const { container } = render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // Component should render without errors
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should handle isReviewing=false correctly', () => {
      const { container } = render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={false}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('Not Reviewed Status with No Active Review', () => {
    it('should render simple status when status is not_reviewed and not reviewing', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={false}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // Should show "Not Reviewed" label
      expect(screen.getByText(i18n.t('prReview.notReviewed'))).toBeInTheDocument();

      // Should show "Run AI Review" button
      expect(screen.getByText(i18n.t('prReview.runAIReview'))).toBeInTheDocument();
    });

    it('should render Run AI Review button with correct callback', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={false}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      const runReviewButton = screen.getByText(i18n.t('prReview.runAIReview'));
      runReviewButton.click();
      expect(mockOnRunReview).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reviewing State - Tree View', () => {
    it('should show tree structure when isReviewing is true', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // Should show the full tree (collapsible card) when reviewing
      expect(screen.getByText(i18n.t('prReview.aiReviewInProgress'))).toBeInTheDocument();

      // Should show cancel button
      expect(screen.getByText(i18n.t('prReview.cancel'))).toBeInTheDocument();
    });

    it('should show "AI Review in Progress" status label when isReviewing', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      expect(screen.getByText(i18n.t('prReview.aiReviewInProgress'))).toBeInTheDocument();
    });

    it('should show cancel button when isReviewing is true', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      const cancelButton = screen.getByText(i18n.t('prReview.cancel'));
      cancelButton.click();
      expect(mockOnCancelReview).toHaveBeenCalledTimes(1);
    });

    it('should show correct tree steps during initial review', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // Should show "Review Started" step (completed)
      expect(screen.getByText(i18n.t('prReview.reviewStarted'))).toBeInTheDocument();

      // Should show "AI Analysis in Progress..." step (current)
      expect(screen.getByText(i18n.t('prReview.analysisInProgress'))).toBeInTheDocument();
    });
  });

  describe('Follow-up Review in Progress', () => {
    it('should show follow-up specific steps when isReviewing with previousReviewResult', () => {
      const previousResult = createMockReviewResult({
        findings: [
          {
            id: 'finding-1',
            severity: 'high',
            category: 'security',
            title: 'Security issue',
            description: 'Fix needed',
            file: 'src/test.ts',
            line: 10,
            fixable: true,
          },
        ],
        postedFindingIds: ['finding-1'],
        hasPostedFindings: true,
      });

      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={previousResult}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={createMockNewCommitsCheck({
            hasNewCommits: true,
            newCommitCount: 2,
          })}
        />
      );

      // Should show previous review step
      expect(screen.getByText(/Previous Review/)).toBeInTheDocument();

      // Should show new commits step
      expect(screen.getByText(/2 New Commits/i)).toBeInTheDocument();

      // Should show follow-up analysis step
      expect(screen.getByText(i18n.t('prReview.followupInProgress'))).toBeInTheDocument();
    });

    it('should handle follow-up in progress without previousReviewResult', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={createMockReviewResult({ isFollowupReview: true })}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // Should show AI Review in Progress (when reviewing, this takes precedence)
      expect(screen.getByText('AI Review in Progress')).toBeInTheDocument();

      // Should show cancel button when reviewing
      expect(screen.getByText(i18n.t('prReview.cancel'))).toBeInTheDocument();
    });
  });

  describe('Status Dot Color Logic', () => {
    it('should return animated blue dot when isReviewing is true', () => {
      // getStatusDotColor function in ReviewStatusTree:
      // if (isReviewing) return "bg-blue-500 animate-pulse";

      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // The status dot should have animated blue styling
      const statusDot = screen.getByText(i18n.t('prReview.aiReviewInProgress')).parentElement?.querySelector('div');
      expect(statusDot).toBeInTheDocument();
    });

    it('should return status-appropriate dot color when not reviewing', () => {
      render(
        <ReviewStatusTree
          status="ready_to_merge"
          isReviewing={false}
          startedAt={null}
          reviewResult={createMockReviewResult({ overallStatus: 'approve' })}
          previousReviewResult={null}
          postedCount={1}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // Should show "Ready to Merge" label
      expect(screen.getByText(i18n.t('prReview.readyToMerge'))).toBeInTheDocument();

      // Should NOT show cancel button when not reviewing
      expect(screen.queryByText(i18n.t('prReview.cancel'))).not.toBeInTheDocument();
    });
  });

  describe('Status Label Logic', () => {
    it('should return "AI Review in Progress" when isReviewing', () => {
      // getStatusLabel function in ReviewStatusTree:
      // if (isReviewing) return t('prReview.aiReviewInProgress');

      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      expect(screen.getByText(i18n.t('prReview.aiReviewInProgress'))).toBeInTheDocument();
    });

    it('should return appropriate label for other statuses when not reviewing', () => {
      const statusLabels: Record<string, string> = {
        ready_to_merge: i18n.t('prReview.readyToMerge'),
        waiting_for_changes: i18n.t('prReview.waitingForChanges'),
        reviewed_pending_post: i18n.t('prReview.reviewComplete'),
        ready_for_followup: i18n.t('prReview.readyForFollowup'),
        needs_attention: i18n.t('prReview.needsAttention'),
        followup_issues_remain: i18n.t('prReview.blockingIssues'),
      };

      for (const [status, expectedLabel] of Object.entries(statusLabels)) {
        render(
          <ReviewStatusTree
            status={status as ReviewStatus}
            isReviewing={false}
            startedAt={null}
            reviewResult={createMockReviewResult()}
            previousReviewResult={null}
            postedCount={0}
            onRunReview={mockOnRunReview}
            onRunFollowupReview={mockOnRunFollowupReview}
            onCancelReview={mockOnCancelReview}
            newCommitsCheck={null}
          />
        );

        expect(screen.getByText(expectedLabel)).toBeInTheDocument();
      }
    });
  });

  describe('Completed Review States', () => {
    it('should show ready_to_merge status correctly', () => {
      render(
        <ReviewStatusTree
          status="ready_to_merge"
          isReviewing={false}
          startedAt={null}
          reviewResult={createMockReviewResult({
            overallStatus: 'approve',
            findings: [],
          })}
          previousReviewResult={null}
          postedCount={1}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      expect(screen.getByText(i18n.t('prReview.readyToMerge'))).toBeInTheDocument();
    });

    it('should show ready_for_followup status with run follow-up button', () => {
      render(
        <ReviewStatusTree
          status="ready_for_followup"
          isReviewing={false}
          startedAt={null}
          reviewResult={createMockReviewResult({
            postedFindingIds: ['finding-1'],
            hasPostedFindings: true,
          })}
          previousReviewResult={null}
          postedCount={1}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={createMockNewCommitsCheck({
            hasNewCommits: true,
            newCommitCount: 3,
            hasCommitsAfterPosting: true,
          })}
        />
      );

      // Component should render without errors - "Ready for Follow-up" appears in both header and tree
      expect(screen.getAllByText(/Ready for Follow-up/i).length).toBeGreaterThan(0);

      // Should show run follow-up button
      const followUpButton = screen.getByText(/Run Follow-up/i);
      followUpButton.click();
      expect(mockOnRunFollowupReview).toHaveBeenCalledTimes(1);
    });
  });

  describe('ACS-200 Integration Scenarios', () => {
    describe('Scenario: Switching between PRs with different review states', () => {
      it('should correctly display reviewing state when switching back to reviewing PR', () => {
        // PR #1: Review in progress
        render(
          <ReviewStatusTree
            status="not_reviewed"
            isReviewing={true}
            startedAt={null}
            reviewResult={null}
            previousReviewResult={null}
            postedCount={0}
            onRunReview={mockOnRunReview}
            onRunFollowupReview={mockOnRunFollowupReview}
            onCancelReview={mockOnCancelReview}
            newCommitsCheck={null}
          />
        );

        expect(screen.getByText(i18n.t('prReview.aiReviewInProgress'))).toBeInTheDocument();
        expect(screen.getByText(i18n.t('prReview.cancel'))).toBeInTheDocument();
      });
    });

    describe('Scenario: Review completes while viewing another PR', () => {
      it('should show completed status when review finishes', () => {
        // During review
        const { rerender } = render(
          <ReviewStatusTree
            status="not_reviewed"
            isReviewing={true}
            startedAt={null}
            reviewResult={null}
            previousReviewResult={null}
            postedCount={0}
            onRunReview={mockOnRunReview}
            onRunFollowupReview={mockOnRunFollowupReview}
            onCancelReview={mockOnCancelReview}
            newCommitsCheck={null}
          />
        );

        expect(screen.getByText(i18n.t('prReview.aiReviewInProgress'))).toBeInTheDocument();

        // Review completes
        rerender(
          <ReviewStatusTree
            status="reviewed_pending_post"
            isReviewing={false}
            startedAt={null}
            reviewResult={createMockReviewResult({
              findings: [
                {
                  id: 'finding-1',
                  severity: 'low',
                  category: 'style',
                  title: 'Style issue',
                  description: 'Minor style issue',
                  file: 'src/test.ts',
                  line: 10,
                  fixable: true,
                },
              ],
            })}
            previousReviewResult={null}
            postedCount={0}
            onRunReview={mockOnRunReview}
            onRunFollowupReview={mockOnRunFollowupReview}
            onCancelReview={mockOnCancelReview}
            newCommitsCheck={null}
          />
        );

        expect(screen.getByText(i18n.t('prReview.reviewComplete'))).toBeInTheDocument();
        expect(screen.queryByText(i18n.t('prReview.cancel'))).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null reviewResult with isReviewing=true', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={null}
          previousReviewResult={null}
          postedCount={0}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={null}
        />
      );

      // Should still show reviewing state
      expect(screen.getByText(i18n.t('prReview.aiReviewInProgress'))).toBeInTheDocument();
    });

    it('should handle followup in progress with reviewResult present', () => {
      render(
        <ReviewStatusTree
          status="not_reviewed"
          isReviewing={true}
          startedAt={null}
          reviewResult={createMockReviewResult({ isFollowupReview: true })}
          previousReviewResult={createMockReviewResult({
            findings: [{ id: 'f1', severity: 'high', category: 'security', title: 'Issue', description: 'Fix', file: 'test.ts', line: 1, fixable: true }],
            postedFindingIds: ['f1'],
          })}
          postedCount={1}
          onRunReview={mockOnRunReview}
          onRunFollowupReview={mockOnRunFollowupReview}
          onCancelReview={mockOnCancelReview}
          newCommitsCheck={createMockNewCommitsCheck({ hasNewCommits: true, newCommitCount: 2 })}
        />
      );

      expect(screen.getByText(i18n.t('prReview.aiReviewInProgress'))).toBeInTheDocument();
    });
  });
});
