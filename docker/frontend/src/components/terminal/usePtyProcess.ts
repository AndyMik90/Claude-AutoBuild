import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../../stores/terminal-store';

interface UsePtyProcessOptions {
  terminalId: string;
  cwd?: string;
  projectPath?: string;
  projectId?: string;  // Project UUID for backend validation
  cols: number;
  rows: number;
  onCreated?: () => void;
  onError?: (error: string) => void;
}

export function usePtyProcess({
  terminalId,
  cwd,
  projectPath,
  projectId,
  cols,
  rows,
  onCreated,
  onError,
}: UsePtyProcessOptions) {
  const isCreatingRef = useRef(false);
  const isCreatedRef = useRef(false);
  const setTerminalStatus = useTerminalStore((state) => state.setTerminalStatus);
  const updateTerminal = useTerminalStore((state) => state.updateTerminal);

  // Create PTY process
  useEffect(() => {
    if (isCreatingRef.current || isCreatedRef.current) return;

    const terminalState = useTerminalStore.getState().terminals.find((t) => t.id === terminalId);
    const alreadyRunning = terminalState?.status === 'running' || terminalState?.status === 'claude-active';
    const isRestored = terminalState?.isRestored;

    isCreatingRef.current = true;

    if (isRestored && terminalState) {
      // Restored session
      window.electronAPI.restoreTerminalSession(
        {
          id: terminalState.id,
          title: terminalState.title,
          cwd: terminalState.cwd,
          projectPath: projectPath || '',
          isClaudeMode: terminalState.isClaudeMode,
          claudeSessionId: terminalState.claudeSessionId,
          outputBuffer: '',
          createdAt: terminalState.createdAt.toISOString(),
          lastActiveAt: new Date().toISOString()
        },
        cols,
        rows
      ).then((result) => {
        if (result.success && result.data?.success) {
          isCreatedRef.current = true;
          setTerminalStatus(terminalId, terminalState.isClaudeMode ? 'claude-active' : 'running');
          updateTerminal(terminalId, { isRestored: false });
          onCreated?.();
        } else {
          const error = `Error restoring session: ${result.data?.error || result.error}`;
          onError?.(error);
        }
        isCreatingRef.current = false;
      }).catch((err) => {
        onError?.(err.message);
        isCreatingRef.current = false;
      });
    } else {
      // New terminal
      window.electronAPI.createTerminal({
        id: terminalId,
        cwd,
        cols,
        rows,
        projectPath,
        projectId,
      }).then((result) => {
        if (result.success) {
          isCreatedRef.current = true;
          if (!alreadyRunning) {
            setTerminalStatus(terminalId, 'running');
          }
          onCreated?.();
        } else {
          onError?.(result.error || 'Unknown error');
        }
        isCreatingRef.current = false;
      }).catch((err) => {
        onError?.(err.message);
        isCreatingRef.current = false;
      });
    }
  }, [terminalId, cwd, projectPath, projectId, cols, rows, setTerminalStatus, updateTerminal, onCreated, onError]);

  return {
    isCreated: isCreatedRef.current,
  };
}
