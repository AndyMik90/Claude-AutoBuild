import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { Plus, Inbox, Loader2, Eye, CheckCircle2, Archive, Settings, ListPlus } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { TaskCard } from './TaskCard';
import { SortableTaskCard } from './SortableTaskCard';
import { QueueSettingsModal } from './QueueSettingsModal';
import { TASK_STATUS_COLUMNS, TASK_STATUS_LABELS } from '../../shared/constants';
import { cn } from '../lib/utils';
import { persistTaskStatus, archiveTasks, promoteNextQueuedTask } from '../stores/task-store';
import { updateProjectSettings } from '../stores/project-store';
import { useProjectStore } from '../stores/project-store';
import type { Task, TaskStatus } from '../../shared/types';

interface KanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onNewTaskClick?: () => void;
}

interface DroppableColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  isOver: boolean;
  onAddClick?: () => void;
  onArchiveAll?: () => void;
  onQueueSettings?: () => void;
  onQueueAll?: () => void;
}

// Empty state content for each column
const getEmptyStateContent = (status: TaskStatus, t: (key: string) => string): { icon: React.ReactNode; message: string; subtext?: string } => {
  switch (status) {
    case 'backlog':
      return {
        icon: <Inbox className="h-6 w-6 text-muted-foreground/50" />,
        message: t('kanban.emptyBacklog'),
        subtext: t('kanban.emptyBacklogHint')
      };
    case 'queue':
      return {
        icon: <Loader2 className="h-6 w-6 text-muted-foreground/50" />,
        message: t('kanban.emptyQueue'),
        subtext: t('kanban.emptyQueueHint')
      };
    case 'in_progress':
      return {
        icon: <Loader2 className="h-6 w-6 text-muted-foreground/50" />,
        message: t('kanban.emptyInProgress'),
        subtext: t('kanban.emptyInProgressHint')
      };
    case 'ai_review':
      return {
        icon: <Eye className="h-6 w-6 text-muted-foreground/50" />,
        message: t('kanban.emptyAiReview'),
        subtext: t('kanban.emptyAiReviewHint')
      };
    case 'human_review':
      return {
        icon: <Eye className="h-6 w-6 text-muted-foreground/50" />,
        message: t('kanban.emptyHumanReview'),
        subtext: t('kanban.emptyHumanReviewHint')
      };
    case 'done':
      return {
        icon: <CheckCircle2 className="h-6 w-6 text-muted-foreground/50" />,
        message: t('kanban.emptyDone'),
        subtext: t('kanban.emptyDoneHint')
      };
    default:
      return {
        icon: <Inbox className="h-6 w-6 text-muted-foreground/50" />,
        message: t('kanban.emptyDefault')
      };
  }
};

