import { useCallback, useRef } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { useTerminalStore } from '../../stores/terminal-store';

interface UseAutoNamingOptions {
  terminalId: string;
  cwd?: string;
}

export function useAutoNaming({ terminalId, cwd }: UseAutoNamingOptions) {
  const lastCommandRef = useRef<string>('');
  const autoNameTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoNameTerminals = useSettingsStore((state) => state.settings.autoNameTerminals);
  const terminal = useTerminalStore((state) => state.terminals.find((t) => t.id === terminalId));
  const updateTerminal = useTerminalStore((state) => state.updateTerminal);

  const triggerAutoNaming = useCallback(async () => {
    if (!autoNameTerminals || terminal?.isClaudeMode || !lastCommandRef.current.trim()) {
      return;
    }

    const command = lastCommandRef.current.trim();
    // Skip very short or common commands
    if (command.length < 2 || ['ls', 'cd', 'll', 'pwd', 'exit', 'clear'].includes(command)) {
      return;
    }

    try {
      const result = await window.electronAPI.generateTerminalName(command, terminal?.cwd || cwd);
      if (result.success && result.data) {
        updateTerminal(terminalId, { title: result.data });
      }
    } catch (error) {
      console.warn('[Terminal] Auto-naming failed:', error);
    }
  }, [autoNameTerminals, terminal?.isClaudeMode, terminal?.cwd, cwd, terminalId, updateTerminal]);

  const handleCommandEnter = useCallback((command: string) => {
    lastCommandRef.current = command;

    if (autoNameTimeoutRef.current) {
      clearTimeout(autoNameTimeoutRef.current);
    }

    autoNameTimeoutRef.current = setTimeout(() => {
      triggerAutoNaming();
    }, 1500);
  }, [triggerAutoNaming]);

  const cleanup = useCallback(() => {
    if (autoNameTimeoutRef.current) {
      clearTimeout(autoNameTimeoutRef.current);
      autoNameTimeoutRef.current = null;
    }
  }, []);

  return {
    handleCommandEnter,
    cleanup,
  };
}
