/**
 * Project Detail Page
 *
 * Shows the full project view with sidebar navigation and main content area.
 * Displays Kanban board, Insights, Ideation, and other project views.
 */

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  LayoutGrid,
  Terminal,
  Sparkles,
  Map,
  Lightbulb,
  FileText,
  BookOpen,
  Github,
  GitBranch,
  UserCog,
  Settings,
  Plus,
  Loader2,
  Inbox,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Key,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { ScrollArea } from '../components/ui/scroll-area';
import { cn } from '../lib/utils';
import { AgentProfileSettings, CredentialSettings } from '../components/project-settings';
import { TaskCreationWizard } from '../components/TaskCreationWizard';
import { Insights } from '../components/Insights';
import { Roadmap } from '../components/Roadmap';
import { TerminalGrid } from '../components/TerminalGrid';
import { Ideation } from '../components/ideation/Ideation';
import { GitHubIssues } from '../components/GitHubIssues';
import { Worktrees } from '../components/Worktrees';
import { Context } from '../components/context/Context';
import { Changelog } from '../components/changelog/Changelog';
import { KanbanBoard } from '../components/KanbanBoard';
import { TaskDetailPanel } from '../components/task-detail/TaskDetailPanel';
import { useProjectStore } from '../stores/project-store';
import { useTaskStore } from '../stores/task-store';
import { useIpcListeners } from '../hooks/useIpc';
import type { Task } from '../../shared/types';

// API helper
const API_BASE = '/api';

async function authFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const stored = localStorage.getItem('auth-storage');
  let token: string | null = null;
  if (stored) {
    const parsed = JSON.parse(stored);
    token = parsed.state?.accessToken || null;
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });
}

// View types for sidebar navigation
type SidebarView =
  | 'kanban'
  | 'terminals'
  | 'insights'
  | 'roadmap'
  | 'ideation'
  | 'changelog'
  | 'context'
  | 'github-issues'
  | 'worktrees'
  | 'agent-profiles'
  | 'settings';

// Settings tab type
type SettingsTab = 'agent-profile' | 'credentials';

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
  { id: 'context', label: 'Context', icon: BookOpen, shortcut: 'C' },
];

const toolsNavItems: NavItem[] = [
  { id: 'github-issues', label: 'GitHub Issues', icon: Github, shortcut: 'G' },
  { id: 'worktrees', label: 'Worktrees', icon: GitBranch, shortcut: 'W' },
  { id: 'agent-profiles', label: 'Agent Profiles', icon: UserCog, shortcut: 'P' },
];

// Project type matching backend
interface Project {
  id: string;
  name: string;
  path: string;
  repo_url: string | null;
  status: 'active' | 'inactive' | 'building' | 'error';
  created_at: string;
  updated_at: string;
}

// Task type imported from shared/types

interface ProjectDetailPageProps {
  project: Project;
  onBack: () => void;
}

