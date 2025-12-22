/**
 * Workspace slug input and project selection dropdown
 */

import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../ui/select';
import type { PlaneProject } from '../types';

interface WorkspaceProjectSelectorProps {
  workspaceSlug: string;
  projects: PlaneProject[];
  selectedProjectId: string;
  isLoadingProjects: boolean;
  onWorkspaceChange: (slug: string) => void;
  onProjectChange: (projectId: string) => void;
}

export function WorkspaceProjectSelector({
  workspaceSlug,
  projects,
  selectedProjectId,
  isLoadingProjects,
  onWorkspaceChange,
  onProjectChange
}: WorkspaceProjectSelectorProps) {
  return (
    <div className="flex gap-4 shrink-0">
      <div className="flex-1 space-y-2">
        <Label className="text-sm font-medium text-foreground">Workspace Slug</Label>
        <Input
          placeholder="my-workspace"
          value={workspaceSlug}
          onChange={e => onWorkspaceChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          The workspace slug from your Plane URL
        </p>
      </div>

      <div className="flex-1 space-y-2">
        <Label className="text-sm font-medium text-foreground">Project</Label>
        <Select
          value={selectedProjectId}
          onValueChange={onProjectChange}
          disabled={isLoadingProjects || !workspaceSlug}
        >
          <SelectTrigger>
            <SelectValue placeholder={isLoadingProjects ? 'Loading...' : 'Select a project'} />
          </SelectTrigger>
          <SelectContent>
            {projects.map(project => (
              <SelectItem key={project.id} value={project.id}>
                {project.identifier} - {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
