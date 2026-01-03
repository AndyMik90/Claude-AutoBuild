import { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Settings,
  Trash2,
  Moon,
  Sun,
  LayoutGrid,
  Terminal,
  Map,
  BookOpen,
  Lightbulb,
  AlertCircle,
  Download,
  RefreshCw,
  Github,
  FileText,
  Sparkles,
  GitBranch,
  HelpCircle,
  UserCog
} from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from './ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { cn } from '../lib/utils';
import {
  useProjectStore,
  removeProject,
  initializeProject,
  checkProjectVersion,
  updateProjectAutoBuild
} from '../stores/project-store';
import { useSettingsStore, saveSettings } from '../stores/settings-store';
import { AddProjectModal } from './AddProjectModal';
import { GitSetupModal } from './GitSetupModal';
import { RateLimitIndicator } from './RateLimitIndicator';
import type { Project, AutoBuildVersionInfo, GitStatus } from '../../shared/types';

export type SidebarView = 'kanban' | 'terminals' | 'roadmap' | 'context' | 'ideation' | 'github-issues' | 'changelog' | 'insights' | 'worktrees' | 'agent-tools' | 'agent-profiles';

interface SidebarProps {
  onSettingsClick: () => void;
  onNewTaskClick: () => void;
  activeView?: SidebarView;
  onViewChange?: (view: SidebarView) => void;
}

interface NavItem {
  id: SidebarView;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
}

const projectNavItems: NavItem[] = [
  { id: 'kanban', label: 'Kanban Board', icon: LayoutGrid, shortcut: 'K' },
  { id: 'terminals', label: 'Agent Terminals', icon: Terminal, shortcut: 'A' },
  { id: 'insights', label: 'Insights', icon: Sparkles, shortcut: 'N' },
  { id: 'roadmap', label: 'Roadmap', icon: Map, shortcut: 'D' },
  { id: 'ideation', label: 'Ideation', icon: Lightbulb, shortcut: 'I' },
  { id: 'changelog', label: 'Changelog', icon: FileText, shortcut: 'L' },
  { id: 'context', label: 'Context', icon: BookOpen, shortcut: 'C' }
];

const toolsNavItems: NavItem[] = [
  { id: 'github-issues', label: 'GitHub Issues', icon: Github, shortcut: 'G' },
  { id: 'worktrees', label: 'Worktrees', icon: GitBranch, shortcut: 'W' },
  { id: 'agent-profiles', label: 'Agent Profiles', icon: UserCog, shortcut: 'P' }
];

