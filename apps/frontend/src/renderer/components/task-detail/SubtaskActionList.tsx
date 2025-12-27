import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Search,
  FolderSearch,
  Pencil,
  FileCode,
  Terminal,
  Wrench,
  CheckCircle2,
  XCircle,
  Info,
  AlertTriangle,
  Sparkles,
  Layers,
  FileEdit,
  Eye,
  FolderOpen,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { cn } from '../../lib/utils';
import type { ScoredAction } from '../../lib/actionScoring';
import { groupActionsBySubphase, getScoreReason } from '../../lib/actionScoring';

interface SubtaskActionListProps {
  /** Scored actions to display (already filtered to top N) */
  actions: ScoredAction[];
  /** Maximum number of actions to show (for display purposes) */
  maxActions?: number;
  /** Whether to show subphase grouping headers */
  showSubphaseGrouping?: boolean;
  /** Optional callback when "View all logs" is clicked */
  onViewAllLogs?: () => void;
  /** Files that were modified (edited/written) during this subtask */
  modifiedFiles?: string[];
  /** Files that were read (but not modified) during this subtask */
  readFiles?: string[];
}

/**
 * Get tool info including icon, label, and color styling
 * Mirrors the pattern from TaskLogs.tsx
 */
function getToolInfo(toolName: string) {
  switch (toolName?.toLowerCase()) {
    case 'read':
      return { icon: FileText, label: 'Reading', color: 'text-blue-500 bg-blue-500/10' };
    case 'glob':
      return { icon: FolderSearch, label: 'Searching files', color: 'text-amber-500 bg-amber-500/10' };
    case 'grep':
      return { icon: Search, label: 'Searching code', color: 'text-green-500 bg-green-500/10' };
    case 'edit':
      return { icon: Pencil, label: 'Editing', color: 'text-purple-500 bg-purple-500/10' };
    case 'write':
      return { icon: FileCode, label: 'Writing', color: 'text-cyan-500 bg-cyan-500/10' };
    case 'bash':
      return { icon: Terminal, label: 'Running', color: 'text-orange-500 bg-orange-500/10' };
    default:
      return { icon: Wrench, label: toolName || 'Action', color: 'text-muted-foreground bg-muted' };
  }
}

/**
 * Format timestamp into a human-readable time
 */
function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Get entry type styling
 */
function getEntryTypeStyles(type: string): { bgColor: string; textColor: string; borderColor: string; Icon: typeof XCircle | null } {
  switch (type) {
    case 'error':
      return { bgColor: 'bg-destructive/10', textColor: 'text-destructive', borderColor: 'border-destructive/30', Icon: XCircle };
    case 'success':
      return { bgColor: 'bg-success/10', textColor: 'text-success', borderColor: 'border-success/30', Icon: CheckCircle2 };
    case 'info':
      return { bgColor: 'bg-info/10', textColor: 'text-info', borderColor: 'border-info/30', Icon: Info };
    default:
      return { bgColor: 'bg-secondary/30', textColor: 'text-muted-foreground', borderColor: 'border-border/50', Icon: null };
  }
}

/**
 * Individual scored action item
 */
interface ScoredActionItemProps {
  scoredAction: ScoredAction;
  showScore?: boolean;
}

