import { useEffect } from 'react';
import { useTerminalStore } from '../stores/terminal-store';

/**
 * Custom hook to handle Claude profile login terminal visibility.
 * Listens for onClaudeProfileLoginTerminal events and adds the terminal
 * to the store so users can see the OAuth flow output.
 */
export function useClaudeLoginTerminal() {
  const addExternalTerminal = useTerminalStore((state) => state.addExternalTerminal);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onClaudeProfileLoginTerminal((info) => {
      // Add the terminal to the store so it becomes visible in the UI
      // This allows users to see the 'claude setup-token' output and complete the OAuth flow
      // cwd is optional and defaults to HOME or '~' in addExternalTerminal
      addExternalTerminal(
        info.terminalId,
        `Auth: ${info.profileName}`
      );
    });

    return unsubscribe;
  }, [addExternalTerminal]);
}
