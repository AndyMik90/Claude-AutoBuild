import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Settings,
  Trash2,
  LayoutGrid,
  Terminal,
  Map,
  BookOpen,
  Lightbulb,
  AlertCircle,
  Download,
  RefreshCw,
  Github,
  GitlabIcon,
  GitPullRequest,
  GitMerge,
  FileText,
  Sparkles,
  GitBranch,
  HelpCircle,
  Wrench,
  Search
} from 'lucide-react';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
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
  initializeProject
} from '../stores/project-store';
import { useSettingsStore } from '../stores/settings-store';
import { AddProjectModal } from './AddProjectModal';
import { GitSetupModal } from './GitSetupModal';
import { RateLimitIndicator } from './RateLimitIndicator';
import type { Project, AutoBuildVersionInfo, GitStatus } from '../../shared/types';

/* Apple HIG-inspired Sidebar component
   Key principles:
   - Clear visual hierarchy with section headers
   - Consistent spacing (12pt grid system)
   - Rounded corners for modern appearance
   - Smooth transitions for interactive states
   - Proper tap target sizes (44x44pt minimum)
   - Keyboard shortcuts clearly indicated
*/

export type SidebarView = 'kanban' | 'terminals' | 'roadmap' | 'context' | 'ideation' | 'github-issues' | 'gitlab-issues' | 'github-prs' | 'gitlab-merge-requests' | 'changelog' | 'insights' | 'worktrees' | 'agent-tools' | 'zen';

interface SidebarProps {
  onSettingsClick: () => void;
  onNewTaskClick: () => void;
  activeView?: SidebarView;
  onViewChange?: (view: SidebarView) => void;
}

interface NavItem {
  id: SidebarView;
  labelKey: string;
  icon: React.ElementType;
  shortcut?: string;
}

const projectNavItems: NavItem[] = [
  { id: 'kanban', labelKey: 'navigation:items.kanban', icon: LayoutGrid, shortcut: 'K' },
  { id: 'terminals', labelKey: 'navigation:items.terminals', icon: Terminal, shortcut: 'A' },
  { id: 'insights', labelKey: 'navigation:items.insights', icon: Sparkles, shortcut: 'N' },
  { id: 'roadmap', labelKey: 'navigation:items.roadmap', icon: Map, shortcut: 'D' },
  { id: 'ideation', labelKey: 'navigation:items.ideation', icon: Lightbulb, shortcut: 'I' },
  { id: 'changelog', labelKey: 'navigation:items.changelog', icon: FileText, shortcut: 'L' },
  { id: 'context', labelKey: 'navigation:items.context', icon: BookOpen, shortcut: 'C' },
  { id: 'zen', labelKey: 'navigation:items.zen', icon: Search, shortcut: 'Z' }
];

const toolsNavItems: NavItem[] = [
  { id: 'github-issues', labelKey: 'navigation:items.githubIssues', icon: Github, shortcut: 'G' },
  { id: 'gitlab-issues', labelKey: 'navigation:items.gitlabIssues', icon: GitlabIcon, shortcut: 'B' },
  { id: 'github-prs', labelKey: 'navigation:items.githubPRs', icon: GitPullRequest, shortcut: 'P' },
  { id: 'gitlab-merge-requests', labelKey: 'navigation:items.gitlabMRs', icon: GitMerge, shortcut: 'R' },
  { id: 'worktrees', labelKey: 'navigation:items.worktrees', icon: GitBranch, shortcut: 'W' },
  { id: 'agent-tools', labelKey: 'navigation:items.agentTools', icon: Wrench, shortcut: 'M' }
];

