import { useState, useEffect } from 'react';
import { Github, RefreshCw, KeyRound, Loader2, CheckCircle2, AlertCircle, User, Lock, Globe, ChevronDown } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Separator } from '../../ui/separator';
import { Button } from '../../ui/button';
import { GitHubOAuthFlow } from '../../project-settings/GitHubOAuthFlow';
import { PasswordInput } from '../../project-settings/PasswordInput';
import type { ProjectEnvConfig, GitHubSyncStatus } from '../../../../shared/types';

// Debug logging
const DEBUG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[GitHubIntegration] ${message}`, data);
    } else {
      console.warn(`[GitHubIntegration] ${message}`);
    }
  }
}

interface GitHubRepo {
  fullName: string;
  description: string | null;
  isPrivate: boolean;
}

interface GitHubIntegrationProps {
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  showGitHubToken: boolean;
  setShowGitHubToken: React.Dispatch<React.SetStateAction<boolean>>;
  gitHubConnectionStatus: GitHubSyncStatus | null;
  isCheckingGitHub: boolean;
}

/**
 * GitHub integration settings component.
 * Manages GitHub token (manual or OAuth), repository configuration, and connection status.
 */
export function GitHubIntegration({
  envConfig,
  updateEnvConfig,
  showGitHubToken: _showGitHubToken,
  setShowGitHubToken: _setShowGitHubToken,
  gitHubConnectionStatus,
  isCheckingGitHub
}: GitHubIntegrationProps) {
  const [authMode, setAuthMode] = useState<'manual' | 'oauth' | 'oauth-success'>('manual');
  const [oauthUsername, setOauthUsername] = useState<string | null>(null);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  debugLog('Render - authMode:', authMode);
  debugLog('Render - envConfig:', envConfig ? { githubEnabled: envConfig.githubEnabled, hasToken: !!envConfig.githubToken } : null);

  // Fetch repos when entering oauth-success mode
  useEffect(() => {
    if (authMode === 'oauth-success') {
      fetchUserRepos();
    }
  }, [authMode]);

  const fetchUserRepos = async () => {
    debugLog('Fetching user repositories...');
    setIsLoadingRepos(true);
    setReposError(null);

    try {
      const result = await window.electronAPI.listGitHubUserRepos();
      debugLog('listGitHubUserRepos result:', result);

      if (result.success && result.data?.repos) {
        setRepos(result.data.repos);
        debugLog('Loaded repos:', result.data.repos.length);
      } else {
        setReposError(result.error || 'Failed to load repositories');
      }
    } catch (err) {
      debugLog('Error fetching repos:', err);
      setReposError(err instanceof Error ? err.message : 'Failed to load repositories');
    } finally {
      setIsLoadingRepos(false);
    }
  };

  if (!envConfig) {
    debugLog('No envConfig, returning null');
    return null;
  }

  const handleOAuthSuccess = (token: string, username?: string) => {
    debugLog('handleOAuthSuccess called with token length:', token.length);
    debugLog('OAuth username:', username);

    // Update the token
    updateEnvConfig({ githubToken: token });

    // Show success state with username
    setOauthUsername(username || null);
    setAuthMode('oauth-success');
  };

  const handleSwitchToManual = () => {
    setAuthMode('manual');
    setOauthUsername(null);
  };

  const handleSwitchToOAuth = () => {
    setAuthMode('oauth');
  };

  const handleSelectRepo = (repoFullName: string) => {
    debugLog('Selected repo:', repoFullName);
    updateEnvConfig({ githubRepo: repoFullName });
  };

  return (
    <div className="space-y-4">
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
          {/* OAuth Success State */}
          {authMode === 'oauth-success' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-success/30 bg-success/10 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-sm font-medium text-success">Connected via GitHub CLI</p>
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

              {/* Repository Dropdown */}
              <RepositoryDropdown
                repos={repos}
                selectedRepo={envConfig.githubRepo || ''}
                isLoading={isLoadingRepos}
                error={reposError}
                onSelect={handleSelectRepo}
                onRefresh={fetchUserRepos}
                onManualEntry={() => setAuthMode('manual')}
              />
            </div>
          )}

          {/* OAuth Flow */}
          {authMode === 'oauth' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-foreground">GitHub Authentication</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSwitchToManual}
                >
                  Use Manual Token
                </Button>
              </div>
              <GitHubOAuthFlow
                onSuccess={handleOAuthSuccess}
                onCancel={handleSwitchToManual}
              />
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
                <PasswordInput
                  value={envConfig.githubToken || ''}
                  onChange={(value) => updateEnvConfig({ githubToken: value })}
                  placeholder="ghp_xxxxxxxx or github_pat_xxxxxxxx"
                />
              </div>

              <RepositoryInput
                value={envConfig.githubRepo || ''}
                onChange={(value) => updateEnvConfig({ githubRepo: value })}
              />
            </>
          )}

          {envConfig.githubToken && envConfig.githubRepo && (
            <ConnectionStatus
              isChecking={isCheckingGitHub}
              connectionStatus={gitHubConnectionStatus}
            />
          )}

          {gitHubConnectionStatus?.connected && <IssuesAvailableInfo />}

          <Separator />

          <AutoSyncToggle
            enabled={envConfig.githubAutoSync || false}
            onToggle={(checked) => updateEnvConfig({ githubAutoSync: checked })}
          />
        </>
      )}
    </div>
  );
}

interface RepositoryDropdownProps {
  repos: GitHubRepo[];
  selectedRepo: string;
  isLoading: boolean;
  error: string | null;
  onSelect: (repoFullName: string) => void;
  onRefresh: () => void;
  onManualEntry: () => void;
}

function RepositoryDropdown({
  repos,
  selectedRepo,
  isLoading,
  error,
  onSelect,
  onRefresh,
  onManualEntry
}: RepositoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const filteredRepos = repos.filter(repo =>
    repo.fullName.toLowerCase().includes(filter.toLowerCase()) ||
    (repo.description?.toLowerCase().includes(filter.toLowerCase()))
  );

  const selectedRepoData = repos.find(r => r.fullName === selectedRepo);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium text-foreground">Repository</Label>
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
              Loading repositories...
            </span>
          ) : selectedRepo ? (
            <span className="flex items-center gap-2">
              {selectedRepoData?.isPrivate ? (
                <Lock className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground" />
              )}
              {selectedRepo}
            </span>
          ) : (
            <span className="text-muted-foreground">Select a repository...</span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && !isLoading && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-hidden">
            {/* Search filter */}
            <div className="p-2 border-b border-border">
              <Input
                placeholder="Search repositories..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-8 text-sm"
                autoFocus
              />
            </div>

            {/* Repository list */}
            <div className="max-h-48 overflow-y-auto">
              {filteredRepos.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {filter ? 'No matching repositories' : 'No repositories found'}
                </div>
              ) : (
                filteredRepos.map((repo) => (
                  <button
                    key={repo.fullName}
                    type="button"
                    onClick={() => {
                      onSelect(repo.fullName);
                      setIsOpen(false);
                      setFilter('');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-accent flex items-start gap-2 ${
                      repo.fullName === selectedRepo ? 'bg-accent' : ''
                    }`}
                  >
                    {repo.isPrivate ? (
                      <Lock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    ) : (
                      <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{repo.fullName}</p>
                      {repo.description && (
                        <p className="text-xs text-muted-foreground truncate">{repo.description}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedRepo && (
        <p className="text-xs text-muted-foreground">
          Selected: <code className="px-1 bg-muted rounded">{selectedRepo}</code>
        </p>
      )}
    </div>
  );
}

interface RepositoryInputProps {
  value: string;
  onChange: (value: string) => void;
}

function RepositoryInput({ value, onChange }: RepositoryInputProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">Repository</Label>
      <p className="text-xs text-muted-foreground">
        Format: <code className="px-1 bg-muted rounded">owner/repo</code> (e.g., facebook/react)
      </p>
      <Input
        placeholder="owner/repository"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface ConnectionStatusProps {
  isChecking: boolean;
  connectionStatus: GitHubSyncStatus | null;
}

function ConnectionStatus({ isChecking, connectionStatus }: ConnectionStatusProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Connection Status</p>
          <p className="text-xs text-muted-foreground">
            {isChecking ? 'Checking...' :
              connectionStatus?.connected
                ? `Connected to ${connectionStatus.repoFullName}`
                : connectionStatus?.error || 'Not connected'}
          </p>
          {connectionStatus?.connected && connectionStatus.repoDescription && (
            <p className="text-xs text-muted-foreground mt-1 italic">
              {connectionStatus.repoDescription}
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

function IssuesAvailableInfo() {
  return (
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
  );
}

interface AutoSyncToggleProps {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}

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