export function Sidebar({
  onSettingsClick,
  onNewTaskClick,
  activeView = 'kanban',
  onViewChange
}: SidebarProps) {
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);
  const settings = useSettingsStore((state) => state.settings);

  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showGitSetupModal, setShowGitSetupModal] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [_versionInfo, setVersionInfo] = useState<AutoBuildVersionInfo | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      // Only handle shortcuts when a project is selected
      if (!selectedProjectId) return;

      // Check for modifier keys - we want plain key presses only
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key.toUpperCase();

      // Find matching nav item
      const allNavItems = [...projectNavItems, ...toolsNavItems];
      const matchedItem = allNavItems.find((item) => item.shortcut === key);

      if (matchedItem) {
        e.preventDefault();
        onViewChange?.(matchedItem.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedProjectId, onViewChange]);

  // Check for updates when project changes
  useEffect(() => {
    const checkUpdates = async () => {
      if (selectedProjectId && settings.autoUpdateAutoBuild) {
        const info = await checkProjectVersion(selectedProjectId);
        if (info?.updateAvailable) {
          setVersionInfo(info);
          setShowUpdateDialog(true);
        }
      }
    };
    checkUpdates();
  }, [selectedProjectId, settings.autoUpdateAutoBuild]);

  // Check git status when project changes
  useEffect(() => {
    const checkGit = async () => {
      if (selectedProject) {
        try {
          const result = await window.electronAPI.checkGitStatus(selectedProject.path);
          if (result.success && result.data) {
            setGitStatus(result.data);
            // Show git setup modal if project is not a git repo or has no commits
            if (!result.data.isGitRepo || !result.data.hasCommits) {
              setShowGitSetupModal(true);
            }
          }
        } catch (error) {
          console.error('Failed to check git status:', error);
        }
      } else {
        setGitStatus(null);
      }
    };
    checkGit();
  }, [selectedProject]);

  const handleAddProject = () => {
    setShowAddProjectModal(true);
  };

  const handleProjectAdded = (project: Project, needsInit: boolean) => {
    if (needsInit) {
      setPendingProject(project);
      setShowInitDialog(true);
    }
  };

  const handleInitialize = async () => {
    if (!pendingProject) return;

    const projectId = pendingProject.id;
    setIsInitializing(true);
    try {
      const result = await initializeProject(projectId);
      if (result?.success) {
        // Clear pendingProject FIRST before closing dialog
        // This prevents onOpenChange from triggering skip logic
        setPendingProject(null);
        setShowInitDialog(false);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSkipInit = () => {
    setShowInitDialog(false);
    setPendingProject(null);
  };

  const _handleUpdate = async () => {
    if (!selectedProjectId) return;

    setIsInitializing(true);
    try {
      const result = await updateProjectAutoBuild(selectedProjectId);
      if (result?.success) {
        setShowUpdateDialog(false);
        setVersionInfo(null);
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const _handleSkipUpdate = () => {
    setShowUpdateDialog(false);
    setVersionInfo(null);
  };

  const handleGitInitialized = async () => {
    // Refresh git status after initialization
    if (selectedProject) {
      try {
        const result = await window.electronAPI.checkGitStatus(selectedProject.path);
        if (result.success && result.data) {
          setGitStatus(result.data);
        }
      } catch (error) {
        console.error('Failed to refresh git status:', error);
      }
    }
  };

  const _handleRemoveProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await removeProject(projectId);
  };

  const handleProjectChange = (projectId: string) => {
    if (projectId === '__add_new__') {
      handleAddProject();
    } else {
      selectProject(projectId);
    }
  };

  const toggleTheme = () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    saveSettings({ theme: newTheme });

    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const handleNavClick = (view: SidebarView) => {
    onViewChange?.(view);
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = activeView === item.id;
    const Icon = item.icon;

    return (
      <button
        key={item.id}
        onClick={() => handleNavClick(item.id)}
        disabled={!selectedProjectId}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
          'hover:bg-accent hover:text-accent-foreground',
          'disabled:pointer-events-none disabled:opacity-50',
          isActive && 'bg-accent text-accent-foreground'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {item.shortcut && (
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded-md border border-border bg-secondary px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            {item.shortcut}
          </kbd>
        )}
      </button>
    );
  };

  return (
    <TooltipProvider>
      <div className="flex h-full w-64 flex-col bg-sidebar border-r border-border">
        {/* Header with drag area - extra top padding for macOS traffic lights */}
        <div className="electron-drag flex h-14 items-center justify-between px-4 pt-6">
          <span className="electron-no-drag text-lg font-bold text-primary">Auto Claude</span>
          <div className="electron-no-drag flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleTheme}>
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Separator className="mt-2" />

        {/* Project Selector Dropdown */}
        <div className="px-4 py-4">
          <Select
            value={selectedProjectId || ''}
            onValueChange={handleProjectChange}
          >
            <SelectTrigger className="w-full [&_span]:truncate">
              <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="Select a project..." className="truncate min-w-0 flex-1" />
              </div>
            </SelectTrigger>
            <SelectContent className="min-w-(--radix-select-trigger-width) max-w-(--radix-select-trigger-width)">
              {projects.length === 0 ? (
                <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                  <p>No projects yet</p>
                </div>
              ) : (
                projects.map((project) => (
                  <div key={project.id} className="relative flex items-center">
                    <SelectItem value={project.id} className="flex-1 pr-10">
                      <span className="truncate" title={`${project.name} - ${project.path}`}>
                        {project.name}
                      </span>
                    </SelectItem>
                    <button
                      type="button"
                      className="absolute right-2 flex h-6 w-6 items-center justify-center rounded-md hover:bg-destructive/10 transition-colors"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeProject(project.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  </div>
                ))
              )}
              <Separator className="my-1" />
              <SelectItem value="__add_new__">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Add Project...</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Project path - shown when project is selected */}
          {selectedProject && (
            <div className="mt-2">
              <span className="truncate block text-xs text-muted-foreground" title={selectedProject.path}>
                {selectedProject.path}
              </span>
            </div>
          )}
        </div>

        <Separator />

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-4">
            {/* Project Section */}
            <div className="mb-6">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Project
              </h3>
              <nav className="space-y-1">
                {projectNavItems.map(renderNavItem)}
              </nav>
            </div>

            {/* Tools Section */}
            <div>
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tools
              </h3>
              <nav className="space-y-1">
                {toolsNavItems.map(renderNavItem)}
              </nav>
            </div>
          </div>
        </ScrollArea>

        <Separator />

        {/* Rate Limit Indicator - shows when Claude is rate limited */}
        <RateLimitIndicator />

        {/* Bottom section with Settings, Help, and New Task */}
        <div className="p-4 space-y-3">
          {/* Settings and Help row */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 justify-start gap-2"
                  onClick={onSettingsClick}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Application Settings</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.open('https://github.com/AndyMik90/Auto-Claude/issues', '_blank')}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Help & Feedback</TooltipContent>
            </Tooltip>
          </div>

          {/* New Task button */}
          <Button
            className="w-full"
            onClick={onNewTaskClick}
            disabled={!selectedProjectId || !selectedProject?.autoBuildPath}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
          {selectedProject && !selectedProject.autoBuildPath && (
            <p className="mt-2 text-xs text-muted-foreground text-center">
              Initialize Auto Claude to create tasks
            </p>
          )}
        </div>
      </div>

      {/* Initialize Auto Claude Dialog */}
      <Dialog open={showInitDialog} onOpenChange={(open) => {
        // Only allow closing if user manually closes (not during initialization)
        if (!open && !isInitializing) {
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

      {/* Update Auto Claude Dialog - Deprecated, updateAvailable is always false now */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Auto Claude
            </DialogTitle>
            <DialogDescription>
              Project is initialized.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdateDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Project Modal */}
      <AddProjectModal
        open={showAddProjectModal}
        onOpenChange={setShowAddProjectModal}
        onProjectAdded={handleProjectAdded}
      />

      {/* Git Setup Modal */}
      <GitSetupModal
        open={showGitSetupModal}
        onOpenChange={setShowGitSetupModal}
        project={selectedProject || null}
        gitStatus={gitStatus}
        onGitInitialized={handleGitInitialized}
      />
    </TooltipProvider>
  );
}
