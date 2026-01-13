import { useEffect, useRef, useCallback, useState, type RefObject } from 'react';
import { useTerminalStore } from '../../stores/terminal-store';

// Maximum retry attempts for recreation when dimensions aren't ready
const MAX_RECREATION_RETRIES = 10;
// Delay between retry attempts in ms
const RECREATION_RETRY_DELAY = 100;

interface UsePtyProcessOptions {
  terminalId: string;
  cwd?: string;
  projectPath?: string;
  cols: number;
  rows: number;
  skipCreation?: boolean; // Skip PTY creation until dimensions are ready
  // Track deliberate recreation scenarios (e.g., worktree switching)
  // When true, resets terminal status to 'idle' to allow proper recreation
  isRecreatingRef?: RefObject<boolean>;
  onCreated?: () => void;
  onError?: (error: string) => void;
}

export function usePtyProcess({
  terminalId,
  cwd,
  projectPath,
  cols,
  rows,
  skipCreation = false,
  isRecreatingRef,
  onCreated,
  onError,
}: UsePtyProcessOptions) {
  const isCreatingRef = useRef(false);
  const isCreatedRef = useRef(false);
  const currentCwdRef = useRef(cwd);
  // Trigger state to force re-creation after resetForRecreate()
  // Refs don't trigger re-renders, so we need a state to ensure the effect runs
  const [recreationTrigger, setRecreationTrigger] = useState(0);
  // Track retry attempts during recreation when dimensions aren't ready
  const recreationRetryCountRef = useRef(0);
  const recreationRetryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Use getState() pattern for store actions to avoid React Fast Refresh issues
  // The selectors like useTerminalStore((state) => state.setTerminalStatus) can fail
  // during HMR with "Should have a queue" errors. Using getState() in callbacks
  // avoids this by not relying on React's hook queue mechanism.
  const getStore = useCallback(() => useTerminalStore.getState(), []);

  // Cleanup retry timer on unmount
  useEffect(() => {
    return () => {
      if (recreationRetryTimerRef.current) {
        clearTimeout(recreationRetryTimerRef.current);
        recreationRetryTimerRef.current = null;
      }
    };
  }, []);

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
  // recreationTrigger is included to force the effect to run after resetForRecreate()
  // since refs don't trigger re-renders
  useEffect(() => {
    // During recreation, if dimensions aren't ready, schedule a retry instead of giving up
    if (skipCreation && isRecreatingRef?.current) {
      // Don't exceed max retries
      if (recreationRetryCountRef.current < MAX_RECREATION_RETRIES) {
        recreationRetryCountRef.current += 1;
        // Schedule a retry by incrementing the trigger after a delay
        recreationRetryTimerRef.current = setTimeout(() => {
          setRecreationTrigger((prev) => prev + 1);
        }, RECREATION_RETRY_DELAY);
      } else {
        // Max retries exceeded - clear recreation state and report error
        console.error('[usePtyProcess] Recreation failed: dimensions not ready after max retries');
        isRecreatingRef.current = false;
        recreationRetryCountRef.current = 0;
        onError?.('Terminal recreation failed: dimensions not ready');
      }
      return;
    }

    // Normal skip (not during recreation) - just return
    if (skipCreation) return;
    if (isCreatingRef.current || isCreatedRef.current) return;

    // Clear retry counter since we're proceeding with creation
    recreationRetryCountRef.current = 0;

    const store = getStore();
    const terminalState = store.terminals.find((t) => t.id === terminalId);
    const alreadyRunning = terminalState?.status === 'running' || terminalState?.status === 'claude-active';
    const isRestored = terminalState?.isRestored;

    // When recreating (e.g., worktree switching), reset status from 'exited' to 'idle'
    // This allows proper recreation after deliberate terminal destruction
    if (isRecreatingRef?.current && terminalState?.status === 'exited') {
      store.setTerminalStatus(terminalId, 'idle');
    }

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
          lastActiveAt: new Date().toISOString(),
          // Pass worktreeConfig so backend can restore it and persist correctly
          worktreeConfig: terminalState.worktreeConfig,
        },
        cols,
        rows
      ).then((result) => {
        if (result.success && result.data?.success) {
          isCreatedRef.current = true;
          // Clear recreation flag after successful PTY creation
          if (isRecreatingRef?.current) {
            isRecreatingRef.current = false;
          }
          recreationRetryCountRef.current = 0;
          const store = getStore();
          store.setTerminalStatus(terminalId, terminalState.isClaudeMode ? 'claude-active' : 'running');
          store.updateTerminal(terminalId, { isRestored: false });
          onCreated?.();
        } else {
          const error = `Error restoring session: ${result.data?.error || result.error}`;
          // During recreation, retry instead of giving up immediately
          if (isRecreatingRef?.current && recreationRetryCountRef.current < MAX_RECREATION_RETRIES) {
            recreationRetryCountRef.current += 1;
            recreationRetryTimerRef.current = setTimeout(() => {
              setRecreationTrigger((prev) => prev + 1);
            }, RECREATION_RETRY_DELAY);
          } else {
            // Not recreating or max retries exceeded - clear and report error
            if (isRecreatingRef?.current) {
              isRecreatingRef.current = false;
            }
            recreationRetryCountRef.current = 0;
            onError?.(error);
          }
        }
        isCreatingRef.current = false;
      }).catch((err) => {
        // During recreation, retry instead of giving up immediately
        if (isRecreatingRef?.current && recreationRetryCountRef.current < MAX_RECREATION_RETRIES) {
          recreationRetryCountRef.current += 1;
          recreationRetryTimerRef.current = setTimeout(() => {
            setRecreationTrigger((prev) => prev + 1);
          }, RECREATION_RETRY_DELAY);
        } else {
          // Not recreating or max retries exceeded - clear and report error
          if (isRecreatingRef?.current) {
            isRecreatingRef.current = false;
          }
          recreationRetryCountRef.current = 0;
          onError?.(err.message);
        }
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
          // Clear recreation flag after successful PTY creation
          if (isRecreatingRef?.current) {
            isRecreatingRef.current = false;
          }
          recreationRetryCountRef.current = 0;
          if (!alreadyRunning) {
            getStore().setTerminalStatus(terminalId, 'running');
          }
          onCreated?.();
        } else {
          // During recreation, retry instead of giving up immediately
          if (isRecreatingRef?.current && recreationRetryCountRef.current < MAX_RECREATION_RETRIES) {
            recreationRetryCountRef.current += 1;
            recreationRetryTimerRef.current = setTimeout(() => {
              setRecreationTrigger((prev) => prev + 1);
            }, RECREATION_RETRY_DELAY);
          } else {
            // Not recreating or max retries exceeded - clear and report error
            if (isRecreatingRef?.current) {
              isRecreatingRef.current = false;
            }
            recreationRetryCountRef.current = 0;
            onError?.(result.error || 'Unknown error');
          }
        }
        isCreatingRef.current = false;
      }).catch((err) => {
        // During recreation, retry instead of giving up immediately
        if (isRecreatingRef?.current && recreationRetryCountRef.current < MAX_RECREATION_RETRIES) {
          recreationRetryCountRef.current += 1;
          recreationRetryTimerRef.current = setTimeout(() => {
            setRecreationTrigger((prev) => prev + 1);
          }, RECREATION_RETRY_DELAY);
        } else {
          // Not recreating or max retries exceeded - clear and report error
          if (isRecreatingRef?.current) {
            isRecreatingRef.current = false;
          }
          recreationRetryCountRef.current = 0;
          onError?.(err.message);
        }
        isCreatingRef.current = false;
      });
    }

  }, [terminalId, cwd, projectPath, cols, rows, skipCreation, recreationTrigger, getStore, onCreated, onError]);

  // Function to prepare for recreation by preventing the effect from running
  // Call this BEFORE updating the store cwd to avoid race condition
  const prepareForRecreate = useCallback(() => {
    isCreatingRef.current = true;
  }, []);

  // Function to reset refs and allow recreation
  // Call this AFTER destroying the old terminal
  // Increments recreationTrigger to force the effect to run since refs don't trigger re-renders
  const resetForRecreate = useCallback(() => {
    isCreatedRef.current = false;
    isCreatingRef.current = false;
    // Increment trigger to force the creation effect to run
    setRecreationTrigger((prev) => prev + 1);
  }, []);

  return {
    isCreated: isCreatedRef.current,
    prepareForRecreate,
    resetForRecreate,
  };
}
