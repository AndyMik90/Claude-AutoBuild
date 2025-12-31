import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewState } from '../contexts/ViewStateContext';
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
import { Plus, Inbox, Loader2, Eye, CheckCircle2, Archive } from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { TaskCard } from './TaskCard';
import { SortableTaskCard } from './SortableTaskCard';
import { TASK_STATUS_COLUMNS, TASK_STATUS_LABELS } from '../../shared/constants';
import { cn } from '../lib/utils';
import { persistTaskStatus, archiveTasks } from '../stores/task-store';
import type { Task, TaskStatus } from '../../shared/types';

/* Apple HIG-inspired Kanban Board component
   Key principles:
   - Card-based columns with subtle elevation
   - Smooth drag interactions with visual feedback
   - Proper spacing (12pt grid system)
   - Clear visual hierarchy with status colors
   - Rounded corners (16-20px) for modern appearance
   - Empty states with friendly, helpful messaging
*/

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
}

// Empty state content for each column
const getEmptyStateContent = (status: TaskStatus, t: (key: string) => string): { icon: React.ReactNode; message: string; subtext?: string } => {
  switch (status) {
    case 'backlog':
      return {
        icon: <Inbox className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />,
        message: t('kanban.emptyBacklog'),
        subtext: t('kanban.emptyBacklogHint')
      };
    case 'in_progress':
      return {
        icon: <Loader2 className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />,
        message: t('kanban.emptyInProgress'),
        subtext: t('kanban.emptyInProgressHint')
      };
    case 'ai_review':
      return {
        icon: <Eye className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />,
        message: t('kanban.emptyAiReview'),
        subtext: t('kanban.emptyAiReviewHint')
      };
    case 'human_review':
      return {
        icon: <Eye className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />,
        message: t('kanban.emptyHumanReview'),
        subtext: t('kanban.emptyHumanReviewHint')
      };
    case 'done':
      return {
        icon: <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />,
        message: t('kanban.emptyDone'),
        subtext: t('kanban.emptyDoneHint')
      };
    default:
      return {
        icon: <Inbox className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.5} />,
        message: t('kanban.emptyDefault')
      };
  }
};

function DroppableColumn({ status, tasks, onTaskClick, isOver, onAddClick, onArchiveAll }: DroppableColumnProps) {
  const { t } = useTranslation('tasks');
  const { setNodeRef } = useDroppable({
    id: status
  });

  const taskIds = tasks.map((t) => t.id);

  const getColumnBorderColor = (): string => {
    switch (status) {
      case 'backlog':
        return 'column-backlog';
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
        /* Apple-style column card */
        'card-surface flex w-80 shrink-0 flex-col rounded-2xl border',
        /* Smooth transitions with Apple easing */
        'transition-all duration-200 ease-out',
        getColumnBorderColor(),
        'border-t-2',
        /* Drop zone feedback */
        isOver && 'drop-zone-highlight scale-[1.02]'
      )}
    >
      {/* Column header - Apple-style */}
      <div className="flex items-center justify-between p-5 border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            {TASK_STATUS_LABELS[status]}
          </h2>
          <span className="column-count-badge">
            {tasks.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {status === 'backlog' && onAddClick && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl hover:bg-primary/10 hover:text-primary transition-all duration-150 ease-out"
              onClick={onAddClick}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </Button>
          )}
          {status === 'done' && onArchiveAll && tasks.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-xl hover:bg-muted-foreground/10 hover:text-muted-foreground transition-all duration-150 ease-out"
              onClick={onArchiveAll}
              title={t('tooltips.archiveAllDone')}
            >
              <Archive className="h-4 w-4" strokeWidth={2.5} />
            </Button>
          )}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 min-h-0">
        <ScrollArea className="h-full px-4 pb-4 pt-3">
          <SortableContext
            items={taskIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2.5 min-h-[120px]">
              {tasks.length === 0 ? (
                <div
                  className={cn(
                    'empty-column-dropzone flex flex-col items-center justify-center py-8 rounded-xl',
                    isOver && 'active'
                  )}
                >
                  {isOver ? (
                    <>
                      <div className="h-10 w-10 rounded-2xl bg-primary/15 flex items-center justify-center mb-3">
                        <Plus className="h-5 w-5 text-primary" strokeWidth={2.5} />
                      </div>
                      <span className="text-sm font-medium text-primary">{t('kanban.dropHere')}</span>
                    </>
                  ) : (
                    <>
                      {emptyState.icon}
                      <span className="mt-3 text-sm font-medium text-muted-foreground/70">
                        {emptyState.message}
                      </span>
                      {emptyState.subtext && (
                        <span className="mt-1 text-xs text-muted-foreground/50">
                          {emptyState.subtext}
                        </span>
                      )}
                    </>
                  )}
                </div>
              ) : (
                tasks.map((task, index) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick(task)}
                    index={index}
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
  const { showArchived } = useViewState();

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

    // Check if dropped on a column
    if (TASK_STATUS_COLUMNS.includes(overId as TaskStatus)) {
      const newStatus = overId as TaskStatus;
      const task = tasks.find((t) => t.id === activeTaskId);

      if (task && task.status !== newStatus) {
        // Persist status change to file and update local state
        persistTaskStatus(activeTaskId, newStatus);
      }
      return;
    }

    // Check if dropped on another task - move to that task's column
    const overTask = tasks.find((t) => t.id === overId);
    if (overTask) {
      const task = tasks.find((t) => t.id === activeTaskId);
      if (task && task.status !== overTask.status) {
        // Persist status change to file and update local state
        persistTaskStatus(activeTaskId, overTask.status);
      }
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Kanban columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-6 overflow-x-auto p-6 max-w-[1280px] mx-auto">
          {TASK_STATUS_COLUMNS.map((status) => (
            <DroppableColumn
              key={status}
              status={status}
              tasks={tasksByStatus[status]}
              onTaskClick={onTaskClick}
              isOver={overColumnId === status}
              onAddClick={status === 'backlog' ? onNewTaskClick : undefined}
              onArchiveAll={status === 'done' ? handleArchiveAll : undefined}
            />
          ))}
        </div>

        {/* Drag overlay - enhanced visual feedback */}
        <DragOverlay>
          {activeTask ? (
            <div className="drag-overlay-card rounded-2xl">
              <TaskCard task={activeTask} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
