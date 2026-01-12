/**
 * ProviderIntegration Component
 * ==============================
 *
 * Unified component for git provider integration (GitHub, GitLab, etc.).
 * Replaces the separate GitHubIntegration and GitLabIntegration components.
 */

import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Button } from '../../ui/button';
import { PasswordInput } from '../../project-settings/PasswordInput';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import type { ProjectEnvConfig, ProjectSettings } from '../../../../shared/types';
import { useProviderIntegration } from '../../../lib/providers/useProviderIntegration';
import { PROVIDER_METADATA, type ProviderType } from '../../../lib/providers/types';

interface ProviderIntegrationProps {
  provider: ProviderType;
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  showToken: boolean;
  setShowToken: React.Dispatch<React.SetStateAction<boolean>>;
  projectPath?: string;
  settings?: ProjectSettings;
  setSettings?: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}

export function ProviderIntegration({
  provider,
  envConfig,
  updateEnvConfig,
  showToken,
  setShowToken,
  projectPath,
  settings,
  setSettings,
}: ProviderIntegrationProps) {
  const { t } = useTranslation(['settings', 'common']);
  const metadata = PROVIDER_METADATA[provider];

  const {
    providerConfig,
    cliInstalled,
    cliVersion,
    isCheckingCli,
    isInstallingCli,
    cliInstallSuccess,
    cliAuthenticated,
    cliAuthUsername,
    authMode,
    oauthUsername,
    repositories,
    isLoadingRepositories,
    repositoriesError,
    branches,
    isLoadingBranches,
    branchesError,
    checkCli,
    installCli,
    switchToManual,
    switchToOAuth,
    fetchBranches,
    selectRepository,
    selectBranch,
  } = useProviderIntegration({
    provider,
    envConfig,
    updateEnvConfig,
    projectPath,
  });

  if (!envConfig) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
        <p className="text-sm text-muted-foreground">Loading configuration...</p>
      </div>
    );
  }

  const selectedRepo = provider === 'github' ? envConfig.githubRepo : envConfig.gitlabProject;
  const selectedBranch = settings?.mainBranch || envConfig.defaultBranch || 'main';

  return (
    <div className="space-y-4">
      {/* Enable Provider Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">
            {metadata.icon} Enable {metadata.displayName} Issues
          </div>
          <div className="text-xs text-muted-foreground">
            Sync issues from {metadata.displayName} and create tasks automatically
          </div>
        </div>
        <Switch
          checked={providerConfig.enabled}
          onCheckedChange={(checked) => {
            console.log(`[ProviderIntegration] Toggle ${provider} integration:`, checked);
            const updates = {
              [provider === 'github' ? 'githubEnabled' : 'gitlabEnabled']: checked,
            };
            console.log(`[ProviderIntegration] Calling updateEnvConfig with:`, updates);
            updateEnvConfig(updates);
          }}
        />
      </div>

      {providerConfig.enabled && (
        <>
          {/* Instance URL (for providers that support custom instances) */}
          {metadata.instanceUrl.supportsCustom && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {metadata.displayName} Instance
              </Label>
              <p className="text-xs text-muted-foreground">
                Use {metadata.instanceUrl.default} or your self-hosted instance URL
              </p>
              <Input
                type="url"
                placeholder={metadata.instanceUrl.default}
                value={
                  provider === 'gitlab'
                    ? envConfig.gitlabInstanceUrl || metadata.instanceUrl.default
                    : metadata.instanceUrl.default
                }
                onChange={(e) => {
                  if (provider === 'gitlab') {
                    updateEnvConfig({ gitlabInstanceUrl: e.target.value });
                  }
                }}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* OAuth Success State */}
          {authMode === 'oauth-success' && (
            <div className="rounded-lg border border-success/30 bg-success/10 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <div>
                    <p className="text-sm font-medium text-success">
                      Connected via {metadata.displayName} CLI
                    </p>
                    {oauthUsername && (
                      <p className="text-xs text-success/80 mt-0.5">
                        Authenticated as {oauthUsername}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={switchToManual}>
                  Use Manual Token
                </Button>
              </div>

              {/* Repository Selection */}
              <div className="mt-4 space-y-2">
                <Label className="text-sm font-medium">
                  Select {metadata.terminology.repo}
                </Label>
                {isLoadingRepositories ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading {metadata.terminology.repo.toLowerCase()}s...
                  </div>
                ) : repositoriesError ? (
                  <p className="text-sm text-destructive">{repositoriesError}</p>
                ) : (
                  <Select value={selectedRepo || ''} onValueChange={selectRepository}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${metadata.terminology.repo.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {repositories.map((repo) => (
                        <SelectItem key={repo.fullName} value={repo.fullName}>
                          <div className="flex flex-col">
                            <span className="font-medium">{repo.fullName}</span>
                            {repo.description && (
                              <span className="text-xs text-muted-foreground">
                                {repo.description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {/* OAuth Flow */}
          {authMode === 'oauth' && (
            <div className="rounded-lg border border-info/30 bg-info/10 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-info">
                    {metadata.displayName} Authentication
                  </p>
                  <p className="text-xs text-info/80 mt-1">
                    Complete the authentication in your browser
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={switchToManual}>
                  Use Manual Token
                </Button>
              </div>
            </div>
          )}

          {/* Manual Token Entry */}
          {authMode === 'manual' && (
            <>
              {/* CLI Required Warning */}
              {metadata.oauth.supported && cliInstalled === false && (
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div>
                        <p className="text-sm font-medium">
                          {metadata.displayName} CLI Required
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          The {metadata.displayName} CLI ({metadata.cliName}) is required for OAuth
                          authentication.
                        </p>
                      </div>
                      {cliInstallSuccess ? (
                        <div className="rounded-md border border-success/30 bg-success/10 p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-4 w-4 text-success" />
                              <p className="text-xs text-success">Installation command executed</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => checkCli(true)}
                              disabled={isCheckingCli}
                              className="h-7 gap-1.5"
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${isCheckingCli ? 'animate-spin' : ''}`}
                              />
                              {t('settings.cli.refresh')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={installCli}
                            disabled={isInstallingCli}
                            className="gap-2"
                          >
                            {isInstallingCli ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Installing...
                              </>
                            ) : (
                              <>
                                <Terminal className="h-3 w-3" />
                                Install {metadata.cliName}
                              </>
                            )}
                          </Button>
                          <a
                            href={`https://${provider}.com/cli#installation`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-info hover:underline flex items-center gap-1"
                          >
                            Learn more
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* CLI Installed Success */}
              {cliInstalled === true && cliVersion && (
                <div className="rounded-lg border border-success/30 bg-success/10 p-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <p className="text-xs text-success">
                      {metadata.cliName} CLI installed <span className="font-mono">{cliVersion}</span>
                    </p>
                  </div>
                  {/* CLI Authentication Status */}
                  {cliAuthenticated && (
                    <div className="flex items-center gap-2 mt-2 pl-6">
                      <CheckCircle2 className="h-3 w-3 text-success" />
                      <p className="text-xs text-muted-foreground">
                        {cliAuthUsername ? (
                          <>
                            Authenticated as <span className="font-mono text-success">{cliAuthUsername}</span>
                          </>
                        ) : (
                          <span className="text-success">Authenticated</span>
                        )}
                      </p>
                    </div>
                  )}
                  {cliInstalled && !cliAuthenticated && (
                    <div className="flex items-center gap-2 mt-2 pl-6">
                      <AlertCircle className="h-3 w-3 text-warning" />
                      <p className="text-xs text-muted-foreground">
                        Not authenticated - will authenticate when you save your token
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Token Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Personal Access Token</Label>
                  {metadata.oauth.supported && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={switchToOAuth}
                      disabled={cliInstalled === false || isCheckingCli}
                      className="gap-2"
                    >
                      {isCheckingCli ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <KeyRound className="h-3 w-3" />
                      )}
                      Use OAuth
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Create a token with <code className="px-1 bg-muted rounded">api</code> scope from{' '}
                  <a
                    href={`${
                      provider === 'gitlab'
                        ? envConfig.gitlabInstanceUrl || metadata.instanceUrl.default
                        : metadata.instanceUrl.default
                    }/-/user_settings/personal_access_tokens`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-info hover:underline"
                  >
                    {metadata.displayName} Settings
                  </a>
                </p>
                <PasswordInput
                  value={
                    provider === 'github' ? envConfig.githubToken || '' : envConfig.gitlabToken || ''
                  }
                  onChange={(value) => {
                    updateEnvConfig({
                      [provider === 'github' ? 'githubToken' : 'gitlabToken']: value,
                    });
                  }}
                  placeholder={`${provider}_pat_xxxxxxxxxxxxxxxxxxxx`}
                />
              </div>

              {/* Repository/Project Input */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {metadata.terminology.repo}
                </Label>
                <p className="text-xs text-muted-foreground">
                  Format: {provider === 'github' ? 'owner/repo' : 'group/project'} (e.g.{' '}
                  {provider === 'github' ? 'octocat/hello-world' : 'gitlab-org/gitlab'})
                </p>
                <Input
                  type="text"
                  value={selectedRepo || ''}
                  onChange={(e) => {
                    updateEnvConfig({
                      [provider === 'github' ? 'githubRepo' : 'gitlabProject']: e.target.value,
                    });
                  }}
                  placeholder={provider === 'github' ? 'owner/repo' : 'group/project'}
                  className="font-mono text-xs"
                />
              </div>
            </>
          )}

          {/* Default Branch Selection */}
          {(selectedRepo || authMode === 'oauth-success') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Default Branch</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    fetchBranches();
                  }}
                  disabled={isLoadingBranches}
                  className="h-7 gap-1.5"
                >
                  <RefreshCw className={`h-3 w-3 ${isLoadingBranches ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Base branch for creating task worktrees
              </p>
              {isLoadingBranches ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading branches...
                </div>
              ) : branchesError ? (
                <p className="text-sm text-destructive">{branchesError}</p>
              ) : branches.length > 0 ? (
                <Select value={selectedBranch} onValueChange={selectBranch}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">No branches found</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
