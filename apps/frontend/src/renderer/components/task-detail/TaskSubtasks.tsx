import { useState, useMemo, useCallback } from 'react';
import { CheckCircle2, Clock, XCircle, AlertCircle, ListChecks, FileCode, ChevronDown, ChevronRight, Sparkles, ArrowUpDown, ArrowDownWideNarrow, ListOrdered } from 'lucide-react';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import { cn, calculateProgress } from '../../lib/utils';
import { filterTopActions, calculateSubtaskRelevanceScores, sortSubtasksByRelevance, getImportantFiles } from '../../lib/actionScoring';
import { SubtaskActionList } from './SubtaskActionList';
import type { Task, TaskLogs, TaskLogEntry } from '../../../shared/types';

/** Sort mode for subtasks */
type SortMode = 'default' | 'relevance';

interface TaskSubtasksProps {
  task: Task;
  /** Phase logs containing actions - used to show top 5 actions per subtask */
  phaseLogs?: TaskLogs | null;
  /** Optional callback when "View all logs" is clicked from a subtask */
  onViewAllLogs?: () => void;
}

function getSubtaskStatusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />;
    case 'in_progress':
      return <Clock className="h-4 w-4 text-[var(--info)] animate-pulse" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-[var(--error)]" />;
    default:
      return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
  }
}

/**
 * Extract all log entries from phase logs into a flat array
 */
function getAllEntriesFromPhaseLogs(phaseLogs: TaskLogs): TaskLogEntry[] {
  const entries: TaskLogEntry[] = [];

  // Collect entries from all phases
  for (const phase of ['planning', 'coding', 'validation'] as const) {
    const phaseLog = phaseLogs.phases[phase];
    if (phaseLog && phaseLog.entries) {
      entries.push(...phaseLog.entries);
    }
  }

  return entries;
}

/**
 * Get action count for a subtask from phase logs
 */
function getSubtaskActionCount(phaseLogs: TaskLogs | null | undefined, subtaskId: string): number {
  if (!phaseLogs) return 0;

  const allEntries = getAllEntriesFromPhaseLogs(phaseLogs);
  return allEntries.filter(entry => entry.subtask_id === subtaskId).length;
}

