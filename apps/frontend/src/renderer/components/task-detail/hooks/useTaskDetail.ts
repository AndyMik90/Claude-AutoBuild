import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../../stores/project-store';
import { checkTaskRunning, isIncompleteHumanReview, getTaskProgress } from '../../../stores/task-store';
import type { Task, TaskLogs, TaskLogPhase, WorktreeStatus, WorktreeDiff, MergeConflict, MergeStats, GitConflictInfo } from '../../../../shared/types';

export interface UseTaskDetailOptions {
  task: Task;
}

export function useTaskDetail({ task }: UseTaskDetailOptions) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [hasCheckedRunning, setHasCheckedRunning] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [worktreeStatus, setWorktreeStatus] = useState<WorktreeStatus | null>(null);
  const [worktreeDiff, setWorktreeDiff] = useState<WorktreeDiff | null>(null);
  const [isLoadingWorktree, setIsLoadingWorktree] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [stageOnly, setStageOnly] = useState(false); // Default to full merge for proper cleanup (fixes #243)
  const [stagedSuccess, setStagedSuccess] = useState<string | null>(null);
  const [stagedProjectPath, setStagedProjectPath] = useState<string | undefined>(undefined);
  const [suggestedCommitMessage, setSuggestedCommitMessage] = useState<string | undefined>(undefined);
  const [phaseLogs, setPhaseLogs] = useState<TaskLogs | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<TaskLogPhase>>(new Set());
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Merge preview state
  const [mergePreview, setMergePreview] = useState<{
    files: string[];
    conflicts: MergeConflict[];
    summary: MergeStats;
    gitConflicts?: GitConflictInfo;
  } | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);

  const selectedProject = useProjectStore((state) => state.getSelectedProject());
  const isRunning = task.status === 'in_progress';
  // isActiveTask includes ai_review for stuck detection (CHANGELOG documents this feature)
  const isActiveTask = task.status === 'in_progress' || task.status === 'ai_review';
  const needsReview = task.status === 'human_review';
  const executionPhase = task.executionProgress?.phase;
  const hasActiveExecution = executionPhase && executionPhase !== 'idle' && executionPhase !== 'complete' && executionPhase !== 'failed';
  const isIncomplete = isIncompleteHumanReview(task);
  const taskProgress = getTaskProgress(task);

  // Check if task is stuck (status says in_progress/ai_review but no actual process)
  // Add a grace period to avoid false positives during process spawn
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    // IMPORTANT: If execution phase is 'complete' or 'failed', the task is NOT stuck.
    // It means the process has finished and status update is pending.
    // This prevents false-positive "stuck" indicators when the process exits normally.
    const isPhaseTerminal = executionPhase === 'complete' || executionPhase === 'failed';
    if (isPhaseTerminal) {
      setIsStuck(false);
      setHasCheckedRunning(true);
      return;
    }

    if (isActiveTask && !hasCheckedRunning) {
      // Wait 2 seconds before checking - gives process time to spawn and register
      timeoutId = setTimeout(() => {
        checkTaskRunning(task.id).then((actuallyRunning) => {
          // Double-check the phase in case it changed while waiting
          const latestPhase = task.executionProgress?.phase;
          if (latestPhase === 'complete' || latestPhase === 'failed') {
            setIsStuck(false);
          } else {
            setIsStuck(!actuallyRunning);
          }
          setHasCheckedRunning(true);
        });
      }, 2000);
    } else if (!isActiveTask) {
      setIsStuck(false);
      setHasCheckedRunning(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [task.id, isActiveTask, hasCheckedRunning, executionPhase, task.executionProgress?.phase]);

  // Handle scroll events in logs to detect if user scrolled up
  const handleLogsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setIsUserScrolledUp(!isNearBottom);
  };

  // Auto-scroll logs to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current && !isUserScrolledUp) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [task.logs, activeTab, isUserScrolledUp]);

  // Reset scroll state when switching to logs tab
  useEffect(() => {
    if (activeTab === 'logs') {
      setIsUserScrolledUp(false);
    }
  }, [activeTab]);

  // Load worktree status when task is in human_review
  useEffect(() => {
    if (needsReview) {
      setIsLoadingWorktree(true);
      setWorkspaceError(null);

      Promise.all([
        window.electronAPI.getWorktreeStatus(task.id),
        window.electronAPI.getWorktreeDiff(task.id)
      ]).then(([statusResult, diffResult]) => {
        if (statusResult.success && statusResult.data) {
          setWorktreeStatus(statusResult.data);
        }
        if (diffResult.success && diffResult.data) {
          setWorktreeDiff(diffResult.data);
        }
      }).catch((err) => {
        console.error('Failed to load worktree info:', err);
      }).finally(() => {
        setIsLoadingWorktree(false);
      });
    } else {
      setWorktreeStatus(null);
      setWorktreeDiff(null);
    }
  }, [task.id, needsReview]);

  // Load and watch phase logs
  useEffect(() => {
    if (!selectedProject) return;

    const loadLogs = async () => {
      setIsLoadingLogs(true);
      try {
        const result = await window.electronAPI.getTaskLogs(selectedProject.id, task.specId);
        if (result.success && result.data) {
          setPhaseLogs(result.data);
          // Auto-expand active phase
          const activePhase = (['planning', 'coding', 'validation'] as TaskLogPhase[]).find(
            phase => result.data?.phases[phase]?.status === 'active'
          );
          if (activePhase) {
            setExpandedPhases(new Set([activePhase]));
          }
        }
      } catch (err) {
        console.error('Failed to load task logs:', err);
      } finally {
        setIsLoadingLogs(false);
      }
    };

    loadLogs();

    // Start watching for log changes
    window.electronAPI.watchTaskLogs(selectedProject.id, task.specId);

    // Listen for log changes
    const unsubscribe = window.electronAPI.onTaskLogsChanged((specId, logs) => {
      if (specId === task.specId) {
        setPhaseLogs(logs);
        // Auto-expand newly active phase
        const activePhase = (['planning', 'coding', 'validation'] as TaskLogPhase[]).find(
          phase => logs.phases[phase]?.status === 'active'
        );
        if (activePhase) {
          setExpandedPhases(prev => {
            const next = new Set(prev);
            next.add(activePhase);
            return next;
          });
        }
      }
    });

    return () => {
      unsubscribe();
      window.electronAPI.unwatchTaskLogs(task.specId);
    };
  }, [selectedProject, task.specId]);

  // Toggle phase expansion
  const togglePhase = useCallback((phase: TaskLogPhase) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  }, []);

  // Track if we've already loaded preview for this task to prevent infinite loops
  const hasLoadedPreviewRef = useRef<string | null>(null);

  // Clear merge preview state when switching to a different task
  useEffect(() => {
    if (hasLoadedPreviewRef.current !== task.id) {
      setMergePreview(null);
      hasLoadedPreviewRef.current = null;
    }
  }, [task.id]);

  // Load merge preview (conflict detection)
  const loadMergePreview = useCallback(async () => {
    setIsLoadingPreview(true);
    try {
      const result = await window.electronAPI.mergeWorktreePreview(task.id);
      if (result.success && result.data?.preview) {
        setMergePreview(result.data.preview);
      }
    } catch (err) {
      console.error('[useTaskDetail] Failed to load merge preview:', err);
    } finally {
      hasLoadedPreviewRef.current = task.id;
      setIsLoadingPreview(false);
    }
  }, [task.id]);

  // NOTE: Merge preview is NO LONGER auto-loaded on modal open.
  // User must click "Check for Conflicts" button to trigger the expensive preview operation.
  // This improves modal open performance significantly (avoids 1-30+ second Python subprocess).

  return {
    // State
    feedback,
    isSubmitting,
    activeTab,
    isUserScrolledUp,
    isStuck,
    isRecovering,
    hasCheckedRunning,
    showDeleteDialog,
    isDeleting,
    deleteError,
    isEditDialogOpen,
    worktreeStatus,
    worktreeDiff,
    isLoadingWorktree,
    isMerging,
    isDiscarding,
    showDiscardDialog,
    workspaceError,
    showDiffDialog,
    stageOnly,
    stagedSuccess,
    stagedProjectPath,
    suggestedCommitMessage,
    phaseLogs,
    isLoadingLogs,
    expandedPhases,
    logsEndRef,
    logsContainerRef,
    selectedProject,
    isRunning,
    needsReview,
    executionPhase,
    hasActiveExecution,
    isIncomplete,
    taskProgress,
    mergePreview,
    isLoadingPreview,
    showConflictDialog,

    // Setters
    setFeedback,
    setIsSubmitting,
    setActiveTab,
    setIsUserScrolledUp,
    setIsStuck,
    setIsRecovering,
    setHasCheckedRunning,
    setShowDeleteDialog,
    setIsDeleting,
    setDeleteError,
    setIsEditDialogOpen,
    setWorktreeStatus,
    setWorktreeDiff,
    setIsLoadingWorktree,
    setIsMerging,
    setIsDiscarding,
    setShowDiscardDialog,
    setWorkspaceError,
    setShowDiffDialog,
    setStageOnly,
    setStagedSuccess,
    setStagedProjectPath,
    setSuggestedCommitMessage,
    setPhaseLogs,
    setIsLoadingLogs,
    setExpandedPhases,
    setMergePreview,
    setIsLoadingPreview,
    setShowConflictDialog,

    // Handlers
    handleLogsScroll,
    togglePhase,
    loadMergePreview,
  };
}
