import { useEffect } from 'react';
import { useTerminalStore } from '../../stores/terminal-store';

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
  // Handle terminal output from main process
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalOutput((id, data) => {
      if (id === terminalId) {
        useTerminalStore.getState().appendOutput(terminalId, data);
        onOutput?.(data);
      }
    });

    return cleanup;
  }, [terminalId, onOutput]);

  // Handle terminal exit
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalExit((id, exitCode) => {
      if (id === terminalId) {
        useTerminalStore.getState().setTerminalStatus(terminalId, 'exited');
        onExit?.(exitCode);
      }
    });

    return cleanup;
  }, [terminalId, onExit]);

  // Handle terminal title change
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalTitleChange((id, title) => {
      if (id === terminalId) {
        useTerminalStore.getState().updateTerminal(terminalId, { title });
        onTitleChange?.(title);
      }
    });

    return cleanup;
  }, [terminalId, onTitleChange]);

  // Handle Claude session ID capture
  useEffect(() => {
    const cleanup = window.electronAPI.onTerminalClaudeSession((id, sessionId) => {
      if (id === terminalId) {
        useTerminalStore.getState().setClaudeSessionId(terminalId, sessionId);
        console.warn('[Terminal] Captured Claude session ID:', sessionId);
        onClaudeSession?.(sessionId);
      }
    });

    return cleanup;
  }, [terminalId, onClaudeSession]);
}
