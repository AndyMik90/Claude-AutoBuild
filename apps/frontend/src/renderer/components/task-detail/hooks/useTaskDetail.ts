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
  const [stageOnly, setStageOnly] = useState(task.status === 'human_review');
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
  const isRunning = task.status === 'in_progress' || task.status === 'ai_review';
  const needsReview = task.status === 'human_review';
  const executionPhase = task.executionProgress?.phase;
  const hasActiveExecution = executionPhase && executionPhase !== 'idle' && executionPhase !== 'complete' && executionPhase !== 'failed';
  const isIncomplete = isIncompleteHumanReview(task);
  const taskProgress = getTaskProgress(task);

  // Check if task is stuck (status says in_progress but no actual process)
  // Add a grace period to avoid false positives during process spawn
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    if (isRunning && !hasCheckedRunning) {
      // Wait 2 seconds before checking - gives process time to spawn and register
      timeoutId = setTimeout(() => {
        checkTaskRunning(task.id).then((actuallyRunning) => {
          setIsStuck(!actuallyRunning);
          setHasCheckedRunning(true);
        });
      }, 2000);
    } else if (!isRunning) {
      setIsStuck(false);
      setHasCheckedRunning(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [task.id, isRunning, hasCheckedRunning]);

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

  // Restore merge preview from sessionStorage on mount (survives HMR reloads)
  useEffect(() => {
    const storageKey = `mergePreview-${task.id}`;
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        const previewData = JSON.parse(stored);
        console.warn('%c[useTaskDetail] Restored merge preview from sessionStorage:', 'color: magenta;', previewData);
        setMergePreview(previewData);
        // Don't auto-popup - restored data stays silent
      } catch {
        console.warn('[useTaskDetail] Failed to parse stored merge preview');
        sessionStorage.removeItem(storageKey);
      }
    }
  }, [task.id]);

  // Load merge preview (conflict detection)
  const loadMergePreview = useCallback(async () => {
    console.warn('%c[useTaskDetail] loadMergePreview called for task:', 'color: cyan; font-weight: bold;', task.id);
    setIsLoadingPreview(true);
    try {
      console.warn('[useTaskDetail] Calling mergeWorktreePreview...');
      const result = await window.electronAPI.mergeWorktreePreview(task.id);
      console.warn('%c[useTaskDetail] mergeWorktreePreview result:', 'color: lime; font-weight: bold;', JSON.stringify(result, null, 2));
      if (result.success && result.data?.preview) {
        const previewData = result.data.preview;
        console.warn('%c[useTaskDetail] Setting merge preview:', 'color: lime; font-weight: bold;', previewData);
        console.warn('  - files:', previewData.files);
        console.warn('  - conflicts:', previewData.conflicts);
        console.warn('  - summary:', previewData.summary);
        setMergePreview(previewData);
        // Persist to sessionStorage to survive HMR reloads
        sessionStorage.setItem(`mergePreview-${task.id}`, JSON.stringify(previewData));
        // Don't auto-popup conflict dialog - let user click to see details if curious
      } else {
        console.warn('%c[useTaskDetail] Preview not successful or no preview data:', 'color: orange;', result);
        console.warn('  - success:', result.success);
        console.warn('  - data:', result.data);
        console.warn('  - error:', result.error);
      }
    } catch (err) {
      console.error('%c[useTaskDetail] Failed to load merge preview:', 'color: red; font-weight: bold;', err);
    } finally {
      console.warn('[useTaskDetail] Setting isLoadingPreview to false');
      setIsLoadingPreview(false);
    }
  }, [task.id]);

  // Auto-load merge preview when worktree is ready (eliminates need to click "Check Conflicts")
  // NOTE: This must be placed AFTER loadMergePreview definition since it depends on that callback
  useEffect(() => {
    // Only auto-load if:
    // 1. Task needs review
    // 2. Worktree exists
    // 3. We haven't already loaded the preview
    // 4. We're not currently loading
    if (needsReview && worktreeStatus?.exists && !mergePreview && !isLoadingPreview) {
      console.warn('[useTaskDetail] Auto-loading merge preview for task:', task.id);
      loadMergePreview();
    }
  }, [needsReview, worktreeStatus?.exists, mergePreview, isLoadingPreview, task.id, loadMergePreview]);

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
