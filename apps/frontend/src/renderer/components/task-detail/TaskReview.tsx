import type { Task, WorktreeStatus, WorktreeDiff, MergeConflict, MergeStats, GitConflictInfo } from '../../../shared/types';
import {
  StagedSuccessMessage,
  WorkspaceStatus,
  QAFeedbackSection,
  DiscardDialog,
  DiffViewDialog,
  ConflictDetailsDialog,
  ConflictResolverDialog,
  LoadingMessage,
  NoWorkspaceMessage,
  StagedInProjectMessage
} from './task-review';

interface TaskReviewProps {
  task: Task;
  feedback: string;
  isSubmitting: boolean;
  worktreeStatus: WorktreeStatus | null;
  worktreeDiff: WorktreeDiff | null;
  isLoadingWorktree: boolean;
  isMerging: boolean;
  isDiscarding: boolean;
  showDiscardDialog: boolean;
  showDiffDialog: boolean;
  workspaceError: string | null;
  stageOnly: boolean;
  stagedSuccess: string | null;
  stagedProjectPath: string | undefined;
  suggestedCommitMessage: string | undefined;
  mergePreview: { files: string[]; conflicts: MergeConflict[]; summary: MergeStats; gitConflicts?: GitConflictInfo; uncommittedChanges?: { hasChanges: boolean; files: string[]; count: number } | null } | null;
  isLoadingPreview: boolean;
  showConflictDialog: boolean;
  showConflictResolver: boolean;
  onFeedbackChange: (value: string) => void;
  onReject: () => void;
  onMerge: () => void;
  onDiscard: () => void;
  onShowDiscardDialog: (show: boolean) => void;
  onShowDiffDialog: (show: boolean) => void;
  onStageOnlyChange: (value: boolean) => void;
  onShowConflictDialog: (show: boolean) => void;
  onShowConflictResolver: (show: boolean) => void;
  onLoadMergePreview: () => void;
  onClose?: () => void;
}

/**
 * TaskReview Component
 *
 * Main component for reviewing task completion, displaying workspace status,
 * merge previews, and providing options to merge, stage, or discard changes.
 *
 * This component has been refactored into smaller, focused sub-components for better
 * maintainability. See ./task-review/ directory for individual component implementations.
 */
export function TaskReview({
  task,
  feedback,
  isSubmitting,
  worktreeStatus,
  worktreeDiff,
  isLoadingWorktree,
  isMerging,
  isDiscarding,
  showDiscardDialog,
  showDiffDialog,
  workspaceError,
  stageOnly,
  stagedSuccess,
  stagedProjectPath,
  suggestedCommitMessage,
  mergePreview,
  isLoadingPreview,
  showConflictDialog,
  showConflictResolver,
  onFeedbackChange,
  onReject,
  onMerge,
  onDiscard,
  onShowDiscardDialog,
  onShowDiffDialog,
  onStageOnlyChange,
  onShowConflictDialog,
  onShowConflictResolver,
  onLoadMergePreview,
  onClose
}: TaskReviewProps) {
  return (
    <div className="space-y-4">
      {/* Section divider */}
      <div className="section-divider-gradient" />

      {/* Staged Success Message */}
      {stagedSuccess && (
        <StagedSuccessMessage
          stagedSuccess={stagedSuccess}
          stagedProjectPath={stagedProjectPath}
          task={task}
          suggestedCommitMessage={suggestedCommitMessage}
        />
      )}

      {/* Workspace Status - show appropriate component based on staging state and worktree existence */}
      {/* Don't show anything in this section if stagedSuccess is shown (avoids duplicate messaging) */}
      {isLoadingWorktree ? (
        <LoadingMessage />
      ) : stagedSuccess ? (
        // Staging just succeeded - StagedSuccessMessage is already shown above, don't show anything else
        null
      ) : task.stagedInMainProject ? (
        // Changes were previously staged - show staged message with worktree cleanup option
        <StagedInProjectMessage
          task={task}
          projectPath={stagedProjectPath}
          hasWorktree={worktreeStatus?.exists || false}
          onClose={onClose}
        />
      ) : worktreeStatus?.exists ? (
        // Worktree exists and not yet staged - show full workspace status
        <WorkspaceStatus
          task={task}
          worktreeStatus={worktreeStatus}
          workspaceError={workspaceError}
          stageOnly={stageOnly}
          mergePreview={mergePreview}
          isLoadingPreview={isLoadingPreview}
          isMerging={isMerging}
          isDiscarding={isDiscarding}
          onShowDiffDialog={onShowDiffDialog}
          onShowDiscardDialog={onShowDiscardDialog}
          onShowConflictDialog={onShowConflictDialog}
          onShowConflictResolver={onShowConflictResolver}
          onLoadMergePreview={onLoadMergePreview}
          onStageOnlyChange={onStageOnlyChange}
          onMerge={onMerge}
        />
      ) : (
        // No worktree and not staged - allow marking as done
        <NoWorkspaceMessage task={task} onClose={onClose} />
      )}

      {/* QA Feedback Section */}
      <QAFeedbackSection
        feedback={feedback}
        isSubmitting={isSubmitting}
        onFeedbackChange={onFeedbackChange}
        onReject={onReject}
      />

      {/* Discard Confirmation Dialog */}
      <DiscardDialog
        open={showDiscardDialog}
        task={task}
        worktreeStatus={worktreeStatus}
        isDiscarding={isDiscarding}
        onOpenChange={onShowDiscardDialog}
        onDiscard={onDiscard}
      />

      {/* Diff View Dialog */}
      <DiffViewDialog
        open={showDiffDialog}
        worktreeDiff={worktreeDiff}
        onOpenChange={onShowDiffDialog}
      />

      {/* Conflict Details Dialog */}
      <ConflictDetailsDialog
        open={showConflictDialog}
        mergePreview={mergePreview}
        stageOnly={stageOnly}
        onOpenChange={onShowConflictDialog}
        onMerge={onMerge}
      />

      {/* Interactive Conflict Resolver Dialog */}
      <ConflictResolverDialog
        open={showConflictResolver}
        taskId={task.id}
        onOpenChange={onShowConflictResolver}
        onResolved={onLoadMergePreview}
      />
    </div>
  );
}
