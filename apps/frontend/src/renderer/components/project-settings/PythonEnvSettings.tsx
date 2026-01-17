/**
 * PythonEnvSettings - Python Environment settings page for projects
 *
 * This component is shown when the user navigates to "Python Env" in project settings
 * (only visible when the useCondaEnv toggle is enabled).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  XCircle,
  Circle,
  RefreshCw,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Terminal,
  Loader2
} from 'lucide-react';
import { Button } from '../ui/button';
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
import { CondaSetupWizard } from '../settings/CondaSetupWizard';
import type { Project, ProjectSettings, CondaEnvValidation, PythonVersionResult, CondaProjectPaths } from '../../../shared/types';

export interface PythonEnvSettingsProps {
  project: Project;
  settings: ProjectSettings;
  onSettingsChange: (settings: ProjectSettings) => void;
}

interface EnvStatus {
  status: 'none' | 'ready' | 'broken' | 'creating';
  pythonVersion?: string;
  packageCount?: number;
}

export function PythonEnvSettings({
  project,
  settings,
  onSettingsChange
}: PythonEnvSettingsProps) {
  const { t } = useTranslation(['settings']);

  // State
  const [envStatus, setEnvStatus] = useState<EnvStatus>({ status: 'none' });
  const [detectedPython, setDetectedPython] = useState<PythonVersionResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [projectPaths, setProjectPaths] = useState<CondaProjectPaths | null>(null);
  const [pythonVersions, setPythonVersions] = useState<string[]>([]);
  const [selectedPythonVersion, setSelectedPythonVersion] = useState<string>('');
  const [recommendedVersion, setRecommendedVersion] = useState<string>('3.12');
  // Use ref to track initial version selection without causing callback recreation
  const hasInitializedVersionRef = useRef(false);

  // Derived values - use dynamic paths from backend if available, otherwise fallback
  const projectName = project.name;
  const pythonRootPrefix = projectPaths?.pythonRootRelative ? `${projectPaths.pythonRootRelative}/` : '';
  const envPathDisplay = projectPaths?.envPathRelative || `.envs/${projectName}/`;
  const envPath = `${pythonRootPrefix}${envPathDisplay}`;
  const workspaceFile = projectPaths?.workspaceFile || `${projectName}.code-workspace`;

  // Load environment status on mount
  const loadEnvStatus = useCallback(async () => {
    if (!project.path) return;

    setIsLoading(true);
    try {
      const condaApi = (window.electronAPI as { conda?: {
        checkProjectEnv: (envPath: string) => Promise<{ success: boolean; data?: CondaEnvValidation }>;
        getPythonVersion: (projectPath: string) => Promise<{ success: boolean; data?: PythonVersionResult }>;
        getProjectPaths: (projectPath: string, projectName: string) => Promise<{ success: boolean; data?: CondaProjectPaths }>;
        listPythonVersions: (projectPath?: string) => Promise<{ success: boolean; data?: { versions: string[]; recommended: string; detectedVersion?: string } }>;
      } }).conda;

      if (!condaApi) {
        console.warn('Conda API not available');
        setEnvStatus({ status: 'none' });
        setIsLoading(false);
        return;
      }

      // Get computed project paths first
      const pathsResult = await condaApi.getProjectPaths(project.path, project.name);
      if (pathsResult.success && pathsResult.data) {
        setProjectPaths(pathsResult.data);
      }

      // Check environment status using the actual env path from backend
      const actualEnvPath = pathsResult.data?.envPath || `${project.path}/.envs/${project.name}`;
      const envResult = await condaApi.checkProjectEnv(actualEnvPath);

      if (envResult.success && envResult.data) {
        const validation = envResult.data;
        if (validation.valid) {
          setEnvStatus({
            status: 'ready',
            pythonVersion: validation.pythonVersion,
            packageCount: validation.packageCount
          });
        } else if (validation.error === 'env_not_found') {
          setEnvStatus({ status: 'none' });
        } else {
          setEnvStatus({ status: 'broken' });
        }
      } else {
        setEnvStatus({ status: 'none' });
      }

      // Get detected Python version from project files
      const pythonResult = await condaApi.getPythonVersion(project.path);
      if (pythonResult.success && pythonResult.data) {
        setDetectedPython(pythonResult.data);
      }

      // Load available Python versions
      const versionsResult = await condaApi.listPythonVersions(project.path);
      if (versionsResult.success && versionsResult.data) {
        setPythonVersions(versionsResult.data.versions);
        setRecommendedVersion(versionsResult.data.recommended);
        // Only set default selection on initial load, preserve user's selection after that
        if (!hasInitializedVersionRef.current) {
          setSelectedPythonVersion(versionsResult.data.recommended);
          hasInitializedVersionRef.current = true;
        }
      }
    } catch (error) {
      console.error('Failed to load environment status:', error);
      setEnvStatus({ status: 'none' });
    } finally {
      setIsLoading(false);
    }
  }, [project.path, project.name]);

  useEffect(() => {
    loadEnvStatus();
  }, [loadEnvStatus]);

  // Handle setup/reinstall environment
  const handleSetupEnv = () => {
    setShowSetupWizard(true);
  };

  // Handle setup completion - refresh environment status
  const handleSetupComplete = () => {
    loadEnvStatus();
  };

  // Handle Open in VS Code
  const handleOpenInVsCode = async () => {
    // Use actual workspace path from backend if available
    const actualWorkspacePath = projectPaths?.workspacePath || `${project.path}/${workspaceFile}`;
    // Convert backslashes to forward slashes for URI
    const normalizedPath = actualWorkspacePath.replace(/\\/g, '/');
    // Encode path to handle spaces and special characters in the deep link
    const encodedPath = encodeURIComponent(normalizedPath);
    try {
      await window.electronAPI.openExternal(`vscode://file/${encodedPath}`);
    } catch (error) {
      console.error('Failed to open VS Code:', error);
    }
  };

  // Handle Show in Folder
  const handleShowInFolder = async () => {
    // Use actual workspace path from backend if available
    const actualWorkspacePath = projectPaths?.workspacePath || `${project.path}/${workspaceFile}`;
    try {
      await window.electronAPI.showItemInFolder(actualWorkspacePath);
    } catch (error) {
      console.error('Failed to show in folder:', error);
    }
  };

  // Handle auto-activate toggle
  const handleAutoActivateChange = (checked: boolean) => {
    onSettingsChange({
      ...settings,
      condaAutoActivate: checked
    });
  };

  // Render status indicator
  const renderStatusIndicator = () => {
    if (isLoading) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">{t('python.statusCreating')}</span>
        </div>
      );
    }

    switch (envStatus.status) {
      case 'ready':
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">{t('python.statusReady')}</span>
            </div>
            {(envStatus.pythonVersion || envStatus.packageCount !== undefined) && (
              <p className="text-xs text-muted-foreground ml-6">
                {envStatus.pythonVersion && `Python ${envStatus.pythonVersion}`}
                {envStatus.pythonVersion && envStatus.packageCount !== undefined && ' | '}
                {envStatus.packageCount !== undefined && t('python.packagesInstalled', { count: envStatus.packageCount })}
              </p>
            )}
          </div>
        );
      case 'broken':
        return (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <span className="text-sm font-medium">{t('python.statusBroken')}</span>
          </div>
        );
      case 'none':
      default:
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Circle className="h-4 w-4" />
            <span className="text-sm font-medium">{t('python.statusNotConfigured')}</span>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Environment Location Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">{t('python.envLocation')}</h3>
        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-2">
          <code className="text-sm font-mono text-foreground">{envPath}</code>
          <p className="text-xs text-muted-foreground">
            {t('python.envLocationHint')}
          </p>
        </div>
      </section>

      <Separator />

      {/* Python Version Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">{t('python.pythonVersion')}</h3>
        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
          <div className="flex items-center gap-4">
            <Label className="text-sm text-foreground min-w-24">{t('python.selectVersion')}</Label>
            <Select
              value={selectedPythonVersion}
              onValueChange={setSelectedPythonVersion}
              disabled={isLoading}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('python.selectVersionPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {pythonVersions.map((version) => (
                  <SelectItem key={version} value={version}>
                    Python {version}
                    {version === recommendedVersion && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({t('common:recommended')})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {envStatus.status === 'ready' && envStatus.pythonVersion ? (
            <>
              <p className="text-xs text-success">
                {t('python.installedVersion')}: Python {envStatus.pythonVersion}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('python.versionChangeHint')}
              </p>
            </>
          ) : detectedPython ? (
            <p className="text-xs text-muted-foreground">
              {t('python.detectedFromProject')}: Python {detectedPython.version} ({detectedPython.source})
            </p>
          ) : null}
        </div>
      </section>

      <Separator />

      {/* Status Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">{t('python.status')}</h3>
        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-4">
          {renderStatusIndicator()}
          <div className="flex gap-2">
            {envStatus.status === 'none' ? (
              <Button
                size="sm"
                onClick={handleSetupEnv}
                disabled={isLoading}
              >
                {t('python.setupEnv')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSetupEnv}
                disabled={isLoading}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('python.reinstallEnv')}
              </Button>
            )}
          </div>
        </div>
      </section>

      <Separator />

      {/* VS Code Integration Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">{t('python.vscodeIntegration')}</h3>
        <div className="rounded-lg border border-border bg-muted/50 p-4 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileCode2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-foreground">{t('python.workspaceFile')}:</span>
              <code className="text-xs bg-background px-2 py-0.5 rounded">{workspaceFile}</code>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              {t('python.workspaceHint')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenInVsCode}
              disabled={envStatus.status !== 'ready'}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {t('python.openInVscode')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleShowInFolder}
              disabled={envStatus.status !== 'ready'}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              {t('python.showInFolder')}
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* Terminal Integration Section */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">{t('python.terminalIntegration')}</h3>
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5 flex-1">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <Label className="font-normal text-foreground">
                  {t('python.autoActivate')}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">
                {t('python.autoActivateHint')}
              </p>
            </div>
            <Switch
              checked={settings.condaAutoActivate ?? true}
              onCheckedChange={handleAutoActivateChange}
              disabled={envStatus.status !== 'ready'}
            />
          </div>
        </div>
      </section>

      {/* Conda Setup Wizard */}
      <CondaSetupWizard
        open={showSetupWizard}
        onOpenChange={setShowSetupWizard}
        type="project"
        projectPath={project.path}
        projectName={project.name}
        pythonVersion={selectedPythonVersion}
        onComplete={handleSetupComplete}
      />
    </div>
  );
}
