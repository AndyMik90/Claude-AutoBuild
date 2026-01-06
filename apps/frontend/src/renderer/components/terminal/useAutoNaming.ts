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
    const commandLower = command.toLowerCase();
    const firstWord = commandLower.split(/\s+/)[0];

    // Skip very short commands
    if (command.length < 3) {
      return;
    }

    // Skip common shell/navigation commands that don't represent meaningful work.
    // These commands are too generic to produce useful terminal names - they don't indicate
    // a specific task or purpose. For example, "git" could be any git operation,
    // "npm" could be install, run, or test. Meaningful names come from project-specific
    // commands like "npm run build:prod" or application-specific scripts.
    const skipCommands = [
      // Navigation & file listing
      'ls', 'cd', 'll', 'la', 'pwd', 'dir', 'tree',
      // Shell control
      'exit', 'clear', 'cls', 'reset', 'history',
      // Claude CLI - naming should come from the task description inside Claude, not the launch command
      'claude',
      // Common dev tools that are too generic
      'git', 'npm', 'yarn', 'pnpm', 'node', 'python', 'pip', 'cargo', 'go',
      'docker', 'kubectl', 'make', 'cmake',
      // Package managers
      'brew', 'apt', 'yum', 'pacman', 'choco', 'scoop', 'winget',
      // Editors
      'vim', 'nvim', 'nano', 'code', 'cursor',
      // System commands
      'cat', 'head', 'tail', 'less', 'more', 'grep', 'find', 'which', 'where',
      'echo', 'env', 'export', 'set', 'unset', 'alias', 'source',
      'chmod', 'chown', 'mkdir', 'rmdir', 'rm', 'cp', 'mv', 'touch',
      'man', 'help', 'whoami', 'hostname', 'date', 'time', 'top', 'htop', 'ps',
    ];

    if (skipCommands.includes(firstWord)) {
      return;
    }

    try {
      const result = await window.electronAPI.generateTerminalName(command, terminal?.cwd || cwd);
      if (result.success && result.data) {
        updateTerminal(terminalId, { title: result.data });
        // Sync to main process so title persists across hot reloads
        window.electronAPI.setTerminalTitle(terminalId, result.data);
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
