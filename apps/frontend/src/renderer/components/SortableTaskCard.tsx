import { memo, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskCard } from './TaskCard';
import { cn } from '../lib/utils';
import type { Task, TaskStatus } from '../../shared/types';

interface SortableTaskCardProps {
  task: Task;
  onClick: () => void;
  onStatusChange?: (newStatus: TaskStatus) => unknown;
}

// Custom comparator - only re-render when task or onClick actually changed
function sortableTaskCardPropsAreEqual(
  prevProps: SortableTaskCardProps,
  nextProps: SortableTaskCardProps
): boolean {
  // TaskCard has its own memo, so we just need to check reference equality
  // for the task object and onClick handler
  return (
    prevProps.task === nextProps.task &&
    prevProps.onClick === nextProps.onClick &&
    prevProps.onStatusChange === nextProps.onStatusChange
  );
}

export const SortableTaskCard = memo(function SortableTaskCard({ task, onClick, onStatusChange }: SortableTaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Prevent z-index stacking issues during drag
    zIndex: isDragging ? 50 : undefined
  };

  // Memoize onClick to prevent unnecessary TaskCard re-renders
  const handleClick = useCallback(() => {
    onClick();
  }, [onClick]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'touch-none transition-all duration-200',
        isDragging && 'dragging-placeholder opacity-40 scale-[0.98]',
        isOver && !isDragging && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background rounded-xl'
      )}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onClick={handleClick} onStatusChange={onStatusChange} />
    </div>
  );
}, sortableTaskCardPropsAreEqual);
