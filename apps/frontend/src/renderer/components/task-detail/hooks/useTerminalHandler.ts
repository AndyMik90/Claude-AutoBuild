import { useState } from 'react';

/**
 * Hook for handling terminal creation with proper error handling and loading states.
 * Fixes silent failures when terminal buttons are clicked.
 */
export function useTerminalHandler() {
  const [error, setError] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);

  const openTerminal = async (id: string, cwd: string) => {
    setIsOpening(true);
    setError(null);

    try {
      const result = await window.electronAPI.createTerminal({ id, cwd });

      if (!result.success) {
        setError(result.error || 'Failed to open terminal');
        console.error('[Terminal] Failed to open:', result.error);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to open terminal: ${errorMsg}`);
      console.error('[Terminal] Exception:', err);
    } finally {
      setIsOpening(false);
    }
  };

  return { openTerminal, error, isOpening };
}
