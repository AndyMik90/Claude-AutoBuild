import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  RefreshCw,
  Loader2,
  AlertCircle,
  Play,
  Settings,
  FolderOpen,
  CheckCircle,
  XCircle,
  Clock,
  Terminal as TerminalIcon,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  Copy,
  RotateCcw,
  Ban,
  FileText,
  List,
  Plus,
  Trash2,
  Edit2,
  FastForward
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from './ui/tooltip';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useProjectStore } from '../stores/project-store';
import { useSettingsStore } from '../stores/settings-store';
import type {
  UnityProfile,
  UnityProfileSettings,
  UnityPipelineRun,
  PipelineStep,
  PipelineStepType
} from '../../preload/api/unity-api';

interface UnityProps {
  projectId: string;
}

interface UnityProjectInfo {
  isUnityProject: boolean;
  version?: string;
  projectPath: string;
}

interface UnityEditorInfo {
  version: string;
  path: string;
}

interface UnityRun {
  id: string;
  action: 'editmode-tests' | 'playmode-tests' | 'build';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'running' | 'success' | 'failed' | 'canceled';
  exitCode?: number;
  command: string;
  pid?: number;
  actionId?: string;
  params?: {
    editorPath: string;
    projectPath: string;
    executeMethod?: string;
    testPlatform?: string;
    buildTarget?: string;
    testFilter?: string;
  };
  artifactPaths: {
    runDir: string;
    log?: string;
    testResults?: string;
    stdout?: string;
    stderr?: string;
    errorDigest?: string;
  };
  testsSummary?: {
    passed: number;
    failed: number;
    skipped: number;
    durationSeconds?: number;
  };
  errorSummary?: {
    errorCount: number;
    firstErrorLine?: string;
  };
  canceledReason?: string;
}

