import { useState, useCallback, useEffect, useRef } from 'react';
import { GripVertical, Minus, Plus, RotateCcw } from 'lucide-react';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Separator } from '../ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { TooltipProvider } from '../ui/tooltip';
import { calculateProgress, cn } from '../../lib/utils';
import { startTask, stopTask, submitReview, recoverStuckTask, deleteTask, useTaskStore } from '../../stores/task-store';
import { TaskEditDialog } from '../TaskEditDialog';
import { useTaskDetail } from './hooks/useTaskDetail';
import { TaskHeader } from './TaskHeader';
import { TaskProgress } from './TaskProgress';
import { TaskMetadata } from './TaskMetadata';
import { TaskHierarchy } from './TaskHierarchy';
import { TaskActions } from './TaskActions';
import { TaskWarnings } from './TaskWarnings';
import { TaskSubtasks } from './TaskSubtasks';
import { TaskLogs } from './TaskLogs';
import { TaskReview } from './TaskReview';
import { MergeTargetDialog } from './task-review/MergeTargetDialog';
import type { Task, MergeOptions } from '../../../shared/types';
import { useProjectStore } from '../../stores/project-store';

// Panel size constants
const MIN_WIDTH = 384; // w-96
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 384;
const EXPANDED_WIDTH = 700;
const STORAGE_KEY = 'task-detail-panel-width';
const FONT_SIZE_STORAGE_KEY = 'task-detail-font-size';

// Font size constants
const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 20;
const DEFAULT_FONT_SIZE = 14;

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onSelectTask?: (task: Task) => void;
}

