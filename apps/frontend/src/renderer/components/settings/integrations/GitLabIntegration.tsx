import { useState, useEffect } from 'react';
import { RefreshCw, KeyRound, Loader2, CheckCircle2, AlertCircle, User, Lock, Globe, ChevronDown, GitBranch, Server } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Separator } from '../../ui/separator';
import { Button } from '../../ui/button';
import { PasswordInput } from '../../project-settings/PasswordInput';
import type { ProjectEnvConfig, GitLabSyncStatus } from '../../../../shared/types';

// Debug logging
const DEBUG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
/**
 * Conditionally emits debug messages to the console when debug mode is enabled.
 *
 * @param message - Textual message describing the event or state to log
 * @param data - Optional supplemental value to log alongside the message
 */
function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[GitLabIntegration] ${message}`, data);
    } else {
      console.warn(`[GitLabIntegration] ${message}`);
    }
  }
}

interface GitLabProject {
  pathWithNamespace: string;
  description: string | null;
  visibility: string;
}

interface GitLabIntegrationProps {
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  showGitLabToken: boolean;
  setShowGitLabToken: React.Dispatch<React.SetStateAction<boolean>>;
  gitLabConnectionStatus: GitLabSyncStatus | null;
  isCheckingGitLab: boolean;
  projectPath?: string;
}

/**
 * Render the GitLab integration settings UI, including authentication (manual token or OAuth), project selection, branch selection, and connection status.
 *
 * @param props - GitLabIntegrationProps containing current environment config and callbacks to update it, token visibility controls, connection status, loading flags, and optional project path.
 */
export function GitLabIntegration({
  envConfig,
  updateEnvConfig,
  showGitLabToken: _showGitLabToken,
  setShowGitLabToken: _setShowGitLabToken,
  gitLabConnectionStatus,
  isCheckingGitLab,
  projectPath
}: GitLabIntegrationProps) {
  const [authMode, setAuthMode] = useState<'manual' | 'oauth' | 'oauth-success'>('manual');
  const [oauthUsername, setOauthUsername] = useState<string | null>(null);
  const [projects, setProjects] = useState<GitLabProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // Branch selection state
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  debugLog('Render - authMode:', authMode);
  debugLog('Render - projectPath:', projectPath);
  debugLog('Render - envConfig:', envConfig ? { gitlabEnabled: envConfig.gitlabEnabled, hasToken: !!envConfig.gitlabToken, defaultBranch: envConfig.defaultBranch } : null);

  // Fetch projects when entering oauth-success mode
  useEffect(() => {
    if (authMode === 'oauth-success') {
      fetchUserProjects();
    }
  }, [authMode]);

  // Fetch branches when GitLab is enabled and project path is available
  useEffect(() => {
    debugLog(`useEffect[branches] - gitlabEnabled: ${envConfig?.gitlabEnabled}, projectPath: ${projectPath}`);
    if (envConfig?.gitlabEnabled && projectPath) {
      debugLog('useEffect[branches] - Triggering fetchBranches');
      fetchBranches();
    } else {
      debugLog('useEffect[branches] - Skipping fetchBranches (conditions not met)');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envConfig?.gitlabEnabled, projectPath]);

  const fetchBranches = async () => {
    if (!projectPath) {
      debugLog('fetchBranches: No projectPath, skipping');
      return;
    }

    debugLog('fetchBranches: Starting with projectPath:', projectPath);
    setIsLoadingBranches(true);
    setBranchesError(null);

    try {
      debugLog('fetchBranches: Calling getGitBranches...');
      const result = await window.electronAPI.getGitBranches(projectPath);
      debugLog('fetchBranches: getGitBranches result:', { success: result.success, dataType: typeof result.data, dataLength: Array.isArray(result.data) ? result.data.length : 'N/A', error: result.error });

      if (result.success && result.data) {
        setBranches(result.data);
        debugLog('fetchBranches: Loaded branches:', result.data.length);

        // Auto-detect default branch if not set
        if (!envConfig?.defaultBranch) {
          debugLog('fetchBranches: No defaultBranch set, auto-detecting...');
          const detectResult = await window.electronAPI.detectMainBranch(projectPath);
          debugLog('fetchBranches: detectMainBranch result:', detectResult);
          if (detectResult.success && detectResult.data) {
            debugLog('fetchBranches: Auto-detected default branch:', detectResult.data);
            updateEnvConfig({ defaultBranch: detectResult.data });
          }
        }
      } else {
        debugLog('fetchBranches: Failed -', result.error || 'No data returned');
        setBranchesError(result.error || 'Failed to load branches');
      }
    } catch (err) {
      debugLog('fetchBranches: Exception:', err);
      setBranchesError(err instanceof Error ? err.message : 'Failed to load branches');
    } finally {
      setIsLoadingBranches(false);
    }
  };

  const fetchUserProjects = async () => {
    debugLog('Fetching user projects...');
    setIsLoadingProjects(true);
    setProjectsError(null);

    try {
      const hostname = envConfig?.gitlabInstanceUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const result = await window.electronAPI.listGitLabUserProjects(hostname);
      debugLog('listGitLabUserProjects result:', result);

      if (result.success && result.data?.projects) {
        setProjects(result.data.projects);
        debugLog('Loaded projects:', result.data.projects.length);
      } else {
        setProjectsError(result.error || 'Failed to load projects');
      }
    } catch (err) {
      debugLog('Error fetching projects:', err);
      setProjectsError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  if (!envConfig) {
    debugLog('No envConfig, returning null');
    return null;
  }

  const handleOAuthSuccess = async () => {
    debugLog('handleOAuthSuccess called');

    try {
      const hostname = envConfig?.gitlabInstanceUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const tokenResult = await window.electronAPI.getGitLabToken(hostname);
      if (tokenResult.success && tokenResult.data?.token) {
        updateEnvConfig({ gitlabToken: tokenResult.data.token });
      }

      const userResult = await window.electronAPI.getGitLabUser(hostname);
      if (userResult.success && userResult.data?.username) {
        setOauthUsername(userResult.data.username);
      }

      setAuthMode('oauth-success');
    } catch (err) {
      debugLog('Error in OAuth success:', err);
    }
  };

  const handleStartOAuth = async () => {
    const hostname = envConfig?.gitlabInstanceUrl?.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const result = await window.electronAPI.startGitLabAuth(hostname);

    if (result.success) {
      // Poll for auth completion
      const checkAuth = async () => {
        const authResult = await window.electronAPI.checkGitLabAuth(hostname);
        if (authResult.success && authResult.data?.authenticated) {
          handleOAuthSuccess();
        } else {
          // Retry after delay
          setTimeout(checkAuth, 2000);
        }
      };
      setTimeout(checkAuth, 3000);
    }
  };

  const handleSwitchToManual = () => {
    setAuthMode('manual');
    setOauthUsername(null);
  };

  const handleSwitchToOAuth = () => {
    setAuthMode('oauth');
    handleStartOAuth();
  };

  const handleSelectProject = (projectPath: string) => {
    debugLog('Selected project:', projectPath);
    updateEnvConfig({ gitlabProject: projectPath });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="font-normal text-foreground">Enable GitLab Issues</Label>
          <p className="text-xs text-muted-foreground">
            Sync issues from GitLab and create tasks automatically
          </p>
        </div>
        <Switch
          checked={envConfig.gitlabEnabled}
          onCheckedChange={(checked) => updateEnvConfig({ gitlabEnabled: checked })}
        />
      </div>

      {envConfig.gitlabEnabled && (
        <>
          {/* Instance URL */}
          <InstanceUrlInput
            value={envConfig.gitlabInstanceUrl || 'https://gitlab.com'}
            onChange={(value) => updateEnvConfig({ gitlabInstanceUrl: value })}
          />

          {/* OAuth Success State */}
          {authMode === 'oauth-success' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-success/30 bg-success/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-sm font-medium text-success">Connected via GitLab CLI</p>
                      {oauthUsername && (
                        <p className="text-xs text-success/80 flex items-center gap-1 mt-0.5">
                          <User className="h-3 w-3" />
                          Authenticated as {oauthUsername}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSwitchToManual}
                    className="text-xs"
                  >
                    Use Different Token
                  </Button>
                </div>
              </div>

              {/* Project Dropdown */}
              <ProjectDropdown
                projects={projects}
                selectedProject={envConfig.gitlabProject || ''}
                isLoading={isLoadingProjects}
                error={projectsError}
                onSelect={handleSelectProject}
                onRefresh={fetchUserProjects}
                onManualEntry={() => setAuthMode('manual')}
              />
            </div>
          )}

          {/* OAuth Flow */}
          {authMode === 'oauth' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">GitLab Authentication</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSwitchToManual}
                >
                  Use Manual Token
                </Button>
              </div>
              <div className="rounded-lg border border-info/30 bg-info/10 p-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 text-info animate-spin" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Authenticating with glab CLI...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      A browser window should open for you to log in.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manual Token Entry */}
          {authMode === 'manual' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground">Personal Access Token</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSwitchToOAuth}
                    className="gap-2"
                  >
                    <KeyRound className="h-3 w-3" />
                    Use OAuth Instead
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Create a token with <code className="px-1 bg-muted rounded">api</code> scope from{' '}
                  <a
                    href={`${envConfig.gitlabInstanceUrl || 'https://gitlab.com'}/-/user_settings/personal_access_tokens`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-info hover:underline"
                  >
                    GitLab Settings
                  </a>
                </p>
                <PasswordInput
                  value={envConfig.gitlabToken || ''}
                  onChange={(value) => updateEnvConfig({ gitlabToken: value })}
                  placeholder="glpat-xxxxxxxxxxxxxxxxxxxx"
                />
              </div>

              <ProjectInput
                value={envConfig.gitlabProject || ''}
                onChange={(value) => updateEnvConfig({ gitlabProject: value })}
              />
            </>
          )}

          {envConfig.gitlabToken && envConfig.gitlabProject && (
            <ConnectionStatus
              isChecking={isCheckingGitLab}
              connectionStatus={gitLabConnectionStatus}
            />
          )}

          {gitLabConnectionStatus?.connected && <IssuesAvailableInfo />}

          <Separator />

          {/* Default Branch Selector */}
          {projectPath && (
            <BranchSelector
              branches={branches}
              selectedBranch={envConfig.defaultBranch || ''}
              isLoading={isLoadingBranches}
              error={branchesError}
              onSelect={(branch) => updateEnvConfig({ defaultBranch: branch })}
              onRefresh={fetchBranches}
            />
          )}

          <Separator />

          <AutoSyncToggle
            enabled={envConfig.gitlabAutoSync || false}
            onToggle={(checked) => updateEnvConfig({ gitlabAutoSync: checked })}
          />
        </>
      )}
    </div>
  );
}

interface InstanceUrlInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Renders an input control for configuring the GitLab instance URL.
 *
 * @param value - The current GitLab instance URL (e.g., `https://gitlab.com`) or an empty string.
 * @param onChange - Callback invoked with the new URL when the input changes.
 * @returns The rendered input element for configuring the GitLab instance URL.
 */
