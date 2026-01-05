import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTerminalStore } from '../stores/terminal-store';
import { toast } from './use-toast';

/**
 * Custom hook to handle Claude profile login terminal visibility.
 * Listens for onTerminalAuthCreated events and adds the terminal
 * to the store so users can see the OAuth flow output.
 */
export function useClaudeLoginTerminal() {
  const { t } = useTranslation('terminal');
  const addExternalTerminal = useTerminalStore((state) => state.addExternalTerminal);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onTerminalAuthCreated((info) => {
      // Add the terminal to the store so it becomes visible in the UI
      // This allows users to see the 'claude setup-token' output and complete the OAuth flow
      // cwd is optional and defaults to HOME or '~' in addExternalTerminal
      const terminal = addExternalTerminal(
        info.terminalId,
        t('auth.terminalTitle', { profileName: info.profileName })
      );

      // If terminal creation failed (max terminals reached), show a notification
      // The terminal was created in main process but we can't show it in UI
      if (!terminal) {
        toast({
          title: t('auth.maxTerminalsReached'),
          variant: 'destructive',
        });
      }
    });

    return unsubscribe;
  }, [addExternalTerminal, t]);
}
