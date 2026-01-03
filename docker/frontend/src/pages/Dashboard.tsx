/**
 * Dashboard Page
 *
 * Main dashboard shown after authentication.
 * Displays user's projects with options to create new ones.
 * Uses the app's design system (Oscura Midnight theme).
 */

import { useState, useEffect } from 'react';
import {
  Plus,
  Folder,
  GitBranch,
  Clock,
  AlertCircle,
  Loader2,
  Settings,
  Play,
  ExternalLink,
  RefreshCw,
  Trash2,
  MoreVertical,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { useAuthStore } from '../stores/auth-store';
import { ProjectDetailPage } from './ProjectDetailPage';

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

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newProjectUrl, setNewProjectUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Selected project for detail view
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await authFetch('/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to load projects');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectUrl.trim()) {
      setCreateError('Please enter a repository URL');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const response = await authFetch('/projects', {
        method: 'POST',
        body: JSON.stringify({ repo_url: newProjectUrl }),
      });

      if (response.ok) {
        const project = await response.json();
        setProjects((prev) => [project, ...prev]);
        setIsCreateDialogOpen(false);
        setNewProjectUrl('');
      } else {
        const err = await response.json();
        setCreateError(err.detail || 'Failed to create project');
      }
    } catch (err) {
      setCreateError('Failed to connect to server');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);

    try {
      const response = await authFetch(`/projects/${projectToDelete.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectToDelete.id));
        setDeleteDialogOpen(false);
        setProjectToDelete(null);
      } else {
        const err = await response.json();
        setError(err.detail || 'Failed to delete project');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteDialog = (project: Project) => {
    setProjectToDelete(project);
    setDeleteDialogOpen(true);
  };

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'active':
        return 'bg-success';
      case 'building':
        return 'bg-info animate-pulse';
      case 'error':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground';
    }
  };

  const getStatusLabel = (status: Project['status']) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'building':
        return 'Building';
      case 'error':
        return 'Error';
      default:
        return 'Inactive';
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // If a project is selected, show the detail page
  if (selectedProject) {
    return (
      <ProjectDetailPage
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your Auto-Claude projects
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={loadProjects}
            disabled={isLoading}
            className="border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Create New Project</DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Clone a Git repository to start a new Auto-Claude project.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {createError && (
                  <div className="flex items-center gap-2 p-3 bg-error-light border border-destructive/50 rounded-lg text-destructive">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{createError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="repoUrl" className="text-foreground">
                    Repository URL
                  </Label>
                  <Input
                    id="repoUrl"
                    type="url"
                    value={newProjectUrl}
                    onChange={(e) => setNewProjectUrl(e.target.value)}
                    placeholder="https://github.com/user/repo.git"
                    disabled={isCreating}
                    className="bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a public or private Git repository URL
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={isCreating}
                  className="border-border text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateProject}
                  disabled={isCreating || !newProjectUrl.trim()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Project'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-error-light border border-destructive/50 rounded-xl text-destructive mb-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadProjects}
            className="ml-auto text-destructive hover:text-destructive/80"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && projects.length === 0 && (
        <div className="text-center py-16 card-surface">
          <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Folder className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No projects yet</h3>
          <p className="text-muted-foreground mb-6">
            Get started by creating your first project
          </p>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Your First Project
          </Button>
        </div>
      )}

      {/* Projects grid */}
      {!isLoading && !error && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <div
              key={project.id}
              className="card-surface card-interactive p-5 cursor-pointer"
              onClick={() => setSelectedProject(project)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
                    <Folder className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{project.name}</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`w-2 h-2 rounded-full ${getStatusColor(project.status)}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {getStatusLabel(project.status)}
                      </span>
                    </div>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover border-border">
                    <DropdownMenuItem
                      className="text-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                      onClick={() => setSelectedProject(project)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Project Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-border" />
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                      onClick={() => openDeleteDialog(project)}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {project.repo_url && (
                <div
                  className="flex items-center gap-2 text-sm text-muted-foreground mb-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GitBranch className="w-4 h-4 flex-shrink-0" />
                  <a
                    href={project.repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary truncate"
                  >
                    {project.repo_url.replace('https://github.com/', '')}
                  </a>
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
                <Clock className="w-3.5 h-3.5" />
                <span>Created {formatDate(project.created_at)}</span>
              </div>

              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 border-border text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedProject(project)}
                >
                  View Details
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  Run Build
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin notice */}
      {user?.role === 'admin' && (
        <div className="mt-8 p-4 bg-info-light border border-info/30 rounded-xl">
          <p className="text-info text-sm">
            <strong>Admin:</strong> You can manage users and invitations from the
            Admin Settings menu in the header.
          </p>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete Project</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Are you sure you want to delete <strong className="text-foreground">{projectToDelete?.name}</strong>?
              This action cannot be undone and will permanently remove the project and all its data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-border text-muted-foreground hover:text-foreground"
              disabled={isDeleting}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
