/**
 * useProviderIntegration Hook
 * ===========================
 *
 * Custom hook for managing provider integration state and OAuth flow.
 * Provides a unified interface for GitHub, GitLab, and future providers.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ProviderType, ProviderRepository } from './types';
import type { ProjectEnvConfig } from '../../../shared/types';
import {
  getProviderOAuthHandlers,
  getProviderRepositoryFetcher,
  envConfigToProviderConfig,
  providerConfigToEnvConfig,
} from './factory';

export interface UseProviderIntegrationProps {
  provider: ProviderType;
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  projectPath?: string;
}

export function useProviderIntegration({
  provider,
  envConfig,
  updateEnvConfig,
  projectPath,
}: UseProviderIntegrationProps) {
  // Provider configuration - memoized to prevent infinite re-renders
  const providerConfig = useMemo(
    () => envConfigToProviderConfig(provider, envConfig || {}),
    [provider, envConfig]
  );

  // CLI state
  const [cliInstalled, setCliInstalled] = useState<boolean | null>(null);
  const [cliVersion, setCliVersion] = useState<string | null>(null);
  const [isCheckingCli, setIsCheckingCli] = useState(false);
  const [isInstallingCli, setIsInstallingCli] = useState(false);
  const [cliInstallSuccess, setCliInstallSuccess] = useState(false);
  const [cliAuthenticated, setCliAuthenticated] = useState<boolean>(false);
  const [cliAuthUsername, setCliAuthUsername] = useState<string | null>(null);

  // Auth state
  const [authMode, setAuthMode] = useState<'manual' | 'oauth' | 'oauth-success'>('manual');
  const [oauthUsername, setOauthUsername] = useState<string | null>(null);

  // Repositories/Projects state
  const [repositories, setRepositories] = useState<ProviderRepository[]>([]);
  const [isLoadingRepositories, setIsLoadingRepositories] = useState(false);
  const [repositoriesError, setRepositoriesError] = useState<string | null>(null);

  // Branches state
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  // Track whether initial CLI check has been performed
  const hasCheckedCliRef = useRef(false);

  // Get provider-specific handlers - memoized to prevent infinite re-renders
  const oauthHandlers = useMemo(() => getProviderOAuthHandlers(provider), [provider]);
  const repositoryFetcher = useMemo(() => getProviderRepositoryFetcher(provider), [provider]);

  // Define checkAuthStatus before using it in effects
  const checkAuthStatus = useCallback(async () => {
    try {
      const authResult = await oauthHandlers.checkAuth(providerConfig.instanceUrl);
      setCliAuthenticated(authResult.authenticated);
      setCliAuthUsername(authResult.username || null);
    } catch (error) {
      console.error(`[useProviderIntegration] Error checking ${provider} auth:`, error);
      setCliAuthenticated(false);
      setCliAuthUsername(null);
    }
  }, [provider, providerConfig.instanceUrl, oauthHandlers]);

  // Re-check auth status when token changes
  useEffect(() => {
    if (cliInstalled && providerConfig.token) {
      // Small delay to allow backend to authenticate glab
      const timer = setTimeout(() => {
        checkAuthStatus();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [providerConfig.token, cliInstalled, checkAuthStatus]);

  const startOAuth = useCallback(async () => {
    const instanceUrl = providerConfig.instanceUrl;
    const result = await oauthHandlers.startAuth(instanceUrl);

    if (result.success) {
      // Poll for auth completion with max retries
      const MAX_RETRIES = 60; // 60 retries * 2s = 2 minutes max wait time
      let retryCount = 0;

      const checkAuth = async () => {
        if (retryCount >= MAX_RETRIES) {
          console.error(`[useProviderIntegration] OAuth polling timed out after ${MAX_RETRIES} attempts`);
          setAuthMode('manual'); // Revert to manual mode on timeout
          return;
        }

        retryCount++;
        const authResult = await oauthHandlers.checkAuth(instanceUrl);
        if (authResult.authenticated) {
          setAuthMode('oauth-success');
          setOauthUsername(authResult.username || null);

          // Get token and save to env config
          try {
            const tokenResult = await oauthHandlers.getToken(instanceUrl);
            const updates = providerConfigToEnvConfig(provider, {
              ...providerConfig,
              token: tokenResult.token,
            });
            updateEnvConfig(updates);
          } catch (error) {
            console.error(`[useProviderIntegration] Error getting ${provider} token:`, error);
          }
        } else {
          // Retry after delay
          setTimeout(checkAuth, 2000);
        }
      };
      setTimeout(checkAuth, 3000);
    } else {
      console.error(`[useProviderIntegration] OAuth failed:`, result);
    }
  }, [provider, providerConfig, oauthHandlers, updateEnvConfig]);

  const checkCli = useCallback(async (shouldAutoTriggerOAuth: boolean = false) => {
    setIsCheckingCli(true);
    try {
      const result = await oauthHandlers.checkCli();
      const wasInstalled = cliInstalled;
      setCliInstalled(result.installed);
      setCliVersion(result.version || null);

      // Check auth status if CLI is installed
      if (result.installed) {
        await checkAuthStatus();
      }

      // Auto-trigger OAuth only if:
      // 1. User explicitly requested it (clicked refresh/install)
      // 2. CLI was just detected as installed
      // 3. Provider integration is enabled
      // 4. Currently in manual auth mode
      if (
        shouldAutoTriggerOAuth &&
        result.installed &&
        wasInstalled === false &&
        providerConfig.enabled &&
        authMode === 'manual'
      ) {
        setAuthMode('oauth');
        await startOAuth();
      }
    } catch (error) {
      console.error(`[useProviderIntegration] Error checking ${provider} CLI:`, error);
      setCliInstalled(false);
    } finally {
      setIsCheckingCli(false);
    }
  }, [provider, oauthHandlers, cliInstalled, authMode, providerConfig.enabled, startOAuth, checkAuthStatus]);

  const installCli = useCallback(async () => {
    setIsInstallingCli(true);
    setCliInstallSuccess(false);
    try {
      await oauthHandlers.installCli();
      setCliInstallSuccess(true);

      // Re-check after 5 seconds with auto-trigger enabled
      setTimeout(async () => {
        await checkCli(true); // Pass true to enable auto-trigger OAuth
        setIsInstallingCli(false);
      }, 5000);
    } catch (error) {
      console.error(`[useProviderIntegration] Error installing ${provider} CLI:`, error);
      setIsInstallingCli(false);
    }
  }, [provider, oauthHandlers, checkCli]);

  const switchToManual = useCallback(() => {
    setAuthMode('manual');
    setOauthUsername(null);
  }, []);

  const switchToOAuth = useCallback(() => {
    console.log(`[useProviderIntegration] switchToOAuth called for ${provider}`);
    setAuthMode('oauth');
    startOAuth();
  }, [provider, startOAuth]);

  const fetchRepositories = useCallback(async () => {
    setIsLoadingRepositories(true);
    setRepositoriesError(null);
    try {
      const repos = await repositoryFetcher();
      setRepositories(repos);
    } catch (error) {
      console.error(`[useProviderIntegration] Error fetching ${provider} repositories:`, error);
      setRepositoriesError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoadingRepositories(false);
    }
  }, [provider, repositoryFetcher]);

  const fetchBranches = useCallback(async () => {
    if (!projectPath) return;

    setIsLoadingBranches(true);
    setBranchesError(null);
    try {
      const result = await window.electronAPI.getGitBranches(projectPath);
      if (result.success && result.data) {
        setBranches(result.data);
      } else {
        setBranchesError(result.error || 'Failed to fetch branches');
      }
    } catch (error) {
      console.error(`[useProviderIntegration] Error fetching branches:`, error);
      setBranchesError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoadingBranches(false);
    }
  }, [projectPath]);

  const handleOAuthSuccess = useCallback(() => {
    setAuthMode('oauth-success');
  }, []);

  const selectRepository = useCallback(
    (repoFullName: string) => {
      const updates = providerConfigToEnvConfig(provider, {
        ...providerConfig,
        [provider === 'github' ? 'repo' : 'project']: repoFullName,
      });
      updateEnvConfig(updates);
    },
    [provider, providerConfig, updateEnvConfig]
  );

  const selectBranch = useCallback(
    (branch: string) => {
      const updates = providerConfigToEnvConfig(provider, {
        ...providerConfig,
        defaultBranch: branch,
      });
      updateEnvConfig(updates);
    },
    [provider, providerConfig, updateEnvConfig]
  );

  // Check CLI installation on mount (only if provider is enabled)
  useEffect(() => {
    // CRITICAL: Only check CLI if the provider is enabled
    // This prevents Git Credential Manager popups when navigating to other provider settings
    // Use ref to prevent duplicate checks on mount
    if (providerConfig.enabled && !hasCheckedCliRef.current) {
      hasCheckedCliRef.current = true;
      checkCli();
    }
  }, [provider, providerConfig.enabled, checkCli]);

  // Fetch repositories when entering oauth-success mode
  useEffect(() => {
    if (authMode === 'oauth-success') {
      fetchRepositories();
    }
  }, [authMode, fetchRepositories]);

  // Fetch branches when provider is enabled and project path is available
  useEffect(() => {
    if (providerConfig.enabled && projectPath) {
      fetchBranches();
    }
  }, [providerConfig.enabled, projectPath, fetchBranches]);

  return {
    // Configuration
    providerConfig,

    // CLI state
    cliInstalled,
    cliVersion,
    isCheckingCli,
    isInstallingCli,
    cliInstallSuccess,
    cliAuthenticated,
    cliAuthUsername,

    // Auth state
    authMode,
    oauthUsername,

    // Repositories state
    repositories,
    isLoadingRepositories,
    repositoriesError,

    // Branches state
    branches,
    isLoadingBranches,
    branchesError,

    // Actions
    checkCli,
    installCli,
    startOAuth,
    switchToManual,
    switchToOAuth,
    handleOAuthSuccess,
    fetchRepositories,
    fetchBranches,
    selectRepository,
    selectBranch,
  };
}
