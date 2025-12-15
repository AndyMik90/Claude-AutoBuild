import { useEffect, useRef } from 'react';
import {
  FolderOpen,
  Zap,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Import,
  Radio,
  Github,
  RefreshCw
} from 'lucide-react';
import { LinearTaskImportModal } from '../LinearTaskImportModal';
import { Separator } from '../ui/separator';
import { SettingsSection } from './SettingsSection';
import { GeneralSettings } from '../project-settings/GeneralSettings';
import { EnvironmentSettings } from '../project-settings/EnvironmentSettings';
import { IntegrationSettings } from '../project-settings/IntegrationSettings';
import { SecuritySettings } from '../project-settings/SecuritySettings';
import { useProjectSettings, UseProjectSettingsReturn } from '../project-settings/hooks/useProjectSettings';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import type { Project, ProjectEnvConfig, LinearSyncStatus, GitHubSyncStatus } from '../../../shared/types';

export type ProjectSettingsSection = 'general' | 'claude' | 'linear' | 'github' | 'memory';

interface ProjectSettingsContentProps {
  project: Project | undefined;
  activeSection: ProjectSettingsSection;
  isOpen: boolean;
  onHookReady: (hook: UseProjectSettingsReturn | null) => void;
}

/**
 * Renders project settings content based on the active section.
 * Exposes hook state to parent for save coordination.
 */
export function ProjectSettingsContent({
  project,
  activeSection,
  isOpen,
  onHookReady
}: ProjectSettingsContentProps) {
  // Show empty state if no project selected
  if (!project) {
    return (
      <SettingsSection
        title="No Project Selected"
        description="Select a project from the dropdown above to configure its settings"
      >
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <p className="text-muted-foreground">
            Select a project to view and edit its settings
          </p>
        </div>
      </SettingsSection>
    );
  }

  return (
    <ProjectSettingsContentInner
      project={project}
      activeSection={activeSection}
      isOpen={isOpen}
      onHookReady={onHookReady}
    />
  );
}

/**
 * Inner component that uses the project settings hook.
 * Separated to ensure the hook is only called when a project is selected.
 */