function InstanceUrlInput({ value, onChange }: InstanceUrlInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium text-foreground">GitLab Instance</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        Use <code className="px-1 bg-muted rounded">https://gitlab.com</code> or your self-hosted instance URL
      </p>
      <Input
        placeholder="https://gitlab.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface ProjectDropdownProps {
  projects: GitLabProject[];
  selectedProject: string;
  isLoading: boolean;
  error: string | null;
  onSelect: (projectPath: string) => void;
  onRefresh: () => void;
  onManualEntry: () => void;
}

/**
 * Renders a searchable dropdown to choose a GitLab project with refresh and manual-entry options.
 *
 * Displays the currently selected project (with visibility icon), a refresh button, an "Enter Manually" action,
 * and a dropdown that shows searchable project results. Handles loading and error states and exposes callbacks
 * for selecting a project, refreshing the project list, and switching to manual entry.
 *
 * @param projects - List of available GitLab projects to show in the dropdown.
 * @param selectedProject - The currently selected project's pathWithNamespace, if any.
 * @param isLoading - When true, the component shows a loading state and disables interactions.
 * @param error - Optional error message to display above the dropdown.
 * @param onSelect - Callback invoked with the selected project's pathWithNamespace.
 * @param onRefresh - Callback invoked when the refresh button is clicked.
 * @param onManualEntry - Callback invoked when the user chooses to enter a project manually.
 * @returns The project selection dropdown element.
 */
