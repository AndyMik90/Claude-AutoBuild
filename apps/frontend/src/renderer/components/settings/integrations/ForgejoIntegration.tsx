import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Loader2, CheckCircle2, AlertCircle, GitBranch, Server, ChevronDown } from 'lucide-react';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Separator } from '../../ui/separator';
import { Button } from '../../ui/button';
import { PasswordInput } from '../../project-settings/PasswordInput';
import type { ProjectEnvConfig, ForgejoSyncStatus, ProjectSettings } from '../../../../shared/types';

// Debug logging
const DEBUG = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';
function debugLog(message: string, data?: unknown) {
  if (DEBUG) {
    if (data !== undefined) {
      console.warn(`[ForgejoIntegration] ${message}`, data);
    } else {
      console.warn(`[ForgejoIntegration] ${message}`);
    }
  }
}

interface ForgejoIntegrationProps {
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  showForgejoToken: boolean;
  setShowForgejoToken: React.Dispatch<React.SetStateAction<boolean>>;
  forgejoConnectionStatus: ForgejoSyncStatus | null;
  isCheckingForgejo: boolean;
  projectPath?: string;
  // Project settings for mainBranch (used by kanban tasks and terminal worktrees)
  settings?: ProjectSettings;
  setSettings?: React.Dispatch<React.SetStateAction<ProjectSettings>>;
}

/**
 * Forgejo integration settings component.
 * Manages Forgejo/Gitea token, repository configuration, and connection status.
 * Supports self-hosted Forgejo and Gitea instances (e.g., Codeberg).
 */
