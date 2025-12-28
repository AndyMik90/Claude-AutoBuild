import { useState, useMemo, useEffect } from 'react';
import { Search, AlertCircle, Check, X, GitMerge } from 'lucide-react';
import { Input } from './ui/input';
import { Checkbox } from './ui/checkbox';
import { Badge } from './ui/badge';
import { cn } from '../lib/utils';
import { useTaskStore } from '../stores/task-store';
import { validateDependencies, getDependencySummary } from '../utils/dependency-validator';
import type { Task } from '../../shared/types/task';

interface TaskDependencySelectorProps {
  projectId: string;
  selectedDependencies: string[];
  onDependenciesChange: (dependencies: string[]) => void;
  onError: (error: string | null) => void;
  disabled?: boolean;
  currentTaskId?: string;  // When editing, exclude current task
}

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  queue: 'Queue',
  in_progress: 'In Progress',
  ai_review: 'AI Review',
  human_review: 'Human Review',
  done: 'Done',
};

const STATUS_COLORS: Record<string, string> = {
  backlog: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  queue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  in_progress: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  ai_review: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  human_review: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  done: 'bg-green-500/10 text-green-600 dark:text-green-400',
};

export function TaskDependencySelector({
  projectId,
  selectedDependencies,
  onDependenciesChange,
  onError,
  disabled = false,
  currentTaskId,
}: TaskDependencySelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const tasks = useTaskStore(state => state.tasks);

  // Filter tasks for this project, excluding current task
  const availableTasks = useMemo(() => {
    return tasks.filter(task => {
      if (task.projectId !== projectId) return false;
      if (currentTaskId && (task.id === currentTaskId || task.specId === currentTaskId)) return false;
      return true;
    });
  }, [tasks, projectId, currentTaskId]);

  // Filter tasks by search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return availableTasks;

    const query = searchQuery.toLowerCase();
    return availableTasks.filter(task => {
      const title = (task.title || '').toLowerCase();
      const specId = (task.specId || '').toLowerCase();
      const description = (task.description || '').toLowerCase();
      return title.includes(query) || specId.includes(query) || description.includes(query);
    });
  }, [availableTasks, searchQuery]);

  // Sort tasks: selected first, then by creation date
  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      const aSelected = selectedDependencies.includes(a.id) || selectedDependencies.includes(a.specId);
      const bSelected = selectedDependencies.includes(b.id) || selectedDependencies.includes(b.specId);

      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [filteredTasks, selectedDependencies]);

  // Validate dependencies whenever selection changes
  useEffect(() => {
    if (!currentTaskId || selectedDependencies.length === 0) {
      onError(null);
      return;
    }

    const validation = validateDependencies(
      currentTaskId,
      selectedDependencies,
      availableTasks
    );

    if (!validation.valid) {
      onError(validation.error || 'Invalid dependencies');
    } else {
      onError(null);
    }
  }, [selectedDependencies, currentTaskId, availableTasks, onError]);

  const handleToggle = (task: Task) => {
    if (disabled) return;

    const taskIdentifier = task.id || task.specId;
    const isSelected = selectedDependencies.includes(taskIdentifier);

    let newDependencies: string[];
    if (isSelected) {
      newDependencies = selectedDependencies.filter(id => id !== taskIdentifier);
    } else {
      newDependencies = [...selectedDependencies, taskIdentifier];
    }

    onDependenciesChange(newDependencies);
  };

  const handleClearAll = () => {
    if (disabled) return;
    onDependenciesChange([]);
  };

  if (availableTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-sm text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
        <p>No other tasks available in this project.</p>
        <p className="text-xs mt-1">Create more tasks to add dependencies.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          disabled={disabled}
          className="pl-9 h-9"
        />
      </div>

      {/* Selected Count and Clear */}
      {selectedDependencies.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {selectedDependencies.length} {selectedDependencies.length === 1 ? 'dependency' : 'dependencies'} selected
          </span>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={disabled}
            className="text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Task List */}
      <div className="max-h-[300px] overflow-y-auto border rounded-md">
        {sortedTasks.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No tasks match your search.
          </div>
        ) : (
          <div className="divide-y">
            {sortedTasks.map((task) => {
              const taskIdentifier = task.id || task.specId;
              const isSelected = selectedDependencies.includes(taskIdentifier);
              const isMerged = task.stagedInMainProject === true;

              return (
                <div
                  key={taskIdentifier}
                  className={cn(
                    'flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer',
                    disabled && 'opacity-50 cursor-not-allowed'
                  )}
                  onClick={() => handleToggle(task)}
                >
                  {/* Checkbox */}
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => handleToggle(task)}
                    disabled={disabled}
                    className="mt-0.5"
                  />

                  {/* Task Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                      <span className="font-medium text-sm truncate flex-1">
                        {task.title || task.specId}
                      </span>
                      {isMerged && (
                        <GitMerge className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                      )}
                    </div>

                    {/* Description */}
                    {task.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                        {task.description}
                      </p>
                    )}

                    {/* Status and Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs px-1.5 py-0',
                          STATUS_COLORS[task.status] || 'bg-gray-500/10 text-gray-600'
                        )}
                      >
                        {STATUS_LABELS[task.status] || task.status}
                      </Badge>

                      {!isMerged && task.status === 'done' && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 bg-orange-500/10 text-orange-600 dark:text-orange-400">
                          Not merged
                        </Badge>
                      )}

                      {!isMerged && task.status !== 'done' && (
                        <Badge variant="outline" className="text-xs px-1.5 py-0 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                          In progress
                        </Badge>
                      )}

                      {task.specId && (
                        <span className="text-xs text-muted-foreground">
                          {task.specId}
                        </span>
                      )}
                    </div>

                    {/* Warning for unmerged dependencies */}
                    {isSelected && !isMerged && (
                      <div className="flex items-start gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>This task is not merged yet. Dependent task will wait.</span>
                      </div>
                    )}
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md p-2.5">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div>
          <p className="mb-1">
            Select tasks that must be <strong>completed and merged</strong> before this task can start from the queue.
          </p>
          <p>
            Tasks with a <GitMerge className="inline h-3 w-3 text-green-600 dark:text-green-400" /> icon are already merged.
          </p>
        </div>
      </div>
    </div>
  );
}
