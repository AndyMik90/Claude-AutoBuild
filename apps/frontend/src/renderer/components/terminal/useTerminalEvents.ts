import { useEffect, useRef } from 'react';
import { useTerminalStore } from '../../stores/terminal-store';
import { terminalBufferManager } from '../../lib/terminal-buffer-manager';

interface UseTerminalEventsOptions {
  terminalId: string;
  onOutput?: (data: string) => void;
  onExit?: (exitCode: number) => void;
  onTitleChange?: (title: string) => void;
  onClaudeSession?: (sessionId: string) => void;
}

export function useTerminalEvents({
  terminalId,
  onOutput,
  onExit,
  onTitleChange,
  onClaudeSession,
}: UseTerminalEventsOptions) {
  // Use refs to always have the latest callbacks without re-registering listeners
  // This prevents duplicate listener registration when callbacks change identity
  const onOutputRef = useRef(onOutput);
  const onExitRef = useRef(onExit);
  const onTitleChangeRef = useRef(onTitleChange);
  const onClaudeSessionRef = useRef(onClaudeSession);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onOutputRef.current = onOutput;
  }, [onOutput]);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);

  useEffect(() => {
    onClaudeSessionRef.current = onClaudeSession;
  }, [onClaudeSession]);

  // Handle terminal output from main process
  // Only depends on terminalId (stable) to prevent listener re-registration
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalOutput((id, data) => {
      if (id === terminalId) {
        terminalBufferManager.append(terminalId, data);
        onOutputRef.current?.(data);
      }
    });

    return cleanup;
  }, [terminalId]);

  // Handle terminal exit
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalExit((id, exitCode) => {
      if (id === terminalId) {
        useTerminalStore.getState().setTerminalStatus(terminalId, 'exited');
        onExitRef.current?.(exitCode);
      }
    });

    return cleanup;
  }, [terminalId]);

  // Handle terminal title change
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalTitleChange((id, title) => {
      if (id === terminalId) {
        useTerminalStore.getState().updateTerminal(terminalId, { title });
        onTitleChangeRef.current?.(title);
      }
    });

    return cleanup;
  }, [terminalId]);

  // Handle Claude session ID capture
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalClaudeSession((id, sessionId) => {
      if (id === terminalId) {
        useTerminalStore.getState().setClaudeSessionId(terminalId, sessionId);
        console.warn('[Terminal] Captured Claude session ID:', sessionId);
        onClaudeSessionRef.current?.(sessionId);
      }
    });

    return cleanup;
  }, [terminalId]);
}