export function TaskSubtasks({ task, phaseLogs, onViewAllLogs }: TaskSubtasksProps) {
  const progress = calculateProgress(task.subtasks);

  // Track which subtasks are expanded (store by subtask id)
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());

  // Sort mode for subtasks
  const [sortMode, setSortMode] = useState<SortMode>('default');

  // Toggle expansion state for a subtask
  const toggleSubtask = useCallback((subtaskId: string) => {
    setExpandedSubtasks(prev => {
      const next = new Set(prev);
      if (next.has(subtaskId)) {
        next.delete(subtaskId);
      } else {
        next.add(subtaskId);
      }
      return next;
    });
  }, []);

  // Toggle sort mode
  const toggleSortMode = useCallback(() => {
    setSortMode(prev => prev === 'default' ? 'relevance' : 'default');
  }, []);

  // Memoize all entries from phase logs
  const allEntries = useMemo(() => {
    if (!phaseLogs) return [];
    return getAllEntriesFromPhaseLogs(phaseLogs);
  }, [phaseLogs]);

  // Memoize scored actions per subtask (only compute when expanded)
  const getSubtaskActions = useCallback((subtaskId: string) => {
    if (allEntries.length === 0) return [];
    return filterTopActions(allEntries, 5, subtaskId);
  }, [allEntries]);

  // Calculate relevance scores for all subtasks (memoized)
  const relevanceScores = useMemo(() => {
    if (allEntries.length === 0) return new Map();
    const subtaskIds = task.subtasks.map(s => s.id);
    return calculateSubtaskRelevanceScores(allEntries, subtaskIds);
  }, [allEntries, task.subtasks]);

  // Get sorted subtasks based on sort mode
  const sortedSubtasks = useMemo(() => {
    if (sortMode === 'default') {
      return task.subtasks;
    }
    // Sort by relevance
    const subtaskIds = task.subtasks.map(s => s.id);
    const sortedIds = sortSubtasksByRelevance(subtaskIds, relevanceScores);
    // Map sorted IDs back to subtask objects
    return sortedIds.map(id => task.subtasks.find(s => s.id === id)!).filter(Boolean);
  }, [task.subtasks, sortMode, relevanceScores]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        {task.subtasks.length === 0 ? (
          <div className="text-center py-12">
            <ListChecks className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground mb-1">No subtasks defined</p>
            <p className="text-xs text-muted-foreground/70">
              Implementation subtasks will appear here after planning
            </p>
          </div>
        ) : (
          <>
            {/* Progress summary with sort toggle */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pb-2 border-b border-border/50">
              <span>{task.subtasks.filter(c => c.status === 'completed').length} of {task.subtasks.length} completed</span>
              <div className="flex items-center gap-2">
                {/* Sort toggle button */}
                {allEntries.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={toggleSortMode}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded-md transition-colors duration-150',
                          'hover:bg-secondary/80',
                          sortMode === 'relevance'
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground'
                        )}
                        aria-label={sortMode === 'relevance' ? 'Sort by default order' : 'Sort by relevance'}
                      >
                        {sortMode === 'relevance' ? (
                          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
                        ) : (
                          <ListOrdered className="h-3.5 w-3.5" />
                        )}
                        <span className="hidden sm:inline">
                          {sortMode === 'relevance' ? 'Relevance' : 'Order'}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {sortMode === 'relevance'
                          ? 'Sorted by relevance (errors and key actions first)'
                          : 'Click to sort by relevance score'}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <span className="tabular-nums">{progress}%</span>
              </div>
            </div>
            {sortedSubtasks.map((subtask, index) => {
              const isExpanded = expandedSubtasks.has(subtask.id);
              const actionCount = getSubtaskActionCount(phaseLogs, subtask.id);
              const hasActions = actionCount > 0;
              // Only compute scored actions when expanded (memoized via useCallback)
              const scoredActions = isExpanded ? getSubtaskActions(subtask.id) : [];
              // Get files touched during this subtask (only when expanded)
              const importantFiles = isExpanded && hasActions
                ? getImportantFiles(allEntries, subtask.id, 5)
                : { modified: [], read: [] };
              // Get relevance score for this subtask
              const relevanceScore = relevanceScores.get(subtask.id);
              // Original index (1-based) for display
              const originalIndex = task.subtasks.findIndex(s => s.id === subtask.id) + 1;

              return (
                <Collapsible
                  key={subtask.id}
                  open={isExpanded}
                  onOpenChange={() => toggleSubtask(subtask.id)}
                >
                  <div
                    className={cn(
                      'rounded-xl border border-border bg-secondary/30 transition-all duration-200',
                      subtask.status === 'in_progress' && 'border-[var(--info)]/50 bg-[var(--info-light)] ring-1 ring-info/20',
                      subtask.status === 'completed' && 'border-[var(--success)]/50 bg-[var(--success-light)]',
                      subtask.status === 'failed' && 'border-[var(--error)]/50 bg-[var(--error-light)]'
                    )}
                  >
                    {/* Subtask Header - always visible */}
                    <div className="p-3">
                      <div className="flex items-start gap-2">
                        {getSubtaskStatusIcon(subtask.status)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                              subtask.status === 'completed' ? 'bg-success/20 text-success' :
                              subtask.status === 'in_progress' ? 'bg-info/20 text-info' :
                              subtask.status === 'failed' ? 'bg-destructive/20 text-destructive' :
                              'bg-muted text-muted-foreground'
                            )}>
                              #{originalIndex}
                            </span>
                            {/* Show relevance score when sorting by relevance */}
                            {sortMode === 'relevance' && relevanceScore && relevanceScore.totalScore > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className={cn(
                                    'text-[10px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5',
                                    relevanceScore.hasErrors
                                      ? 'bg-destructive/20 text-destructive'
                                      : relevanceScore.hasDecisions
                                        ? 'bg-primary/20 text-primary'
                                        : 'bg-muted text-muted-foreground'
                                  )}>
                                    <Sparkles className="h-2.5 w-2.5" />
                                    {Math.round(relevanceScore.totalScore)}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <div className="text-xs space-y-1">
                                    <p className="font-medium">Relevance Score: {Math.round(relevanceScore.totalScore)}</p>
                                    <p className="text-muted-foreground">
                                      {relevanceScore.actionCount} actions •
                                      Avg: {Math.round(relevanceScore.averageScore)} •
                                      Top: {Math.round(relevanceScore.topScore)}
                                    </p>
                                    {relevanceScore.hasErrors && (
                                      <p className="text-destructive">Contains errors</p>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm font-medium text-foreground truncate cursor-default">
                                  {subtask.id}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="font-mono text-xs">{subtask.id}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2 cursor-default">
                                {subtask.description}
                              </p>
                            </TooltipTrigger>
                            {subtask.description && subtask.description.length > 80 && (
                              <TooltipContent side="bottom" className="max-w-sm">
                                <p className="text-xs">{subtask.description}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                          {subtask.files && subtask.files.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {subtask.files.map((file) => (
                                <Tooltip key={file}>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="secondary"
                                      className="text-xs font-mono cursor-help"
                                    >
                                      <FileCode className="mr-1 h-3 w-3" />
                                      {file.split('/').pop()}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="font-mono text-xs">
                                    {file}
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Expand/Collapse trigger - only show when there are actions */}
                        {hasActions && (
                          <CollapsibleTrigger asChild>
                            <button
                              className={cn(
                                'shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
                                'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
                                'transition-colors duration-150',
                                isExpanded && 'bg-secondary/60'
                              )}
                            >
                              <Sparkles className="h-3 w-3" />
                              <span className="tabular-nums">{actionCount}</span>
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </CollapsibleTrigger>
                        )}
                      </div>
                    </div>

                    {/* Expandable Action Section */}
                    <CollapsibleContent>
                      <div className="px-3 pb-3">
                        <div className="pt-2 border-t border-border/50">
                          <SubtaskActionList
                            actions={scoredActions}
                            maxActions={5}
                            showSubphaseGrouping={true}
                            onViewAllLogs={onViewAllLogs}
                            modifiedFiles={importantFiles.modified}
                            readFiles={importantFiles.read}
                          />
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </>
        )}
      </div>
    </ScrollArea>
  );
}
