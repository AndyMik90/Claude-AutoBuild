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
  AlertTriangle
} from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useProjectStore } from '../stores/project-store';
import { useSettingsStore } from '../stores/settings-store';

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
  action: 'editmode-tests' | 'build';
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  status: 'running' | 'success' | 'failed';
  exitCode?: number;
  command: string;
  artifactPaths: {
    runDir: string;
    log?: string;
    testResults?: string;
    stdout?: string;
    stderr?: string;
  };
}

export function Unity({ projectId }: UnityProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProject = projects.find((p) => p.id === projectId);
  const settings = useSettingsStore((state) => state.settings);

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

  // Get the effective editor path based on project version
  const effectiveEditorPath = useMemo(() => {
    if (!projectInfo?.version) return '';
    const matchingEditor = editors.find(e => e.version === projectInfo.version);
    return matchingEditor?.path || '';
  }, [projectInfo?.version, editors]);

  // Detect Unity project
  const detectUnityProject = useCallback(async () => {
    if (!selectedProject) return;

    setIsDetecting(true);
    setDetectError(null);

    try {
      // Use custom Unity path if set, otherwise use project root
      const pathToCheck = customUnityPath || selectedProject.path;
      const result = await window.electronAPI.detectUnityProject(pathToCheck);
      if (result.success && result.data) {
        setProjectInfo(result.data);
      } else {
        setDetectError(result.error || 'Failed to detect Unity project');
      }
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : 'Failed to detect Unity project');
    } finally {
      setIsDetecting(false);
    }
  }, [selectedProject, customUnityPath]);

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

  // Initial load
  useEffect(() => {
    detectUnityProject();
    loadSettings();
    loadRuns();
  }, [detectUnityProject, loadSettings, loadRuns]);

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
        setRunError(result.error || 'Failed to run EditMode tests');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to run EditMode tests');
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
        setRunError(result.error || 'Failed to run build');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to run build');
    } finally {
      setIsRunning(false);
    }
  };

  // Format duration
  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A';
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
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-info" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (!selectedProject) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Select a project to view Unity tools</p>
      </div>
    );
  }

  const canRunTests = projectInfo?.isUnityProject && effectiveEditorPath && !isRunning;
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
          await detectUnityProject();
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
        setRunError(result.error || 'Failed to update Unity version');
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Failed to update Unity version');
    }
  };

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Box className="h-6 w-6" />
            Unity
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Run Unity tests and builds for your project
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
          Refresh
        </Button>
      </div>

      {/* Error message */}
      {(detectError || runError) && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-destructive">Error</p>
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
                  Project
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Detected</span>
                  {projectInfo.isUnityProject ? (
                    <Badge variant="outline" className="bg-success/10 text-success border-success/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted">
                      No
                    </Badge>
                  )}
                </div>
                {projectInfo.isUnityProject && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm text-muted-foreground shrink-0">Unity Editor</span>
                        <div className="flex items-center gap-2">
                          <Select
                            value={projectInfo.version || ''}
                            onValueChange={handleEditorVersionChange}
                            disabled={isDiscovering || editors.length === 0}
                          >
                            <SelectTrigger className="h-8 text-xs font-mono w-[180px] text-left">
                              <SelectValue placeholder={isDiscovering ? 'Loading...' : 'No editors'} />
                            </SelectTrigger>
                            <SelectContent>
                              {editors.map((editor) => (
                                <SelectItem key={editor.path} value={editor.version} className="text-xs font-mono">
                                  {editor.version}
                                </SelectItem>
                              ))}
                              {editors.length === 0 && !isDiscovering && (
                                <SelectItem value="__none__" disabled className="text-xs">
                                  Configure in Settings
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {projectInfo.version && !projectEditorInstalled && (
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 shrink-0" />
                          <span className="text-xs text-muted-foreground">
                            Editor not installed
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2 ml-auto bg-yellow-500/10 border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400"
                            onClick={() => window.electronAPI.openExternal(`https://unity.com/releases/editor/archive`)}
                          >
                            Install {projectInfo.version}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-start justify-between">
                      <span className="text-sm text-muted-foreground">Project Path</span>
                      <span className="text-sm font-mono text-right break-all max-w-[60%]">
                        {projectInfo.projectPath}
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Not a Unity project - show empty state */}
            {!projectInfo.isUnityProject && (
              <div className="flex flex-col items-center justify-center text-center py-12">
                <div className="rounded-full bg-muted p-4 mb-4">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Not a Unity Project</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">
                  This workspace doesn't appear to be a Unity project. Unity projects are detected by:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 text-left list-disc list-inside">
                  <li>ProjectSettings/ProjectVersion.txt (required)</li>
                  <li>Assets/ directory</li>
                  <li>Packages/manifest.json</li>
                </ul>
                <div className="mt-6">
                  <Button
                    variant="outline"
                    onClick={handleSelectUnityFolder}
                    className="gap-2"
                  >
                    <FolderOpen className="h-4 w-4" />
                    Select Unity Project Folder
                  </Button>
                  {customUnityPath && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Selected: {customUnityPath}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions Card */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Play className="h-5 w-5" />
                    Actions
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
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run EditMode Tests
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Runs Unity Test Framework in EditMode via CLI (batchmode, no -quit flag)
                    </p>
                    {!effectiveEditorPath && (
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Select or specify Unity Editor path to enable
                      </p>
                    )}
                  </div>

                  {/* Build (Custom) */}
                  <div className="space-y-2">
                    <Label htmlFor="execute-method">Build executeMethod</Label>
                    <div className="flex gap-2">
                      <Input
                        id="execute-method"
                        value={buildExecuteMethod}
                        onChange={(e) => setBuildExecuteMethod(e.target.value)}
                        placeholder="Company.Project.Build.PerformBuild"
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={saveSettings}
                        disabled={isSavingSettings}
                      >
                        {isSavingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
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
                          Building...
                        </>
                      ) : (
                        <>
                          <Settings className="h-4 w-4 mr-2" />
                          Build (Custom)
                        </>
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Runs Unity with -batchmode -quit -executeMethod (your custom build script)
                    </p>
                    {!buildExecuteMethod && (
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Configure executeMethod above to enable builds
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Run History Card */}
            {projectInfo.isUnityProject && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Run History
                  </CardTitle>
                  <CardDescription>
                    Last {runs.length} runs for this project
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingRuns ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : runs.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No runs yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {runs.map((run) => (
                        <button
                          key={run.id}
                          onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                          className="w-full text-left p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(run.status)}
                              <span className="text-sm font-medium">
                                {run.action === 'editmode-tests' ? 'EditMode Tests' : 'Build'}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {run.status}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDuration(run.durationMs)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(run.startedAt).toLocaleString()}
                          </div>

                          {/* Expanded details */}
                          {selectedRun?.id === run.id && (
                            <div className="mt-4 pt-4 border-t border-border space-y-3">
                              <div>
                                <p className="text-xs font-medium mb-1">Command</p>
                                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                  {run.command}
                                </pre>
                              </div>

                              <div>
                                <p className="text-xs font-medium mb-1">Artifacts</p>
                                <div className="space-y-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs w-full justify-start"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.electronAPI.openPath(run.artifactPaths.runDir);
                                    }}
                                  >
                                    <FolderOpen className="h-3 w-3 mr-1" />
                                    Open Run Directory
                                  </Button>
                                  {run.artifactPaths.log && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs w-full justify-start"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.electronAPI.openPath(run.artifactPaths.log);
                                      }}
                                    >
                                      <TerminalIcon className="h-3 w-3 mr-1" />
                                      Unity Log
                                    </Button>
                                  )}
                                  {run.artifactPaths.testResults && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs w-full justify-start"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.electronAPI.openPath(run.artifactPaths.testResults);
                                      }}
                                    >
                                      <ChevronRight className="h-3 w-3 mr-1" />
                                      Test Results XML
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
