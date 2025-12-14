import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { useDroppable } from '@dnd-kit/core';
import '@xterm/xterm/css/xterm.css';
import { X, Sparkles, TerminalSquare, ListTodo, FileDown, ChevronDown, Circle, Loader2, CheckCircle2, AlertCircle, Clock, Code2, Search, Wrench, Pencil } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useTerminalStore, type TerminalStatus } from '../stores/terminal-store';
import type { Task, ExecutionPhase } from '../../shared/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

interface TerminalProps {
  id: string;
  cwd?: string;
  projectPath?: string;  // For session persistence
  isActive: boolean;
  onClose: () => void;
  onActivate: () => void;
  tasks?: Task[];  // Tasks for task selection dropdown
}

const STATUS_COLORS: Record<TerminalStatus, string> = {
  idle: 'bg-warning',
  running: 'bg-success',
  'claude-active': 'bg-primary',
  exited: 'bg-destructive',
};

// Execution phase display configuration
const PHASE_CONFIG: Record<ExecutionPhase, { label: string; color: string; icon: React.ElementType }> = {
  idle: { label: 'Ready', color: 'bg-muted text-muted-foreground', icon: Circle },
  planning: { label: 'Planning', color: 'bg-info/20 text-info', icon: Search },
  coding: { label: 'Coding', color: 'bg-primary/20 text-primary', icon: Code2 },
  qa_review: { label: 'QA Review', color: 'bg-warning/20 text-warning', icon: Search },
  qa_fixing: { label: 'Fixing', color: 'bg-warning/20 text-warning', icon: Wrench },
  complete: { label: 'Complete', color: 'bg-success/20 text-success', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-destructive/20 text-destructive', icon: AlertCircle },
};

export function Terminal({ id, cwd, projectPath, isActive, onClose, onActivate, tasks = [] }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isCreatingRef = useRef(false);
  const isCreatedRef = useRef(false);
  const isMountedRef = useRef(true);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  const terminal = useTerminalStore((state) => state.terminals.find((t) => t.id === id));
  const setTerminalStatus = useTerminalStore((state) => state.setTerminalStatus);
  const setClaudeMode = useTerminalStore((state) => state.setClaudeMode);
  const updateTerminal = useTerminalStore((state) => state.updateTerminal);
  const setAssociatedTask = useTerminalStore((state) => state.setAssociatedTask);

  // Filter tasks to only show backlog (Planning) status tasks for dropdown
  const backlogTasks = tasks.filter((t) => t.status === 'backlog');

  // Find the currently associated task for tooltip
  const associatedTask = terminal?.associatedTaskId
    ? tasks.find((t) => t.id === terminal.associatedTaskId)
    : undefined;

  // Setup drop zone for file drag-and-drop
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `terminal-${id}`,
    data: { type: 'terminal', terminalId: id }
  });

  // Initialize xterm.js UI (separate from PTY creation)
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const xterm = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'var(--font-mono), "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
      lineHeight: 1.2,
      letterSpacing: 0,
      theme: {
        background: '#0B0B0F',
        foreground: '#E8E6E3',
        cursor: '#D6D876',
        cursorAccent: '#0B0B0F',
        selectionBackground: '#D6D87640',
        selectionForeground: '#E8E6E3',
        black: '#1A1A1F',
        red: '#FF6B6B',
        green: '#87D687',
        yellow: '#D6D876',
        blue: '#6BB3FF',
        magenta: '#C792EA',
        cyan: '#89DDFF',
        white: '#E8E6E3',
        brightBlack: '#4A4A50',
        brightRed: '#FF8A8A',
        brightGreen: '#A5E6A5',
        brightYellow: '#E8E87A',
        brightBlue: '#8AC4FF',
        brightMagenta: '#DEB3FF',
        brightCyan: '#A6E8FF',
        brightWhite: '#FFFFFF',
      },
      allowProposedApi: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);

    xterm.open(terminalRef.current);

    // Delay fit to ensure container is properly sized
    setTimeout(() => {
      fitAddon.fit();
    }, 50);

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Replay buffered output if this is a remount (output exists in store)
    // Skip replay for ALL Claude sessions - Claude's TUI uses escape sequences for
    // cursor positioning that don't work correctly when replayed. This prevents
    // visual artifacts like phantom input lines with blinking cursors.
    // Then clear the buffer to prevent duplicate content on subsequent remounts
    const terminalState = useTerminalStore.getState().terminals.find((t) => t.id === id);
    if (terminalState?.outputBuffer && !terminalState.isClaudeMode) {
      xterm.write(terminalState.outputBuffer);
      // Clear buffer after replay - new output will accumulate fresh
      // This prevents duplicates when combined with full-screen redraws from TUI apps
      useTerminalStore.getState().clearOutputBuffer(id);
    } else if (terminalState?.isClaudeMode) {
      // For all Claude sessions, clear the buffer without replay
      // Claude's TUI will redraw itself correctly
      useTerminalStore.getState().clearOutputBuffer(id);
    }

    // Handle terminal input - send to main process
    xterm.onData((data) => {
      window.electronAPI.sendTerminalInput(id, data);
    });

    // Handle resize
    xterm.onResize(({ cols, rows }) => {
      if (isCreatedRef.current) {
        window.electronAPI.resizeTerminal(id, cols, rows);
      }
    });

    return () => {
      // Only dispose xterm on actual unmount, not StrictMode re-render
      // The PTY cleanup is handled separately
    };
  }, [id]);

  // Create PTY process in main - with protection against double creation
  // Handles both new terminals and restored sessions
  useEffect(() => {
    if (!xtermRef.current || isCreatingRef.current || isCreatedRef.current) return;

    // Check if terminal is already running (persisted across navigation)
    const terminalState = useTerminalStore.getState().terminals.find((t) => t.id === id);
    const alreadyRunning = terminalState?.status === 'running' || terminalState?.status === 'claude-active';
    const isRestored = terminalState?.isRestored;

    isCreatingRef.current = true;

    const xterm = xtermRef.current;
    const cols = xterm.cols;
    const rows = xterm.rows;

    if (isRestored && terminalState) {
      // Restored session - use restore API to potentially resume Claude
      window.electronAPI.restoreTerminalSession(
        {
          id: terminalState.id,
          title: terminalState.title,
          cwd: terminalState.cwd,
          projectPath: projectPath || '',
          isClaudeMode: terminalState.isClaudeMode,
          claudeSessionId: terminalState.claudeSessionId,
          outputBuffer: '', // Don't send buffer back, we already have it
          createdAt: terminalState.createdAt.toISOString(),
          lastActiveAt: new Date().toISOString()
        },
        cols,
        rows
      ).then((result) => {
        if (result.success && result.data?.success) {
          isCreatedRef.current = true;
          setTerminalStatus(id, terminalState.isClaudeMode ? 'claude-active' : 'running');
          // Clear the isRestored flag now that it's actually restored
          updateTerminal(id, { isRestored: false });
        } else {
          xterm.writeln(`\r\n\x1b[31mError restoring session: ${result.data?.error || result.error}\x1b[0m`);
        }
        isCreatingRef.current = false;
      }).catch((err) => {
        xterm.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
        isCreatingRef.current = false;
      });
    } else {
      // New terminal - use create API
      window.electronAPI.createTerminal({
        id,
        cwd,
        cols,
        rows,
        projectPath,
      }).then((result) => {
        if (result.success) {
          isCreatedRef.current = true;
          // Only set to running if it wasn't already running (avoid overwriting claude-active)
          if (!alreadyRunning) {
            setTerminalStatus(id, 'running');
          }
        } else {
          xterm.writeln(`\r\n\x1b[31mError: ${result.error}\x1b[0m`);
        }
        isCreatingRef.current = false;
      }).catch((err) => {
        xterm.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
        isCreatingRef.current = false;
      });
    }

    // Note: cleanup is handled in the dedicated cleanup effect below
    // to avoid race conditions with StrictMode
  }, [id, cwd, projectPath, setTerminalStatus, updateTerminal]);

  // Handle terminal output from main process
  // Note: We intentionally exclude appendOutput from deps - store actions are stable
  // and including them can cause listener accumulation during rapid state updates
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalOutput((terminalId, data) => {
      if (terminalId === id) {
        // Store output in buffer for replay on remount
        // Use getState() to avoid stale closure issues
        useTerminalStore.getState().appendOutput(id, data);
        // Write to xterm if available
        if (xtermRef.current) {
          xtermRef.current.write(data);
        }
      }
    });

    return cleanup;
  }, [id]);

  // Handle terminal exit
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalExit((terminalId, exitCode) => {
      if (terminalId === id) {
        isCreatedRef.current = false;
        useTerminalStore.getState().setTerminalStatus(id, 'exited');
        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`);
        }
      }
    });

    return cleanup;
  }, [id]);

  // Handle terminal title change
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalTitleChange((terminalId, title) => {
      if (terminalId === id) {
        useTerminalStore.getState().updateTerminal(id, { title });
      }
    });

    return cleanup;
  }, [id]);

  // Handle Claude session ID capture
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalClaudeSession((terminalId, sessionId) => {
      if (terminalId === id) {
        useTerminalStore.getState().setClaudeSessionId(id, sessionId);
        console.log('[Terminal] Captured Claude session ID:', sessionId);
      }
    });

    return cleanup;
  }, [id]);

  // Handle resize on container resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
      }
    };

    // Use ResizeObserver for the terminal container
    const container = terminalRef.current?.parentElement;
    if (container) {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      return () => resizeObserver.disconnect();
    }
  }, []);

  // Focus terminal when it becomes active
  useEffect(() => {
    if (isActive && xtermRef.current) {
      xtermRef.current.focus();
    }
  }, [isActive]);

  // Cleanup xterm UI on unmount - PTY persists in main process
  // PTY is only destroyed via onClose callback (explicit close)
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Delay cleanup to skip StrictMode's immediate remount
      setTimeout(() => {
        if (!isMountedRef.current) {
          // Only dispose the xterm UI, NOT the PTY process
          // PTY destruction happens only via explicit close (onClose prop)
          if (xtermRef.current) {
            xtermRef.current.dispose();
            xtermRef.current = null;
          }
          // Reset creation refs so we can reconnect on remount
          isCreatingRef.current = false;
          isCreatedRef.current = false;
        }
      }, 100);
    };
  }, [id]);

  const handleInvokeClaude = useCallback(() => {
    setClaudeMode(id, true);
    window.electronAPI.invokeClaudeInTerminal(id, cwd);
  }, [id, cwd, setClaudeMode]);

  const handleClick = useCallback(() => {
    onActivate();
    if (xtermRef.current) {
      xtermRef.current.focus();
    }
  }, [onActivate]);

  // Handle task selection from dropdown
  /* eslint-disable react-hooks/preserve-manual-memoization -- Complex callback with mutable tasks array */
  const handleTaskSelect = useCallback((taskId: string) => {
    const selectedTask = tasks.find((t) => t.id === taskId);
    if (!selectedTask) return;

    // Update terminal with task association and title
    setAssociatedTask(id, taskId);
    updateTerminal(id, { title: selectedTask.title });

    // Format and send context message to Claude
    const contextMessage = `I'm working on: ${selectedTask.title}

Description:
${selectedTask.description}

Please confirm you're ready by saying: I'm ready to work on ${selectedTask.title} - Context is loaded.`;

    // Send the context message to the terminal
    window.electronAPI.sendTerminalInput(id, contextMessage + '\r');
  }, [id, tasks, setAssociatedTask, updateTerminal]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  // Handle clearing the associated task
  const handleClearTask = useCallback(() => {
    setAssociatedTask(id, undefined);
    updateTerminal(id, { title: 'Claude' });
  }, [id, setAssociatedTask, updateTerminal]);

  // Get execution phase from associated task
  const executionPhase = associatedTask?.executionProgress?.phase || 'idle';
  const phaseConfig = PHASE_CONFIG[executionPhase];
  const PhaseIcon = phaseConfig.icon;

  // Title editing handlers
  const handleStartEditTitle = useCallback(() => {
    setEditedTitle(terminal?.title || 'Terminal');
    setIsEditingTitle(true);
    // Focus the input after state update
    setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  }, [terminal?.title]);

  const handleSaveTitle = useCallback(() => {
    const trimmedTitle = editedTitle.trim();
    if (trimmedTitle && trimmedTitle !== terminal?.title) {
      updateTerminal(id, { title: trimmedTitle });
    }
    setIsEditingTitle(false);
  }, [editedTitle, terminal?.title, updateTerminal, id]);

  const handleCancelEditTitle = useCallback(() => {
    setIsEditingTitle(false);
    setEditedTitle('');
  }, []);

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditTitle();
    }
  }, [handleSaveTitle, handleCancelEditTitle]);

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
      {/* Drop zone overlay indicator */}
      {isOver && (
        <div className="absolute inset-0 bg-info/10 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 bg-info/90 text-info-foreground px-3 py-2 rounded-md">
            <FileDown className="h-4 w-4" />
            <span className="text-sm font-medium">Drop to insert path</span>
          </div>
        </div>
      )}
      {/* Terminal header */}
      <div className="electron-no-drag flex h-9 items-center justify-between border-b border-border/50 bg-card/30 px-2">
        <div className="flex items-center gap-2">
          <div className={cn('h-2 w-2 rounded-full', STATUS_COLORS[terminal?.status || 'idle'])} />
          <div className="flex items-center gap-1.5">
            <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
            {/* Terminal title - editable on double-click */}
            {isEditingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onKeyDown={handleTitleKeyDown}
                onBlur={handleSaveTitle}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-medium text-foreground bg-transparent border border-primary/50 rounded px-1 py-0.5 outline-none focus:border-primary max-w-32"
                style={{ width: `${Math.max(editedTitle.length * 6 + 16, 60)}px` }}
              />
            ) : associatedTask ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-xs font-medium text-foreground truncate max-w-32 cursor-text hover:text-primary/80 transition-colors"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleStartEditTitle();
                      }}
                    >
                      {terminal?.title || 'Terminal'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">{associatedTask.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Double-click to rename</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="text-xs font-medium text-foreground truncate max-w-32 cursor-text hover:text-primary/80 transition-colors"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleStartEditTitle();
                      }}
                    >
                      {terminal?.title || 'Terminal'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="text-xs">Double-click to rename</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          {terminal?.isClaudeMode && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              <Sparkles className="h-2.5 w-2.5" />
              Claude
            </span>
          )}
          {/* Task selection/status - only show when Claude is active */}
          {terminal?.isClaudeMode && (
            <>
              {/* Show status pill when task is selected */}
              {associatedTask ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        'flex items-center gap-1.5 h-6 px-2 rounded text-[10px] font-medium transition-colors',
                        phaseConfig.color,
                        'hover:opacity-80 cursor-pointer'
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {executionPhase === 'planning' || executionPhase === 'coding' || executionPhase === 'qa_review' || executionPhase === 'qa_fixing' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <PhaseIcon className="h-3 w-3" />
                      )}
                      <span>{phaseConfig.label}</span>
                      <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Current task
                    </div>
                    <div className="px-2 py-1 text-sm font-medium truncate">
                      {associatedTask.title}
                    </div>
                    {associatedTask.executionProgress?.message && (
                      <div className="px-2 py-1 text-xs text-muted-foreground truncate">
                        {associatedTask.executionProgress.message}
                      </div>
                    )}
                    <DropdownMenuSeparator />
                    {backlogTasks.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">
                          Switch to...
                        </div>
                        {backlogTasks.filter(t => t.id !== associatedTask.id).slice(0, 5).map((task) => (
                          <DropdownMenuItem
                            key={task.id}
                            onClick={() => handleTaskSelect(task.id)}
                            className="text-xs"
                          >
                            <ListTodo className="h-3 w-3 mr-2 text-muted-foreground" />
                            <span className="truncate">{task.title}</span>
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={handleClearTask}
                      className="text-xs text-muted-foreground"
                    >
                      <X className="h-3 w-3 mr-2" />
                      Clear task
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                /* Show task selector when no task is selected */
                backlogTasks.length > 0 && (
                  <Select
                    value=""
                    onValueChange={handleTaskSelect}
                  >
                    <SelectTrigger
                      className="h-6 w-auto min-w-[120px] max-w-[160px] text-[10px] px-2 py-0 border-border/50 bg-card/50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ListTodo className="h-3 w-3 mr-1 text-muted-foreground" />
                      <SelectValue placeholder="Select task..." />
                    </SelectTrigger>
                    <SelectContent>
                      {backlogTasks.map((task) => (
                        <SelectItem key={task.id} value={task.id} className="text-xs">
                          <span className="truncate max-w-[200px]">{task.title}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!terminal?.isClaudeMode && terminal?.status !== 'exited' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1 hover:bg-primary/10 hover:text-primary"
              onClick={(e) => {
                e.stopPropagation();
                handleInvokeClaude();
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

      {/* Terminal content */}
      <div
        ref={terminalRef}
        className="flex-1 p-1"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