function DroppableColumn({ status, tasks, onTaskClick, isOver, onAddClick, onArchiveAll, onQueueSettings, onQueueAll }: DroppableColumnProps) {
  const { t } = useTranslation('tasks');
  const { setNodeRef } = useDroppable({
    id: status
  });

  const taskIds = tasks.map((t) => t.id);

  const getColumnBorderColor = (): string => {
    switch (status) {
      case 'backlog':
        return 'column-backlog';
      case 'queue':
        return 'column-queue';
      case 'in_progress':
        return 'column-in-progress';
      case 'ai_review':
        return 'column-ai-review';
      case 'human_review':
        return 'column-human-review';
      case 'done':
        return 'column-done';
      default:
        return 'border-t-muted-foreground/30';
    }
  };

  const emptyState = getEmptyStateContent(status, t);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-white/5 bg-linear-to-b from-secondary/30 to-transparent backdrop-blur-sm transition-all duration-200',
        getColumnBorderColor(),
        'border-t-2',
        isOver && 'drop-zone-highlight'
      )}
    >
      {/* Column header - enhanced styling */}
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-sm text-foreground">
            {TASK_STATUS_LABELS[status]}
          </h2>
          <span className="column-count-badge">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {status === 'backlog' && onQueueAll && tasks.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-blue-500/10 hover:text-blue-400 transition-colors"
                  onClick={onQueueAll}
                >
                  <ListPlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipPrimitive.Portal>
                <TooltipContent>
                  <p>Queue all tasks - Move all tasks from Planning to Queue</p>
                </TooltipContent>
              </TooltipPrimitive.Portal>
            </Tooltip>
          )}
          {status === 'backlog' && onAddClick && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 hover:bg-primary/10 hover:text-primary transition-colors"
                  onClick={onAddClick}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipPrimitive.Portal>
                <TooltipContent>
                  <p>Create new task</p>
                </TooltipContent>
              </TooltipPrimitive.Portal>
            </Tooltip>
          )}
          {status === 'queue' && onQueueSettings && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-cyan-500/10 hover:text-cyan-400 transition-colors"
              onClick={onQueueSettings}
              title="Queue Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          {status === 'done' && onArchiveAll && tasks.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-muted-foreground/10 hover:text-muted-foreground transition-colors"
              onClick={onArchiveAll}
              title={t('tooltips.archiveAllDone')}
            >
              <Archive className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full px-3 pb-3 pt-2">
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3 min-h-[120px]">
              {tasks.length === 0 ? (
                <div
                  className={cn(
                    'empty-column-dropzone flex flex-col items-center justify-center py-6',
                    isOver && 'active'
                  )}
                >
                  {isOver ? (
                    <>
                      <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                        <Plus className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-primary">{t('kanban.dropHere')}</span>
                    </>
                  ) : (
                    <>
                      {emptyState.icon}
                      <span className="mt-2 text-sm font-medium text-muted-foreground/70">
                        {emptyState.message}
                      </span>
                      {emptyState.subtext && (
                        <span className="mt-0.5 text-xs text-muted-foreground/50">
                          {emptyState.subtext}
                        </span>
                      )}
                    </>
                  )}
                </div>
              ) : (
                tasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick(task)}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </ScrollArea>
      </div>
    </div>
  );
}