function ProjectSettingsContentInner({
  project,
  activeSection,
  isOpen,
  onHookReady
}: {
  project: Project;
  activeSection: ProjectSettingsSection;
  isOpen: boolean;
  onHookReady: (hook: UseProjectSettingsReturn | null) => void;
}) {
  const hook = useProjectSettings(project, isOpen);
  
  // Keep a stable ref to the hook for the parent
  const hookRef = useRef(hook);
  hookRef.current = hook;

  const {
    settings,
    setSettings,
    versionInfo,
    isCheckingVersion,
    isUpdating,
    envConfig,
    isLoadingEnv,
    envError,
    updateEnvConfig,
    showClaudeToken,
    setShowClaudeToken,
    showLinearKey,
    setShowLinearKey,
    showOpenAIKey,
    setShowOpenAIKey,
    showFalkorPassword,
    setShowFalkorPassword,
    showGitHubToken,
    setShowGitHubToken,
    expandedSections,
    toggleSection,
    gitHubConnectionStatus,
    isCheckingGitHub,
    isCheckingClaudeAuth,
    claudeAuthStatus,
    showLinearImportModal,
    setShowLinearImportModal,
    linearConnectionStatus,
    isCheckingLinear,
    handleInitialize,
    handleUpdate,
    handleClaudeSetup,
    error
  } = hook;

  // Expose hook to parent for save coordination - only once when dialog opens
  // We use hookRef to avoid infinite loops (hook object is recreated each render)
  useEffect(() => {
    if (isOpen) {
      // Create a proxy that always accesses the latest hook values via ref
      const hookProxy: UseProjectSettingsReturn = {
        get settings() { return hookRef.current.settings; },
        get setSettings() { return hookRef.current.setSettings; },
        get isSaving() { return hookRef.current.isSaving; },
        get error() { return hookRef.current.error; },
        get setError() { return hookRef.current.setError; },
        get versionInfo() { return hookRef.current.versionInfo; },
        get isCheckingVersion() { return hookRef.current.isCheckingVersion; },
        get isUpdating() { return hookRef.current.isUpdating; },
        get envConfig() { return hookRef.current.envConfig; },
        get setEnvConfig() { return hookRef.current.setEnvConfig; },
        get isLoadingEnv() { return hookRef.current.isLoadingEnv; },
        get envError() { return hookRef.current.envError; },
        get setEnvError() { return hookRef.current.setEnvError; },
        get isSavingEnv() { return hookRef.current.isSavingEnv; },
        get updateEnvConfig() { return hookRef.current.updateEnvConfig; },
        get showClaudeToken() { return hookRef.current.showClaudeToken; },
        get setShowClaudeToken() { return hookRef.current.setShowClaudeToken; },
        get showLinearKey() { return hookRef.current.showLinearKey; },
        get setShowLinearKey() { return hookRef.current.setShowLinearKey; },
        get showOpenAIKey() { return hookRef.current.showOpenAIKey; },
        get setShowOpenAIKey() { return hookRef.current.setShowOpenAIKey; },
        get showFalkorPassword() { return hookRef.current.showFalkorPassword; },
        get setShowFalkorPassword() { return hookRef.current.setShowFalkorPassword; },
        get showGitHubToken() { return hookRef.current.showGitHubToken; },
        get setShowGitHubToken() { return hookRef.current.setShowGitHubToken; },
        get expandedSections() { return hookRef.current.expandedSections; },
        get toggleSection() { return hookRef.current.toggleSection; },
        get gitHubConnectionStatus() { return hookRef.current.gitHubConnectionStatus; },
        get isCheckingGitHub() { return hookRef.current.isCheckingGitHub; },
        get isCheckingClaudeAuth() { return hookRef.current.isCheckingClaudeAuth; },
        get claudeAuthStatus() { return hookRef.current.claudeAuthStatus; },
        get setClaudeAuthStatus() { return hookRef.current.setClaudeAuthStatus; },
        get showLinearImportModal() { return hookRef.current.showLinearImportModal; },
        get setShowLinearImportModal() { return hookRef.current.setShowLinearImportModal; },
        get linearConnectionStatus() { return hookRef.current.linearConnectionStatus; },
        get isCheckingLinear() { return hookRef.current.isCheckingLinear; },
        get handleInitialize() { return hookRef.current.handleInitialize; },
        get handleUpdate() { return hookRef.current.handleUpdate; },
        get handleSaveEnv() { return hookRef.current.handleSaveEnv; },
        get handleClaudeSetup() { return hookRef.current.handleClaudeSetup; },
        get handleSave() { return hookRef.current.handleSave; },
      };
      onHookReady(hookProxy);
    }
    return () => {
      onHookReady(null);
    };
  }, [isOpen, onHookReady]);

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return (
          <SettingsSection
            title="General"
            description={`Configure Auto-Build, agent model, and notifications for ${project.name}`}
          >
            <GeneralSettings
              project={project}
              settings={settings}
              setSettings={setSettings}
              versionInfo={versionInfo}
              isCheckingVersion={isCheckingVersion}
              isUpdating={isUpdating}
              handleInitialize={handleInitialize}
              handleUpdate={handleUpdate}
            />
          </SettingsSection>
        );

      case 'claude':
        if (!project.autoBuildPath) {
          return (
            <SettingsSection
              title="Claude Authentication"
              description="Configure Claude CLI authentication"
            >
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                Initialize Auto-Build first to configure Claude authentication
              </div>
            </SettingsSection>
          );
        }
        return (
          <SettingsSection
            title="Claude Authentication"
            description="Configure Claude CLI authentication for this project"
          >
            <EnvironmentSettings
              envConfig={envConfig}
              isLoadingEnv={isLoadingEnv}
              envError={envError}
              updateEnvConfig={updateEnvConfig}
              isCheckingClaudeAuth={isCheckingClaudeAuth}
              claudeAuthStatus={claudeAuthStatus}
              handleClaudeSetup={handleClaudeSetup}
              showClaudeToken={showClaudeToken}
              setShowClaudeToken={setShowClaudeToken}
              expanded={true}
              onToggle={() => {}}
            />
          </SettingsSection>
        );

      case 'linear':
        if (!project.autoBuildPath) {
          return (
            <SettingsSection
              title="Linear Integration"
              description="Sync with Linear for issue tracking"
            >
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                Initialize Auto-Build first to configure Linear integration
              </div>
            </SettingsSection>
          );
        }
        return (
          <SettingsSection
            title="Linear Integration"
            description="Connect to Linear for issue tracking and task import"
          >
            <LinearOnlyIntegration
              envConfig={envConfig}
              updateEnvConfig={updateEnvConfig}
              showLinearKey={showLinearKey}
              setShowLinearKey={setShowLinearKey}
              linearConnectionStatus={linearConnectionStatus}
              isCheckingLinear={isCheckingLinear}
              onOpenLinearImport={() => setShowLinearImportModal(true)}
            />
          </SettingsSection>
        );

      case 'github':
        if (!project.autoBuildPath) {
          return (
            <SettingsSection
              title="GitHub Integration"
              description="Sync with GitHub Issues"
            >
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                Initialize Auto-Build first to configure GitHub integration
              </div>
            </SettingsSection>
          );
        }
        return (
          <SettingsSection
            title="GitHub Integration"
            description="Connect to GitHub for issue tracking"
          >
            <GitHubOnlyIntegration
              envConfig={envConfig}
              updateEnvConfig={updateEnvConfig}
              showGitHubToken={showGitHubToken}
              setShowGitHubToken={setShowGitHubToken}
              gitHubConnectionStatus={gitHubConnectionStatus}
              isCheckingGitHub={isCheckingGitHub}
            />
          </SettingsSection>
        );

      case 'memory':
        if (!project.autoBuildPath) {
          return (
            <SettingsSection
              title="Memory Backend"
              description="Configure agent memory storage"
            >
              <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm text-muted-foreground">
                Initialize Auto-Build first to configure the memory backend
              </div>
            </SettingsSection>
          );
        }
        return (
          <SettingsSection
            title="Memory Backend"
            description="Configure how agents store and retrieve memory"
          >
            <SecuritySettings
              envConfig={envConfig}
              settings={settings}
              setSettings={setSettings}
              updateEnvConfig={updateEnvConfig}
              showOpenAIKey={showOpenAIKey}
              setShowOpenAIKey={setShowOpenAIKey}
              showFalkorPassword={showFalkorPassword}
              setShowFalkorPassword={setShowFalkorPassword}
              expanded={true}
              onToggle={() => {}}
            />
          </SettingsSection>
        );

      default:
        return null;
    }
  };

  return (
    <>
      {renderSection()}

      {/* Error Display */}
      {(error || envError) && (
        <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          {error || envError}
        </div>
      )}

      {/* Linear Task Import Modal */}
      <LinearTaskImportModal
        projectId={project.id}
        open={showLinearImportModal}
        onOpenChange={setShowLinearImportModal}
        onImportComplete={(result) => {
          console.log('Import complete:', result);
        }}
      />
    </>
  );
}

