import { useState } from 'react';
import {
  RefreshCw,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { Separator } from '../ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { AVAILABLE_MODELS } from '../../../shared/constants';
import type {
  Project,
  ProjectSettings as ProjectSettingsType,
  AutoBuildVersionInfo
} from '../../../shared/types';

interface GeneralSettingsProps {
  project: Project;
  settings: ProjectSettingsType;
  setSettings: React.Dispatch<React.SetStateAction<ProjectSettingsType>>;
  versionInfo: AutoBuildVersionInfo | null;
  isCheckingVersion: boolean;
  isUpdating: boolean;
  handleInitialize: () => Promise<void>;
  /** Callback when useCondaEnv setting changes (for sidebar reactivity) */
  onUseCondaEnvChange?: (enabled: boolean) => void;
}

export function GeneralSettings({
  project,
  settings,
  setSettings,
  versionInfo,
  isCheckingVersion,
  isUpdating,
  handleInitialize,
  onUseCondaEnvChange
}: GeneralSettingsProps) {
  const { t } = useTranslation(['settings']);
  const [showDeleteEnvDialog, setShowDeleteEnvDialog] = useState(false);
  const [isCheckingEnv, setIsCheckingEnv] = useState(false);
  const [envPathToDelete, setEnvPathToDelete] = useState('');
  const [deleteActivationScripts, setDeleteActivationScripts] = useState(true);

  // Derived values for the Python environment
  const projectName = project.name;

  // Check if environment exists (for determining whether to show delete dialog)
  // Uses backend to get correct path based on project structure
  async function checkEnvExists(): Promise<{ exists: boolean; envPath: string }> {
    try {
      const condaApi = window.electronAPI?.conda;

      if (!condaApi) return { exists: false, envPath: '' };

      // First get the correct env path from backend
      const pathsResult = await condaApi.getProjectPaths(project.path, projectName);
      const envPath = pathsResult.data?.envPath || `${project.path}/.envs/${projectName}`;

      // Then check if env exists at that path
      const result = await condaApi.checkProjectEnv(envPath);
      return {
        exists: result.success && result.data?.valid === true,
        envPath
      };
    } catch {
      return { exists: false, envPath: '' };
    }
  }

  // Handle the conda toggle - show confirmation when turning off only if env exists
  async function handleCondaToggle(enabled: boolean) {
    if (!enabled && settings.useCondaEnv) {
      // Turning off - check if env actually exists before prompting to delete
      setIsCheckingEnv(true);
      const { exists, envPath: checkedEnvPath } = await checkEnvExists();
      setIsCheckingEnv(false);

      if (exists) {
        // Environment exists - prompt to delete or keep
        // Store the path for deletion
        setEnvPathToDelete(checkedEnvPath);
        setShowDeleteEnvDialog(true);
      } else {
        // No environment exists - just toggle off without dialog
        setSettings(prev => ({ ...prev, useCondaEnv: false }));
        onUseCondaEnvChange?.(false);
      }
    } else {
      // Turning on or just updating
      setSettings(prev => ({ ...prev, useCondaEnv: enabled }));
      onUseCondaEnvChange?.(enabled);
    }
  }

  // Handle keeping files but disabling the setting
  function handleKeepFiles() {
    setSettings(prev => ({ ...prev, useCondaEnv: false }));
    onUseCondaEnvChange?.(false);
    setShowDeleteEnvDialog(false);
  }

  // Handle deleting the environment
  async function handleDeleteEnv() {
    try {
      const condaApi = window.electronAPI.conda;

      if (condaApi && envPathToDelete) {
        await condaApi.deleteProjectEnv(envPathToDelete);
      }

      // Also delete activation scripts if checkbox is checked
      if (condaApi && deleteActivationScripts) {
        await condaApi.deleteActivationScripts(project.path);
      }
    } catch (error) {
      console.error('Failed to delete environment:', error);
    }
    setSettings(prev => ({ ...prev, useCondaEnv: false }));
    onUseCondaEnvChange?.(false);
    setShowDeleteEnvDialog(false);
    setEnvPathToDelete('');
    setDeleteActivationScripts(true); // Reset for next time
  }

  return (
    <>
      {/* Auto-Build Integration */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">{t('projectSections.autoBuild.title')}</h3>
        {!project.autoBuildPath ? (
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{t('projectSections.autoBuild.notInitialized')}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('projectSections.autoBuild.notInitializedDescription')}
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
                      {t('projectSections.autoBuild.initializing')}
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      {t('projectSections.autoBuild.initialize')}
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
                <span className="text-sm font-medium text-foreground">{t('projectSections.autoBuild.initialized')}</span>
              </div>
              <code className="text-xs bg-background px-2 py-1 rounded">
                {project.autoBuildPath}
              </code>
            </div>
            {isCheckingVersion ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t('projectSections.autoBuild.checkingStatus')}
              </div>
            ) : versionInfo && (
              <div className="text-xs text-muted-foreground">
                {versionInfo.isInitialized ? t('projectSections.autoBuild.initialized') : t('projectSections.autoBuild.notInitialized')}
              </div>
            )}
          </div>
        )}
      </section>

      <Separator />

      {/* Python Environment Toggle */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">
          {t('python.title')}
        </h3>
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="font-normal text-foreground">
              {t('python.useCondaEnv')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('python.useCondaEnvHint')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isCheckingEnv && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              checked={settings.useCondaEnv ?? false}
              onCheckedChange={(checked) => handleCondaToggle(checked)}
              disabled={isCheckingEnv}
            />
          </div>
        </div>
      </section>

      {/* Delete Environment Confirmation Dialog */}
      <AlertDialog open={showDeleteEnvDialog} onOpenChange={setShowDeleteEnvDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('python.deleteEnvTitle')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <span>{t('python.deleteEnvMessage')}</span>
                <code className="block mt-2 p-2 bg-muted rounded">
                  {envPathToDelete}
                </code>
                <span className="block mt-2">{t('python.deleteEnvPrompt')}</span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="delete-activation-scripts"
              checked={deleteActivationScripts}
              onCheckedChange={(checked) => setDeleteActivationScripts(checked === true)}
            />
            <Label
              htmlFor="delete-activation-scripts"
              className="text-sm font-normal cursor-pointer"
            >
              {t('python.deleteActivationScripts')}
            </Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleKeepFiles}>
              {t('python.keepFiles')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEnv}>
              {t('python.deleteEnv')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {project.autoBuildPath && (
        <>
          <Separator />

          {/* Agent Settings */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t('projectSections.agentConfig.title')}</h3>
            <div className="space-y-2">
              <Label htmlFor="model" className="text-sm font-medium text-foreground">{t('general.model')}</Label>
              <Select
                value={settings.model}
                onValueChange={(value) => setSettings(prev => ({ ...prev, model: value }))}
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
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label className="font-normal text-foreground">
                  {t('projectSections.general.useClaudeMd')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('projectSections.general.useClaudeMdDescription')}
                </p>
              </div>
              <Switch
                checked={settings.useClaudeMd ?? true}
                onCheckedChange={(checked) =>
                  setSettings(prev => ({ ...prev, useClaudeMd: checked }))
                }
              />
            </div>
          </section>

          <Separator />

          {/* Notifications */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t('notifications.title')}</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">{t('notifications.onTaskComplete')}</Label>
                <Switch
                  checked={settings.notifications.onTaskComplete}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        onTaskComplete: checked
                      }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">{t('notifications.onTaskFailed')}</Label>
                <Switch
                  checked={settings.notifications.onTaskFailed}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        onTaskFailed: checked
                      }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">{t('notifications.onReviewNeeded')}</Label>
                <Switch
                  checked={settings.notifications.onReviewNeeded}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        onReviewNeeded: checked
                      }
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal text-foreground">{t('notifications.sound')}</Label>
                <Switch
                  checked={settings.notifications.sound}
                  onCheckedChange={(checked) =>
                    setSettings(prev => ({
                      ...prev,
                      notifications: {
                        ...prev.notifications,
                        sound: checked
                      }
                    }))
                  }
                />
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
