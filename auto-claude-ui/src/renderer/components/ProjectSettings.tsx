import { useState, useEffect } from 'react';
import {
  Settings2,
  Save,
  Loader2,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Key,
  ExternalLink,
  Eye,
  EyeOff,
  Database,
  Zap,
  ChevronDown,
  ChevronUp,
  Import,
  Radio,
  Github,
  Globe
} from 'lucide-react';
import { LinearTaskImportModal } from './LinearTaskImportModal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import { Separator } from './ui/separator';
import {
  updateProjectSettings,
  checkProjectVersion,
  initializeProject,
  updateProjectAutoBuild
} from '../stores/project-store';
import { AVAILABLE_MODELS, MEMORY_BACKENDS } from '../../shared/constants';
import type {
  Project,
  ProjectSettings as ProjectSettingsType,
  AutoBuildVersionInfo,
  ProjectEnvConfig,
  LinearSyncStatus,
  GitHubSyncStatus
} from '../../shared/types';

interface ProjectSettingsProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettings({ project, open, onOpenChange }: ProjectSettingsProps) {
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
  const [showFalkorPassword, setShowFalkorPassword] = useState(false);

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

    // Only check after env config is loaded and Linear is enabled with API key
    if (envConfig?.linearEnabled && envConfig.linearApiKey) {
      checkLinearConnection();
    }
  }, [envConfig?.linearEnabled, envConfig?.linearApiKey, project.id]);

  // Check GitHub connection when token/repo changes
  useEffect(() => {
    const checkGitHubConnection = async () => {
      if (!envConfig?.githubEnabled || !envConfig.githubToken || !envConfig.githubRepo) {
        setGitHubConnectionStatus(null);
        return;
      }

      setIsCheckingGitHub(true);
      try {
        const result = await window.electronAPI.checkGitHubConnection(project.id);
        if (result.success && result.data) {
          setGitHubConnectionStatus(result.data);
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

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleInitialize = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      const result = await initializeProject(project.id);
      if (result?.success) {
        // Refresh version info
        const info = await checkProjectVersion(project.id);
        setVersionInfo(info);
        // Load env config for newly initialized project
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

  const handleUpdate = async () => {
    setIsUpdating(true);
    setError(null);
    try {
      const result = await updateProjectAutoBuild(project.id);
      if (result?.success) {
        // Refresh version info
        const info = await checkProjectVersion(project.id);
        setVersionInfo(info);
      } else {
        setError(result?.error || 'Failed to update');
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
        // Refresh env config
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

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Save project settings
      const success = await updateProjectSettings(project.id, settings);
      if (!success) {
        setError('Failed to save settings');
        return;
      }

      // Save env config if loaded
      if (envConfig) {
        const envResult = await window.electronAPI.updateProjectEnv(project.id, envConfig);
        if (!envResult.success) {
          setError(envResult.error || 'Failed to save environment config');
          return;
        }
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const updateEnvConfig = (updates: Partial<ProjectEnvConfig>) => {
    if (envConfig) {
      setEnvConfig({ ...envConfig, ...updates });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Settings2 className="h-5 w-5" />
            Project Settings
          </DialogTitle>
          <DialogDescription>
            Configure settings for {project.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 -mx-6 overflow-y-auto">
          <div className="px-6 py-4 space-y-6">
            {/* Auto-Build Integration */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Auto-Build Integration</h3>
              {!project.autoBuildPath ? (
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">Not Initialized</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Initialize Auto-Build to enable task creation and agent workflows.
                      </p>
                      <Button
                        size="sm"
                        className="mt-3"
                        onClick={handleInitialize}
                        disabled={isUpdating}
                      >
                        {isUpdating ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Initializing...
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 h-4 w-4" />
                            Initialize Auto-Build
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium text-foreground">Initialized</span>
                    </div>
                    <code className="text-xs bg-background px-2 py-1 rounded">
                      {project.autoBuildPath}
                    </code>
                  </div>
                  {isCheckingVersion ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking status...
                    </div>
                  ) : versionInfo && (
                    <div className="text-xs text-muted-foreground">
                      {versionInfo.isInitialized ? 'Initialized' : 'Not initialized'}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Environment Configuration - Only show if initialized */}
            {project.autoBuildPath && (
              <>
                <Separator />

                {/* Claude Authentication Section */}
                <section className="space-y-3">
                  <button
                    onClick={() => toggleSection('claude')}
                    className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
                  >
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Claude Authentication
                      {claudeAuthStatus === 'authenticated' && (
                        <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
                          Connected
                        </span>
                      )}
                      {claudeAuthStatus === 'not_authenticated' && (
                        <span className="px-2 py-0.5 text-xs bg-warning/10 text-warning rounded-full">
                          Not Connected
                        </span>
                      )}
                    </div>
                    {expandedSections.claude ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {expandedSections.claude && (
                    <div className="space-y-4 pl-6 pt-2">
                      {isLoadingEnv ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading configuration...
                        </div>
                      ) : envConfig ? (
                        <>
                          {/* Claude CLI Status */}
                          <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">Claude CLI</p>
                                <p className="text-xs text-muted-foreground">
                                  {isCheckingClaudeAuth ? 'Checking...' :
                                    claudeAuthStatus === 'authenticated' ? 'Authenticated via OAuth' :
                                    claudeAuthStatus === 'not_authenticated' ? 'Not authenticated' :
                                    'Status unknown'}
                                </p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleClaudeSetup}
                                disabled={isCheckingClaudeAuth}
                              >
                                {isCheckingClaudeAuth ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    {claudeAuthStatus === 'authenticated' ? 'Re-authenticate' : 'Setup OAuth'}
                                  </>
                                )}
                              </Button>
                            </div>
                          </div>

                          {/* Manual OAuth Token */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium text-foreground">
                                OAuth Token {envConfig.claudeTokenIsGlobal ? '(Override)' : ''}
                              </Label>
                              {envConfig.claudeTokenIsGlobal && (
                                <span className="flex items-center gap-1 text-xs text-info">
                                  <Globe className="h-3 w-3" />
                                  Using global token
                                </span>
                              )}
                            </div>
                            {envConfig.claudeTokenIsGlobal ? (
                              <p className="text-xs text-muted-foreground">
                                Using token from App Settings. Enter a project-specific token below to override.
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Paste a token from <code className="px-1 bg-muted rounded">claude setup-token</code>
                              </p>
                            )}
                            <div className="relative">
                              <Input
                                type={showClaudeToken ? 'text' : 'password'}
                                placeholder={envConfig.claudeTokenIsGlobal ? 'Enter to override global token...' : 'your-oauth-token-here'}
                                value={envConfig.claudeTokenIsGlobal ? '' : (envConfig.claudeOAuthToken || '')}
                                onChange={(e) => updateEnvConfig({
                                  claudeOAuthToken: e.target.value || undefined,
                                  // When user enters a value, it's no longer global
                                })}
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowClaudeToken(!showClaudeToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showClaudeToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                        </>
                      ) : envError ? (
                        <p className="text-sm text-destructive">{envError}</p>
                      ) : null}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Linear Integration Section */}
                <section className="space-y-3">
                  <button
                    onClick={() => toggleSection('linear')}
                    className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Linear Integration
                      {envConfig?.linearEnabled && (
                        <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
                          Enabled
                        </span>
                      )}
                    </div>
                    {expandedSections.linear ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {expandedSections.linear && envConfig && (
                    <div className="space-y-4 pl-6 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="font-normal text-foreground">Enable Linear Sync</Label>
                          <p className="text-xs text-muted-foreground">
                            Create and update Linear issues automatically
                          </p>
                        </div>
                        <Switch
                          checked={envConfig.linearEnabled}
                          onCheckedChange={(checked) => updateEnvConfig({ linearEnabled: checked })}
                        />
                      </div>

                      {envConfig.linearEnabled && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">API Key</Label>
                            <p className="text-xs text-muted-foreground">
                              Get your API key from{' '}
                              <a
                                href="https://linear.app/settings/api"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-info hover:underline"
                              >
                                Linear Settings
                              </a>
                            </p>
                            <div className="relative">
                              <Input
                                type={showLinearKey ? 'text' : 'password'}
                                placeholder="lin_api_xxxxxxxx"
                                value={envConfig.linearApiKey || ''}
                                onChange={(e) => updateEnvConfig({ linearApiKey: e.target.value })}
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowLinearKey(!showLinearKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showLinearKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          {/* Connection Status */}
                          {envConfig.linearApiKey && (
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-foreground">Connection Status</p>
                                  <p className="text-xs text-muted-foreground">
                                    {isCheckingLinear ? 'Checking...' :
                                      linearConnectionStatus?.connected
                                        ? `Connected${linearConnectionStatus.teamName ? ` to ${linearConnectionStatus.teamName}` : ''}`
                                        : linearConnectionStatus?.error || 'Not connected'}
                                  </p>
                                  {linearConnectionStatus?.connected && linearConnectionStatus.issueCount !== undefined && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {linearConnectionStatus.issueCount}+ tasks available to import
                                    </p>
                                  )}
                                </div>
                                {isCheckingLinear ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : linearConnectionStatus?.connected ? (
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-warning" />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Import Existing Tasks Button */}
                          {linearConnectionStatus?.connected && (
                            <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                              <div className="flex items-start gap-3">
                                <Import className="h-5 w-5 text-info mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground">Import Existing Tasks</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Select which Linear issues to import into AutoBuild as tasks.
                                  </p>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-2"
                                    onClick={() => setShowLinearImportModal(true)}
                                  >
                                    <Import className="h-4 w-4 mr-2" />
                                    Import Tasks from Linear
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}

                          <Separator />

                          {/* Real-time Sync Toggle */}
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <Radio className="h-4 w-4 text-info" />
                                <Label className="font-normal text-foreground">Real-time Sync</Label>
                              </div>
                              <p className="text-xs text-muted-foreground pl-6">
                                Automatically import new tasks created in Linear
                              </p>
                            </div>
                            <Switch
                              checked={envConfig.linearRealtimeSync || false}
                              onCheckedChange={(checked) => updateEnvConfig({ linearRealtimeSync: checked })}
                            />
                          </div>

                          {envConfig.linearRealtimeSync && (
                            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 ml-6">
                              <p className="text-xs text-warning">
                                When enabled, new Linear issues will be automatically imported into AutoBuild.
                                Make sure to configure your team/project filters below to control which issues are imported.
                              </p>
                            </div>
                          )}

                          <Separator />

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">Team ID (Optional)</Label>
                              <Input
                                placeholder="Auto-detected"
                                value={envConfig.linearTeamId || ''}
                                onChange={(e) => updateEnvConfig({ linearTeamId: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">Project ID (Optional)</Label>
                              <Input
                                placeholder="Auto-created"
                                value={envConfig.linearProjectId || ''}
                                onChange={(e) => updateEnvConfig({ linearProjectId: e.target.value })}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>

                <Separator />

                {/* GitHub Integration Section */}
                <section className="space-y-3">
                  <button
                    onClick={() => toggleSection('github')}
                    className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
                  >
                    <div className="flex items-center gap-2">
                      <Github className="h-4 w-4" />
                      GitHub Integration
                      {envConfig?.githubEnabled && (
                        <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
                          Enabled
                        </span>
                      )}
                    </div>
                    {expandedSections.github ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {expandedSections.github && envConfig && (
                    <div className="space-y-4 pl-6 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="font-normal text-foreground">Enable GitHub Issues</Label>
                          <p className="text-xs text-muted-foreground">
                            Sync issues from GitHub and create tasks automatically
                          </p>
                        </div>
                        <Switch
                          checked={envConfig.githubEnabled}
                          onCheckedChange={(checked) => updateEnvConfig({ githubEnabled: checked })}
                        />
                      </div>

                      {envConfig.githubEnabled && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Personal Access Token</Label>
                            <p className="text-xs text-muted-foreground">
                              Create a token with <code className="px-1 bg-muted rounded">repo</code> scope from{' '}
                              <a
                                href="https://github.com/settings/tokens/new?scopes=repo&description=Auto-Build-UI"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-info hover:underline"
                              >
                                GitHub Settings
                              </a>
                            </p>
                            <div className="relative">
                              <Input
                                type={showGitHubToken ? 'text' : 'password'}
                                placeholder="ghp_xxxxxxxx or github_pat_xxxxxxxx"
                                value={envConfig.githubToken || ''}
                                onChange={(e) => updateEnvConfig({ githubToken: e.target.value })}
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowGitHubToken(!showGitHubToken)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showGitHubToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Repository</Label>
                            <p className="text-xs text-muted-foreground">
                              Format: <code className="px-1 bg-muted rounded">owner/repo</code> (e.g., facebook/react)
                            </p>
                            <Input
                              placeholder="owner/repository"
                              value={envConfig.githubRepo || ''}
                              onChange={(e) => updateEnvConfig({ githubRepo: e.target.value })}
                            />
                          </div>

                          {/* Connection Status */}
                          {envConfig.githubToken && envConfig.githubRepo && (
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-foreground">Connection Status</p>
                                  <p className="text-xs text-muted-foreground">
                                    {isCheckingGitHub ? 'Checking...' :
                                      gitHubConnectionStatus?.connected
                                        ? `Connected to ${gitHubConnectionStatus.repoFullName}`
                                        : gitHubConnectionStatus?.error || 'Not connected'}
                                  </p>
                                  {gitHubConnectionStatus?.connected && gitHubConnectionStatus.repoDescription && (
                                    <p className="text-xs text-muted-foreground mt-1 italic">
                                      {gitHubConnectionStatus.repoDescription}
                                    </p>
                                  )}
                                </div>
                                {isCheckingGitHub ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : gitHubConnectionStatus?.connected ? (
                                  <CheckCircle2 className="h-4 w-4 text-success" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-warning" />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Info about accessing issues */}
                          {gitHubConnectionStatus?.connected && (
                            <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                              <div className="flex items-start gap-3">
                                <Github className="h-5 w-5 text-info mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground">Issues Available</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Access GitHub Issues from the sidebar to view, investigate, and create tasks from issues.
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          <Separator />

                          {/* Auto-sync Toggle */}
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <RefreshCw className="h-4 w-4 text-info" />
                                <Label className="font-normal text-foreground">Auto-Sync on Load</Label>
                              </div>
                              <p className="text-xs text-muted-foreground pl-6">
                                Automatically fetch issues when the project loads
                              </p>
                            </div>
                            <Switch
                              checked={envConfig.githubAutoSync || false}
                              onCheckedChange={(checked) => updateEnvConfig({ githubAutoSync: checked })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Memory Backend Section */}
                <section className="space-y-3">
                  <button
                    onClick={() => toggleSection('graphiti')}
                    className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
                  >
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Memory Backend
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        envConfig?.graphitiEnabled
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {envConfig?.graphitiEnabled ? 'Graphiti' : 'File-based'}
                      </span>
                    </div>
                    {expandedSections.graphiti ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>

                  {expandedSections.graphiti && envConfig && (
                    <div className="space-y-4 pl-6 pt-2">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="font-normal text-foreground">Use Graphiti (Recommended)</Label>
                          <p className="text-xs text-muted-foreground">
                            Persistent cross-session memory using FalkorDB graph database
                          </p>
                        </div>
                        <Switch
                          checked={envConfig.graphitiEnabled}
                          onCheckedChange={(checked) => {
                            updateEnvConfig({ graphitiEnabled: checked });
                            // Also update project settings to match
                            setSettings({ ...settings, memoryBackend: checked ? 'graphiti' : 'file' });
                          }}
                        />
                      </div>

                      {!envConfig.graphitiEnabled && (
                        <div className="rounded-lg border border-border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">
                            Using file-based memory. Session insights are stored locally in JSON files.
                            Enable Graphiti for persistent cross-session memory with semantic search.
                          </p>
                        </div>
                      )}

                      {envConfig.graphitiEnabled && (
                        <>
                          <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                            <p className="text-xs text-warning">
                              Requires FalkorDB running. Start with:{' '}
                              <code className="px-1 bg-warning/10 rounded">docker-compose up -d falkordb</code>
                            </p>
                          </div>

                          {/* Graphiti MCP Server Toggle */}
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="font-normal text-foreground">Enable Agent Memory Access</Label>
                              <p className="text-xs text-muted-foreground">
                                Allow agents to search and add to the knowledge graph via MCP
                              </p>
                            </div>
                            <Switch
                              checked={settings.graphitiMcpEnabled}
                              onCheckedChange={(checked) =>
                                setSettings({ ...settings, graphitiMcpEnabled: checked })
                              }
                            />
                          </div>

                          {settings.graphitiMcpEnabled && (
                            <div className="space-y-2 ml-6">
                              <Label className="text-sm font-medium text-foreground">Graphiti MCP Server URL</Label>
                              <p className="text-xs text-muted-foreground">
                                URL of the Graphiti MCP server (requires Docker container)
                              </p>
                              <Input
                                placeholder="http://localhost:8000/mcp/"
                                value={settings.graphitiMcpUrl || ''}
                                onChange={(e) => setSettings({ ...settings, graphitiMcpUrl: e.target.value || undefined })}
                              />
                              <div className="rounded-lg border border-info/30 bg-info/5 p-3">
                                <p className="text-xs text-info">
                                  Start the MCP server with:{' '}
                                  <code className="px-1 bg-info/10 rounded">docker run -d -p 8000:8000 falkordb/graphiti-knowledge-graph-mcp</code>
                                </p>
                              </div>
                            </div>
                          )}

                          <Separator />

                          {/* LLM Provider Selection - V2 Multi-provider support */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">LLM Provider</Label>
                            <p className="text-xs text-muted-foreground">
                              Provider for graph operations (extraction, search, reasoning)
                            </p>
                            <Select
                              value={envConfig.graphitiProviderConfig?.llmProvider || 'openai'}
                              onValueChange={(value) => updateEnvConfig({
                                graphitiProviderConfig: {
                                  ...envConfig.graphitiProviderConfig,
                                  llmProvider: value as 'openai' | 'anthropic' | 'google' | 'groq',
                                }
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select LLM provider" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="openai">OpenAI (GPT-4o)</SelectItem>
                                <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                                <SelectItem value="google">Google (Gemini)</SelectItem>
                                <SelectItem value="groq">Groq (Llama)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Embedding Provider Selection */}
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Embedding Provider</Label>
                            <p className="text-xs text-muted-foreground">
                              Provider for semantic search embeddings
                            </p>
                            <Select
                              value={envConfig.graphitiProviderConfig?.embeddingProvider || 'openai'}
                              onValueChange={(value) => updateEnvConfig({
                                graphitiProviderConfig: {
                                  ...envConfig.graphitiProviderConfig,
                                  embeddingProvider: value as 'openai' | 'voyage' | 'google' | 'huggingface',
                                }
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select embedding provider" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="openai">OpenAI</SelectItem>
                                <SelectItem value="voyage">Voyage AI</SelectItem>
                                <SelectItem value="google">Google</SelectItem>
                                <SelectItem value="huggingface">HuggingFace (Local)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <Separator />

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label className="text-sm font-medium text-foreground">
                                OpenAI API Key {envConfig.openaiKeyIsGlobal ? '(Override)' : ''}
                              </Label>
                              {envConfig.openaiKeyIsGlobal && (
                                <span className="flex items-center gap-1 text-xs text-info">
                                  <Globe className="h-3 w-3" />
                                  Using global key
                                </span>
                              )}
                            </div>
                            {envConfig.openaiKeyIsGlobal ? (
                              <p className="text-xs text-muted-foreground">
                                Using key from App Settings. Enter a project-specific key below to override.
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Required when using OpenAI as LLM or embedding provider
                              </p>
                            )}
                            <div className="relative">
                              <Input
                                type={showOpenAIKey ? 'text' : 'password'}
                                placeholder={envConfig.openaiKeyIsGlobal ? 'Enter to override global key...' : 'sk-xxxxxxxx'}
                                value={envConfig.openaiKeyIsGlobal ? '' : (envConfig.openaiApiKey || '')}
                                onChange={(e) => updateEnvConfig({ openaiApiKey: e.target.value || undefined })}
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showOpenAIKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">FalkorDB Host</Label>
                              <Input
                                placeholder="localhost"
                                value={envConfig.graphitiFalkorDbHost || ''}
                                onChange={(e) => updateEnvConfig({ graphitiFalkorDbHost: e.target.value })}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">FalkorDB Port</Label>
                              <Input
                                type="number"
                                placeholder="6380"
                                value={envConfig.graphitiFalkorDbPort || ''}
                                onChange={(e) => updateEnvConfig({ graphitiFalkorDbPort: parseInt(e.target.value) || undefined })}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">FalkorDB Password (Optional)</Label>
                            <div className="relative">
                              <Input
                                type={showFalkorPassword ? 'text' : 'password'}
                                placeholder="Leave empty if none"
                                value={envConfig.graphitiFalkorDbPassword || ''}
                                onChange={(e) => updateEnvConfig({ graphitiFalkorDbPassword: e.target.value })}
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowFalkorPassword(!showFalkorPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showFalkorPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Database Name</Label>
                            <Input
                              placeholder="auto_build_memory"
                              value={envConfig.graphitiDatabase || ''}
                              onChange={(e) => updateEnvConfig({ graphitiDatabase: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </section>

                <Separator />
              </>
            )}

            {/* Agent Settings */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Agent Configuration</h3>
              <div className="space-y-2">
                <Label htmlFor="model" className="text-sm font-medium text-foreground">Model</Label>
                <Select
                  value={settings.model}
                  onValueChange={(value) => setSettings({ ...settings, model: value })}
                >
                  <SelectTrigger id="model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="font-normal text-foreground">Parallel Execution</Label>
                  <p className="text-xs text-muted-foreground">
                    Run multiple subtasks simultaneously
                  </p>
                </div>
                <Switch
                  checked={settings.parallelEnabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, parallelEnabled: checked })
                  }
                />
              </div>
              {settings.parallelEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="workers" className="text-sm font-medium text-foreground">Max Workers</Label>
                  <Input
                    id="workers"
                    type="number"
                    min={1}
                    max={8}
                    value={settings.maxWorkers}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        maxWorkers: parseInt(e.target.value) || 1
                      })
                    }
                  />
                </div>
              )}

            </section>

            <Separator />

            {/* Notifications */}
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">On Task Complete</Label>
                  <Switch
                    checked={settings.notifications.onTaskComplete}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          onTaskComplete: checked
                        }
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">On Task Failed</Label>
                  <Switch
                    checked={settings.notifications.onTaskFailed}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          onTaskFailed: checked
                        }
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">On Review Needed</Label>
                  <Switch
                    checked={settings.notifications.onReviewNeeded}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          onReviewNeeded: checked
                        }
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-normal text-foreground">Sound</Label>
                  <Switch
                    checked={settings.notifications.sound}
                    onCheckedChange={(checked) =>
                      setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          sound: checked
                        }
                      })
                    }
                  />
                </div>
              </div>
            </section>

            {/* Error */}
            {(error || envError) && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {error || envError}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isSavingEnv}>
            {isSaving || isSavingEnv ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Linear Task Import Modal */}
      <LinearTaskImportModal
        projectId={project.id}
        open={showLinearImportModal}
        onOpenChange={setShowLinearImportModal}
        onImportComplete={(result) => {
          // Optionally refresh or notify
          console.log('Import complete:', result);
        }}
      />
    </Dialog>
  );
}
