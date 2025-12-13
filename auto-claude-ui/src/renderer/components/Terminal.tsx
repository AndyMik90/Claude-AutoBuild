import { useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { X, Sparkles, TerminalSquare, ListTodo } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useTerminalStore, type TerminalStatus } from '../stores/terminal-store';
import type { Task } from '../../shared/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
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

export function Terminal({ id, cwd, projectPath, isActive, onClose, onActivate, tasks = [] }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isCreatingRef = useRef(false);
  const isCreatedRef = useRef(false);
  const isMountedRef = useRef(true);

  const terminal = useTerminalStore((state) => state.terminals.find((t) => t.id === id));
  const setTerminalStatus = useTerminalStore((state) => state.setTerminalStatus);
  const setClaudeMode = useTerminalStore((state) => state.setClaudeMode);
  const setClaudeSessionId = useTerminalStore((state) => state.setClaudeSessionId);
  const updateTerminal = useTerminalStore((state) => state.updateTerminal);
  const setAssociatedTask = useTerminalStore((state) => state.setAssociatedTask);

  // Filter tasks to only show backlog (Planning) status tasks for dropdown
  const backlogTasks = tasks.filter((t) => t.status === 'backlog');

  // Find the currently associated task for tooltip
  const associatedTask = terminal?.associatedTaskId
    ? tasks.find((t) => t.id === terminal.associatedTaskId)
    : undefined;
  const appendOutput = useTerminalStore((state) => state.appendOutput);
  const clearOutputBuffer = useTerminalStore((state) => state.clearOutputBuffer);

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
    // Skip replay for restored Claude sessions - they'll clear and resume fresh
    // Then clear the buffer to prevent duplicate content on subsequent remounts
    const terminalState = useTerminalStore.getState().terminals.find((t) => t.id === id);
    if (terminalState?.outputBuffer && !(terminalState.isRestored && terminalState.isClaudeMode)) {
      xterm.write(terminalState.outputBuffer);
      // Clear buffer after replay - new output will accumulate fresh
      // This prevents duplicates when combined with full-screen redraws from TUI apps
      useTerminalStore.getState().clearOutputBuffer(id);
    } else if (terminalState?.isRestored && terminalState.isClaudeMode) {
      // For restored Claude sessions, just clear the buffer without replay
      // The session will clear screen and start fresh
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
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalOutput((terminalId, data) => {
      if (terminalId === id) {
        // Store output in buffer for replay on remount
        appendOutput(id, data);
        // Write to xterm if available
        if (xtermRef.current) {
          xtermRef.current.write(data);
        }
      }
    });

    return cleanup;
  }, [id, appendOutput]);

  // Handle terminal exit
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalExit((terminalId, exitCode) => {
      if (terminalId === id) {
        isCreatedRef.current = false;
        setTerminalStatus(id, 'exited');
        if (xtermRef.current) {
          xtermRef.current.writeln(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m`);
        }
      }
    });

    return cleanup;
  }, [id, setTerminalStatus]);

  // Handle terminal title change
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalTitleChange((terminalId, title) => {
      if (terminalId === id) {
        updateTerminal(id, { title });
      }
    });

    return cleanup;
  }, [id, updateTerminal]);

  // Handle Claude session ID capture
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalClaudeSession((terminalId, sessionId) => {
      if (terminalId === id) {
        setClaudeSessionId(id, sessionId);
        console.log('[Terminal] Captured Claude session ID:', sessionId);
      }
    });

    return cleanup;
  }, [id, setClaudeSessionId]);

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

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-lg border bg-[#0B0B0F] overflow-hidden transition-all',
        isActive ? 'border-primary ring-1 ring-primary/20' : 'border-border'
      )}
      onClick={handleClick}
    >
      {/* Terminal header */}
      <div className="electron-no-drag flex h-9 items-center justify-between border-b border-border/50 bg-card/30 px-2">
        <div className="flex items-center gap-2">
          <div className={cn('h-2 w-2 rounded-full', STATUS_COLORS[terminal?.status || 'idle'])} />
          <div className="flex items-center gap-1.5">
            <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
            {/* Terminal title with optional tooltip showing task description */}
            {associatedTask ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs font-medium text-foreground truncate max-w-32 cursor-help">
                      {terminal?.title || 'Terminal'}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">{associatedTask.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="text-xs font-medium text-foreground truncate max-w-32">
                {terminal?.title || 'Terminal'}
              </span>
            )}
          </div>
          {terminal?.isClaudeMode && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
              <Sparkles className="h-2.5 w-2.5" />
              Claude
            </span>
          )}
          {/* Task selection dropdown - only show when Claude is active and there are backlog tasks */}
          {terminal?.isClaudeMode && backlogTasks.length > 0 && (
            <Select
              value={terminal?.associatedTaskId || ''}
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
