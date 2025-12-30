import { useState, useEffect } from 'react';
import {
  updateProjectSettings,
  checkProjectVersion,
  initializeProject
} from '../../../stores/project-store';
import { checkGitHubConnection as checkGitHubConnectionGlobal } from '../../../stores/github';
import type {
  Project,
  ProjectSettings as ProjectSettingsType,
  AutoBuildVersionInfo,
  ProjectEnvConfig,
  LinearSyncStatus,
  GitHubSyncStatus,
  GitLabSyncStatus
} from '../../../../shared/types';

export interface UseProjectSettingsReturn {
  // Settings state
  settings: ProjectSettingsType;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettingsType>>;
  isSaving: boolean;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Version info
  versionInfo: AutoBuildVersionInfo | null;
  isCheckingVersion: boolean;
  isUpdating: boolean;

  // Environment config
  envConfig: ProjectEnvConfig | null;
  setEnvConfig: React.Dispatch<React.SetStateAction<ProjectEnvConfig | null>>;
  isLoadingEnv: boolean;
  envError: string | null;
  setEnvError: React.Dispatch<React.SetStateAction<string | null>>;
  isSavingEnv: boolean;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => Promise<void>;

  // Password visibility toggles
  showClaudeToken: boolean;
  setShowClaudeToken: React.Dispatch<React.SetStateAction<boolean>>;
  showLinearKey: boolean;
  setShowLinearKey: React.Dispatch<React.SetStateAction<boolean>>;
  showOpenAIKey: boolean;
  setShowOpenAIKey: React.Dispatch<React.SetStateAction<boolean>>;
  showGitHubToken: boolean;
  setShowGitHubToken: React.Dispatch<React.SetStateAction<boolean>>;

  // Collapsible sections
  expandedSections: Record<string, boolean>;
  toggleSection: (section: string) => void;

  // GitHub state
  gitHubConnectionStatus: GitHubSyncStatus | null;
  isCheckingGitHub: boolean;

  // GitLab state
  showGitLabToken: boolean;
  setShowGitLabToken: React.Dispatch<React.SetStateAction<boolean>>;
  gitLabConnectionStatus: GitLabSyncStatus | null;
  isCheckingGitLab: boolean;

  // Claude auth state
  isCheckingClaudeAuth: boolean;
  claudeAuthStatus: 'checking' | 'authenticated' | 'not_authenticated' | 'error';
  setClaudeAuthStatus: React.Dispatch<React.SetStateAction<'checking' | 'authenticated' | 'not_authenticated' | 'error'>>;

  // Linear state
  showLinearImportModal: boolean;
  setShowLinearImportModal: React.Dispatch<React.SetStateAction<boolean>>;
  linearConnectionStatus: LinearSyncStatus | null;
  isCheckingLinear: boolean;

  // Actions
  handleInitialize: () => Promise<void>;
  handleSaveEnv: () => Promise<void>;
  handleClaudeSetup: () => Promise<void>;
  handleSave: (onClose: () => void) => Promise<void>;
}