// Extracted Linear-only integration (without the collapsible header)
function LinearOnlyIntegration({
  envConfig,
  updateEnvConfig,
  showLinearKey,
  setShowLinearKey,
  linearConnectionStatus,
  isCheckingLinear,
  onOpenLinearImport
}: {
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  showLinearKey: boolean;
  setShowLinearKey: React.Dispatch<React.SetStateAction<boolean>>;
  linearConnectionStatus: LinearSyncStatus | null;
  isCheckingLinear: boolean;
  onOpenLinearImport: () => void;
}) {
  if (!envConfig) return null;

  return (
    <div className="space-y-4">
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
                    onClick={onOpenLinearImport}
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
  );
}

// Extracted GitHub-only integration (without the collapsible header)
function GitHubOnlyIntegration({
  envConfig,
  updateEnvConfig,
  showGitHubToken,
  setShowGitHubToken,
  gitHubConnectionStatus,
  isCheckingGitHub
}: {
  envConfig: ProjectEnvConfig | null;
  updateEnvConfig: (updates: Partial<ProjectEnvConfig>) => void;
  showGitHubToken: boolean;
  setShowGitHubToken: React.Dispatch<React.SetStateAction<boolean>>;
  gitHubConnectionStatus: GitHubSyncStatus | null;
  isCheckingGitHub: boolean;
}) {
  if (!envConfig) return null;

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
  );
}
