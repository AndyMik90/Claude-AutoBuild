import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Zap,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Import,
  Radio,
  Github,
  RefreshCw,
  GitBranch
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import type { ProjectEnvConfig, LinearSyncStatus, GitHubSyncStatus, Project, ProjectSettings as ProjectSettingsType } from '../../../shared/types';

interface IntegrationSettingsProps {
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;

  // Project settings for main branch
  project: Project;
  settings: ProjectSettingsType;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettingsType>>;

  // Linear state
  showLinearKey: boolean;
  setShowLinearKey: React.Dispatch<React.SetStateAction<boolean>>;
  linearConnectionStatus: LinearSyncStatus | null;
  isCheckingLinear: boolean;
  linearExpanded: boolean;
  onLinearToggle: () => void;
  onOpenLinearImport: () => void;

  // GitHub state
  showGitHubToken: boolean;
  setShowGitHubToken: React.Dispatch<React.SetStateAction<boolean>>;
  gitHubConnectionStatus: GitHubSyncStatus | null;
  isCheckingGitHub: boolean;
  githubExpanded: boolean;
  onGitHubToggle: () => void;
}

export function IntegrationSettings({
  envConfig,
  updateEnvConfig,
  project,
  settings,
  setSettings,
  showLinearKey,
  setShowLinearKey,
  linearConnectionStatus,
  isCheckingLinear,
  linearExpanded,
  onLinearToggle,
  onOpenLinearImport,
  showGitHubToken,
  setShowGitHubToken,
  gitHubConnectionStatus,
  isCheckingGitHub,
  githubExpanded,
  onGitHubToggle
}: IntegrationSettingsProps) {
  const { t } = useTranslation(['settings']);
  
  // Branch selection state
  const [branches, setBranches] = useState<string[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);

  // Load branches when GitHub section expands
  useEffect(() => {
    if (githubExpanded && project.path) {
      loadBranches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadBranches is intentionally excluded to avoid infinite loops
  }, [githubExpanded, project.path]);

  const loadBranches = async () => {
    setIsLoadingBranches(true);
    try {
      const result = await window.electronAPI.getGitBranches(project.path);
      if (result.success && result.data) {
        setBranches(result.data);
        // Auto-detect main branch if not set
        if (!settings.mainBranch) {
          const detectResult = await window.electronAPI.detectMainBranch(project.path);
          if (detectResult.success && detectResult.data) {
            setSettings(prev => ({ ...prev, mainBranch: detectResult.data! }));
          }
        }
      }
    } catch (error) {
      console.error('Failed to load branches:', error);
    } finally {
      setIsLoadingBranches(false);
    }
  };

  if (!envConfig) return null;

  return (
    <>
      {/* Linear Integration Section */}
      <section className="space-y-3">
        <button
          onClick={onLinearToggle}
          className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {t('projectSections.linear.title')}
            {envConfig.linearEnabled && (
              <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
                {t('projectSections.linear.enabled')}
              </span>
            )}
          </div>
          {linearExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {linearExpanded && (
          <div className="space-y-4 pl-6 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-normal text-foreground">{t('projectSections.linear.enableLinearSync')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('projectSections.linear.enableLinearSyncDescription')}
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
                  <Label className="text-sm font-medium text-foreground">{t('projectSections.linear.apiKey')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('projectSections.linear.apiKeyDescription')}{' '}
                    <a
                      href="https://linear.app/settings/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-info hover:underline"
                    >
                      {t('projectSections.linear.linearSettings')}
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
                        <p className="text-sm font-medium text-foreground">{t('projectSections.linear.connectionStatus')}</p>
                        <p className="text-xs text-muted-foreground">
                          {isCheckingLinear ? t('projectSections.linear.checking') :
                            linearConnectionStatus?.connected
                              ? t('projectSections.linear.connectedTo', { name: linearConnectionStatus.teamName })
                              : linearConnectionStatus?.error || t('projectSections.linear.notConnected')}
                        </p>
                        {linearConnectionStatus?.connected && linearConnectionStatus.issueCount !== undefined && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('projectSections.linear.tasksAvailable', { count: linearConnectionStatus.issueCount })}
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
                        <p className="text-sm font-medium text-foreground">{t('projectSections.linear.importExistingTasks')}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('projectSections.linear.importDescription')}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={onOpenLinearImport}
                        >
                          <Import className="h-4 w-4 mr-2" />
                          {t('projectSections.linear.importTasksFromLinear')}
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
                       <Label className="font-normal text-foreground">{t('projectSections.linear.realTimeSync')}</Label>
                     </div>
                     <p className="text-xs text-muted-foreground pl-6">
                       {t('projectSections.linear.realTimeSyncDescription')}
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
                       {t('projectSections.linear.realTimeSyncWarning')}
                     </p>
                   </div>
                 )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">{t('projectSections.linear.teamId')}</Label>
                    <Input
                      placeholder={t('projectSections.linear.autoDetected')}
                      value={envConfig.linearTeamId || ''}
                      onChange={(e) => updateEnvConfig({ linearTeamId: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">{t('projectSections.linear.projectId')}</Label>
                    <Input
                      placeholder={t('projectSections.linear.autoCreated')}
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
          onClick={onGitHubToggle}
          className="w-full flex items-center justify-between text-sm font-semibold text-foreground hover:text-foreground/80"
        >
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4" />
            {t('projectSections.github.title')}
            {envConfig.githubEnabled && (
              <span className="px-2 py-0.5 text-xs bg-success/10 text-success rounded-full">
                {t('projectSections.github.enabled')}
              </span>
            )}
          </div>
          {githubExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {githubExpanded && (
          <div className="space-y-4 pl-6 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="font-normal text-foreground">{t('projectSections.github.enableGithubIssues')}</Label>
                <p className="text-xs text-muted-foreground">
                  {t('projectSections.github.enableGithubIssuesDescription')}
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
                  <Label className="text-sm font-medium text-foreground">{t('projectSections.github.personalAccessToken')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('projectSections.github.personalAccessTokenDescription')}{' '}
                    <code className="px-1 bg-muted rounded">{t('projectSections.github.scope')}</code>{' '}
                    {t('projectSections.github.scopeDescription')}{' '}
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo&description=Auto-Build-UI"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-info hover:underline"
                    >
                      {t('projectSections.github.githubSettings')}
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
                  <Label className="text-sm font-medium text-foreground">{t('projectSections.github.repository')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('projectSections.github.repositoryDescription')}{' '}
                    <code className="px-1 bg-muted rounded">{t('projectSections.github.repoExample')}</code>{' '}
                    {t('projectSections.github.repoExampleDescription')}
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
                        <p className="text-sm font-medium text-foreground">{t('projectSections.github.connectionStatus')}</p>
                        <p className="text-xs text-muted-foreground">
                          {isCheckingGitHub ? t('projectSections.github.checking') :
                            gitHubConnectionStatus?.connected
                              ? t('projectSections.github.connectedTo', { repo: gitHubConnectionStatus.repoFullName })
                              : gitHubConnectionStatus?.error || t('projectSections.github.notConnected')}
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
                        <p className="text-sm font-medium text-foreground">{t('projectSections.github.issuesAvailable')}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('projectSections.github.issuesDescription')}
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
                       <Label className="font-normal text-foreground">{t('projectSections.github.autoSyncOnLoad')}</Label>
                     </div>
                     <p className="text-xs text-muted-foreground pl-6">
                       {t('projectSections.github.autoSyncOnLoadDescription')}
                     </p>
                  </div>
                  <Switch
                    checked={envConfig.githubAutoSync || false}
                    onCheckedChange={(checked) => updateEnvConfig({ githubAutoSync: checked })}
                  />
                </div>

                <Separator />

                {/* Main Branch Selection */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-info" />
                    <Label className="text-sm font-medium text-foreground">{t('projectSections.github.mainBranch')}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('projectSections.github.mainBranchDescription')}
                  </p>
                  <Select
                    value={settings.mainBranch || ''}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, mainBranch: value }))}
                    disabled={isLoadingBranches || branches.length === 0}
                  >
                    <SelectTrigger>
                      {isLoadingBranches ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>{t('projectSections.github.loadingBranches')}</span>
                        </div>
                      ) : (
                        <SelectValue placeholder={t('projectSections.github.selectMainBranch')} />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map((branch) => (
                        <SelectItem key={branch} value={branch}>
                          {branch}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {settings.mainBranch && (
                    <p className="text-xs text-muted-foreground">
                      {t('projectSections.github.tasksWillBeCreated')}{' '}
                      <code className="px-1 bg-muted rounded">auto-claude/task-name</code>{' '}
                      {t('projectSections.github.from')}{' '}
                      <code className="px-1 bg-muted rounded">{settings.mainBranch}</code>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}