export function useProjectSettings(
  project: Project,
  open: boolean
): UseProjectSettingsReturn {
  const [settings, setSettings] = useState<ProjectSettingsType>(project.settings);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [versionInfo, setVersionInfo] = useState<AutoBuildVersionInfo | null>(null);
  const [isCheckingVersion, setIsCheckingVersion] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Environment configuration state
  const [envConfig, setEnvConfig] = useState<ProjectEnvConfig | null>(null);
  const [isLoadingEnv, setIsLoadingEnv] = useState(false);
  const [envError, setEnvError] = useState<string | null>(null);
  const [isSavingEnv, setIsSavingEnv] = useState(false);

  // Password visibility toggles
  const [showClaudeToken, setShowClaudeToken] = useState(false);
  const [showLinearKey, setShowLinearKey] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);

  // Collapsible sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    claude: true,
    linear: false,
    github: false,
    graphiti: false
  });

  // GitHub state
  const [showGitHubToken, setShowGitHubToken] = useState(false);
  const [gitHubConnectionStatus, setGitHubConnectionStatus] = useState<GitHubSyncStatus | null>(null);
  const [isCheckingGitHub, setIsCheckingGitHub] = useState(false);

  // GitLab state
  const [showGitLabToken, setShowGitLabToken] = useState(false);
  const [gitLabConnectionStatus, setGitLabConnectionStatus] = useState<GitLabSyncStatus | null>(null);
  const [isCheckingGitLab, setIsCheckingGitLab] = useState(false);

  // Claude auth state
  const [isCheckingClaudeAuth, setIsCheckingClaudeAuth] = useState(false);
  const [claudeAuthStatus, setClaudeAuthStatus] = useState<'checking' | 'authenticated' | 'not_authenticated' | 'error'>('checking');

  // Linear import state
  const [showLinearImportModal, setShowLinearImportModal] = useState(false);
  const [linearConnectionStatus, setLinearConnectionStatus] = useState<LinearSyncStatus | null>(null);
  const [isCheckingLinear, setIsCheckingLinear] = useState(false);

  // Reset settings when project changes
  useEffect(() => {
    setSettings(project.settings);
  }, [project]);

  // Check version when dialog opens
  useEffect(() => {
    const checkVersion = async () => {
      if (open && project.autoBuildPath) {
        setIsCheckingVersion(true);
        const info = await checkProjectVersion(project.id);
        setVersionInfo(info);
        setIsCheckingVersion(false);
      }
    };
    checkVersion();
  }, [open, project.id, project.autoBuildPath]);

  // Load environment config when dialog opens
  useEffect(() => {
    const loadEnvConfig = async () => {
      if (open && project.autoBuildPath) {
        setIsLoadingEnv(true);
        setEnvError(null);
        try {
          const result = await window.electronAPI.getProjectEnv(project.id);
          if (result.success && result.data) {
            setEnvConfig(result.data);
          } else {
            setEnvError(result.error || 'Failed to load environment config');
          }
        } catch (err) {
          setEnvError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
          setIsLoadingEnv(false);
        }
      }
    };
    loadEnvConfig();
  }, [open, project.id, project.autoBuildPath]);

  // Check Claude authentication status
  useEffect(() => {
    const checkAuth = async () => {
      if (open && project.autoBuildPath) {
        setIsCheckingClaudeAuth(true);
        try {
          const result = await window.electronAPI.checkClaudeAuth(project.id);
          if (result.success && result.data) {
            setClaudeAuthStatus(result.data.authenticated ? 'authenticated' : 'not_authenticated');
          } else {
            setClaudeAuthStatus('error');
          }
        } catch {
          setClaudeAuthStatus('error');
        } finally {
          setIsCheckingClaudeAuth(false);
        }
      }
    };
    checkAuth();
  }, [open, project.id, project.autoBuildPath]);

  // Check Linear connection when API key changes
  useEffect(() => {
    const checkLinearConnection = async () => {
      if (!envConfig?.linearEnabled || !envConfig.linearApiKey) {
        setLinearConnectionStatus(null);
        return;
      }

      setIsCheckingLinear(true);
      try {
        const result = await window.electronAPI.checkLinearConnection(project.id);
        if (result.success && result.data) {
          setLinearConnectionStatus(result.data);
        }
      } catch {
        setLinearConnectionStatus({ connected: false, error: 'Failed to check connection' });
      } finally {
        setIsCheckingLinear(false);
      }
    };

    if (envConfig?.linearEnabled && envConfig.linearApiKey) {
      checkLinearConnection();
    }
  }, [envConfig?.linearEnabled, envConfig?.linearApiKey, project.id]);

  // Check GitHub connection when token/repo changes
  // Also updates the global GitHub store so other components (like GitHub Issues) see the change
  useEffect(() => {
    const checkGitHubConnection = async () => {
      if (!envConfig?.githubEnabled || !envConfig.githubToken || !envConfig.githubRepo) {
        setGitHubConnectionStatus(null);
        return;
      }

      setIsCheckingGitHub(true);
      try {
        // Use the global store action - it makes the API call AND updates the global store
        // This ensures the GitHub Issues page sees the updated status
        const status = await checkGitHubConnectionGlobal(project.id);
        if (status) {
          setGitHubConnectionStatus(status);
        }
      } catch {
        setGitHubConnectionStatus({ connected: false, error: 'Failed to check connection' });
      } finally {
        setIsCheckingGitHub(false);
      }
    };

    if (envConfig?.githubEnabled && envConfig.githubToken && envConfig.githubRepo) {
      checkGitHubConnection();
    }
  }, [envConfig?.githubEnabled, envConfig?.githubToken, envConfig?.githubRepo, project.id]);

  // Check GitLab connection when token/project changes
  useEffect(() => {
    const checkGitLabConnection = async () => {
      if (!envConfig?.gitlabEnabled || !envConfig.gitlabToken || !envConfig.gitlabProject) {
        setGitLabConnectionStatus(null);
        return;
      }

      setIsCheckingGitLab(true);
      try {
        const status = await window.electronAPI.checkGitLabConnection(project.id);
        if (status.success && status.data) {
          setGitLabConnectionStatus(status.data);
        }
      } catch {
        setGitLabConnectionStatus({ connected: false, error: 'Failed to check connection' });
      } finally {
        setIsCheckingGitLab(false);
      }
    };

    if (envConfig?.gitlabEnabled && envConfig.gitlabToken && envConfig.gitlabProject) {
      checkGitLabConnection();
    }
  }, [envConfig?.gitlabEnabled, envConfig?.gitlabToken, envConfig?.gitlabProject, project.id]);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleInitialize = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      const result = await initializeProject(project.id);
      if (result?.success) {
        const info = await checkProjectVersion(project.id);
        setVersionInfo(info);
        const envResult = await window.electronAPI.getProjectEnv(project.id);
        if (envResult.success && envResult.data) {
          setEnvConfig(envResult.data);
        }
      } else {
        setError(result?.error || 'Failed to initialize');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveEnv = async () => {
    if (!envConfig) return;

    setIsSavingEnv(true);
    setEnvError(null);
    try {
      const result = await window.electronAPI.updateProjectEnv(project.id, envConfig);
      if (!result.success) {
        setEnvError(result.error || 'Failed to save environment config');
      }
    } catch (err) {
      setEnvError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleClaudeSetup = async () => {
    setIsCheckingClaudeAuth(true);
    try {
      const result = await window.electronAPI.invokeClaudeSetup(project.id);
      if (result.success && result.data?.authenticated) {
        setClaudeAuthStatus('authenticated');
        const envResult = await window.electronAPI.getProjectEnv(project.id);
        if (envResult.success && envResult.data) {
          setEnvConfig(envResult.data);
        }
      }
    } catch {
      setClaudeAuthStatus('error');
    } finally {
      setIsCheckingClaudeAuth(false);
    }
  };

  const handleSave = async (onClose: () => void) => {
    setIsSaving(true);
    setError(null);

    try {
      const success = await updateProjectSettings(project.id, settings);
      if (!success) {
        setError('Failed to save settings');
        return;
      }

      if (envConfig) {
        const envResult = await window.electronAPI.updateProjectEnv(project.id, envConfig);
        if (!envResult.success) {
          setError(envResult.error || 'Failed to save environment config');
          return;
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateEnvConfig = async (updates: Partial<ProjectEnvConfig>) => {
    if (envConfig) {
      const newConfig = { ...envConfig, ...updates };

      // Save to backend FIRST so disk is updated before effects run
      try {
        const result = await window.electronAPI.updateProjectEnv(project.id, newConfig);
        if (!result.success) {
          console.error('[useProjectSettings] Failed to auto-save env config:', result.error);
        }
      } catch (err) {
        console.error('[useProjectSettings] Error auto-saving env config:', err);
      }

      // Then update local state (triggers effects that read from disk)
      setEnvConfig(newConfig);
    }
  };

  return {
    settings,
    setSettings,
    isSaving,
    error,
    setError,
    versionInfo,
    isCheckingVersion,
    isUpdating,
    envConfig,
    setEnvConfig,
    isLoadingEnv,
    envError,
    setEnvError,
    isSavingEnv,
    updateEnvConfig,
    showClaudeToken,
    setShowClaudeToken,
    showLinearKey,
    setShowLinearKey,
    showOpenAIKey,
    setShowOpenAIKey,
    showGitHubToken,
    setShowGitHubToken,
    expandedSections,
    toggleSection,
    gitHubConnectionStatus,
    isCheckingGitHub,
    showGitLabToken,
    setShowGitLabToken,
    gitLabConnectionStatus,
    isCheckingGitLab,
    isCheckingClaudeAuth,
    claudeAuthStatus,
    setClaudeAuthStatus,
    showLinearImportModal,
    setShowLinearImportModal,
    linearConnectionStatus,
    isCheckingLinear,
    handleInitialize,
    handleSaveEnv,
    handleClaudeSetup,
    handleSave
  };
}
