import { useState, useEffect, useMemo, useRef } from 'react';
import { Terminal, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTaskStore } from '../stores/task-store';
import { useProjectStore } from '../stores/project-store';

const CYCLE_INTERVAL = 3000; // Cycle through tasks every 3 seconds
const MAX_LOG_LENGTH = 200; // Truncate long log lines

function cleanLogContent(content: string): string {
  return content
    .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes
    .replace(/__TASK_LOG[^:]*:[^\n]*/g, '') // Remove task log markers
    .replace(/\n/g, ' ') // Replace newlines with spaces
    .trim()
    .substring(0, MAX_LOG_LENGTH);
}

export function TaskLogStatusBar() {
  const tasks = useTaskStore((state) => state.tasks);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const projectId = activeProjectId || selectedProjectId;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [streamingLogs, setStreamingLogs] = useState<Map<string, string>>(new Map());
  const lastLogRef = useRef<string>('');

  // Memoize running tasks to prevent infinite re-renders
  const runningTasks = useMemo(
    () => tasks.filter((t) => t.status === 'in_progress'),
    [tasks]
  );

  // Subscribe to streaming logs for all running tasks
  useEffect(() => {
    if (runningTasks.length === 0) return;

    // Listen for streaming log chunks
    const cleanup = window.electronAPI.onTaskLogsStream((specId, chunk) => {
      // Extract content from the chunk object
      const content = chunk.content || '';

      const cleaned = cleanLogContent(content);
      if (cleaned && cleaned.length > 5 && cleaned !== lastLogRef.current) {
        lastLogRef.current = cleaned;
        setStreamingLogs((prev) => {
          const next = new Map(prev);
          next.set(specId, cleaned);
          return next;
        });
      }
    });

    // Start watching logs for each running task
    const watchCleanups: (() => void)[] = [];
    for (const task of runningTasks) {
      if (projectId && task.specId) {
        window.electronAPI.watchTaskLogs(projectId, task.specId).catch(() => {
          // Ignore errors - task may have finished
        });
        watchCleanups.push(() => {
          window.electronAPI.unwatchTaskLogs(task.specId!).catch(() => {});
        });
      }
    }

    return () => {
      cleanup();
      watchCleanups.forEach((fn) => fn());
    };
  }, [runningTasks, projectId]);

  // Reset index when running tasks change
  useEffect(() => {
    if (currentIndex >= runningTasks.length) {
      setCurrentIndex(0);
    }
  }, [runningTasks.length, currentIndex]);

  // Cycle through tasks
  useEffect(() => {
    if (runningTasks.length <= 1) {
      return;
    }

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % runningTasks.length);
    }, CYCLE_INTERVAL);

    return () => clearInterval(interval);
  }, [runningTasks.length]);

  // No running tasks - show idle state
  if (runningTasks.length === 0) {
    return (
      <div className="h-9 bg-muted/50 border-t border-border flex items-center px-3 gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground/50" />
        <span className="text-xs text-muted-foreground/50 font-mono">
          No active tasks
        </span>
      </div>
    );
  }

  // Get current task to display
  const currentTask = runningTasks[currentIndex % runningTasks.length];

  // Get log content: streaming > executionProgress > fallback
  const streamingLog = streamingLogs.get(currentTask.specId || '');
  const progressMessage = currentTask.executionProgress?.message || currentTask.executionProgress?.currentSubtask;
  const logContent = streamingLog || (progressMessage ? cleanLogContent(progressMessage) : 'Processing...');

  return (
    <div className="h-9 bg-muted/50 border-t border-border flex items-center px-3 gap-2 overflow-hidden">
      {/* Activity indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Loader2 className="h-4 w-4 text-primary animate-spin" />
        {runningTasks.length > 1 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {currentIndex + 1}/{runningTasks.length}
          </span>
        )}
      </div>

      {/* Task identifier */}
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
          {currentTask.specId || currentTask.id.substring(0, 3)}
        </span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
      </div>

      {/* Log content */}
      <div className="flex-1 overflow-hidden">
        <p
          className={cn(
            "text-xs font-mono text-muted-foreground truncate",
            "animate-in fade-in slide-in-from-right-2 duration-300"
          )}
          key={`${currentTask.id}-${logContent.substring(0, 30)}`}
        >
          {logContent}
        </p>
      </div>

      {/* Task title */}
      <div
        className="shrink-0 max-w-[150px] truncate"
        title={currentTask.title}
      >
        <span className="text-[10px] text-muted-foreground/60">
          {currentTask.title}
        </span>
      </div>
    </div>
  );
}
