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
  FastForward,
  Stethoscope,
  Wrench,
  Package,
  Info,
  ChevronDown,
  ChevronUp,
  Download
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
  PipelineStepType,
  UnityDoctorCheck,
  UnityDoctorReport,
  UnityTweakParams,
  UnityPackageInfo
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
  action: 'editmode-tests' | 'playmode-tests' | 'build' | 'tweak' | 'upm-resolve' | 'bridge-install';
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
    tweakAction?: string;
    targetGroup?: string;
    symbol?: string;
    backend?: string;
  };
  artifactPaths: {
    runDir: string;
    log?: string;
    testResults?: string;
    stdout?: string;
    stderr?: string;
    errorDigest?: string;
    preBackupDir?: string;
    postBackupDir?: string;
    diffFile?: string;
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
  tweakSummary?: {
    action: string;
    description: string;
    changedFiles: string[];
    backupCreated: boolean;
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
  const [isRunningEditMode, setIsRunningEditMode] = useState(false);
  const [isRunningPlayMode, setIsRunningPlayMode] = useState(false);
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
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
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

  // M3: Unity Doctor state
  const [doctorReport, setDoctorReport] = useState<UnityDoctorReport | null>(null);
  const [isDoctorRunning, setIsDoctorRunning] = useState(false);
  const [bridgeInstalled, setBridgeInstalled] = useState(false);
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  // M3: Project Tweaks state
  const [tweakTargetGroup, setTweakTargetGroup] = useState('Standalone');
  const [defineSymbol, setDefineSymbol] = useState('');
  const [scriptingBackend, setScriptingBackend] = useState('Mono');
  const [tweakBuildTarget, setTweakBuildTarget] = useState('StandaloneWindows64');

  // M3: UPM state
  const [packages, setPackages] = useState<UnityPackageInfo[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);

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
        setProfileSettings(result.data);
      }
    } catch (err) {
      console.error('Failed to load Unity profiles:', err);
    }
  }, [selectedProject]);

  // Initial load
  useEffect(() => {
    detectUnityProject();
    loadSettings();
    loadRuns();
    loadProfiles(); // M2
  }, [detectUnityProject, loadSettings, loadRuns, loadProfiles]);

  // Load editors when project info or settings change
  useEffect(() => {
    loadUnityEditors();
  }, [loadUnityEditors]);

  // Update PlayMode defaults when active profile changes
  useEffect(() => {
    if (!profileSettings) return;
    
    const activeProfile = profileSettings.profiles.find(p => p.id === profileSettings.activeProfileId);
    if (activeProfile?.testDefaults?.playModeBuildTarget) {
      setPlayModeBuildTarget(activeProfile.testDefaults.playModeBuildTarget);
    }
    if (activeProfile?.testDefaults?.testFilter) {
      setPlayModeTestFilter(activeProfile.testDefaults.testFilter);
    }
  }, [profileSettings?.activeProfileId]);

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

    setIsRunningEditMode(true);
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
      setIsRunningEditMode(false);
    }
  };

  // Run custom build
  const runBuild = async () => {
    if (!selectedProject || !effectiveEditorPath || !buildExecuteMethod) return;

    setIsRunningEditMode(true);
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
      setIsRunningEditMode(false);
    }
  };

  // M2: Run PlayMode tests
  const runPlayModeTests = async () => {
    if (!selectedProject || !effectiveEditorPath) return;

    setIsRunningPlayMode(true);
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
      setIsRunningPlayMode(false);
    }
  };

  // M2: Run pipeline
  const runPipeline = async () => {
    if (!selectedProject || !profileSettings) return;

    setIsRunningPipeline(true);
    setPipelineError(null);

    try {
      const result = await window.electronAPI.runUnityPipeline(selectedProject.id, {
        profileId: profileSettings.activeProfileId,
        steps: pipelineSteps,
        continueOnFail
      });
      if (result.success) {
        // Refresh runs
        await loadRuns();
      } else {
        const errorMsg = result.error || 'Failed to run pipeline';
        setPipelineError(errorMsg);
        console.error('Failed to run pipeline:', errorMsg);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to run pipeline';
      setPipelineError(errorMsg);
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

  // M3: Run Unity Doctor checks
  const runDoctorChecks = async () => {
    if (!selectedProject) return;

    setIsDoctorRunning(true);
    try {
      const result = await window.electronAPI.runUnityDoctorChecks(
        selectedProject.id,
        effectiveEditorPath
      );
      if (result.success && result.data) {
        setDoctorReport(result.data);
        // Also check bridge status
        const bridgeResult = await window.electronAPI.checkBridgeInstalled(selectedProject.id);
        if (bridgeResult.success && bridgeResult.data) {
          setBridgeInstalled(bridgeResult.data.installed);
        }
      }
    } catch (err) {
      console.error('Failed to run Unity Doctor checks:', err);
    } finally {
      setIsDoctorRunning(false);
    }
  };

  // M3: Install Unity Bridge
  const installBridge = async () => {
    if (!selectedProject) return;

    try {
      const result = await window.electronAPI.installBridge(selectedProject.id);
      if (result.success) {
        setBridgeInstalled(true);
        await loadRuns(); // Refresh to show the install run
        await runDoctorChecks(); // Re-run doctor to update bridge status
      }
    } catch (err) {
      console.error('Failed to install Unity Bridge:', err);
    }
  };

  // M3: Add define symbol
  const addDefineSymbol = async () => {
    if (!selectedProject || !effectiveEditorPath || !defineSymbol.trim()) return;

    try {
      const result = await window.electronAPI.tweakAddDefine(
        selectedProject.id,
        effectiveEditorPath,
        {
          targetGroup: tweakTargetGroup,
          symbol: defineSymbol.trim(),
        }
      );
      if (result.success) {
        setDefineSymbol(''); // Clear input
        await loadRuns(); // Refresh to show the tweak run
      }
    } catch (err) {
      console.error('Failed to add define symbol:', err);
    }
  };

  // M3: Remove define symbol
  const removeDefineSymbol = async () => {
    if (!selectedProject || !effectiveEditorPath || !defineSymbol.trim()) return;

    try {
      const result = await window.electronAPI.tweakRemoveDefine(
        selectedProject.id,
        effectiveEditorPath,
        {
          targetGroup: tweakTargetGroup,
          symbol: defineSymbol.trim(),
        }
      );
      if (result.success) {
        setDefineSymbol(''); // Clear input
        await loadRuns(); // Refresh to show the tweak run
      }
    } catch (err) {
      console.error('Failed to remove define symbol:', err);
    }
  };

  // M3: Set scripting backend
  const setBackend = async () => {
    if (!selectedProject || !effectiveEditorPath) return;

    try {
      const result = await window.electronAPI.tweakSetBackend(
        selectedProject.id,
        effectiveEditorPath,
        {
          targetGroup: tweakTargetGroup,
          backend: scriptingBackend,
        }
      );
      if (result.success) {
        await loadRuns(); // Refresh to show the tweak run
      }
    } catch (err) {
      console.error('Failed to set scripting backend:', err);
    }
  };

  // M3: Switch build target
  const switchBuildTarget = async () => {
    if (!selectedProject || !effectiveEditorPath) return;

    try {
      const result = await window.electronAPI.tweakSwitchBuildTarget(
        selectedProject.id,
        effectiveEditorPath,
        {
          buildTarget: tweakBuildTarget,
        }
      );
      if (result.success) {
        await loadRuns(); // Refresh to show the tweak run
      }
    } catch (err) {
      console.error('Failed to switch build target:', err);
    }
  };

  // M3: List Unity packages
  const listPackages = async () => {
    if (!selectedProject) return;

    setIsLoadingPackages(true);
    try {
      const result = await window.electronAPI.upmListPackages(selectedProject.id);
      if (result.success && result.data) {
        setPackages(result.data.packages);
      }
    } catch (err) {
      console.error('Failed to list Unity packages:', err);
    } finally {
      setIsLoadingPackages(false);
    }
  };

  // M3: UPM Resolve
  const upmResolve = async () => {
    if (!selectedProject || !effectiveEditorPath) return;

    try {
      const result = await window.electronAPI.upmResolve(selectedProject.id, effectiveEditorPath);
      if (result.success) {
        await loadRuns(); // Refresh to show the UPM resolve run
        await listPackages(); // Refresh package list
      }
    } catch (err) {
      console.error('Failed to resolve Unity packages:', err);
    }
  };

  // M3: Copy diagnostics text
  const copyDiagnostics = async () => {
    if (!doctorReport) return;

    try {
      const result = await window.electronAPI.getDiagnosticsText(doctorReport);
      if (result.success && result.data) {
        await window.electronAPI.copyToClipboard(result.data);
      }
    } catch (err) {
      console.error('Failed to copy diagnostics:', err);
    }
  };

  // M3: Toggle check expansion
  const toggleCheckExpansion = (checkId: string) => {
    setExpandedChecks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(checkId)) {
        newSet.delete(checkId);
      } else {
        newSet.add(checkId);
      }
      return newSet;
    });
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

  // Get action label with fallback for new M3 actions
  const getActionLabel = (action: UnityRun['action']) => {
    switch (action) {
      case 'editmode-tests':
        return t('history.actionLabels.editmode-tests', { defaultValue: 'EditMode Tests' });
      case 'playmode-tests':
        return t('history.actionLabels.playmode-tests', { defaultValue: 'PlayMode Tests' });
      case 'build':
        return t('history.actionLabels.build', { defaultValue: 'Build' });
      case 'tweak':
        return t('history.actionLabels.tweak', { defaultValue: 'Project Tweak' });
      case 'upm-resolve':
        return t('history.actionLabels.upm-resolve', { defaultValue: 'UPM Resolve' });
      case 'bridge-install':
        return t('history.actionLabels.bridge-install', { defaultValue: 'Bridge Install' });
      default:
        return action;
    }
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

    setIsRunningEditMode(true);
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
      setIsRunningEditMode(false);
    }
  };

  // Delete a single Unity run
  const deleteRun = async (runId: string) => {
    if (!selectedProject) return;

    const confirmed = window.confirm(t('history.confirmDelete'));
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.deleteUnityRun(selectedProject.id, runId);
      if (result.success) {
        // Close the expanded run if it was deleted
        if (selectedRun?.id === runId) {
          setSelectedRun(null);
        }
        // Refresh runs
        await loadRuns();
      } else {
        setRunError(result.error || 'Failed to delete run');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to delete run');
    }
  };

  // Clear all Unity runs
  const clearAllRuns = async () => {
    if (!selectedProject) return;

    const confirmed = window.confirm(t('history.confirmClearAll'));
    if (!confirmed) return;

    try {
      const result = await window.electronAPI.clearUnityRuns(selectedProject.id);
      if (result.success) {
        setSelectedRun(null);
        // Refresh runs
        await loadRuns();
      } else {
        setRunError(result.error || 'Failed to clear runs');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to clear runs');
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

  const canRunTests = projectInfo?.isUnityProject && effectiveEditorPath && !isRunningEditMode && !isRunningPlayMode && !hasRunningRun;
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

            {/* M3: Unity Doctor Panel */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Stethoscope className="h-5 w-5" />
                      Unity Doctor
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {doctorReport && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyDiagnostics}
                          className="gap-2"
                        >
                          <Copy className="h-4 w-4" />
                          Copy Report
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        onClick={runDoctorChecks}
                        disabled={isDoctorRunning}
                        className="gap-2"
                      >
                        {isDoctorRunning ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Run Diagnostics
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    Check Unity project, editor, toolchain, and package health
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isDoctorRunning && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {!isDoctorRunning && !doctorReport && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>Click "Run Diagnostics" to check your Unity project health</p>
                    </div>
                  )}

                  {doctorReport && !isDoctorRunning && (
                    <div className="space-y-4">
                      {/* Summary */}
                      <div className="flex items-center gap-4 p-3 bg-muted rounded-md">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <span className="text-sm font-medium">{doctorReport.summary.success} OK</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <span className="text-sm font-medium">{doctorReport.summary.warning} Warnings</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-destructive" />
                          <span className="text-sm font-medium">{doctorReport.summary.error} Errors</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Info className="h-4 w-4 text-info" />
                          <span className="text-sm font-medium">{doctorReport.summary.info} Info</span>
                        </div>
                      </div>

                      {/* Checks by category */}
                      {['project', 'editor', 'toolchain', 'packages', 'git'].map((category) => {
                        const categoryChecks = doctorReport.checks.filter((c) => c.category === category);
                        if (categoryChecks.length === 0) return null;

                        return (
                          <div key={category} className="space-y-2">
                            <h4 className="text-sm font-semibold text-foreground capitalize">{category}</h4>
                            <div className="space-y-1">
                              {categoryChecks.map((check) => (
                                <div
                                  key={check.id}
                                  className="border rounded-md p-3 hover:bg-muted/50 transition-colors"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-2 flex-1">
                                      <div className="mt-0.5">
                                        {check.status === 'success' && (
                                          <CheckCircle className="h-4 w-4 text-success" />
                                        )}
                                        {check.status === 'warning' && (
                                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                                        )}
                                        {check.status === 'error' && (
                                          <XCircle className="h-4 w-4 text-destructive" />
                                        )}
                                        {check.status === 'info' && (
                                          <Info className="h-4 w-4 text-info" />
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-medium">{check.message}</span>
                                        </div>
                                        {check.details && (
                                          <button
                                            onClick={() => toggleCheckExpansion(check.id)}
                                            className="flex items-center gap-1 mt-1 text-xs text-muted-foreground hover:text-foreground"
                                          >
                                            {expandedChecks.has(check.id) ? (
                                              <ChevronUp className="h-3 w-3" />
                                            ) : (
                                              <ChevronDown className="h-3 w-3" />
                                            )}
                                            Details
                                          </button>
                                        )}
                                        {expandedChecks.has(check.id) && check.details && (
                                          <div className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded">
                                            {check.details}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {check.actionable && check.fixAction === 'install-bridge' && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={installBridge}
                                        className="gap-1"
                                      >
                                        <Download className="h-3 w-3" />
                                        Install
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* M3: Project Tweaks Panel */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    Project Tweaks
                  </CardTitle>
                  <CardDescription>
                    Safe project settings modification with backups and diffs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Bridge Warning */}
                  {!bridgeInstalled && (
                    <div className="border-l-4 border-yellow-600 bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Unity Bridge Required
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            The Unity Bridge enables safe project tweaks and uses official Unity APIs instead of directly editing project files.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={installBridge}
                            className="mt-2 gap-2"
                          >
                            <Download className="h-3 w-3" />
                            Install Unity Bridge
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Define Symbols */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Scripting Define Symbols</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor="targetGroup" className="text-xs text-muted-foreground">Target Group</Label>
                        <Select value={tweakTargetGroup} onValueChange={setTweakTargetGroup}>
                          <SelectTrigger id="targetGroup">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Standalone">Standalone</SelectItem>
                            <SelectItem value="Android">Android</SelectItem>
                            <SelectItem value="iOS">iOS</SelectItem>
                            <SelectItem value="WebGL">WebGL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="defineSymbol" className="text-xs text-muted-foreground">Symbol</Label>
                        <Input
                          id="defineSymbol"
                          value={defineSymbol}
                          onChange={(e) => setDefineSymbol(e.target.value)}
                          placeholder="MY_DEFINE"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={addDefineSymbol}
                        disabled={!bridgeInstalled || !effectiveEditorPath || !defineSymbol.trim()}
                        className="gap-1"
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={removeDefineSymbol}
                        disabled={!bridgeInstalled || !effectiveEditorPath || !defineSymbol.trim()}
                        className="gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  {/* Scripting Backend */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Scripting Backend</Label>
                    <div className="flex gap-2">
                      <Select value={scriptingBackend} onValueChange={setScriptingBackend}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Mono">Mono</SelectItem>
                          <SelectItem value="IL2CPP">IL2CPP</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={setBackend}
                        disabled={!bridgeInstalled || !effectiveEditorPath}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>

                  {/* Build Target */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold">Build Target</Label>
                    <div className="flex gap-2">
                      <Select value={tweakBuildTarget} onValueChange={setTweakBuildTarget}>
                        <SelectTrigger className="flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="StandaloneWindows64">Windows 64-bit</SelectItem>
                          <SelectItem value="StandaloneOSX">macOS</SelectItem>
                          <SelectItem value="StandaloneLinux64">Linux 64-bit</SelectItem>
                          <SelectItem value="Android">Android</SelectItem>
                          <SelectItem value="iOS">iOS</SelectItem>
                          <SelectItem value="WebGL">WebGL</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={switchBuildTarget}
                        disabled={!bridgeInstalled || !effectiveEditorPath}
                      >
                        Switch
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* M3: Unity Package Manager Panel */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Unity Package Manager
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={listPackages}
                        disabled={isLoadingPackages}
                        className="gap-2"
                      >
                        {isLoadingPackages ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                        Refresh
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={upmResolve}
                        disabled={!bridgeInstalled || !effectiveEditorPath}
                        className="gap-2"
                      >
                        <Download className="h-4 w-4" />
                        UPM Resolve
                      </Button>
                    </div>
                  </div>
                  <CardDescription>
                    View and resolve Unity Package Manager dependencies
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingPackages && (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {!isLoadingPackages && packages.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No packages found. Click "Refresh" to load packages from manifest.json</p>
                    </div>
                  )}

                  {!isLoadingPackages && packages.length > 0 && (
                    <ScrollArea className="h-[200px]">
                      <div className="space-y-1">
                        {packages.map((pkg) => (
                          <div
                            key={pkg.name}
                            className="flex items-center justify-between p-2 border rounded hover:bg-muted/50"
                          >
                            <span className="text-sm font-mono text-foreground">{pkg.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {pkg.version}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
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
                  {/* Test Configuration */}
                  <div className="space-y-2">
                    <Label htmlFor="test-filter" className="text-xs">
                      {t('actions.testFilterLabel')}
                    </Label>
                    <Input
                      id="test-filter"
                      value={playModeTestFilter}
                      onChange={(e) => setPlayModeTestFilter(e.target.value)}
                      placeholder={t('actions.testFilterPlaceholder')}
                    />
                  </div>

                  {/* Run Tests Buttons */}
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={runEditModeTests}
                        disabled={!canRunTests}
                      >
                        {isRunningEditMode ? (
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
                      <Button
                        onClick={runPlayModeTests}
                        disabled={!canRunTests}
                      >
                        {isRunningPlayMode ? (
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
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <p>{t('actions.editModeDescription')}</p>
                      <p>{t('actions.playModeDescription')}</p>
                    </div>
                    {!effectiveEditorPath && (
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {t('actions.selectEditorPrompt')}
                      </p>
                    )}
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
                      {isRunningEditMode ? (
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

                  {/* Pipeline Error Message */}
                  {pipelineError && (
                    <div className="mt-2 text-sm text-red-500">
                      {pipelineError}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Run History Card */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        {t('history.title')}
                      </CardTitle>
                      <CardDescription>
                        {t('history.description', { count: runs.length })}
                      </CardDescription>
                    </div>
                    {runs.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={clearAllRuns}
                        className="h-8"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('history.clearAll')}
                      </Button>
                    )}
                  </div>
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
                                    {getActionLabel(run.action)}
                                  </span>
                                  <Badge variant="outline" className="text-xs">
                                    {run.status}
                                  </Badge>
                                  {testSummary && (
                                    <span className="text-xs text-muted-foreground">
                                      {testSummary}
                                    </span>
                                  )}
                                  {run.tweakSummary && (
                                    <Badge variant="secondary" className="text-xs">
                                      {run.tweakSummary.description}
                                    </Badge>
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
                                    <>
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
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs text-destructive hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteRun(run.id);
                                        }}
                                      >
                                        <XCircle className="h-3 w-3 mr-1" />
                                        {t('history.deleteRun')}
                                      </Button>
                                    </>
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
                                    <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap break-all max-w-full">
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
                                    {run.artifactPaths.diffFile && (
                                      <div className="flex gap-1">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-xs flex-1 justify-start"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            window.electronAPI.openPath(run.artifactPaths.diffFile!);
                                          }}
                                        >
                                          <FileText className="h-3 w-3 mr-1" />
                                          View Diff
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(run.artifactPaths.diffFile!);
                                          }}
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Tweak Summary - Changed Files */}
                                {run.tweakSummary && run.tweakSummary.changedFiles.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs font-medium mb-1">Changed Files</p>
                                    <div className="bg-muted p-2 rounded text-xs font-mono space-y-0.5">
                                      {run.tweakSummary.changedFiles.map((file, idx) => (
                                        <div key={idx} className="text-muted-foreground">
                                          {file}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
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

                      // Check for duplicate profile names
                      const duplicateProfile = profileSettings?.profiles.find(
                        (profile) =>
                          profile.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
                          (!editingProfile || profile.id !== editingProfile.id)
                      );
                      if (duplicateProfile) {
                        setProfileFormError(t('profiles.dialog.duplicateProfileName'));
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
      <Dialog
        open={deleteConfirmProfile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmProfile(null);
          }
        }}
      >
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
