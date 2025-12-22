import { useState, useEffect } from 'react';
import { Settings2, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { TooltipProvider } from './components/ui/tooltip';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from './components/ui/tooltip';
import { Sidebar, type SidebarView } from './components/Sidebar';
import { KanbanBoard } from './components/KanbanBoard';
import { TaskDetailModal } from './components/task-detail/TaskDetailModal';
import { TaskCreationWizard } from './components/TaskCreationWizard';
import { AppSettingsDialog, type AppSection } from './components/settings/AppSettings';
import type { ProjectSettingsSection } from './components/settings/ProjectSettingsContent';
import { TerminalGrid } from './components/TerminalGrid';
import { Roadmap } from './components/Roadmap';
import { Context } from './components/Context';
import { Ideation } from './components/Ideation';
import { Insights } from './components/Insights';
import { GitHubIssues } from './components/GitHubIssues';
import { Changelog } from './components/Changelog';
import { Worktrees } from './components/Worktrees';
import { WelcomeScreen } from './components/WelcomeScreen';
import { RateLimitModal } from './components/RateLimitModal';
import { SDKRateLimitModal } from './components/SDKRateLimitModal';
import { OnboardingWizard } from './components/onboarding';
import { AppUpdateNotification } from './components/AppUpdateNotification';
import { UsageIndicator } from './components/UsageIndicator';
import { ProactiveSwapListener } from './components/ProactiveSwapListener';
import { GitHubSetupModal } from './components/GitHubSetupModal';
import { useProjectStore, loadProjects, addProject, initializeProject } from './stores/project-store';
import { useTaskStore, loadTasks } from './stores/task-store';
import { useSettingsStore, loadSettings } from './stores/settings-store';
import { useTerminalStore, restoreTerminalSessions } from './stores/terminal-store';
import { useIpcListeners } from './hooks/useIpc';
import { COLOR_THEMES } from '../shared/constants';
import type { Task, Project, ColorTheme } from '../shared/types';

export function App() {
  // Load IPC listeners for real-time updates
  useIpcListeners();

  // Stores
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const tasks = useTaskStore((state) => state.tasks);
  const settings = useSettingsStore((state) => state.settings);
  const settingsLoading = useSettingsStore((state) => state.isLoading);

  // UI State
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskDialogOpen, setIsNewTaskDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<AppSection | undefined>(undefined);
  const [settingsInitialProjectSection, setSettingsInitialProjectSection] = useState<ProjectSettingsSection | undefined>(undefined);
  const [activeView, setActiveView] = useState<SidebarView>('kanban');
  const [isOnboardingWizardOpen, setIsOnboardingWizardOpen] = useState(false);

  // Initialize dialog state
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [initSuccess, setInitSuccess] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [skippedInitProjectId, setSkippedInitProjectId] = useState<string | null>(null);

  // GitHub setup state (shown after Auto Claude init)
  const [showGitHubSetup, setShowGitHubSetup] = useState(false);
  const [gitHubSetupProject, setGitHubSetupProject] = useState<Project | null>(null);

  // Get selected project
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Initial load
  useEffect(() => {
    loadProjects();
    loadSettings();
  }, []);

  // Track if settings have been loaded at least once
  const [settingsHaveLoaded, setSettingsHaveLoaded] = useState(false);

  // Mark settings as loaded when loading completes
  useEffect(() => {
    if (!settingsLoading && !settingsHaveLoaded) {
      setSettingsHaveLoaded(true);
    }
  }, [settingsLoading, settingsHaveLoaded]);

  // First-run detection - show onboarding wizard if not completed
  // Only check AFTER settings have been loaded from disk to avoid race condition
  useEffect(() => {
    if (settingsHaveLoaded && settings.onboardingCompleted === false) {
      setIsOnboardingWizardOpen(true);
    }
  }, [settingsHaveLoaded, settings.onboardingCompleted]);

  // Listen for open-app-settings events (e.g., from project settings)
  useEffect(() => {
    const handleOpenAppSettings = (event: Event) => {
      const customEvent = event as CustomEvent<AppSection>;
      const section = customEvent.detail;
      if (section) {
        setSettingsInitialSection(section);
      }
      setIsSettingsDialogOpen(true);
    };

    window.addEventListener('open-app-settings', handleOpenAppSettings);
    return () => {
      window.removeEventListener('open-app-settings', handleOpenAppSettings);
    };
  }, []);

  // Listen for app updates - auto-open settings to 'updates' section when update is ready
  useEffect(() => {
    // When an update is downloaded and ready to install, open settings to updates section
    const cleanupDownloaded = window.electronAPI.onAppUpdateDownloaded(() => {
      console.warn('[App] Update downloaded, opening settings to updates section');
      setSettingsInitialSection('updates');
      setIsSettingsDialogOpen(true);
    });

    return () => {
      cleanupDownloaded();
    };
  }, []);

  // Check if selected project needs initialization (e.g., .auto-claude folder was deleted)
  useEffect(() => {
    // Don't show dialog while initialization is in progress
    if (isInitializing) return;

    if (selectedProject && !selectedProject.autoBuildPath && skippedInitProjectId !== selectedProject.id) {
      // Project exists but isn't initialized - show init dialog
      setPendingProject(selectedProject);
      setInitError(null); // Clear any previous errors
      setInitSuccess(false); // Reset success flag
      setShowInitDialog(true);
    }
  }, [selectedProject, skippedInitProjectId, isInitializing]);

  // Load tasks when project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadTasks(selectedProjectId);
      setSelectedTask(null); // Clear selection on project change
    } else {
      useTaskStore.getState().clearTasks();
    }

    // Handle terminals on project change
    const currentTerminals = useTerminalStore.getState().terminals;

    // Close existing terminals (they belong to the previous project)
    currentTerminals.forEach((t) => {
      window.electronAPI.destroyTerminal(t.id);
    });
    useTerminalStore.getState().clearAllTerminals();

    // Try to restore saved sessions for the new project
    if (selectedProject?.path) {
      restoreTerminalSessions(selectedProject.path).catch((err) => {
        console.error('[App] Failed to restore sessions:', err);
      });
    }
  }, [selectedProjectId, selectedProject?.path, selectedProject?.name]);

  // Apply theme on load
  useEffect(() => {
    const root = document.documentElement;

    const applyTheme = () => {
      // Apply light/dark mode
      if (settings.theme === 'dark') {
        root.classList.add('dark');
      } else if (settings.theme === 'light') {
        root.classList.remove('dark');
      } else {
        // System preference
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    // Apply color theme via data-theme attribute
    // Validate colorTheme against known themes, fallback to 'default' if invalid
    const validThemeIds = COLOR_THEMES.map((t) => t.id);
    const rawColorTheme = settings.colorTheme ?? 'default';
    const colorTheme: ColorTheme = validThemeIds.includes(rawColorTheme as ColorTheme)
      ? (rawColorTheme as ColorTheme)
      : 'default';

    if (colorTheme === 'default') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', colorTheme);
    }

    applyTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (settings.theme === 'system') {
        applyTheme();
      }
    };
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [settings.theme, settings.colorTheme]);

  // Update selected task when tasks change (for real-time updates)
  useEffect(() => {
    if (selectedTask) {
      const updatedTask = tasks.find(
        (t) => t.id === selectedTask.id || t.specId === selectedTask.specId
      );
      if (updatedTask) {
        setSelectedTask(updatedTask);
      }
    }
  }, [tasks, selectedTask?.id, selectedTask?.specId, selectedTask]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
  };

  const handleCloseTaskDetail = () => {
    setSelectedTask(null);
  };

  const handleAddProject = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        const project = await addProject(path);
        if (project && !project.autoBuildPath) {
          // Project doesn't have Auto Claude initialized, show init dialog
          setPendingProject(project);
          setInitError(null); // Clear any previous errors
          setInitSuccess(false); // Reset success flag
          setShowInitDialog(true);
        }
      }
    } catch (error) {
      console.error('Failed to add project:', error);
    }
  };

  const handleInitialize = async () => {
    if (!pendingProject) return;

    const projectId = pendingProject.id;
    console.log('[InitDialog] Starting initialization for project:', projectId);
    setIsInitializing(true);
    setInitSuccess(false);
    setInitError(null); // Clear any previous errors
    try {
      const result = await initializeProject(projectId);
      console.log('[InitDialog] Initialization result:', result);

      if (result?.success) {
        console.log('[InitDialog] Initialization successful, closing dialog');
        // Get the updated project from store
        const updatedProject = useProjectStore.getState().projects.find(p => p.id === projectId);
        console.log('[InitDialog] Updated project:', updatedProject);

        // Mark as successful to prevent onOpenChange from treating this as a skip
        setInitSuccess(true);
        setIsInitializing(false);

        // Now close the dialog
        setShowInitDialog(false);
        setPendingProject(null);

        // Show GitHub setup modal
        if (updatedProject) {
          setGitHubSetupProject(updatedProject);
          setShowGitHubSetup(true);
        }
      } else {
        // Initialization failed - show error but keep dialog open
        console.log('[InitDialog] Initialization failed, showing error');
        const errorMessage = result?.error || 'Failed to initialize Auto Claude. Please try again.';
        setInitError(errorMessage);
        setIsInitializing(false);
      }
    } catch (error) {
      // Unexpected error occurred
      console.error('[InitDialog] Unexpected error during initialization:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setInitError(errorMessage);
      setIsInitializing(false);
    }
  };

  const handleGitHubSetupComplete = async (settings: {
    githubToken: string;
    githubRepo: string;
    mainBranch: string;
  }) => {
    if (!gitHubSetupProject) return;

    try {
      // NOTE: settings.githubToken is a GitHub access token (from gh CLI),
      // NOT a Claude Code OAuth token. They are different things:
      // - GitHub token: for GitHub API access (repo operations)
      // - Claude token: for Claude AI access (run.py, roadmap, etc.)
      // The user needs to separately authenticate with Claude using 'claude setup-token'

      // Update project env config with GitHub settings
      await window.electronAPI.updateProjectEnv(gitHubSetupProject.id, {
        githubEnabled: true,
        githubToken: settings.githubToken, // GitHub token for repo access
        githubRepo: settings.githubRepo
      });

      // Update project settings with mainBranch
      await window.electronAPI.updateProjectSettings(gitHubSetupProject.id, {
        mainBranch: settings.mainBranch
      });

      // Refresh projects to get updated data
      await loadProjects();
    } catch (error) {
      console.error('Failed to save GitHub settings:', error);
    }

    setShowGitHubSetup(false);
    setGitHubSetupProject(null);
  };

  const handleGitHubSetupSkip = () => {
    setShowGitHubSetup(false);
    setGitHubSetupProject(null);
  };

  const handleSkipInit = () => {
    console.log('[InitDialog] User skipped initialization');
    if (pendingProject) {
      setSkippedInitProjectId(pendingProject.id);
    }
    setShowInitDialog(false);
    setPendingProject(null);
    setInitError(null); // Clear any error when skipping
    setInitSuccess(false); // Reset success flag
  };

  const handleGoToTask = (taskId: string) => {
    // Switch to kanban view
    setActiveView('kanban');
    // Find and select the task (match by id or specId)
    const task = tasks.find((t) => t.id === taskId || t.specId === taskId);
    if (task) {
      setSelectedTask(task);
    }
  };

  return (
    <TooltipProvider>
      <ProactiveSwapListener />
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar
          onSettingsClick={() => setIsSettingsDialogOpen(true)}
          onNewTaskClick={() => setIsNewTaskDialogOpen(true)}
          activeView={activeView}
          onViewChange={setActiveView}
        />

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="electron-drag flex h-14 items-center justify-between border-b border-border bg-card/50 backdrop-blur-sm px-6">
            <div className="electron-no-drag">
              {selectedProject ? (
                <h1 className="font-semibold text-foreground">{selectedProject.name}</h1>
              ) : (
                <div className="text-muted-foreground">
                  Select a project to get started
                </div>
              )}
            </div>
            {selectedProject && (
              <div className="electron-no-drag flex items-center gap-3">
                <UsageIndicator />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsSettingsDialogOpen(true)}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Settings</TooltipContent>
                </Tooltip>
              </div>
            )}
          </header>

          {/* Main content area */}
          <main className="flex-1 overflow-hidden">
            {selectedProject ? (
              <>
                {activeView === 'kanban' && (
                  <KanbanBoard
                    tasks={tasks}
                    onTaskClick={handleTaskClick}
                    onNewTaskClick={() => setIsNewTaskDialogOpen(true)}
                  />
                )}
                {/* TerminalGrid is always mounted but hidden when not active to preserve terminal state */}
                <div className={activeView === 'terminals' ? 'h-full' : 'hidden'}>
                  <TerminalGrid
                    projectPath={selectedProject?.path}
                    onNewTaskClick={() => setIsNewTaskDialogOpen(true)}
                  />
                </div>
                {activeView === 'roadmap' && selectedProjectId && (
                  <Roadmap projectId={selectedProjectId} onGoToTask={handleGoToTask} />
                )}
                {activeView === 'context' && selectedProjectId && (
                  <Context projectId={selectedProjectId} />
                )}
                {activeView === 'ideation' && selectedProjectId && (
                  <Ideation projectId={selectedProjectId} onGoToTask={handleGoToTask} />
                )}
                {activeView === 'insights' && selectedProjectId && (
                  <Insights projectId={selectedProjectId} />
                )}
                {activeView === 'github-issues' && selectedProjectId && (
                  <GitHubIssues
                    onOpenSettings={() => {
                      setSettingsInitialProjectSection('github');
                      setIsSettingsDialogOpen(true);
                    }}
                    onNavigateToTask={handleGoToTask}
                  />
                )}
                {activeView === 'changelog' && selectedProjectId && (
                  <Changelog />
                )}
                {activeView === 'worktrees' && selectedProjectId && (
                  <Worktrees projectId={selectedProjectId} />
                )}
                {activeView === 'agent-tools' && (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <h2 className="text-lg font-semibold text-foreground">Agent Tools</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Configure and manage agent tools - Coming soon
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <WelcomeScreen
                projects={projects}
                onNewProject={handleAddProject}
                onOpenProject={handleAddProject}
                onSelectProject={(projectId) => useProjectStore.getState().selectProject(projectId)}
              />
            )}
          </main>
        </div>

        {/* Task detail modal */}
        <TaskDetailModal
          open={!!selectedTask}
          task={selectedTask}
          onOpenChange={(open) => !open && handleCloseTaskDetail()}
        />

        {/* Dialogs */}
        {selectedProjectId && (
          <TaskCreationWizard
            projectId={selectedProjectId}
            open={isNewTaskDialogOpen}
            onOpenChange={setIsNewTaskDialogOpen}
          />
        )}

        <AppSettingsDialog
          open={isSettingsDialogOpen}
          onOpenChange={(open) => {
            setIsSettingsDialogOpen(open);
            if (!open) {
              // Reset initial sections when dialog closes
              setSettingsInitialSection(undefined);
              setSettingsInitialProjectSection(undefined);
            }
          }}
          initialSection={settingsInitialSection}
          initialProjectSection={settingsInitialProjectSection}
          onRerunWizard={() => {
            // Reset onboarding state to trigger wizard
            useSettingsStore.getState().updateSettings({ onboardingCompleted: false });
            // Close settings dialog
            setIsSettingsDialogOpen(false);
            // Open onboarding wizard
            setIsOnboardingWizardOpen(true);
          }}
        />

        {/* Initialize Auto Claude Dialog */}
        <Dialog open={showInitDialog} onOpenChange={(open) => {
          console.log('[InitDialog] onOpenChange called', { open, pendingProject: !!pendingProject, isInitializing, initSuccess });
          // Only trigger skip if user manually closed the dialog
          // Don't trigger if: successful init, no pending project, or currently initializing
          if (!open && pendingProject && !isInitializing && !initSuccess) {
            handleSkipInit();
          }
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Initialize Auto Claude
              </DialogTitle>
              <DialogDescription>
                This project doesn't have Auto Claude initialized. Would you like to set it up now?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-medium mb-2">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Create a <code className="text-xs bg-background px-1 py-0.5 rounded">.auto-claude</code> folder in your project</li>
                  <li>Copy the Auto Claude framework files</li>
                  <li>Set up the specs directory for your tasks</li>
                </ul>
              </div>
              {!settings.autoBuildPath && (
                <div className="mt-4 rounded-lg border border-warning/50 bg-warning/10 p-4 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-warning">Source path not configured</p>
                      <p className="text-muted-foreground mt-1">
                        Please set the Auto Claude source path in App Settings before initializing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              {initError && (
                <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-destructive">Initialization Failed</p>
                      <p className="text-muted-foreground mt-1">
                        {initError}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleSkipInit} disabled={isInitializing}>
                Skip
              </Button>
              <Button
                onClick={handleInitialize}
                disabled={isInitializing || !settings.autoBuildPath}
              >
                {isInitializing ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Initialize
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* GitHub Setup Modal - shows after Auto Claude init to configure GitHub */}
        {gitHubSetupProject && (
          <GitHubSetupModal
            open={showGitHubSetup}
            onOpenChange={setShowGitHubSetup}
            project={gitHubSetupProject}
            onComplete={handleGitHubSetupComplete}
            onSkip={handleGitHubSetupSkip}
          />
        )}

        {/* Rate Limit Modal - shows when Claude Code hits usage limits (terminal) */}
        <RateLimitModal />

        {/* SDK Rate Limit Modal - shows when SDK/CLI operations hit limits (changelog, tasks, etc.) */}
        <SDKRateLimitModal />

        {/* Onboarding Wizard - shows on first launch when onboardingCompleted is false */}
        <OnboardingWizard
          open={isOnboardingWizardOpen}
          onOpenChange={setIsOnboardingWizardOpen}
          onOpenTaskCreator={() => {
            setIsOnboardingWizardOpen(false);
            setIsNewTaskDialogOpen(true);
          }}
          onOpenSettings={() => {
            setIsOnboardingWizardOpen(false);
            setIsSettingsDialogOpen(true);
          }}
        />

        {/* App Update Notification - shows when new app version is available */}
        <AppUpdateNotification />
      </div>
    </TooltipProvider>
  );
}
