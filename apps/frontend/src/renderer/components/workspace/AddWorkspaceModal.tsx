import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { Project } from '../../../shared/types';

type ProjectRole = 'backend' | 'frontend' | 'mobile' | 'shared' | 'api' | 'worker' | 'other';

interface WorkspaceProject {
  projectId: string;
  role: ProjectRole;
}

interface Workspace {
  id: string;
  name: string;
  description?: string;
  projects?: WorkspaceProject[];
}

type IPCResult<T> = { success: boolean; data?: T; error?: string };

type WorkspaceApi = {
  createWorkspace: (
    name: string,
    description?: string,
    options?: { validationEnabled?: boolean; validationTriggers?: string[] }
  ) => Promise<IPCResult<Workspace>>;
  addProjectToWorkspace: (
    workspaceId: string,
    projectId: string,
    role: ProjectRole
  ) => Promise<IPCResult<Workspace>>;
  getWorkspace: (workspaceId: string) => Promise<IPCResult<Workspace>>;
};

interface AddWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onCreated: (workspace: Workspace) => void;
}

interface SelectedProject {
  projectId: string;
  role: ProjectRole;
}

const ROLE_OPTIONS: { value: ProjectRole; key: string; descKey: string }[] = [
  { value: 'backend', key: 'backend', descKey: 'backendDescription' },
  { value: 'frontend', key: 'frontend', descKey: 'frontendDescription' },
  { value: 'mobile', key: 'mobile', descKey: 'mobileDescription' },
  { value: 'shared', key: 'shared', descKey: 'sharedDescription' },
  { value: 'api', key: 'api', descKey: 'apiDescription' },
  { value: 'worker', key: 'worker', descKey: 'workerDescription' },
  { value: 'other', key: 'other', descKey: 'otherDescription' },
];

export function AddWorkspaceModal({
  open,
  onOpenChange,
  projects,
  onCreated,
}: AddWorkspaceModalProps) {
  const { t } = useTranslation(['dialogs', 'common']);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<SelectedProject[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableProjects = projects.filter(
    (p) => !selectedProjects.some((sp) => sp.projectId === p.id)
  );

  // Get translated role options
  const roleOptions = ROLE_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(`addWorkspace.roles.${opt.key}`),
    description: t(`addWorkspace.roles.${opt.descKey}`)
  }));

  const handleAddProject = (projectId: string) => {
    setSelectedProjects((prev) => [
      ...prev,
      { projectId, role: 'other' as ProjectRole },
    ]);
  };

  const handleRemoveProject = (projectId: string) => {
    setSelectedProjects((prev) => prev.filter((p) => p.projectId !== projectId));
  };

  const handleRoleChange = (projectId: string, role: ProjectRole) => {
    setSelectedProjects((prev) =>
      prev.map((p) => (p.projectId === projectId ? { ...p, role } : p))
    );
  };

  const getProjectName = (projectId: string): string => {
    const project = projects.find((p) => p.id === projectId);
    return project?.name || projectId;
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setError(t('addWorkspace.errors.nameRequired'));
      return;
    }

    const workspaceApi = window.electronAPI as unknown as Partial<WorkspaceApi>;
    if (!workspaceApi.createWorkspace || !workspaceApi.addProjectToWorkspace || !workspaceApi.getWorkspace) {
      setError(t('addWorkspace.errors.apiNotAvailable'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Create the workspace
      const result = await workspaceApi.createWorkspace(
        name.trim(),
        description.trim() || undefined,
        {
          validationEnabled: true,
          validationTriggers: ['spec_creation', 'before_merge'],
        }
      );

      if (!result.success || !result.data) {
        throw new Error(result.error || t('addWorkspace.errors.createFailed'));
      }

      const workspace = result.data;

      // Add projects to the workspace
      for (const selected of selectedProjects) {
        await workspaceApi.addProjectToWorkspace(
          workspace.id,
          selected.projectId,
          selected.role
        );
      }

      // Reload the workspace with members
      const reloadResult = await workspaceApi.getWorkspace(workspace.id);
      const finalWorkspace = reloadResult.success && reloadResult.data ? reloadResult.data : workspace;

      onCreated(finalWorkspace);
      resetForm();
    } catch (err) {
      setError(String(err));
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setSelectedProjects([]);
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {t('addWorkspace.title')}
          </DialogTitle>
          <DialogDescription>
            {t('addWorkspace.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">{t('addWorkspace.name')}</Label>
            <Input
              id="name"
              placeholder={t('common:placeholders.workspaceName')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">{t('addWorkspace.description')}</Label>
            <Textarea
              id="description"
              placeholder={t('common:placeholders.workspaceDescription')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Add projects */}
          <div className="grid gap-2">
            <Label>{t('addWorkspace.projects')}</Label>
            {availableProjects.length > 0 ? (
              <Select onValueChange={handleAddProject}>
                <SelectTrigger>
                  <SelectValue placeholder={t('addWorkspace.addProject')} />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedProjects.length > 0
                  ? t('addWorkspace.allProjectsAdded')
                  : t('addWorkspace.noProjectsAvailable')}
              </p>
            )}
          </div>

          {/* Selected projects */}
          {selectedProjects.length > 0 && (
            <div className="grid gap-2">
              {selectedProjects.map((selected) => (
                <div
                  key={selected.projectId}
                  className="flex items-center gap-2 rounded-md border p-2"
                >
                  <span className="flex-1 text-sm font-medium">
                    {getProjectName(selected.projectId)}
                  </span>
                  <Select
                    value={selected.role}
                    onValueChange={(value) =>
                      handleRoleChange(selected.projectId, value as ProjectRole)
                    }
                  >
                    <SelectTrigger className="w-[130px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRemoveProject(selected.projectId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('addWorkspace.cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? t('addWorkspace.creating') : t('addWorkspace.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
