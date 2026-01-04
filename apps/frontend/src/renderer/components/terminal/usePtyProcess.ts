import { useEffect, useRef, useCallback } from 'react';
import { useTerminalStore } from '../../stores/terminal-store';

interface UsePtyProcessOptions {
  terminalId: string;
  cwd?: string;
  projectPath?: string;
  cols: number;
  rows: number;
  onCreated?: () => void;
  onError?: (error: string) => void;
}

export function usePtyProcess({
  terminalId,
  cwd,
  projectPath,
  cols,
  rows,
  onCreated,
  onError,
}: UsePtyProcessOptions) {
  const isCreatingRef = useRef(false);
  const isCreatedRef = useRef(false);
  const currentCwdRef = useRef(cwd);
  const setTerminalStatus = useTerminalStore((state) => state.setTerminalStatus);
  const updateTerminal = useTerminalStore((state) => state.updateTerminal);

  // Track cwd changes - if cwd changes while terminal exists, trigger recreate
  useEffect(() => {
    if (currentCwdRef.current !== cwd) {
      // Only reset if we're not already in a controlled recreation process.
      // prepareForRecreate() sets isCreatingRef=true to prevent auto-recreation
      // while awaiting destroyTerminal(). Without this check, we'd reset isCreatingRef
      // back to false before destroyTerminal completes, causing a race condition
      // where a new PTY is created before the old one is destroyed.
      if (isCreatedRef.current && !isCreatingRef.current) {
        // Terminal exists and we're not in a controlled recreation, reset refs
        isCreatedRef.current = false;
      }
      currentCwdRef.current = cwd;
    }
  }, [cwd]);

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
  }, [terminalId, cwd, projectPath, cols, rows, setTerminalStatus, updateTerminal, onCreated, onError]);

  // Function to prepare for recreation by preventing the effect from running
  // Call this BEFORE updating the store cwd to avoid race condition
  const prepareForRecreate = useCallback(() => {
    isCreatingRef.current = true;
  }, []);

  // Function to reset refs and allow recreation
  // Call this AFTER destroying the old terminal
  const resetForRecreate = useCallback(() => {
    isCreatedRef.current = false;
    isCreatingRef.current = false;
  }, []);

  return {
    isCreated: isCreatedRef.current,
    prepareForRecreate,
    resetForRecreate,
  };
}
