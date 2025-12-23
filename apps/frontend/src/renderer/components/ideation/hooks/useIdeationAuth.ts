import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../../stores/settings-store';
import type { APIProfile } from '../../../../shared/types/profile';

/**
 * Hook to check if the ideation feature has valid authentication.
 * This combines two sources of authentication:
 * 1. OAuth token from source .env (checked via checkSourceToken)
 * 2. Active API profile (custom Anthropic-compatible endpoint)
 *
 * @returns { hasToken, isLoading, error, checkAuth }
 * - hasToken: true if either source OAuth token exists OR active API profile is configured
 * - isLoading: true while checking authentication status
 * - error: any error that occurred during auth check
 * - checkAuth: function to manually re-check authentication status
 */
export function useIdeationAuth() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get active API profile info from settings store
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);

  const checkAuth = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check for OAuth token from source .env
      const sourceTokenResult = await window.electronAPI.checkSourceToken();
      const hasSourceOAuthToken = sourceTokenResult.success && sourceTokenResult.data?.hasToken;

      // Check if active API profile is configured
      const hasAPIProfile = Boolean(activeProfileId && activeProfileId !== '');

      // Auth is valid if either source token or API profile exists
      setHasToken(hasSourceOAuthToken || hasAPIProfile);
    } catch (err) {
      setHasToken(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, [activeProfileId]);

  return { hasToken, isLoading, error, checkAuth };
}