export function KanbanBoard({ tasks, onTaskClick, onNewTaskClick }: KanbanBoardProps) {
  const { t } = useTranslation('tasks');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showQueueSettings, setShowQueueSettings] = useState(false);

  // Get active project for queue settings
  const { getActiveProject } = useProjectStore();
  const activeProject = getActiveProject();
  const projectId = tasks.length > 0 ? tasks[0].projectId : activeProject?.id || '';
  const maxParallelTasks = activeProject?.settings.maxParallelTasks ?? 3;

  // Count archived tasks for display
  const archivedCount = useMemo(() => {
    return tasks.filter((t) => t.metadata?.archivedAt).length;
  }, [tasks]);

  // Filter tasks based on archive status
  const filteredTasks = useMemo(() => {
    if (showArchived) {
      return tasks; // Show all tasks including archived
    }
    return tasks.filter((t) => !t.metadata?.archivedAt);
  }, [tasks, showArchived]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // 8px movement required before drag starts
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      backlog: [],
      queue: [],
      in_progress: [],
      ai_review: [],
      human_review: [],
      done: []
    };

    filteredTasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });

    // Sort tasks within each column by createdAt (newest first)
    Object.keys(grouped).forEach((status) => {
      grouped[status as TaskStatus].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA; // Descending order (newest first)
      });
    });

    return grouped;
  }, [filteredTasks]);

  const handleArchiveAll = async () => {
    // Get projectId from the first task (all tasks should have the same projectId)
    const projectId = tasks[0]?.projectId;
    if (!projectId) {
      console.error('[KanbanBoard] No projectId found');
      return;
    }

    const doneTaskIds = tasksByStatus.done.map((t) => t.id);
    if (doneTaskIds.length === 0) return;

    const result = await archiveTasks(projectId, doneTaskIds);
    if (!result.success) {
      console.error('[KanbanBoard] Failed to archive tasks:', result.error);
    }
  };

  const handleQueueAll = async () => {
    const backlogTasks = tasksByStatus.backlog;
    if (backlogTasks.length === 0) return;

    console.log(`[KanbanBoard] Queuing ${backlogTasks.length} tasks from backlog`);

    // Update all backlog tasks to queue status
    for (const task of backlogTasks) {
      const success = await persistTaskStatus(task.id, 'queue');
      if (!success) {
        console.error(`[KanbanBoard] Failed to queue task ${task.id}`);
      }
    }

    // Wait a bit for state to update, then trigger queue promotion
    await new Promise(resolve => setTimeout(resolve, 100));

    // The queue promotion logic will automatically start tasks that:
    // 1. Have no dependencies, OR
    // 2. Have all dependencies met (completed and merged)
    // 3. Are within parallel capacity
    console.log('[KanbanBoard] Triggering queue promotion after bulk queue');
    await promoteNextQueuedTask();
  };

  const handleSaveQueueSettings = async (newMaxParallel: number) => {
    if (!projectId) {
      console.error('[KanbanBoard] No projectId found');
      return;
    }

    const success = await updateProjectSettings(projectId, {
      maxParallelTasks: newMaxParallel
    });

    if (!success) {
      console.error('[KanbanBoard] Failed to save queue settings');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find((t) => t.id === active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (!over) {
      setOverColumnId(null);
      return;
    }

    const overId = over.id as string;

    // Check if over a column
    if (TASK_STATUS_COLUMNS.includes(overId as TaskStatus)) {
      setOverColumnId(overId);
      return;
    }

    // Check if over a task - get its column
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask) {
      setOverColumnId(overTask.status);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    setOverColumnId(null);

    if (!over) return;

    const activeTaskId = active.id as string;
    const overId = over.id as string;

    // Helper function to check and enforce parallel task limit
    const enforceParallelLimit = (targetStatus: TaskStatus): TaskStatus => {
      if (targetStatus === 'in_progress') {
        const inProgressCount = tasksByStatus.in_progress.length;
        if (inProgressCount >= maxParallelTasks) {
          console.log(`[KanbanBoard] Parallel task limit reached (${maxParallelTasks}). Redirecting to queue.`);
          return 'queue';
        }
      }
      return targetStatus;
    };

    // Check if dropped on a column
    if (TASK_STATUS_COLUMNS.includes(overId as TaskStatus)) {
      const requestedStatus = overId as TaskStatus;
      const task = tasks.find((t) => t.id === activeTaskId);

      if (task && task.status !== requestedStatus) {
        // Enforce parallel task limit
        const finalStatus = enforceParallelLimit(requestedStatus);

        // Show feedback if redirected to queue
        if (requestedStatus === 'in_progress' && finalStatus === 'queue') {
          console.log(`[KanbanBoard] Task moved to queue - parallel limit (${maxParallelTasks}) reached`);
        }

        // Persist status change to file and update local state
        persistTaskStatus(activeTaskId, finalStatus);
      }
      return;
    }

    // Check if dropped on another task - move to that task's column
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask) {
      const task = tasks.find((t) => t.id === activeTaskId);
      if (task && task.status !== overTask.status) {
        // Enforce parallel task limit
        const finalStatus = enforceParallelLimit(overTask.status);

        // Show feedback if redirected to queue
        if (overTask.status === 'in_progress' && finalStatus === 'queue') {
          console.log(`[KanbanBoard] Task moved to queue - parallel limit (${maxParallelTasks}) reached`);
        }

        // Persist status change to file and update local state
        persistTaskStatus(activeTaskId, finalStatus);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Kanban header with filters */}
      <div className="flex items-center justify-end px-6 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Checkbox
            id="showArchived"
            checked={showArchived}
            onCheckedChange={(checked) => setShowArchived(checked === true)}
          />
          <Label
            htmlFor="showArchived"
            className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer"
          >
            <Archive className="h-3.5 w-3.5" />
            {t('kanban.showArchived')}
            {archivedCount > 0 && (
              <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full bg-muted">
                {archivedCount}
              </span>
            )}
          </Label>
        </div>
      </div>

      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {TASK_STATUS_COLUMNS.map((status) => (
            <DroppableColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              onTaskClick={onTaskClick}
              isOver={overColumnId === status}
              onAddClick={status === 'backlog' ? onNewTaskClick : undefined}
              onQueueSettings={status === 'queue' ? () => setShowQueueSettings(true) : undefined}
              onArchiveAll={status === 'done' ? handleArchiveAll : undefined}
              onQueueAll={status === 'backlog' ? handleQueueAll : undefined}
            />
          ))}
        </div>

        {/* Drag overlay - enhanced visual feedback */}
        <DragOverlay>
          {activeTask ? (
            <div className="drag-overlay-card">
              <TaskCard task={activeTask} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Queue Settings Modal */}
      <QueueSettingsModal
        open={showQueueSettings}
        onOpenChange={setShowQueueSettings}
        projectId={projectId}
        currentMaxParallel={maxParallelTasks}
        onSave={handleSaveQueueSettings}
      />
    </div>
  );
}
