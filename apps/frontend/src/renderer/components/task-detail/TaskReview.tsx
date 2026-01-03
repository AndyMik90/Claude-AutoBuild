import type { Task, WorktreeStatus, WorktreeDiff, MergeConflict, MergeStats, GitConflictInfo, WorktreeCreatePRResult } from '../../../shared/types';
import {
  StagedSuccessMessage,
  WorkspaceStatus,
  QAFeedbackSection,
  DiscardDialog,
  DiffViewDialog,
  ConflictDetailsDialog,
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
  isCreatingPR: boolean;
  showCreatePRDialog: boolean;
  createPRResult: WorktreeCreatePRResult | null;
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
  onFeedbackChange: (value: string) => void;
  onReject: () => void;
  onMerge: () => void;
  onCreatePR: () => void;
  onShowCreatePRDialog: (show: boolean) => void;
  onDiscard: () => void;
  onShowDiscardDialog: (show: boolean) => void;
  onShowDiffDialog: (show: boolean) => void;
  onStageOnlyChange: (value: boolean) => void;
  onShowConflictDialog: (show: boolean) => void;
  onLoadMergePreview: () => void;
  onClose?: () => void;
  onSwitchToTerminals?: () => void;
  onOpenInbuiltTerminal?: (id: string, cwd: string) => void;
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
  isCreatingPR,
  showCreatePRDialog,
  createPRResult,
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
  onFeedbackChange,
  onReject,
  onMerge,
  onCreatePR,
  onShowCreatePRDialog,
  onDiscard,
  onShowDiscardDialog,
  onShowDiffDialog,
  onStageOnlyChange,
  onShowConflictDialog,
  onLoadMergePreview,
  onClose,
  onSwitchToTerminals,
  onOpenInbuiltTerminal
}: TaskReviewProps) {
  return (
    <div className="space-y-4">
      {/* Section divider */}
      <div className="section-divider-gradient" />

      {/* Staged Success Message */}
      {stagedSuccess && (
        <StagedSuccessMessage
          stagedSuccess={stagedSuccess}
          suggestedCommitMessage={suggestedCommitMessage}
        />
      )}

      {/* Workspace Status - hide if staging was successful (worktree is deleted after staging) */}
      {isLoadingWorktree ? (
        <LoadingMessage />
      ) : worktreeStatus?.exists && !stagedSuccess ? (
        <WorkspaceStatus
          worktreeStatus={worktreeStatus}
          workspaceError={workspaceError}
          stageOnly={stageOnly}
          mergePreview={mergePreview}
          isLoadingPreview={isLoadingPreview}
          isMerging={isMerging}
          isDiscarding={isDiscarding}
          isCreatingPR={isCreatingPR}
          showCreatePRDialog={showCreatePRDialog}
          createPRResult={createPRResult}
          onShowDiffDialog={onShowDiffDialog}
          onShowDiscardDialog={onShowDiscardDialog}
          onShowCreatePRDialog={onShowCreatePRDialog}
          onShowConflictDialog={onShowConflictDialog}
          onLoadMergePreview={onLoadMergePreview}
          onStageOnlyChange={onStageOnlyChange}
          onMerge={onMerge}
          onCreatePR={onCreatePR}
          onClose={onClose}
          onSwitchToTerminals={onSwitchToTerminals}
          onOpenInbuiltTerminal={onOpenInbuiltTerminal}
        />
      ) : task.stagedInMainProject && !stagedSuccess ? (
        <StagedInProjectMessage
          task={task}
          projectPath={stagedProjectPath}
          hasWorktree={worktreeStatus?.exists || false}
          onClose={onClose}
        />
      ) : (
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
    </div>
  );
}