function ProjectDropdown({
  projects,
  selectedProject,
  isLoading,
  error,
  onSelect,
  onRefresh,
  onManualEntry
}: ProjectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filteredProjects = projects.filter(project =>
    project.pathWithNamespace.toLowerCase().includes(filter.toLowerCase()) ||
    (project.description?.toLowerCase().includes(filter.toLowerCase()))
  );

  const selectedProjectData = projects.find(p => p.pathWithNamespace === selectedProject);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">Project</Label>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            className="h-7 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onManualEntry}
            className="h-7 text-xs"
          >
            Enter Manually
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading projects...
            </span>
          ) : selectedProject ? (
            <span className="flex items-center gap-2">
              {selectedProjectData?.visibility === 'private' ? (
                <Lock className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground" />
              )}
              {selectedProject}
            </span>
          ) : (
            <span className="text-muted-foreground">Select a project...</span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && !isLoading && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                placeholder="Search projects..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            <div className="max-h-48 overflow-y-auto">
              {filteredProjects.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {filter ? 'No matching projects' : 'No projects found'}
                </div>
              ) : (
                filteredProjects.map((project) => (
                  <button
                    key={project.pathWithNamespace}
                    type="button"
                    onClick={() => {
                      onSelect(project.pathWithNamespace);
                      setIsOpen(false);
                      setFilter('');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2 ${
                      project.pathWithNamespace === selectedProject ? 'bg-accent' : ''
                    }`}
                  >
                    {project.visibility === 'private' ? (
                      <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{project.pathWithNamespace}</p>
                      {project.description && (
                        <p className="text-xs text-muted-foreground truncate">{project.description}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedProject && (
        <p className="text-xs text-muted-foreground">
          Selected: <code className="px-1 bg-muted rounded">{selectedProject}</code>
        </p>
      )}
    </div>
  );
}

interface ProjectInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Renders an input for specifying a GitLab project path in "group/project" format.
 *
 * @param value - Current project path (e.g., `gitlab-org/gitlab`)
 * @param onChange - Callback invoked with the new project path when the input changes
 * @returns The controlled input UI for entering a GitLab project identifier
 */
function ProjectInput({ value, onChange }: ProjectInputProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">Project</Label>
      <p className="text-xs text-muted-foreground">
        Format: <code className="px-1 bg-muted rounded">group/project</code> (e.g., gitlab-org/gitlab)
      </p>
      <Input
        placeholder="group/project"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface ConnectionStatusProps {
  isChecking: boolean;
  connectionStatus: GitLabSyncStatus | null;
}

/**
 * Render a compact connection status panel for the GitLab integration.
 *
 * Displays a title, a short status line that shows "Checking..." while a check is in progress,
 * the connected project path when connected, or an error / "Not connected" message otherwise.
 *
 * @param props.isChecking - Whether a connection check is currently in progress; when `true` the panel shows a loading indicator and "Checking...".
 * @param props.connectionStatus - Connection details used to populate the status line:
 *   - when `.connected` is `true`, `.projectPathWithNamespace` is shown and optional `.projectDescription` is displayed below;
 *   - when `.connected` is `false`, `.error` (if present) is shown, otherwise "Not connected" is displayed.
 * @returns The rendered connection status UI block.
 */
function ConnectionStatus({ isChecking, connectionStatus }: ConnectionStatusProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Connection Status</p>
          <p className="text-xs text-muted-foreground">
            {isChecking ? 'Checking...' :
              connectionStatus?.connected
                ? `Connected to ${connectionStatus.projectPathWithNamespace}`
                : connectionStatus?.error || 'Not connected'}
          </p>
          {connectionStatus?.connected && connectionStatus.projectDescription && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {connectionStatus.projectDescription}
            </p>
          )}
        </div>
        {isChecking ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : connectionStatus?.connected ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertCircle className="h-4 w-4 text-warning" />
        )}
      </div>
    </div>
  );
}

/**
 * Displays an informational panel that indicates GitLab Issues are available and how to access them.
 *
 * @returns A React element rendering an informational block about accessing GitLab Issues from the sidebar.
 */
function IssuesAvailableInfo() {
  return (
    <div className="rounded-lg border border-info/30 bg-info/5 p-3">
      <div className="flex items-start gap-3">
        <svg className="h-5 w-5 text-info mt-0.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Issues Available</p>
          <p className="text-xs text-muted-foreground mt-1">
            Access GitLab Issues from the sidebar to view, investigate, and create tasks from issues.
          </p>
        </div>
      </div>
    </div>
  );
}

interface AutoSyncToggleProps {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}

/**
 * Render a labeled toggle that controls automatic issue synchronization when a project loads.
 *
 * @param enabled - Whether auto-sync is currently enabled
 * @param onToggle - Callback invoked with the new checked state when the toggle changes
 */
function AutoSyncToggle({ enabled, onToggle }: AutoSyncToggleProps) {
  return (
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
      <Switch checked={enabled} onCheckedChange={onToggle} />
    </div>
  );
}

interface BranchSelectorProps {
  branches: string[];
  selectedBranch: string;
  isLoading: boolean;
  error: string | null;
  onSelect: (branch: string) => void;
  onRefresh: () => void;
}

/**
 * Render a searchable dropdown UI for selecting the repository default branch.
 *
 * Renders the current selection (or an auto-detect option), a refresh control, loading and error states, and a searchable list of branches.
 *
 * @param branches - Available branch names to display in the list.
 * @param selectedBranch - Currently selected branch name; empty string or undefined indicates auto-detect (main/master).
 * @param isLoading - When true, disables interactions and shows a loading state.
 * @param error - Optional error message to show beneath the label.
 * @param onSelect - Callback invoked with the chosen branch name (empty string to select auto-detect).
 * @param onRefresh - Callback invoked when the refresh button is pressed to reload branch data.
 * @returns The branch selector React element.
 */
function BranchSelector({
  branches,
  selectedBranch,
  isLoading,
  error,
  onSelect,
  onRefresh
}: BranchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filteredBranches = branches.filter(branch =>
    branch.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-info" />
            <Label className="text-sm font-medium text-foreground">Default Branch</Label>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            Base branch for creating task worktrees
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="h-7 px-2"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-destructive pl-6">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
      )}

      <div className="relative pl-6">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={isLoading}
          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-md bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading branches...
            </span>
          ) : selectedBranch ? (
            <span className="flex items-center gap-2">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              {selectedBranch}
            </span>
          ) : (
            <span className="text-muted-foreground">Auto-detect (main/master)</span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && !isLoading && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                placeholder="Search branches..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            <button
              type="button"
              onClick={() => {
                onSelect('');
                setIsOpen(false);
                setFilter('');
              }}
              className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 ${
                !selectedBranch ? 'bg-accent' : ''
              }`}
            >
              <span className="text-sm text-muted-foreground italic">Auto-detect (main/master)</span>
            </button>

            <div className="max-h-40 overflow-y-auto border-t border-border">
              {filteredBranches.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {filter ? 'No matching branches' : 'No branches found'}
                </div>
              ) : (
                filteredBranches.map((branch) => (
                  <button
                    key={branch}
                    type="button"
                    onClick={() => {
                      onSelect(branch);
                      setIsOpen(false);
                      setFilter('');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 ${
                      branch === selectedBranch ? 'bg-accent' : ''
                    }`}
                  >
                    <GitBranch className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm">{branch}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedBranch && (
        <p className="text-xs text-muted-foreground pl-6">
          All new tasks will branch from <code className="px-1 bg-muted rounded">{selectedBranch}</code>
        </p>
      )}
    </div>
  );
}