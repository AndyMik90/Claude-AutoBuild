import { X, Sparkles, TerminalSquare, FolderGit, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task, TerminalWorktreeConfig } from '../../../shared/types';
import type { TerminalStatus } from '../../stores/terminal-store';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { STATUS_COLORS } from './types';
import { TerminalTitle } from './TerminalTitle';
import { TaskSelector } from './TaskSelector';
import { WorktreeSelector } from './WorktreeSelector';

interface TerminalHeaderProps {
  terminalId: string;
  title: string;
  status: TerminalStatus;
  isClaudeMode: boolean;
  tasks: Task[];
  associatedTask?: Task;
  onClose: () => void;
  onInvokeClaude: () => void;
  onTitleChange: (newTitle: string) => void;
  onTaskSelect: (taskId: string) => void;
  onClearTask: () => void;
  onNewTaskClick?: () => void;
  terminalCount?: number;
  /** Worktree configuration if terminal is associated with a worktree */
  worktreeConfig?: TerminalWorktreeConfig;
  /** Project path for worktree operations */
  projectPath?: string;
  /** Callback to open worktree creation dialog */
  onCreateWorktree?: () => void;
  /** Callback when an existing worktree is selected */
  onSelectWorktree?: (config: TerminalWorktreeConfig) => void;
  /** Callback to open worktree in IDE */
  onOpenInIDE?: () => void;
}

export function TerminalHeader({
  terminalId,
  title,
  status,
  isClaudeMode,
  tasks,
  associatedTask,
  onClose,
  onInvokeClaude,
  onTitleChange,
  onTaskSelect,
  onClearTask,
  onNewTaskClick,
  terminalCount = 1,
  worktreeConfig,
  projectPath,
  onCreateWorktree,
  onSelectWorktree,
  onOpenInIDE,
}: TerminalHeaderProps) {
  const { t } = useTranslation(['terminal', 'common']);
  const backlogTasks = tasks.filter((t) => t.status === 'backlog');

  return (
    <div className="electron-no-drag flex h-9 items-center justify-between border-b border-border/50 bg-card/30 px-2">
      <div className="flex items-center gap-2">
        <div className={cn('h-2 w-2 rounded-full', STATUS_COLORS[status])} />
        <div className="flex items-center gap-1.5">
          <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
          <TerminalTitle
            title={title}
            associatedTask={associatedTask}
            onTitleChange={onTitleChange}
            terminalCount={terminalCount}
          />
        </div>
        {isClaudeMode && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            <Sparkles className="h-2.5 w-2.5" />
            Claude
          </span>
        )}
        {isClaudeMode && (
          <TaskSelector
            terminalId={terminalId}
            backlogTasks={backlogTasks}
            associatedTask={associatedTask}
            onTaskSelect={onTaskSelect}
            onClearTask={onClearTask}
            onNewTaskClick={onNewTaskClick}
          />
        )}
        {/* Worktree badge when associated */}
        {worktreeConfig && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
            <FolderGit className="h-2.5 w-2.5" />
            {worktreeConfig.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {/* Worktree selector when no worktree and project path available */}
        {!worktreeConfig && projectPath && onCreateWorktree && onSelectWorktree && (
          <WorktreeSelector
            terminalId={terminalId}
            projectPath={projectPath}
            currentWorktree={worktreeConfig}
            onCreateWorktree={onCreateWorktree}
            onSelectWorktree={onSelectWorktree}
          />
        )}
        {/* Open in IDE button when worktree exists */}
        {worktreeConfig && onOpenInIDE && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onOpenInIDE();
            }}
          >
            <ExternalLink className="h-3 w-3" />
            {t('terminal:worktree.openInIDE')}
          </Button>
        )}
        {!isClaudeMode && status !== 'exited' && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
            onClick={(e) => {
              e.stopPropagation();
              onInvokeClaude();
            }}
          >
            <Sparkles className="h-3 w-3" />
            Claude
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-destructive/10 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