export function Unity({ projectId }: UnityProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProject = projects.find((p) => p.id === projectId);
  const settings = useSettingsStore((state) => state.settings);
  const { t } = useTranslation('unity');

  const [projectInfo, setProjectInfo] = useState<UnityProjectInfo | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const [editors, setEditors] = useState<UnityEditorInfo[]>([]);
  const [isDiscovering, setIsDiscovering] = useState(false);

  const [buildExecuteMethod, setBuildExecuteMethod] = useState<string>('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [customUnityPath, setCustomUnityPath] = useState<string>('');

  const [runs, setRuns] = useState<UnityRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<UnityRun | null>(null);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // M2: Profiles state
  const [profileSettings, setProfileSettings] = useState<UnityProfileSettings | null>(null);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UnityProfile | null>(null);
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [deleteConfirmProfile, setDeleteConfirmProfile] = useState<UnityProfile | null>(null);
  const [profileFormName, setProfileFormName] = useState<string>('');
  const [profileFormBuildMethod, setProfileFormBuildMethod] = useState<string>('');
  const [profileFormError, setProfileFormError] = useState<string>('');

  // M2: Pipeline state
  const [, setPipelines] = useState<UnityPipelineRun[]>([]);
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([
    { type: 'validate', enabled: true },
    { type: 'editmode-tests', enabled: true },
    { type: 'playmode-tests', enabled: true },
    { type: 'build', enabled: false },
    { type: 'collect-artifacts', enabled: false }
  ]);
  const [continueOnFail, setContinueOnFail] = useState(false);

  // M2: PlayMode parameters
  const [playModeBuildTarget, setPlayModeBuildTarget] = useState<string>('');
  const [playModeTestFilter, setPlayModeTestFilter] = useState<string>('');

  // Get the effective editor path based on project version
  const effectiveEditorPath = useMemo(() => {
    if (!projectInfo?.version) return '';
    const matchingEditor = editors.find(e => e.version === projectInfo.version);
    return matchingEditor?.path || '';
  }, [projectInfo?.version, editors]);

  // Detect Unity project
  const detectUnityProject = useCallback(async (overridePath?: string) => {
    if (!selectedProject) return;

    setIsDetecting(true);
    setDetectError(null);

    try {
      // Use override path, custom Unity path if set, or project root
      const pathToCheck = overridePath || customUnityPath || selectedProject.path;
      const result = await window.electronAPI.detectUnityProject(pathToCheck);
      if (result.success && result.data) {
        setProjectInfo(result.data);
      } else {
        setDetectError(result.error || t('errors.detect'));
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : t('errors.detect'));
    } finally {
      setIsDetecting(false);
    }
  }, [selectedProject, customUnityPath, t]);

  // Load Unity editors from settings or scan from folder
  const loadUnityEditors = useCallback(async () => {
    setIsDiscovering(true);

    try {
      let editorsList: UnityEditorInfo[] = [];

      // If we have a Unity Editors folder in settings, scan it
      if (settings.unityEditorsFolder) {
        const result = await window.electronAPI.scanUnityEditorsFolder(settings.unityEditorsFolder);
        if (result.success && result.data) {
          editorsList = result.data.editors || [];
        }
      }

      setEditors(editorsList);
    } catch (err) {
      console.error('Failed to load Unity editors:', err);
    } finally {
      setIsDiscovering(false);
    }
  }, [settings.unityEditorsFolder]);

  // Load Unity settings for this project
  const loadSettings = useCallback(async () => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.getUnitySettings(selectedProject.id);
      if (result.success && result.data) {
        setCustomUnityPath(result.data.unityProjectPath ?? '');
        setBuildExecuteMethod(result.data.buildExecuteMethod ?? '');
      } else {
        setCustomUnityPath('');
        setBuildExecuteMethod('');
      }
    } catch (err) {
      console.error('Failed to load Unity settings:', err);
      setCustomUnityPath('');
      setBuildExecuteMethod('');
    }
  }, [selectedProject]);

  // Load runs
  const loadRuns = useCallback(async () => {
    if (!selectedProject) return;

    setIsLoadingRuns(true);

    try {
      const result = await window.electronAPI.loadUnityRuns(selectedProject.id);
      if (result.success && result.data) {
        setRuns(result.data.runs || []);
      }
    } catch (err) {
      console.error('Failed to load Unity runs:', err);
    } finally {
      setIsLoadingRuns(false);
    }
  }, [selectedProject]);

  // M2: Load profiles
  const loadProfiles = useCallback(async () => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.getUnityProfiles(selectedProject.id);
      if (result.success && result.data) {
        const profileData = result.data;
        setProfileSettings(profileData);
        // Update PlayMode defaults from active profile
        const activeProfile = profileData.profiles.find(p => p.id === profileData.activeProfileId);
        if (activeProfile?.testDefaults?.playModeBuildTarget) {
          setPlayModeBuildTarget(activeProfile.testDefaults.playModeBuildTarget);
        }
        if (activeProfile?.testDefaults?.testFilter) {
          setPlayModeTestFilter(activeProfile.testDefaults.testFilter);
        }
      }
    } catch (err) {
      console.error('Failed to load Unity profiles:', err);
    }
  }, [selectedProject]);

  // M2: Load pipelines
  const loadPipelines = useCallback(async () => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.loadUnityPipelines(selectedProject.id);
      if (result.success && result.data) {
        setPipelines(result.data.pipelines || []);
      }
    } catch (err) {
      console.error('Failed to load Unity pipelines:', err);
    }
  }, [selectedProject]);

  // Initial load
  useEffect(() => {
    detectUnityProject();
    loadSettings();
    loadRuns();
    loadProfiles(); // M2
    loadPipelines(); // M2
  }, [detectUnityProject, loadSettings, loadRuns, loadProfiles, loadPipelines]);

  // Load editors when project info or settings change
  useEffect(() => {
    loadUnityEditors();
  }, [loadUnityEditors]);

  // Save Unity settings
  const saveSettings = async () => {
    if (!selectedProject) return;

    setIsSavingSettings(true);

    try {
      const result = await window.electronAPI.saveUnitySettings(selectedProject.id, {
        unityProjectPath: customUnityPath,
        buildExecuteMethod
      });

      if (!result.success) {
        console.error('Failed to save Unity settings:', result.error);
      }
    } catch (err) {
      console.error('Failed to save Unity settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Run EditMode tests
  const runEditModeTests = async () => {
    if (!selectedProject || !effectiveEditorPath) return;

    setIsRunning(true);
    setRunError(null);

    try {
      const result = await window.electronAPI.runUnityEditModeTests(selectedProject.id, effectiveEditorPath);
      if (result.success) {
        // Refresh runs
        await loadRuns();
      } else {
        setRunError(result.error || t('errors.runTests'));
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t('errors.runTests'));
    } finally {
      setIsRunning(false);
    }
  };

  // Run custom build
  const runBuild = async () => {
    if (!selectedProject || !effectiveEditorPath || !buildExecuteMethod) return;

    setIsRunning(true);
    setRunError(null);

    try {
      const result = await window.electronAPI.runUnityBuild(
        selectedProject.id,
        effectiveEditorPath,
        buildExecuteMethod
      );
      if (result.success) {
        // Refresh runs
        await loadRuns();
      } else {
        setRunError(result.error || t('errors.runBuild'));
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t('errors.runBuild'));
    } finally {
      setIsRunning(false);
    }
  };

  // M2: Run PlayMode tests
  const runPlayModeTests = async () => {
    if (!selectedProject || !effectiveEditorPath) return;

    setIsRunning(true);
    setRunError(null);

    try {
      const result = await window.electronAPI.runUnityPlayModeTests(
        selectedProject.id,
        effectiveEditorPath,
        {
          buildTarget: playModeBuildTarget || undefined,
          testFilter: playModeTestFilter || undefined
        }
      );
      if (result.success) {
        // Refresh runs
        await loadRuns();
      } else {
        setRunError(result.error || 'Failed to run PlayMode tests');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to run PlayMode tests');
    } finally {
      setIsRunning(false);
    }
  };

  // M2: Run pipeline
  const runPipeline = async () => {
    if (!selectedProject || !profileSettings) return;

    setIsRunningPipeline(true);

    try {
      const result = await window.electronAPI.runUnityPipeline(selectedProject.id, {
        profileId: profileSettings.activeProfileId,
        steps: pipelineSteps,
        continueOnFail
      });
      if (result.success) {
        // Refresh runs and pipelines
        await loadRuns();
        await loadPipelines();
      } else {
        console.error('Failed to run pipeline:', result.error);
      }
    } catch (err) {
      console.error('Failed to run pipeline:', err);
    } finally {
      setIsRunningPipeline(false);
    }
  };

  // M2: Set active profile
  const setActiveProfile = async (profileId: string) => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.setActiveUnityProfile(selectedProject.id, profileId);
      if (result.success) {
        await loadProfiles();
      }
    } catch (err) {
      console.error('Failed to set active profile:', err);
    }
  };

  // M2: Create profile
  const createProfile = async (profile: Omit<UnityProfile, 'id'>) => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.createUnityProfile(selectedProject.id, profile);
      if (result.success) {
        await loadProfiles();
      }
    } catch (err) {
      console.error('Failed to create profile:', err);
      throw err; // Re-throw to let caller handle
    }
  };

  // M2: Update profile
  const updateProfile = async (profileId: string, updates: Partial<Omit<UnityProfile, 'id'>>) => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.updateUnityProfile(selectedProject.id, profileId, updates);
      if (result.success) {
        await loadProfiles();
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
      throw err; // Re-throw to let caller handle
    }
  };

  // M2: Delete profile
  const deleteProfile = async (profileId: string) => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.deleteUnityProfile(selectedProject.id, profileId);
      if (result.success) {
        await loadProfiles();
      }
    } catch (err) {
      console.error('Failed to delete profile:', err);
    }
  };

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms) return t('history.durationUnavailable');
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'canceled':
        return <Ban className="h-4 w-4 text-yellow-600" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-info" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Format test summary
  const formatTestSummary = (summary: UnityRun['testsSummary']) => {
    if (!summary) return null;
    const parts: string[] = [];
    if (summary.passed > 0) parts.push(`✅ ${summary.passed}`);
    if (summary.failed > 0) parts.push(`❌ ${summary.failed}`);
    if (summary.skipped > 0) parts.push(`⏭ ${summary.skipped}`);
    return parts.join(' / ') || 'No tests';
  };

  // Cancel a running Unity run
  const cancelRun = async (runId: string) => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.cancelUnityRun(selectedProject.id, runId);
      if (result.success) {
        // Refresh runs
        await loadRuns();
      } else {
        setRunError(result.error || 'Failed to cancel run');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to cancel run');
    }
  };

  // Re-run a Unity run
  const rerun = async (runId: string) => {
    if (!selectedProject) return;

    setIsRunning(true);
    setRunError(null);

    try {
      const result = await window.electronAPI.rerunUnity(selectedProject.id, runId);
      if (result.success) {
        // Refresh runs
        await loadRuns();
      } else {
        setRunError(result.error || 'Failed to re-run');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to re-run');
    } finally {
      setIsRunning(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await window.electronAPI.copyToClipboard(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Extract Unity base version (major.minor.patch) from a version string
  const extractUnityBaseVersion = (input: string): string | null => {
    // Match Unity versions like 2021.3.15, 2021.3.15f1, 2021.3.15rc1, etc.
    // Group 1 captures the base version (major.minor.patch).
    const match = input.match(/(\d+\.\d+\.\d+)(?:f\d+|p\d+|a\d+|b\d+|rc\d+)?/i);
    return match ? match[1] : null;
  };

  // Determine version mismatch severity
  type VersionMismatchSeverity = 'none' | 'harmless' | 'minor' | 'moderate' | 'critical';
  
  const getVersionMismatchSeverity = useMemo((): { severity: VersionMismatchSeverity; message: string } => {
    if (!projectInfo?.version || !effectiveEditorPath) {
      return { severity: 'none', message: '' };
    }

    const editorBaseVersion = extractUnityBaseVersion(effectiveEditorPath);
    const projectBaseVersion = extractUnityBaseVersion(projectInfo.version);

    if (!editorBaseVersion || !projectBaseVersion) {
      return { severity: 'none', message: '' };
    }

    // If base versions match, check for release suffix differences
    if (projectBaseVersion === editorBaseVersion) {
      // Check if only release suffix differs (e.g., 2021.3.15 vs 2021.3.15f1)
      if (projectInfo.version !== effectiveEditorPath.match(/(\d+\.\d+\.\d+(?:f\d+|p\d+|a\d+|b\d+|rc\d+)?)/i)?.[1]) {
        return { 
          severity: 'harmless', 
          message: `Project targets Unity ${projectInfo.version} but editor has a different release suffix. This is typically safe.` 
        };
      }
      return { severity: 'none', message: '' };
    }

    const [eMajor, eMinor, ePatch] = editorBaseVersion.split('.').map(Number);
    const [pMajor, pMinor, pPatch] = projectBaseVersion.split('.').map(Number);

    // Major version mismatch
    if (eMajor !== pMajor) {
      return { 
        severity: 'critical', 
        message: `Major version mismatch: Project requires Unity ${projectInfo.version} but editor is ${editorBaseVersion}. This will likely cause compatibility issues and project corruption. Use the correct Unity version.` 
      };
    }

    // Minor version mismatch
    if (eMinor !== pMinor) {
      return { 
        severity: 'moderate', 
        message: `Minor version mismatch: Project requires Unity ${projectInfo.version} but editor is ${editorBaseVersion}. This may cause import issues, recompilation, or feature incompatibilities.` 
      };
    }

    // Patch version mismatch
    if (ePatch !== pPatch) {
      return { 
        severity: 'minor', 
        message: `Patch version mismatch: Project requires Unity ${projectInfo.version} but editor is ${editorBaseVersion}. This is usually safe but may trigger a reimport.` 
      };
    }

    return { severity: 'none', message: '' };
  }, [projectInfo?.version, effectiveEditorPath]);

  // Check if there's a version mismatch (for backward compatibility)
  const hasVersionMismatch = useMemo(() => {
    return getVersionMismatchSeverity.severity !== 'none' && getVersionMismatchSeverity.severity !== 'harmless';
  }, [getVersionMismatchSeverity]);

  // Check if there's a running run
  const hasRunningRun = useMemo(() => {
    return runs.some(run => run.status === 'running');
  }, [runs]);

  if (!selectedProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t('messages.selectProject')}</p>
      </div>
    );
  }

  const canRunTests = projectInfo?.isUnityProject && effectiveEditorPath && !isRunning && !hasRunningRun;
  const canRunBuild = canRunTests && buildExecuteMethod;

  // Check if project's required editor is installed
  const projectEditorInstalled = projectInfo?.version
    ? editors.some(e => e.version === projectInfo.version)
    : true;

  // Handle selecting Unity project folder
  const handleSelectUnityFolder = async () => {
    if (!selectedProject) return;

    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setCustomUnityPath(path);
        // Save immediately
        const result = await window.electronAPI.saveUnitySettings(selectedProject.id, {
          unityProjectPath: path,
          buildExecuteMethod
        });
        if (result.success) {
          // Re-detect Unity project with new path and refresh editors
          // Pass the path directly to avoid stale state
          await detectUnityProject(path);
          await loadUnityEditors();
        }
      }
    } catch (err) {
      console.error('Failed to select Unity folder:', err);
    }
  };

  // Handle editor version change
  const handleEditorVersionChange = async (newVersion: string) => {
    if (!selectedProject || !projectInfo) return;

    try {
      // Update ProjectVersion.txt
      const result = await window.electronAPI.updateUnityProjectVersion(selectedProject.id, newVersion);
      if (result.success) {
        // Refresh project info to show new version
        await detectUnityProject();
      } else {
        setRunError(result.error || t('errors.updateVersion'));
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : t('errors.updateVersion'));
    }
  };

  // Handle opening Unity project
  const handleOpenUnityProject = async () => {
    if (!selectedProject || !effectiveEditorPath) return;

    try {
      const result = await window.electronAPI.openUnityProject(selectedProject.id, effectiveEditorPath);
      if (!result.success) {
        setRunError(result.error || 'Failed to open Unity project');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to open Unity project');
    }
  };

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Box className="h-6 w-6" />
            {t('header.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('header.subtitle')}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            detectUnityProject();
            loadUnityEditors();
            loadRuns();
          }}
          disabled={isDetecting || isDiscovering}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isDetecting || isDiscovering ? 'animate-spin' : ''}`} />
          {t('header.refresh')}
        </Button>
      </div>

      {/* Error message */}
      {(detectError || runError) && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive">{t('messages.errorTitle')}</p>
              <p className="text-muted-foreground mt-1">{detectError || runError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isDetecting && !projectInfo && (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Content */}
      {projectInfo && (
        <ScrollArea className="flex-1 -mx-2">
          <div className="space-y-6 px-2">
            {/* Project Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Box className="h-5 w-5" />
                  {t('project.cardTitle')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{t('project.detected')}</span>
                  {projectInfo.isUnityProject ? (
                    <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {t('project.yes')}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted">
                      {t('project.no')}
                    </Badge>
                  )}
                </div>
                {projectInfo.isUnityProject && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground shrink-0">{t('project.unityEditor')}</span>
                        <div className="flex items-center gap-2">
                          <Select
                            value={projectInfo.version || ''}
                            onValueChange={handleEditorVersionChange}
                            disabled={isDiscovering || editors.length === 0}
                          >
                            <SelectTrigger className="h-8 text-xs font-mono w-[180px] text-left">
                              <SelectValue placeholder={isDiscovering ? t('project.loadingEditors') : t('project.noEditors')} />
                            </SelectTrigger>
                            <SelectContent>
                              {editors.map((editor) => (
                                <SelectItem key={editor.path} value={editor.version} className="text-xs font-mono">
                                  {editor.version}
                                </SelectItem>
                              ))}
                              {editors.length === 0 && !isDiscovering && (
                                <SelectItem value="__none__" disabled className="text-xs">
                                  {t('project.configureSettings')}
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          {projectEditorInstalled && effectiveEditorPath && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3"
                              onClick={handleOpenUnityProject}
                              title={t('project.openProject')}
                            >
                              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                              {t('project.openProject')}
                            </Button>
                          )}
                        </div>
                      </div>

                      {projectInfo.version && !projectEditorInstalled && (
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
                          <span className="text-xs text-muted-foreground">
                            {t('project.editorNotInstalled')}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2 ml-auto bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
                            onClick={() => window.electronAPI.openExternal(`https://unity.com/releases/editor/archive`)}
                          >
                            {t('project.installVersion', { version: projectInfo.version })}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">{t('project.projectPath')}</span>
                      <span className="text-sm font-mono text-right break-all max-w-[60%]">
                        {projectInfo.projectPath}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Version Mismatch Warning */}
            {projectInfo.isUnityProject && hasVersionMismatch && (
              <div className={`rounded-lg border p-4 text-sm ${
                getVersionMismatchSeverity.severity === 'critical' 
                  ? 'border-red-500/50 bg-red-500/10' 
                  : getVersionMismatchSeverity.severity === 'moderate'
                  ? 'border-orange-500/50 bg-orange-500/10'
                  : 'border-yellow-500/50 bg-yellow-500/10'
              }`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${
                    getVersionMismatchSeverity.severity === 'critical'
                      ? 'text-red-600 dark:text-red-500'
                      : getVersionMismatchSeverity.severity === 'moderate'
                      ? 'text-orange-600 dark:text-orange-500'
                      : 'text-yellow-600 dark:text-yellow-500'
                  }`} />
                  <div>
                    <p className={`font-medium ${
                      getVersionMismatchSeverity.severity === 'critical'
                        ? 'text-red-700 dark:text-red-400'
                        : getVersionMismatchSeverity.severity === 'moderate'
                        ? 'text-orange-700 dark:text-orange-400'
                        : 'text-yellow-700 dark:text-yellow-400'
                    }`}>
                      {getVersionMismatchSeverity.severity === 'critical' ? 'Critical ' : ''}
                      Version Mismatch Warning
                    </p>
                    <p className={`mt-1 ${
                      getVersionMismatchSeverity.severity === 'critical'
                        ? 'text-red-600 dark:text-red-500'
                        : getVersionMismatchSeverity.severity === 'moderate'
                        ? 'text-orange-600 dark:text-orange-500'
                        : 'text-yellow-600 dark:text-yellow-500'
                    }`}>
                      {getVersionMismatchSeverity.message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Not a Unity project - show empty state */}
            {!projectInfo.isUnityProject && (
              <div className="flex flex-col items-center justify-center text-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{t('emptyState.title')}</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  {t('emptyState.description')}
                </p>
                <ul className="text-sm text-muted-foreground mt-2 text-left list-disc list-inside">
                  <li>{t('emptyState.requirements.projectVersion')}</li>
                  <li>{t('emptyState.requirements.assets')}</li>
                  <li>{t('emptyState.requirements.manifest')}</li>
                </ul>
                <div className="mt-6">
                  <Button
                    variant="outline"
                    onClick={handleSelectUnityFolder}
                    className="gap-2"
                  >
                    <FolderOpen className="h-4 w-4" />
                    {t('emptyState.selectFolder')}
                  </Button>
                  {customUnityPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {t('emptyState.selectedPath', { path: customUnityPath })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Profile Selector Card */}
            {projectInfo.isUnityProject && profileSettings && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    {t('profiles.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Select
                      value={profileSettings.activeProfileId || ''}
                      onValueChange={setActiveProfile}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={t('profiles.selectProfile')} />
                      </SelectTrigger>
                      <SelectContent>
                        {profileSettings.profiles.length === 0 ? (
                          <SelectItem value="" disabled>
                            {t('profiles.noProfiles')}
                          </SelectItem>
                        ) : (
                          profileSettings.profiles.map((profile) => (
                            <SelectItem key={profile.id} value={profile.id}>
                              {profile.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsProfileDialogOpen(true)}
                      title={t('profiles.manage')}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions Card */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    {t('actions.title')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Run EditMode Tests */}
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={runEditModeTests}
                      disabled={!canRunTests}
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('actions.runningTests')}
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          {t('actions.runEditModeTests')}
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('actions.editModeDescription')}
                    </p>
                    {!effectiveEditorPath && (
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t('actions.selectEditorPrompt')}
                      </p>
                    )}
                  </div>

                  {/* Run PlayMode Tests */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="playmode-target" className="text-xs">
                          {t('actions.buildTargetLabel')}
                        </Label>
                        <Input
                          id="playmode-target"
                          value={playModeBuildTarget}
                          onChange={(e) => setPlayModeBuildTarget(e.target.value)}
                          placeholder={t('actions.buildTargetDefault', { target: 'Auto' })}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="test-filter" className="text-xs">
                          {t('actions.testFilterLabel')}
                        </Label>
                        <Input
                          id="test-filter"
                          value={playModeTestFilter}
                          onChange={(e) => setPlayModeTestFilter(e.target.value)}
                          placeholder={t('actions.testFilterPlaceholder')}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={runPlayModeTests}
                      disabled={!canRunTests}
                      variant="secondary"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('actions.runningTests')}
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          {t('actions.runPlayModeTests')}
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('actions.playModeDescription')}
                    </p>
                  </div>

                  {/* Build (Custom) */}
                  <div className="space-y-2">
                    <Label htmlFor="execute-method">{t('actions.buildExecuteMethod')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="execute-method"
                        value={buildExecuteMethod}
                        onChange={(e) => setBuildExecuteMethod(e.target.value)}
                        placeholder={t('actions.buildPlaceholder')}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={saveSettings}
                        disabled={isSavingSettings}
                      >
                        {isSavingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : t('actions.save')}
                      </Button>
                    </div>
                    <Button
                      className="w-full"
                      onClick={runBuild}
                      disabled={!canRunBuild}
                      variant="secondary"
                    >
                      {isRunning ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('actions.runningBuild')}
                        </>
                      ) : (
                        <>
                          <Settings className="h-4 w-4 mr-2" />
                          {t('actions.buildButton')}
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      {t('actions.buildDescription')}
                    </p>
                    {!buildExecuteMethod && (
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t('actions.configureExecute')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Pipeline Card */}
            {projectInfo.isUnityProject && profileSettings && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FastForward className="h-5 w-5" />
                    {t('pipeline.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('pipeline.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Pipeline Steps */}
                  <div className="space-y-2">
                    {pipelineSteps.map((step, index) => (
                      <div key={step.type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`step-${step.type}`}
                          checked={step.enabled}
                          onCheckedChange={(checked) => {
                            const newSteps = [...pipelineSteps];
                            newSteps[index] = { ...step, enabled: !!checked };
                            setPipelineSteps(newSteps);
                          }}
                        />
                        <Label
                          htmlFor={`step-${step.type}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {t(`pipeline.steps.${step.type}`)}
                        </Label>
                      </div>
                    ))}
                  </div>

                  {/* Continue on Fail */}
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="continue-on-fail"
                      checked={continueOnFail}
                      onCheckedChange={(checked) => setContinueOnFail(!!checked)}
                    />
                    <Label
                      htmlFor="continue-on-fail"
                      className="text-sm font-normal cursor-pointer"
                    >
                      {t('pipeline.continueOnFail')}
                    </Label>
                  </div>

                  {/* Run Pipeline Button */}
                  <Button
                    className="w-full"
                    onClick={runPipeline}
                    disabled={
                      isRunningPipeline ||
                      !effectiveEditorPath ||
                      !pipelineSteps.some((step) => step.enabled)
                    }
                  >
                    {isRunningPipeline ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {t('pipeline.running')}
                      </>
                    ) : (
                      <>
                        <FastForward className="h-4 w-4 mr-2" />
                        {t('pipeline.runPipeline')}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Run History Card */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t('history.title')}
                  </CardTitle>
                  <CardDescription>
                    {t('history.description', { count: runs.length })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingRuns ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : runs.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {runs.map((run) => {
                        const testSummary = formatTestSummary(run.testsSummary);
                        const hasErrors = run.errorSummary && run.errorSummary.errorCount > 0;

                        return (
                          <div
                            key={run.id}
                            className="rounded-lg border border-border overflow-hidden"
                          >
                            <button
                              onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                              className="w-full text-left p-3 hover:bg-accent/50 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {getStatusIcon(run.status)}
                                  <span className="text-sm font-medium">
                                    {t(`history.actionLabels.${run.action}`)}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {run.status}
                                  </Badge>
                                  {testSummary && (
                                    <span className="text-xs text-muted-foreground">
                                      {testSummary}
                                    </span>
                                  )}
                                  {hasErrors && run.errorSummary && (
                                    <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-destructive/30">
                                      ⚠️ {run.errorSummary.errorCount} error{run.errorSummary.errorCount > 1 ? 's' : ''}
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {formatDuration(run.durationMs)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(run.startedAt).toLocaleString()}
                              </div>
                            </button>

                            {/* Expanded details */}
                            {selectedRun?.id === run.id && (
                              <div className="px-3 pb-3 pt-1 border-t border-border space-y-3">
                                {/* Action buttons */}
                                <div className="flex gap-2">
                                  {run.status === 'running' && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        cancelRun(run.id);
                                      }}
                                    >
                                      <Ban className="h-3 w-3 mr-1" />
                                      Cancel
                                    </Button>
                                  )}
                                  {run.status !== 'running' && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            rerun(run.id);
                                          }}
                                          disabled={!run.params || hasRunningRun}
                                        >
                                          <RotateCcw className="h-3 w-3 mr-1" />
                                          Re-run
                                        </Button>
                                      </TooltipTrigger>
                                      {(!run.params || hasRunningRun) && (
                                        <TooltipContent>
                                          {!run.params 
                                            ? 'Cannot re-run: parameters not available' 
                                            : 'Cannot re-run: another Unity action is currently running'}
                                        </TooltipContent>
                                      )}
                                    </Tooltip>
                                  )}
                                </div>

                                {/* Test summary details */}
                                {run.testsSummary && (
                                  <div>
                                    <p className="text-xs font-medium mb-1">Tests</p>
                                    <div className="text-xs bg-muted p-2 rounded space-y-1">
                                      <div>Passed: {run.testsSummary.passed}</div>
                                      <div>Failed: {run.testsSummary.failed}</div>
                                      <div>Skipped: {run.testsSummary.skipped}</div>
                                      {run.testsSummary.durationSeconds && (
                                        <div>Duration: {run.testsSummary.durationSeconds.toFixed(2)}s</div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Error digest */}
                                {hasErrors && run.artifactPaths.errorDigest && (() => {
                                  const errorDigestPath = run.artifactPaths.errorDigest;
                                  return (
                                    <div>
                                      <p className="text-xs font-medium mb-1">Error Digest</p>
                                      <div className="space-y-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs w-full justify-start"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.electronAPI.openPath(errorDigestPath);
                                          }}
                                        >
                                          <FileText className="h-3 w-3 mr-1" />
                                          Open Error Digest
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs w-full justify-start"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(errorDigestPath);
                                          }}
                                        >
                                          <Copy className="h-3 w-3 mr-1" />
                                          Copy Error Digest Path
                                        </Button>
                                        {run.errorSummary?.firstErrorLine && (
                                          <div className="text-xs bg-destructive/10 p-2 rounded text-destructive">
                                            {run.errorSummary.firstErrorLine}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* Command */}
                                <div>
                                  <p className="text-xs font-medium mb-1">{t('history.command')}</p>
                                  <div className="relative">
                                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                      {run.command}
                                    </pre>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="absolute top-1 right-1 h-6 w-6 p-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(run.command);
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Artifacts */}
                                <div>
                                  <p className="text-xs font-medium mb-1">{t('history.artifacts')}</p>
                                  <div className="space-y-1">
                                    <div className="flex gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs flex-1 justify-start"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.electronAPI.openPath(run.artifactPaths.runDir);
                                        }}
                                      >
                                        <FolderOpen className="h-3 w-3 mr-1" />
                                        {t('history.openRunDirectory')}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(run.artifactPaths.runDir);
                                        }}
                                      >
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    {run.artifactPaths.log && (
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs flex-1 justify-start"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.electronAPI.openPath(run.artifactPaths.log!);
                                          }}
                                        >
                                          <TerminalIcon className="h-3 w-3 mr-1" />
                                          {t('history.unityLog')}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(run.artifactPaths.log!);
                                          }}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                    {run.artifactPaths.testResults && (
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs flex-1 justify-start"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.electronAPI.openPath(run.artifactPaths.testResults!);
                                          }}
                                        >
                                          <ChevronRight className="h-3 w-3 mr-1" />
                                          {t('history.testResults')}
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(run.artifactPaths.testResults!);
                                          }}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      )}
    </div>

      {/* Profile Management Dialog */}
      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('profiles.dialog.title')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Profile List */}
            {profileSettings && profileSettings.profiles.length > 0 && (
              <div className="space-y-2">
                {profileSettings.profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{profile.name}</div>
                      {profile.buildExecuteMethod && (
                        <div className="text-xs text-muted-foreground">
                          {profile.buildExecuteMethod}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingProfile(profile);
                          setProfileFormName(profile.name);
                          setProfileFormBuildMethod(profile.buildExecuteMethod || '');
                          setProfileFormError('');
                        }}
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        {t('profiles.dialog.edit')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteConfirmProfile(profile)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t('profiles.dialog.delete')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create New Profile Button */}
            {!editingProfile && !isCreatingProfile && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setIsCreatingProfile(true);
                  setProfileFormName('');
                  setProfileFormBuildMethod('');
                  setProfileFormError('');
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('profiles.dialog.createNew')}
              </Button>
            )}

            {/* Profile Form (Create or Edit) */}
            {(isCreatingProfile || editingProfile) && (
              <div className="space-y-4 p-4 border rounded-lg">
                {profileFormError && (
                  <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
                    {profileFormError}
                  </div>
                )}
                <div>
                  <Label htmlFor="profile-name">{t('profiles.dialog.nameLabel')}</Label>
                  <Input
                    id="profile-name"
                    placeholder={t('profiles.dialog.namePlaceholder')}
                    value={profileFormName}
                    onChange={(e) => {
                      setProfileFormName(e.target.value);
                      setProfileFormError(''); // Clear error on input
                    }}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="profile-build-method">{t('profiles.dialog.buildMethodLabel')}</Label>
                  <Input
                    id="profile-build-method"
                    placeholder={t('profiles.dialog.buildMethodPlaceholder')}
                    value={profileFormBuildMethod}
                    onChange={(e) => setProfileFormBuildMethod(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      // Validate profile name
                      const trimmedName = profileFormName.trim();
                      if (!trimmedName) {
                        setProfileFormError(t('profiles.dialog.profileNameRequired'));
                        return;
                      }

                      const profileData = {
                        name: trimmedName,
                        buildExecuteMethod: profileFormBuildMethod.trim() || undefined,
                        testDefaults: {
                          editModeEnabled: true,
                          playModeEnabled: true
                        }
                      };

                      try {
                        if (editingProfile) {
                          await updateProfile(editingProfile.id, profileData);
                        } else {
                          await createProfile(profileData);
                        }
                        // Reset form and close dialog only on success
                        setIsCreatingProfile(false);
                        setEditingProfile(null);
                        setProfileFormName('');
                        setProfileFormBuildMethod('');
                        setProfileFormError('');
                        setIsProfileDialogOpen(false);
                      } catch (error) {
                        console.error('Failed to save profile:', error);
                        setProfileFormError(t('profiles.dialog.saveFailed'));
                        // Keep form open on error
                      }
                    }}
                  >
                    {editingProfile ? t('profiles.dialog.save') : t('profiles.dialog.create')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsCreatingProfile(false);
                      setEditingProfile(null);
                      setProfileFormName('');
                      setProfileFormBuildMethod('');
                      setProfileFormError('');
                    }}
                  >
                    {t('profiles.dialog.cancel')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmProfile !== null} onOpenChange={(open) => !open && setDeleteConfirmProfile(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profiles.dialog.confirmDeleteTitle')}</DialogTitle>
          </DialogHeader>
          <p>{t('profiles.dialog.confirmDelete', { name: deleteConfirmProfile?.name || '' })}</p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmProfile(null)}
            >
              {t('profiles.dialog.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirmProfile) {
                  deleteProfile(deleteConfirmProfile.id);
                  setDeleteConfirmProfile(null);
                }
              }}
            >
              {t('profiles.dialog.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