export function Sidebar({
  onSettingsClick,
  onNewTaskClick,
  activeView = 'kanban',
  onViewChange
}: SidebarProps) {
  const { t } = useTranslation(['navigation', 'dialogs', 'common']);
  const projects = useProjectStore((state) => state.projects);
  const selectedProjectId = useProjectStore((state) => state.selectedProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);
  const settings = useSettingsStore((state) => state.settings);

  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const [showGitSetupModal, setShowGitSetupModal] = useState(false);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
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
          /* Apple HIG nav item styling */
          'sidebar-item group relative flex w-full items-center gap-3 tap-target rounded-xl px-3 py-2.5 text-sm font-medium',
          /* Smooth transitions */
          'transition-all duration-150 ease-out',
          /* Hover state */
          'hover:bg-accent hover:text-accent-foreground',
          /* Disabled state */
          'disabled:pointer-events-none disabled:opacity-50',
          /* Active state */
          isActive && 'bg-primary text-primary-foreground hover:bg-primary/90'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" strokeWidth={2.5} />
        <span className="flex-1 text-left">{t(item.labelKey)}</span>
        {item.shortcut && (
          <kbd
            className={cn(
              /* Apple-style keyboard shortcut badge */
              'pointer-events-none hidden h-5 select-none items-center gap-1 rounded-md border border-border bg-secondary px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex',
              /* Transition for hover state */
              'transition-opacity duration-150',
              /* Show on hover */
              'opacity-60 group-hover:opacity-100'
            )}
          >
            {item.shortcut}
          </kbd>
        )}
      </button>
    );
  };

  return (
    <TooltipProvider>
      <div
        className={cn(
          /* Apple HIG sidebar container */
          'sidebar flex h-full w-80 flex-col bg-sidebar border-r border-border',
          /* Smooth transitions for theme changes */
          'transition-colors duration-200 ease-out'
        )}
      >
        {/* Header with drag area - extra top padding for macOS traffic lights */}
        <div className="electron-drag flex h-16 items-center px-5 pt-7">
          <span className="electron-no-drag text-lg font-semibold text-foreground tracking-tight">
            Maestro
          </span>
        </div>

        <Separator className="mx-4" />


        <Separator />

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <div className="px-3 py-5">
            {/* Project Section */}
            <div className="mb-6">
              <h3
                className={cn(
                  /* Apple HIG section header styling */
                  'mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70',
                  /* Slightly reduced letter spacing for uppercase */
                  'tracking-wider'
                )}
              >
                {t('sections.project')}
              </h3>
              <nav className="space-y-0.5">
                {projectNavItems.map(renderNavItem)}
              </nav>
            </div>

            {/* Tools Section */}
            <div>
              <h3
                className={cn(
                  /* Apple HIG section header styling */
                  'mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70',
                  /* Slightly reduced letter spacing for uppercase */
                  'tracking-wider'
                )}
              >
                {t('sections.tools')}
              </h3>
              <nav className="space-y-0.5">
                {toolsNavItems.map(renderNavItem)}
              </nav>
            </div>
          </div>
        </ScrollArea>

        <Separator />

        {/* Rate Limit Indicator - shows when Claude is rate limited */}
        <RateLimitIndicator />

        {/* Bottom section with Settings, Help, and New Task */}
        <div className="p-5 space-y-3">
          {/* Settings and Help row */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 justify-start gap-2 h-10 rounded-xl font-medium"
                  onClick={onSettingsClick}
                >
                  <Settings className="h-4 w-4" strokeWidth={2.5} />
                  {t('actions.settings')}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('tooltips.settings')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 rounded-xl"
                  onClick={() => window.open('https://github.com/AndyMik90/Auto-Claude/issues', '_blank')}
                >
                  <HelpCircle className="h-4 w-4" strokeWidth={2.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t('tooltips.help')}</TooltipContent>
            </Tooltip>
          </div>

          {/* New Task button */}
          <Button
            className="w-full h-11 rounded-xl font-medium shadow-sm hover:shadow-md transition-all duration-150"
            onClick={onNewTaskClick}
            disabled={!selectedProjectId || !selectedProject?.autoBuildPath}
          >
            <Plus className="mr-2 h-4 w-4" strokeWidth={2.5} />
            {t('actions.newTask')}
          </Button>
          {selectedProject && !selectedProject.autoBuildPath && (
            <p className="mt-2 text-xs text-muted-foreground text-center">
              {t('messages.initializeToCreateTasks')}
            </p>
          )}
        </div>
      </div>

      {/* Initialize Maestro Dialog */}
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
              {t('dialogs:initialize.title')}
            </DialogTitle>
            <DialogDescription>
              {t('dialogs:initialize.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-xl bg-muted p-4 text-sm">
              <p className="font-medium mb-2">{t('dialogs:initialize.willDo')}</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>{t('dialogs:initialize.createFolder')}</li>
                <li>{t('dialogs:initialize.copyFramework')}</li>
                <li>{t('dialogs:initialize.setupSpecs')}</li>
              </ul>
            </div>
            {!settings.autoBuildPath && (
              <div className="mt-4 rounded-xl border border-warning/50 bg-warning/10 p-4 text-sm">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-warning">{t('dialogs:initialize.sourcePathNotConfigured')}</p>
                    <p className="text-muted-foreground mt-1">
                      {t('dialogs:initialize.sourcePathNotConfiguredDescription')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleSkipInit} disabled={isInitializing}>
              {t('common:buttons.skip')}
            </Button>
            <Button
              onClick={handleInitialize}
              disabled={isInitializing || !settings.autoBuildPath}
            >
              {isInitializing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t('common:labels.initializing')}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {t('common:buttons.initialize')}
                </>
              )}
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