export function TaskDetailPanel({ task, onClose, onSelectTask }: TaskDetailPanelProps) {
  const state = useTaskDetail({ task });
  const _progress = calculateProgress(task.subtasks);
  const allTasks = useTaskStore((state) => state.tasks);
  const selectedProject = useProjectStore((state) => state.getSelectedProject());

  // Merge target dialog state
  const [showMergeTargetDialog, setShowMergeTargetDialog] = useState(false);

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH;
  });
  const [isExpanded, setIsExpanded] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Font size state
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    return saved ? Math.min(Math.max(parseInt(saved, 10), MIN_FONT_SIZE), MAX_FONT_SIZE) : DEFAULT_FONT_SIZE;
  });

  // Save font size to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize.toString());
  }, [fontSize]);

  // Font size handlers
  const increaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.min(prev + 1, MAX_FONT_SIZE));
  }, []);

  const decreaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.max(prev - 1, MIN_FONT_SIZE));
  }, []);

  const resetFontSize = useCallback(() => {
    setFontSize(DEFAULT_FONT_SIZE);
  }, []);

  // Save width to localStorage when it changes
  useEffect(() => {
    if (!isExpanded) {
      localStorage.setItem(STORAGE_KEY, panelWidth.toString());
    }
  }, [panelWidth, isExpanded]);

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = {
      startX: e.clientX,
      startWidth: panelWidth
    };
  }, [panelWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;

      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.min(Math.max(resizeRef.current.startWidth + delta, MIN_WIDTH), MAX_WIDTH);
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Toggle expanded mode
  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Get current width based on expanded state
  const currentWidth = isExpanded ? EXPANDED_WIDTH : panelWidth;

  // Event Handlers
  const handleStartStop = () => {
    if (state.isRunning && !state.isStuck) {
      stopTask(task.id);
    } else {
      startTask(task.id);
    }
  };

  const handleRecover = async () => {
    state.setIsRecovering(true);
    const result = await recoverStuckTask(task.id, { autoRestart: true });
    if (result.success) {
      state.setIsStuck(false);
      state.setHasCheckedRunning(false);
    }
    state.setIsRecovering(false);
  };

  const handleReject = async () => {
    if (!state.feedback.trim()) {
      return;
    }
    state.setIsSubmitting(true);
    await submitReview(task.id, false, state.feedback);
    state.setIsSubmitting(false);
    state.setFeedback('');
  };

  const handleDelete = async () => {
    state.setIsDeleting(true);
    state.setDeleteError(null);
    const result = await deleteTask(task.id);
    if (result.success) {
      state.setShowDeleteDialog(false);
      onClose();
    } else {
      state.setDeleteError(result.error || 'Failed to delete task');
    }
    state.setIsDeleting(false);
  };

  const handleMerge = async (options: MergeOptions) => {
    console.warn('[TaskDetailPanel] handleMerge called with options:', options);
    setShowMergeTargetDialog(false);
    state.setIsMerging(true);
    state.setWorkspaceError(null);
    try {
      console.warn('[TaskDetailPanel] Calling mergeWorktree...');
      const result = await window.electronAPI.mergeWorktree(task.id, options);
      console.warn('[TaskDetailPanel] mergeWorktree result:', JSON.stringify(result, null, 2));
      if (result.success && result.data?.success) {
        // For stage-only: don't close the panel, show success message
        // For full merge: close the panel
        if (options.noCommit && result.data.staged) {
          // Changes are staged in main project - show success but keep panel open
          console.warn('[TaskDetailPanel] Stage-only success, showing success message');
          state.setWorkspaceError(null);
          state.setStagedSuccess(result.data.message || 'Changes staged in main project');
          state.setStagedProjectPath(result.data.projectPath);
          state.setSuggestedCommitMessage(result.data.suggestedCommitMessage);
        } else {
          console.warn('[TaskDetailPanel] Full merge success, closing panel');
          onClose();
        }
      } else {
        console.warn('[TaskDetailPanel] Merge failed:', result.data?.message || result.error);
        state.setWorkspaceError(result.data?.message || result.error || 'Failed to merge changes');
      }
    } catch (error) {
      console.error('[TaskDetailPanel] handleMerge exception:', error);
      state.setWorkspaceError(error instanceof Error ? error.message : 'Unknown error during merge');
    } finally {
      console.warn('[TaskDetailPanel] Setting isMerging to false');
      state.setIsMerging(false);
    }
  };

  // Open merge target dialog instead of merging directly
  const handleOpenMergeDialog = () => {
    setShowMergeTargetDialog(true);
  };

  const handleDiscard = async () => {
    state.setIsDiscarding(true);
    state.setWorkspaceError(null);
    const result = await window.electronAPI.discardWorktree(task.id);
    if (result.success && result.data?.success) {
      state.setShowDiscardDialog(false);
      onClose();
    } else {
      state.setWorkspaceError(result.data?.message || result.error || 'Failed to discard changes');
    }
    state.setIsDiscarding(false);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex h-full flex-col bg-card border-l border-border overflow-hidden relative transition-[width] duration-200",
          isResizing && "transition-none"
        )}
        style={{ width: currentWidth }}
      >
        {/* Resize handle */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 cursor-col-resize group z-10",
            "hover:bg-primary/30 active:bg-primary/50",
            isResizing && "bg-primary/50"
          )}
          onMouseDown={handleMouseDown}
        >
          <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>

        {/* Header */}
        <TaskHeader
          task={task}
          isStuck={state.isStuck}
          isIncomplete={state.isIncomplete}
          taskProgress={state.taskProgress}
          isRunning={state.isRunning}
          isExpanded={isExpanded}
          onClose={onClose}
          onEdit={() => state.setIsEditDialogOpen(true)}
          onToggleExpand={handleToggleExpand}
        />

        <Separator />

        {/* Tabs */}
        <Tabs value={state.activeTab} onValueChange={state.setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border">
            <TabsList className="justify-start rounded-none bg-transparent p-0 h-auto border-0">
              <TabsTrigger
                value="overview"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="subtasks"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
              >
                Subtasks ({task.subtasks.length})
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-2.5 text-sm"
              >
                Logs
              </TabsTrigger>
            </TabsList>

            {/* Font Size Controls */}
            <div className="flex items-center gap-1 pr-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-primary/10"
                    onClick={decreaseFontSize}
                    disabled={fontSize <= MIN_FONT_SIZE}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Decrease font size</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs font-mono hover:bg-primary/10 min-w-[32px]"
                    onClick={resetFontSize}
                  >
                    {fontSize}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Reset to default ({DEFAULT_FONT_SIZE}px)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-primary/10"
                    onClick={increaseFontSize}
                    disabled={fontSize >= MAX_FONT_SIZE}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Increase font size</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 min-h-0 overflow-hidden mt-0">
            <ScrollArea className="h-full w-full">
              <div className="p-5 space-y-5 w-full max-w-full overflow-hidden task-detail-scalable" style={{ fontSize: `${fontSize}px` }}>
                {/* Warnings */}
                <TaskWarnings
                  isStuck={state.isStuck}
                  isIncomplete={state.isIncomplete}
                  isRecovering={state.isRecovering}
                  taskProgress={state.taskProgress}
                  onRecover={handleRecover}
                  onResume={handleStartStop}
                />

                {/* Progress */}
                <TaskProgress
                  task={task}
                  isRunning={state.isRunning}
                  hasActiveExecution={!!state.hasActiveExecution}
                  executionPhase={state.executionPhase}
                  isStuck={state.isStuck}
                />

                {/* Metadata */}
                <TaskMetadata task={task} />

                {/* Hierarchical Task Relationships */}
                <TaskHierarchy
                  task={task}
                  allTasks={allTasks}
                  onTaskClick={(clickedTask) => {
                    // Switch to the clicked task if onSelectTask is provided
                    if (onSelectTask) {
                      onSelectTask(clickedTask);
                    }
                  }}
                />

                {/* Human Review Section */}
                {state.needsReview && (
                  <TaskReview
                    task={task}
                    feedback={state.feedback}
                    isSubmitting={state.isSubmitting}
                    worktreeStatus={state.worktreeStatus}
                    worktreeDiff={state.worktreeDiff}
                    isLoadingWorktree={state.isLoadingWorktree}
                    isMerging={state.isMerging}
                    isDiscarding={state.isDiscarding}
                    showDiscardDialog={state.showDiscardDialog}
                    showDiffDialog={state.showDiffDialog}
                    workspaceError={state.workspaceError}
                    stageOnly={state.stageOnly}
                    stagedSuccess={state.stagedSuccess}
                    stagedProjectPath={state.stagedProjectPath}
                    suggestedCommitMessage={state.suggestedCommitMessage}
                    mergePreview={state.mergePreview}
                    isLoadingPreview={state.isLoadingPreview}
                    showConflictDialog={state.showConflictDialog}
                    onFeedbackChange={state.setFeedback}
                    onReject={handleReject}
                    onMerge={handleOpenMergeDialog}
                    onDiscard={handleDiscard}
                    onShowDiscardDialog={state.setShowDiscardDialog}
                    onShowDiffDialog={state.setShowDiffDialog}
                    onStageOnlyChange={state.setStageOnly}
                    onShowConflictDialog={state.setShowConflictDialog}
                    onLoadMergePreview={state.loadMergePreview}
                  />
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Subtasks Tab */}
          <TabsContent value="subtasks" className="flex-1 min-h-0 overflow-hidden mt-0">
            <TaskSubtasks task={task} fontSize={fontSize} />
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="flex-1 min-h-0 overflow-hidden mt-0">
            <TaskLogs
              task={task}
              phaseLogs={state.phaseLogs}
              isLoadingLogs={state.isLoadingLogs}
              expandedPhases={state.expandedPhases}
              isStuck={state.isStuck}
              logsEndRef={state.logsEndRef}
              logsContainerRef={state.logsContainerRef}
              onLogsScroll={state.handleLogsScroll}
              onTogglePhase={state.togglePhase}
              fontSize={fontSize}
            />
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Actions */}
        <TaskActions
          task={task}
          isStuck={state.isStuck}
          isIncomplete={state.isIncomplete}
          isRunning={state.isRunning}
          isRecovering={state.isRecovering}
          showDeleteDialog={state.showDeleteDialog}
          isDeleting={state.isDeleting}
          deleteError={state.deleteError}
          onStartStop={handleStartStop}
          onRecover={handleRecover}
          onDelete={handleDelete}
          onShowDeleteDialog={state.setShowDeleteDialog}
        />

        {/* Edit Task Dialog */}
        <TaskEditDialog
          task={task}
          open={state.isEditDialogOpen}
          onOpenChange={state.setIsEditDialogOpen}
        />

        {/* Merge Target Dialog */}
        <MergeTargetDialog
          open={showMergeTargetDialog}
          projectPath={selectedProject?.path || ''}
          currentBranch={state.worktreeStatus?.baseBranch || 'main'}
          isMerging={state.isMerging}
          onOpenChange={setShowMergeTargetDialog}
          onMerge={handleMerge}
        />
      </div>
    </TooltipProvider>
  );
}
