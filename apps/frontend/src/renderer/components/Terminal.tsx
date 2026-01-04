import { useEffect, useRef, useCallback, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import '@xterm/xterm/css/xterm.css';
import { FileDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { useTerminalStore } from '../stores/terminal-store';
import { useSettingsStore } from '../stores/settings-store';
import { useToast } from '../hooks/use-toast';
import type { TerminalProps } from './terminal/types';
import type { TerminalWorktreeConfig } from '../../shared/types';
import { TerminalHeader } from './terminal/TerminalHeader';
import { CreateWorktreeDialog } from './terminal/CreateWorktreeDialog';
import { useXterm } from './terminal/useXterm';
import { usePtyProcess } from './terminal/usePtyProcess';
import { useTerminalEvents } from './terminal/useTerminalEvents';
import { useAutoNaming } from './terminal/useAutoNaming';

export function Terminal({
  id,
  cwd,
  projectPath,
  isActive,
  onClose,
  onActivate,
  tasks = [],
  onNewTaskClick,
  terminalCount = 1
}: TerminalProps) {
  const isMountedRef = useRef(true);
  const isCreatedRef = useRef(false);

  // Worktree dialog state
  const [showWorktreeDialog, setShowWorktreeDialog] = useState(false);

  // Terminal store
  const terminal = useTerminalStore((state) => state.terminals.find((t) => t.id === id));
  const setClaudeMode = useTerminalStore((state) => state.setClaudeMode);
  const updateTerminal = useTerminalStore((state) => state.updateTerminal);
  const setAssociatedTask = useTerminalStore((state) => state.setAssociatedTask);
  const setWorktreeConfig = useTerminalStore((state) => state.setWorktreeConfig);

  // Use cwd from store if available (for worktree), otherwise use prop
  const effectiveCwd = terminal?.cwd || cwd;

  // Settings store for IDE preferences
  const { settings } = useSettingsStore();

  // Toast for user feedback
  const { toast } = useToast();

  const associatedTask = terminal?.associatedTaskId
    ? tasks.find((t) => t.id === terminal.associatedTaskId)
    : undefined;

  // Setup drop zone for file drag-and-drop
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `terminal-${id}`,
    data: { type: 'terminal', terminalId: id }
  });

  // Auto-naming functionality
  const { handleCommandEnter, cleanup: cleanupAutoNaming } = useAutoNaming({
    terminalId: id,
    cwd: effectiveCwd,
  });

  // Initialize xterm with command tracking
  const {
    terminalRef,
    xtermRef: _xtermRef,
    write,
    writeln,
    focus,
    dispose,
    cols,
    rows,
  } = useXterm({
    terminalId: id,
    onCommandEnter: handleCommandEnter,
    onResize: (cols, rows) => {
      if (isCreatedRef.current) {
        window.electronAPI.resizeTerminal(id, cols, rows);
      }
    },
  });

  // Create PTY process
  const { prepareForRecreate, resetForRecreate } = usePtyProcess({
    terminalId: id,
    cwd: effectiveCwd,
    projectPath,
    cols,
    rows,
    onCreated: () => {
      isCreatedRef.current = true;
    },
    onError: (error) => {
      writeln(`\r\n\x1b[31mError: ${error}\x1b[0m`);
    },
  });

  // Handle terminal events
  useTerminalEvents({
    terminalId: id,
    onOutput: (data) => {
      write(data);
    },
    onExit: (exitCode) => {
      isCreatedRef.current = false;
      writeln(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`);
    },
  });

  // Focus terminal when it becomes active
  useEffect(() => {
    if (isActive) {
      focus();
    }
  }, [isActive, focus]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      cleanupAutoNaming();

      setTimeout(() => {
        if (!isMountedRef.current) {
          dispose();
          isCreatedRef.current = false;
        }
      }, 100);
    };
  }, [id, dispose, cleanupAutoNaming]);

  const handleInvokeClaude = useCallback(() => {
    setClaudeMode(id, true);
    window.electronAPI.invokeClaudeInTerminal(id, effectiveCwd);
  }, [id, effectiveCwd, setClaudeMode]);

  const handleClick = useCallback(() => {
    onActivate();
    focus();
  }, [onActivate, focus]);

  const handleTitleChange = useCallback((newTitle: string) => {
    updateTerminal(id, { title: newTitle });
  }, [id, updateTerminal]);

  const handleTaskSelect = useCallback((taskId: string) => {
    const selectedTask = tasks.find((t) => t.id === taskId);
    if (!selectedTask) return;

    setAssociatedTask(id, taskId);
    updateTerminal(id, { title: selectedTask.title });

    const contextMessage = `I'm working on: ${selectedTask.title}

Description:
${selectedTask.description}

Please confirm you're ready by saying: I'm ready to work on ${selectedTask.title} - Context is loaded.`;

    window.electronAPI.sendTerminalInput(id, contextMessage + '\r');
  }, [id, tasks, setAssociatedTask, updateTerminal]);

  const handleClearTask = useCallback(() => {
    setAssociatedTask(id, undefined);
    updateTerminal(id, { title: 'Claude' });
  }, [id, setAssociatedTask, updateTerminal]);

  // Worktree handlers
  const handleCreateWorktree = useCallback(() => {
    setShowWorktreeDialog(true);
  }, []);

  const handleWorktreeCreated = useCallback(async (config: TerminalWorktreeConfig) => {
    // IMPORTANT: Set isCreatingRef BEFORE updating the store to prevent race condition
    // This prevents the PTY effect from running before destroyTerminal completes
    prepareForRecreate();

    // Update terminal store with worktree config
    setWorktreeConfig(id, config);

    // Update terminal title and cwd to worktree path
    updateTerminal(id, { title: config.name, cwd: config.worktreePath });

    // Destroy current PTY - a new one will be created in the worktree directory
    if (isCreatedRef.current) {
      await window.electronAPI.destroyTerminal(id);
      isCreatedRef.current = false;
    }

    // Reset refs to allow recreation - effect will now trigger with new cwd
    resetForRecreate();
  }, [id, setWorktreeConfig, updateTerminal, prepareForRecreate, resetForRecreate]);

  const handleSelectWorktree = useCallback(async (config: TerminalWorktreeConfig) => {
    // IMPORTANT: Set isCreatingRef BEFORE updating the store to prevent race condition
    prepareForRecreate();

    // Same logic as handleWorktreeCreated - attach terminal to existing worktree
    setWorktreeConfig(id, config);
    updateTerminal(id, { title: config.name, cwd: config.worktreePath });

    // Destroy current PTY - a new one will be created in the worktree directory
    if (isCreatedRef.current) {
      await window.electronAPI.destroyTerminal(id);
      isCreatedRef.current = false;
    }

    resetForRecreate();
  }, [id, setWorktreeConfig, updateTerminal, prepareForRecreate, resetForRecreate]);

  const handleOpenInIDE = useCallback(async () => {
    const worktreePath = terminal?.worktreeConfig?.worktreePath;
    if (!worktreePath) return;

    const preferredIDE = settings.preferredIDE || 'vscode';
    try {
      await window.electronAPI.worktreeOpenInIDE(
        worktreePath,
        preferredIDE,
        settings.customIDEPath
      );
    } catch (err) {
      console.error('Failed to open in IDE:', err);
      toast({
        title: 'Failed to open IDE',
        description: err instanceof Error ? err.message : 'Could not launch IDE',
        variant: 'destructive',
      });
    }
  }, [terminal?.worktreeConfig?.worktreePath, settings.preferredIDE, settings.customIDEPath, toast]);

  // Get backlog tasks for worktree dialog
  const backlogTasks = tasks.filter((t) => t.status === 'backlog');

  return (
    <div
      ref={setDropRef}
      className={cn(
        'flex h-full flex-col rounded-lg border bg-[#0B0B0F] overflow-hidden transition-all relative',
        isActive ? 'border-primary ring-1 ring-primary/20' : 'border-border',
        isOver && 'ring-2 ring-info border-info'
      )}
      onClick={handleClick}
    >
      {isOver && (
        <div className="absolute inset-0 bg-info/10 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-info/90 text-info-foreground px-3 py-2 rounded-md">
            <FileDown className="h-4 w-4" />
            <span className="text-sm font-medium">Drop to insert path</span>
          </div>
        </div>
      )}

      <TerminalHeader
        terminalId={id}
        title={terminal?.title || 'Terminal'}
        status={terminal?.status || 'idle'}
        isClaudeMode={terminal?.isClaudeMode || false}
        tasks={tasks}
        associatedTask={associatedTask}
        onClose={onClose}
        onInvokeClaude={handleInvokeClaude}
        onTitleChange={handleTitleChange}
        onTaskSelect={handleTaskSelect}
        onClearTask={handleClearTask}
        onNewTaskClick={onNewTaskClick}
        terminalCount={terminalCount}
        worktreeConfig={terminal?.worktreeConfig}
        projectPath={projectPath}
        onCreateWorktree={handleCreateWorktree}
        onSelectWorktree={handleSelectWorktree}
        onOpenInIDE={handleOpenInIDE}
      />

      <div
        ref={terminalRef}
        className="flex-1 p-1"
        style={{ minHeight: 0 }}
      />

      {/* Worktree creation dialog */}
      {projectPath && (
        <CreateWorktreeDialog
          open={showWorktreeDialog}
          onOpenChange={setShowWorktreeDialog}
          terminalId={id}
          projectPath={projectPath}
          backlogTasks={backlogTasks}
          onWorktreeCreated={handleWorktreeCreated}
        />
      )}
    </div>
  );
}
