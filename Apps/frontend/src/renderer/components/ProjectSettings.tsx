import { useState } from 'react';
import { Settings2, Save, Loader2 } from 'lucide-react';
import { LinearTaskImportModal } from './LinearTaskImportModal';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Separator } from './ui/separator';
import { updateProjectSettings, initializeProject, updateProjectAutoBuild, checkProjectVersion } from '../stores/project-store';
import type { Project } from '../../shared/types';

// Import custom hooks
import { useProjectSettings } from '../hooks/useProjectSettings';
import { useEnvironmentConfig } from '../hooks/useEnvironmentConfig';
import { useClaudeAuth } from '../hooks/useClaudeAuth';
import { useLinearConnection } from '../hooks/useLinearConnection';
import { useGitHubConnection } from '../hooks/useGitHubConnection';
import { useInfrastructureStatus } from '../hooks/useInfrastructureStatus';

// Import section components
import { AutoBuildIntegration } from './project-settings/AutoBuildIntegration';
import { ClaudeAuthSection } from './project-settings/ClaudeAuthSection';
import { LinearIntegrationSection } from './project-settings/LinearIntegrationSection';
import { GitHubIntegrationSection } from './project-settings/GitHubIntegrationSection';
import { MemoryBackendSection } from './project-settings/MemoryBackendSection';
import { AgentConfigSection } from './project-settings/AgentConfigSection';
import { NotificationsSection } from './project-settings/NotificationsSection';

interface ProjectSettingsProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectSettings({ project, open, onOpenChange }: ProjectSettingsProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showLinearImportModal, setShowLinearImportModal] = useState(false);

  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    claude: true,
    linear: false,
    github: false,
    graphiti: false
  });

  // Custom hooks for state management
  const { settings, setSettings, versionInfo, setVersionInfo, isCheckingVersion } = useProjectSettings(project, open);

  const {
    envConfig,
    setEnvConfig,
    updateEnvConfig,
    isLoadingEnv,
    envError,
    setEnvError: _setEnvError,
    isSavingEnv,
  } = useEnvironmentConfig(project.id, project.autoBuildPath, open);

  const { isCheckingClaudeAuth, claudeAuthStatus, handleClaudeSetup } = useClaudeAuth(
    project.id,
    project.autoBuildPath,
    open
  );

  const { linearConnectionStatus, isCheckingLinear } = useLinearConnection(
    project.id,
    envConfig?.linearEnabled,
    envConfig?.linearApiKey
  );

  const { gitHubConnectionStatus, isCheckingGitHub } = useGitHubConnection(
    project.id,
    envConfig?.githubEnabled,
    envConfig?.githubToken,
    envConfig?.githubRepo
  );

  const {
    infrastructureStatus,
    isCheckingInfrastructure,
    isStartingFalkorDB,
    isOpeningDocker,
    handleStartFalkorDB,
    handleOpenDockerDesktop,
    handleDownloadDocker,
  } = useInfrastructureStatus(
    envConfig?.graphitiEnabled,
    envConfig?.graphitiFalkorDbPort,
    open
  );

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

  const handleClaudeSetupWithCallback = () => {
    handleClaudeSetup((newEnvConfig) => {
      setEnvConfig(newEnvConfig);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
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
            <AutoBuildIntegration
              autoBuildPath={project.autoBuildPath}
              versionInfo={versionInfo}
              isCheckingVersion={isCheckingVersion}
              isUpdating={isUpdating}
              onInitialize={handleInitialize}
              onUpdate={handleUpdate}
            />

            {/* Environment Configuration - Only show if initialized */}
            {project.autoBuildPath && envConfig && (
              <>
                <Separator />

                {/* Claude Authentication Section */}
                <ClaudeAuthSection
                  isExpanded={expandedSections.claude}
                  onToggle={() => toggleSection('claude')}
                  envConfig={envConfig}
                  isLoadingEnv={isLoadingEnv}
                  envError={envError}
                  isCheckingAuth={isCheckingClaudeAuth}
                  authStatus={claudeAuthStatus}
                  onClaudeSetup={handleClaudeSetupWithCallback}
                  onUpdateConfig={updateEnvConfig}
                />

                <Separator />

                {/* Linear Integration Section */}
                <LinearIntegrationSection
                  isExpanded={expandedSections.linear}
                  onToggle={() => toggleSection('linear')}
                  envConfig={envConfig}
                  onUpdateConfig={updateEnvConfig}
                  linearConnectionStatus={linearConnectionStatus}
                  isCheckingLinear={isCheckingLinear}
                  onOpenImportModal={() => setShowLinearImportModal(true)}
                />

                <Separator />

                {/* GitHub Integration Section */}
                <GitHubIntegrationSection
                  isExpanded={expandedSections.github}
                  onToggle={() => toggleSection('github')}
                  envConfig={envConfig}
                  onUpdateConfig={updateEnvConfig}
                  gitHubConnectionStatus={gitHubConnectionStatus}
                  isCheckingGitHub={isCheckingGitHub}
                  projectName={project.name}
                />

                <Separator />

                {/* Memory Backend Section */}
                <MemoryBackendSection
                  isExpanded={expandedSections.graphiti}
                  onToggle={() => toggleSection('graphiti')}
                  envConfig={envConfig}
                  settings={settings}
                  onUpdateConfig={updateEnvConfig}
                  onUpdateSettings={(updates) => setSettings({ ...settings, ...updates })}
                  infrastructureStatus={infrastructureStatus}
                  isCheckingInfrastructure={isCheckingInfrastructure}
                  isStartingFalkorDB={isStartingFalkorDB}
                  isOpeningDocker={isOpeningDocker}
                  onStartFalkorDB={handleStartFalkorDB}
                  onOpenDockerDesktop={handleOpenDockerDesktop}
                  onDownloadDocker={handleDownloadDocker}
                />

                <Separator />
              </>
            )}

            {/* Agent Settings */}
            <AgentConfigSection
              settings={settings}
              onUpdateSettings={(updates) => setSettings({ ...settings, ...updates })}
            />

            <Separator />

            {/* Notifications */}
            <NotificationsSection
              settings={settings}
              onUpdateSettings={(updates) => setSettings({ ...settings, ...updates })}
            />

            {/* Error */}
            {(error || envError) && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {error || envError}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="shrink-0">
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
          console.warn('Import complete:', result);
        }}
      />
    </Dialog>
  );
}
