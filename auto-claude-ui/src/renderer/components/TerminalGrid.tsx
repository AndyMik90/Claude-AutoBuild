import { useCallback, useEffect, useMemo } from 'react';
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { Plus, Sparkles, Grid2X2 } from 'lucide-react';
import { Terminal } from './Terminal';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { useTerminalStore } from '../stores/terminal-store';
import { useTaskStore } from '../stores/task-store';

interface TerminalGridProps {
  projectPath?: string;
}

export function TerminalGrid({ projectPath }: TerminalGridProps) {
  const terminals = useTerminalStore((state) => state.terminals);
  const activeTerminalId = useTerminalStore((state) => state.activeTerminalId);
  const addTerminal = useTerminalStore((state) => state.addTerminal);
  const removeTerminal = useTerminalStore((state) => state.removeTerminal);
  const setActiveTerminal = useTerminalStore((state) => state.setActiveTerminal);
  const canAddTerminal = useTerminalStore((state) => state.canAddTerminal);
  const setClaudeMode = useTerminalStore((state) => state.setClaudeMode);

  // Get tasks from task store for task selection dropdown in terminals
  const tasks = useTaskStore((state) => state.tasks);

  // Handle keyboard shortcut for new terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+T or Cmd+T for new terminal
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault();
        if (canAddTerminal()) {
          addTerminal(projectPath);
        }
      }
      // Ctrl+W or Cmd+W to close active terminal
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && activeTerminalId) {
        e.preventDefault();
        handleCloseTerminal(activeTerminalId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addTerminal, canAddTerminal, projectPath, activeTerminalId]);

  const handleCloseTerminal = useCallback((id: string) => {
    window.electronAPI.destroyTerminal(id);
    removeTerminal(id);
  }, [removeTerminal]);

  const handleAddTerminal = useCallback(() => {
    if (canAddTerminal()) {
      addTerminal(projectPath);
    }
  }, [addTerminal, canAddTerminal, projectPath]);

  const handleInvokeClaudeAll = useCallback(() => {
    terminals.forEach((terminal) => {
      if (terminal.status === 'running' && !terminal.isClaudeMode) {
        setClaudeMode(terminal.id, true);
        window.electronAPI.invokeClaudeInTerminal(terminal.id, projectPath);
      }
    });
  }, [terminals, setClaudeMode, projectPath]);

  // Calculate grid layout based on number of terminals
  const gridLayout = useMemo(() => {
    const count = terminals.length;
    if (count === 0) return { rows: 0, cols: 0 };
    if (count === 1) return { rows: 1, cols: 1 };
    if (count === 2) return { rows: 1, cols: 2 };
    if (count <= 4) return { rows: 2, cols: 2 };
    if (count <= 6) return { rows: 2, cols: 3 };
    if (count <= 9) return { rows: 3, cols: 3 };
    return { rows: 3, cols: 4 }; // Max 12 terminals = 3x4
  }, [terminals.length]);

  // Group terminals into rows
  const terminalRows = useMemo(() => {
    const rows: typeof terminals[] = [];
    const { cols } = gridLayout;
    if (cols === 0) return rows;

    for (let i = 0; i < terminals.length; i += cols) {
      rows.push(terminals.slice(i, i + cols));
    }
    return rows;
  }, [terminals, gridLayout]);

  // Empty state
  if (terminals.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-card p-4">
            <Grid2X2 className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Agent Terminals</h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-md">
              Spawn multiple terminals to run Claude agents in parallel.
              Use <kbd className="px-1.5 py-0.5 text-xs bg-card border border-border rounded">Ctrl+T</kbd> to create a new terminal.
            </p>
          </div>
        </div>
        <Button onClick={handleAddTerminal} className="gap-2">
          <Plus className="h-4 w-4" />
          New Terminal
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-10 items-center justify-between border-b border-border bg-card/30 px-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {terminals.length} / 12 terminals
          </span>
        </div>
        <div className="flex items-center gap-2">
          {terminals.some((t) => t.status === 'running' && !t.isClaudeMode) && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={handleInvokeClaudeAll}
            >
              <Sparkles className="h-3 w-3" />
              Invoke Claude All
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleAddTerminal}
            disabled={!canAddTerminal()}
          >
            <Plus className="h-3 w-3" />
            New Terminal
            <kbd className="ml-1 text-[10px] text-muted-foreground">
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+T
            </kbd>
          </Button>
        </div>
      </div>

      {/* Terminal grid using resizable panels */}
      <div className="flex-1 overflow-hidden p-2">
        <PanelGroup direction="vertical" className="h-full">
          {terminalRows.map((row, rowIndex) => (
            <div key={rowIndex} className="contents">
              <Panel id={`row-${rowIndex}`} order={rowIndex} defaultSize={100 / terminalRows.length} minSize={15}>
                <PanelGroup direction="horizontal" className="h-full">
                  {row.map((terminal, colIndex) => (
                    <div key={terminal.id} className="contents">
                      <Panel id={terminal.id} order={colIndex} defaultSize={100 / row.length} minSize={20}>
                        <div className="h-full p-1">
                          <Terminal
                            id={terminal.id}
                            cwd={terminal.cwd || projectPath}
                            projectPath={projectPath}
                            isActive={terminal.id === activeTerminalId}
                            onClose={() => handleCloseTerminal(terminal.id)}
                            onActivate={() => setActiveTerminal(terminal.id)}
                            tasks={tasks}
                          />
                        </div>
                      </Panel>
                      {colIndex < row.length - 1 && (
                        <PanelResizeHandle className="w-1 hover:bg-primary/30 transition-colors" />
                      )}
                    </div>
                  ))}
                </PanelGroup>
              </Panel>
              {rowIndex < terminalRows.length - 1 && (
                <PanelResizeHandle className="h-1 hover:bg-primary/30 transition-colors" />
              )}
            </div>
          ))}
        </PanelGroup>
      </div>
    </div>
  );
}