export function ProjectDetailPage({ project, onBack }: ProjectDetailPageProps) {
  const [activeView, setActiveView] = useState<SidebarView>('kanban');
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('agent-profile');
  const [isLoading, setIsLoading] = useState(false);
  const [showTaskWizard, setShowTaskWizard] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const selectProject = useProjectStore((state) => state.selectProject);
  const addProject = useProjectStore((state) => state.addProject);
  const projectExists = useProjectStore((state) => state.projects.some((p) => p.id === project.id));

  // Use Zustand task store for reactive updates from WebSocket
  const tasks = useTaskStore((state) => state.tasks);
  const setTasks = useTaskStore((state) => state.setTasks);

  // Set up WebSocket listeners for real-time task updates
  useIpcListeners();

  // Set the selected project in the global store for components that need it
  useEffect(() => {
    selectProject(project.id);
    // Also ensure the project is in the store's projects array for components that look it up
    if (!projectExists) {
      addProject(project as any); // Cast needed as local Project type may differ slightly
    }
    // Cleanup: don't deselect on unmount as user may want to stay on this project
  }, [project.id, project, selectProject, addProject, projectExists]);

  // Fetch tasks when component mounts or project changes
  useEffect(() => {
    const fetchTasks = async () => {
      setIsLoading(true);
      try {
        const response = await authFetch(`/projects/${project.id}/tasks`);
        if (response.ok) {
          const data = await response.json();
          setTasks(data);
        } else {
          console.error('Failed to fetch tasks:', response.status);
        }
      } catch (error) {
        console.error('Error fetching tasks:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();
  }, [project.id]);

  const renderMainContent = () => {
    switch (activeView) {
      case 'kanban':
        return (
          <KanbanBoard
            tasks={tasks}
            onTaskClick={(task) => setSelectedTask(task)}
            onNewTaskClick={() => setShowTaskWizard(true)}
          />
        );

      case 'terminals':
        return (
          <TerminalGrid
            projectPath={project.path}
            projectId={project.id}
            onNewTaskClick={() => setShowTaskWizard(true)}
          />
        );

      case 'insights':
        return <Insights projectId={project.id} />;

      case 'roadmap':
        return (
          <Roadmap
            projectId={project.id}
            onGoToTask={(taskId) => {
              const task = tasks.find(t => t.id === taskId);
              if (task) setSelectedTask(task);
            }}
          />
        );

      case 'ideation':
        return (
          <Ideation
            projectId={project.id}
            onGoToTask={(taskId) => {
              const task = tasks.find(t => t.id === taskId);
              if (task) setSelectedTask(task);
            }}
          />
        );

      case 'changelog':
        return <Changelog />;

      case 'context':
        return <Context projectId={project.id} />;

      case 'github-issues':
        return (
          <GitHubIssues
            onOpenSettings={() => setActiveView('settings')}
            onNavigateToTask={(taskId) => {
              const task = tasks.find(t => t.id === taskId);
              if (task) {
                setSelectedTask(task);
                setActiveView('kanban');
              }
            }}
          />
        );

      case 'worktrees':
        return <Worktrees projectId={project.id} />;

      case 'agent-profiles':
      case 'settings':
        return (
          <div className="p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Project Settings</h2>

            {/* Tab navigation */}
            <div className="flex border-b border-border mb-6">
              <button
                onClick={() => setSettingsTab('agent-profile')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  settingsTab === 'agent-profile'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <UserCog className="w-4 h-4" />
                Agent Profile
              </button>
              <button
                onClick={() => setSettingsTab('credentials')}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  settingsTab === 'credentials'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <Key className="w-4 h-4" />
                Credentials
              </button>
            </div>

            {/* Tab content */}
            {settingsTab === 'agent-profile' && (
              <AgentProfileSettings projectId={project.id} authFetch={authFetch} />
            )}
            {settingsTab === 'credentials' && (
              <CredentialSettings projectId={project.id} authFetch={authFetch} />
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 bg-sidebar border-r border-border flex flex-col">
        {/* Back button and project name */}
        <div className="p-4 border-b border-border">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-3 text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
              <LayoutGrid className="w-4 h-4 text-primary" />
            </div>
            <span className="font-medium text-foreground truncate">{project.name}</span>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 uppercase tracking-wider">
              Project
            </div>
            {projectNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
                  activeView === item.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="ml-auto text-xs text-muted-foreground/50">{item.shortcut}</span>
                )}
              </button>
            ))}

            <div className="text-xs font-medium text-muted-foreground px-2 py-1.5 mt-4 uppercase tracking-wider">
              Tools
            </div>
            {toolsNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
                  activeView === item.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
                {item.shortcut && (
                  <span className="ml-auto text-xs text-muted-foreground/50">{item.shortcut}</span>
                )}
              </button>
            ))}
          </div>
        </ScrollArea>

        {/* Settings and New Task */}
        <div className="p-2 border-t border-border">
          <button
            onClick={() => setActiveView('settings')}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
              activeView === 'settings'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            )}
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
          <Button
            className="w-full mt-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setShowTaskWizard(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Task
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-background">{renderMainContent()}</div>

      {/* Task Creation Wizard */}
      <TaskCreationWizard
        projectId={project.id}
        open={showTaskWizard}
        onOpenChange={setShowTaskWizard}
      />

      {/* Task Detail Panel */}
      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