function ScoredActionItem({ scoredAction, showScore = true }: ScoredActionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { action, score, scoreBreakdown } = scoredAction;
  const hasDetail = Boolean(action.detail);
  const entryStyles = getEntryTypeStyles(action.type);

  // Determine if this is a tool action or a regular entry
  const isToolAction = action.type === 'tool_start' || action.type === 'tool_end';
  const toolInfo = action.tool_name ? getToolInfo(action.tool_name) : null;

  // Render tool action
  if (isToolAction && toolInfo) {
    const { icon: ToolIcon, label, color } = toolInfo;
    const isStart = action.type === 'tool_start';

    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <div className={cn(
            'inline-flex items-center gap-2 rounded-md px-2 py-1 text-xs',
            color,
            !isStart && 'opacity-60'
          )}>
            <ToolIcon className={cn('h-3 w-3', isStart && 'animate-pulse')} />
            <span className="font-medium">{label}</span>
            {isStart && action.tool_input && (
              <span className="text-muted-foreground truncate max-w-[300px]" title={action.tool_input}>
                {action.tool_input}
              </span>
            )}
            {!isStart && (
              <CheckCircle2 className="h-3 w-3 text-success" />
            )}
          </div>
          {showScore && score > 0 && (
            <ScoreBadge score={score} scoreBreakdown={scoreBreakdown} />
          )}
          {hasDetail && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded',
                'text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
                isExpanded && 'bg-secondary/50'
              )}
            >
              {isExpanded ? (
                <>
                  <ChevronDown className="h-2.5 w-2.5" />
                  <span>Hide</span>
                </>
              ) : (
                <>
                  <ChevronRight className="h-2.5 w-2.5" />
                  <span>Show</span>
                </>
              )}
            </button>
          )}
        </div>
        {hasDetail && isExpanded && (
          <div className="mt-1.5 ml-4 p-2 bg-secondary/30 rounded-md border border-border/50 overflow-x-auto">
            <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-words font-mono max-h-[200px] overflow-y-auto">
              {action.detail}
            </pre>
          </div>
        )}
      </div>
    );
  }

  // Render typed entry (error, success, info, text)
  const { bgColor, textColor, borderColor, Icon } = entryStyles;

  return (
    <div className="flex flex-col">
      <div className={cn(
        'flex items-start gap-2 text-xs rounded-md px-2 py-1',
        bgColor,
        textColor
      )}>
        {Icon && <Icon className="h-3 w-3 mt-0.5 shrink-0" />}
        <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
          {formatTime(action.timestamp)}
        </span>
        <span className="break-words whitespace-pre-wrap flex-1">{action.content}</span>
        {action.subphase && (
          <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground border-muted-foreground/30">
            {action.subphase}
          </Badge>
        )}
        {showScore && score > 0 && (
          <ScoreBadge score={score} scoreBreakdown={scoreBreakdown} />
        )}
        {hasDetail && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded shrink-0',
              'text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors',
              isExpanded && 'bg-secondary/50'
            )}
          >
            {isExpanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          </button>
        )}
      </div>
      {hasDetail && isExpanded && (
        <div className={cn('mt-1.5 ml-4 p-2 rounded-md border overflow-x-auto', bgColor, borderColor)}>
          <pre className={cn('text-[10px] whitespace-pre-wrap break-words font-mono max-h-[200px] overflow-y-auto', textColor, 'opacity-80')}>
            {action.detail}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * Score badge with tooltip showing breakdown
 */
interface ScoreBadgeProps {
  score: number;
  scoreBreakdown: {
    error: number;
    decision: number;
    fileChange: number;
    timeAnomaly: number;
    novelty: number;
  };
}

function ScoreBadge({ score, scoreBreakdown }: ScoreBadgeProps) {
  const reason = getScoreReason({ score, scoreBreakdown } as ScoredAction);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            'text-[9px] px-1.5 py-0 flex items-center gap-1 cursor-help',
            score >= 40 ? 'border-destructive/50 text-destructive bg-destructive/5' :
            score >= 25 ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' :
            'border-info/50 text-info bg-info/5'
          )}
        >
          <Sparkles className="h-2.5 w-2.5" />
          {score}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="text-xs">
          <p className="font-medium mb-1">Relevance Score: {score}</p>
          <p className="text-muted-foreground">{reason}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Subphase group header
 */
interface SubphaseGroupProps {
  subphase: string;
  actions: ScoredAction[];
  defaultExpanded?: boolean;
}

function SubphaseGroup({ subphase, actions, defaultExpanded = true }: SubphaseGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <button className={cn(
          'w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors',
          'hover:bg-secondary/50 text-xs'
        )}>
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            <Layers className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium text-muted-foreground">{subphase}</span>
          </div>
          <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
            {actions.length}
          </Badge>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 pl-3 border-l border-border/50 mt-1 space-y-1">
          {actions.map((scoredAction, idx) => (
            <ScoredActionItem
              key={`${scoredAction.action.timestamp}-${scoredAction.index}-${idx}`}
              scoredAction={scoredAction}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Get filename from a path
 */
function getFilenameFromPath(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

/**
 * Files Section Component
 * Displays modified and read files in a compact format
 */
interface FilesSectionProps {
  modifiedFiles?: string[];
  readFiles?: string[];
}

function FilesSection({ modifiedFiles = [], readFiles = [] }: FilesSectionProps) {
  const hasFiles = modifiedFiles.length > 0 || readFiles.length > 0;

  if (!hasFiles) {
    return null;
  }

  return (
    <div className="mb-3 p-2 bg-secondary/30 rounded-lg border border-border/50">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
        <FolderOpen className="h-3.5 w-3.5" />
        <span>Files Touched</span>
      </div>
      <div className="space-y-1.5">
        {/* Modified Files */}
        {modifiedFiles.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <FileEdit className="h-3 w-3 text-purple-500" />
              <span>Modified</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {modifiedFiles.map((file) => (
                <Tooltip key={file}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 font-mono bg-purple-500/5 border-purple-500/30 text-purple-600 dark:text-purple-400"
                    >
                      <FileEdit className="h-2.5 w-2.5 mr-1" />
                      {getFilenameFromPath(file)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="font-mono text-xs max-w-md break-all">
                    {file}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
        {/* Read Files */}
        {readFiles.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
              <Eye className="h-3 w-3 text-blue-500" />
              <span>Read</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {readFiles.map((file) => (
                <Tooltip key={file}>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 font-mono bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                    >
                      <Eye className="h-2.5 w-2.5 mr-1" />
                      {getFilenameFromPath(file)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="font-mono text-xs max-w-md break-all">
                    {file}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SubtaskActionList Component
 *
 * Displays the top N most relevant actions for a subtask, grouped by subphase.
 * Uses cognitive science-based scoring to highlight the most important actions.
 */
export function SubtaskActionList({
  actions,
  maxActions = 5,
  showSubphaseGrouping = true,
  onViewAllLogs,
  modifiedFiles,
  readFiles,
}: SubtaskActionListProps) {
  // Limit to maxActions and group by subphase
  const displayActions = useMemo(() => {
    return actions.slice(0, maxActions);
  }, [actions, maxActions]);

  const groupedActions = useMemo(() => {
    if (!showSubphaseGrouping) return null;
    return groupActionsBySubphase(displayActions);
  }, [displayActions, showSubphaseGrouping]);

  // Empty state
  if (actions.length === 0) {
    return (
      <div className="text-center py-4">
        <Info className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">No actions recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Files Section - shows modified and read files */}
      <FilesSection modifiedFiles={modifiedFiles} readFiles={readFiles} />

      {/* Header with action count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Top {displayActions.length} of {actions.length} actions
        </span>
        {onViewAllLogs && (
          <button
            onClick={onViewAllLogs}
            className="text-info hover:text-info/80 hover:underline transition-colors"
          >
            View all logs
          </button>
        )}
      </div>

      {/* Actions list */}
      <div className="space-y-1">
        {showSubphaseGrouping && groupedActions ? (
          // Grouped by subphase
          Array.from(groupedActions.entries()).map(([subphase, subphaseActions]) => (
            <SubphaseGroup
              key={subphase}
              subphase={subphase}
              actions={subphaseActions}
            />
          ))
        ) : (
          // Flat list
          displayActions.map((scoredAction, idx) => (
            <ScoredActionItem
              key={`${scoredAction.action.timestamp}-${scoredAction.index}-${idx}`}
              scoredAction={scoredAction}
            />
          ))
        )}
      </div>

      {/* Show warning if many actions were filtered */}
      {actions.length > 100 && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 px-1 pt-1">
          <AlertTriangle className="h-3 w-3" />
          <span>Showing top {displayActions.length} most relevant from {actions.length} total actions</span>
        </div>
      )}
    </div>
  );
}

export default SubtaskActionList;