export function ForgejoIntegration({
  envConfig,
  updateEnvConfig,
  showForgejoToken: _showForgejoToken,
  setShowForgejoToken: _setShowForgejoToken,
  forgejoConnectionStatus,
  isCheckingForgejo,
  projectPath,
  settings,
  setSettings
}: ForgejoIntegrationProps) {
  const { t } = useTranslation('forgejo');

  // Branch selection state
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [branchesError, setBranchesError] = useState<string | null>(null);

  debugLog('Render - projectPath:', projectPath);
  debugLog('Render - envConfig:', envConfig ? { forgejoEnabled: envConfig.forgejoEnabled, hasToken: !!envConfig.forgejoToken, defaultBranch: envConfig.defaultBranch } : null);

  // Fetch branches when Forgejo is enabled and project path is available
  useEffect(() => {
    debugLog(`useEffect[branches] - forgejoEnabled: ${envConfig?.forgejoEnabled}, projectPath: ${projectPath}`);
    if (envConfig?.forgejoEnabled && projectPath) {
      debugLog('useEffect[branches] - Triggering fetchBranches');
      fetchBranches();
    } else {
      debugLog('useEffect[branches] - Skipping fetchBranches (conditions not met)');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envConfig?.forgejoEnabled, projectPath]);

  /**
   * Handler for branch selection changes.
   * Updates BOTH project.settings.mainBranch (for Electron app) and envConfig.defaultBranch (for CLI backward compatibility).
   */
  const handleBranchChange = (branch: string) => {
    debugLog('handleBranchChange: Updating branch to:', branch);

    // Update project settings (primary source for Electron app)
    if (setSettings) {
      setSettings(prev => ({ ...prev, mainBranch: branch }));
      debugLog('handleBranchChange: Updated settings.mainBranch');
    }

    // Also update envConfig for CLI backward compatibility
    updateEnvConfig({ defaultBranch: branch });
    debugLog('handleBranchChange: Updated envConfig.defaultBranch');
  };

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

        // Auto-detect default branch if not set in project settings
        // Priority: settings.mainBranch > envConfig.defaultBranch > auto-detect
        if (!settings?.mainBranch && !envConfig?.defaultBranch) {
          debugLog('fetchBranches: No branch set, auto-detecting...');
          const detectResult = await window.electronAPI.detectMainBranch(projectPath);
          debugLog('fetchBranches: detectMainBranch result:', detectResult);
          if (detectResult.success && detectResult.data) {
            debugLog('fetchBranches: Auto-detected default branch:', detectResult.data);
            handleBranchChange(detectResult.data);
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

  if (!envConfig) {
    debugLog('No envConfig, returning null');
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="font-normal text-foreground">{t('settings.enableIssues')}</Label>
          <p className="text-xs text-muted-foreground">
            {t('settings.enableIssuesDescription')}
          </p>
        </div>
        <Switch
          checked={envConfig.forgejoEnabled}
          onCheckedChange={(checked) => updateEnvConfig({ forgejoEnabled: checked })}
        />
      </div>

      {envConfig.forgejoEnabled && (
        <>
          {/* Instance URL */}
          <InstanceUrlInput
            value={envConfig.forgejoInstanceUrl || ''}
            onChange={(value) => updateEnvConfig({ forgejoInstanceUrl: value })}
          />

          {/* Personal Access Token */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">{t('settings.personalAccessToken')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.tokenScope')} <code className="px-1 bg-muted rounded">{t('settings.scopeRepo')}</code> {t('settings.scopeFrom')}{' '}
              <a
                href={envConfig.forgejoInstanceUrl ? `${envConfig.forgejoInstanceUrl}/user/settings/applications` : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-info hover:underline"
              >
                {t('settings.forgejoSettings')}
              </a>
            </p>
            <PasswordInput
              value={envConfig.forgejoToken || ''}
              onChange={(value) => updateEnvConfig({ forgejoToken: value })}
              placeholder={t('settings.tokenPlaceholder')}
            />
          </div>

          {/* Repository */}
          <RepositoryInput
            value={envConfig.forgejoRepo || ''}
            onChange={(value) => updateEnvConfig({ forgejoRepo: value })}
          />

          {envConfig.forgejoToken && envConfig.forgejoRepo && (
            <ConnectionStatus
              isChecking={isCheckingForgejo}
              connectionStatus={forgejoConnectionStatus}
            />
          )}

          {forgejoConnectionStatus?.connected && <IssuesAvailableInfo />}

          <Separator />

          {/* Default Branch Selector */}
          {projectPath && (
            <BranchSelector
              branches={branches}
              selectedBranch={settings?.mainBranch || envConfig.defaultBranch || ''}
              isLoading={isLoadingBranches}
              error={branchesError}
              onSelect={handleBranchChange}
              onRefresh={fetchBranches}
            />
          )}

          <Separator />

          <AutoSyncToggle
            enabled={envConfig.forgejoAutoSync || false}
            onToggle={(checked) => updateEnvConfig({ forgejoAutoSync: checked })}
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

function InstanceUrlInput({ value, onChange }: InstanceUrlInputProps) {
  const { t } = useTranslation('forgejo');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-muted-foreground" />
        <Label className="text-sm font-medium text-foreground">{t('settings.instance')}</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('settings.instanceDescription')}
      </p>
      <Input
        placeholder="https://codeberg.org"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface RepositoryInputProps {
  value: string;
  onChange: (value: string) => void;
}

function RepositoryInput({ value, onChange }: RepositoryInputProps) {
  const { t } = useTranslation('forgejo');

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-foreground">{t('settings.repository')}</Label>
      <p className="text-xs text-muted-foreground">
        {t('settings.repositoryFormat')} <code className="px-1 bg-muted rounded">owner/repo</code> {t('settings.repositoryFormatExample')}
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
  connectionStatus: ForgejoSyncStatus | null;
}

function ConnectionStatus({ isChecking, connectionStatus }: ConnectionStatusProps) {
  const { t } = useTranslation('forgejo');

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{t('settings.connectionStatus')}</p>
          <p className="text-xs text-muted-foreground">
            {isChecking ? t('settings.checking') :
              connectionStatus?.connected
                ? `${t('settings.connectedTo')} ${connectionStatus.repoFullName}`
                : connectionStatus?.error || t('settings.notConnected')}
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
  const { t } = useTranslation('forgejo');

  return (
    <div className="rounded-lg border border-info/30 bg-info/5 p-3">
      <div className="flex items-start gap-3">
        {/* Forgejo/Gitea icon */}
        <svg className="h-5 w-5 text-info mt-0.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
        </svg>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">{t('settings.issuesAvailable')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.issuesAvailableDescription')}
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
  const { t } = useTranslation('forgejo');

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-info" />
          <Label className="font-normal text-foreground">{t('settings.autoSyncOnLoad')}</Label>
        </div>
        <p className="text-xs text-muted-foreground pl-6">
          {t('settings.autoSyncDescription')}
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

function BranchSelector({
  branches,
  selectedBranch,
  isLoading,
  error,
  onSelect,
  onRefresh
}: BranchSelectorProps) {
  const { t } = useTranslation('forgejo');
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
            <Label className="text-sm font-medium text-foreground">{t('settings.defaultBranch')}</Label>
          </div>
          <p className="text-xs text-muted-foreground pl-6">
            {t('settings.defaultBranchDescription')}
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
              {t('settings.loadingBranches')}
            </span>
          ) : selectedBranch ? (
            <span className="flex items-center gap-2">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              {selectedBranch}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('settings.autoDetect')}</span>
          )}
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && !isLoading && (
          <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-hidden">
            <div className="p-2 border-b border-border">
              <Input
                placeholder={t('settings.searchBranches')}
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
              <span className="text-sm text-muted-foreground italic">{t('settings.autoDetect')}</span>
            </button>

            <div className="max-h-40 overflow-y-auto border-t border-border">
              {filteredBranches.length === 0 ? (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {filter ? t('settings.noMatchingBranches') : t('settings.noBranchesFound')}
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
          {t('settings.branchFromNote')} <code className="px-1 bg-muted rounded">{selectedBranch}</code>
        </p>
      )}
    </div>
  );
}
