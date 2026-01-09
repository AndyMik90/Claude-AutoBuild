import { ProjectCreationWizard } from './ProjectCreationWizard';
import type { Project } from '../../shared/types';

/**
 * Thin wrapper component for backward compatibility.
 * Delegates to the unified ProjectCreationWizard.
 *
 * @deprecated Use ProjectCreationWizard directly for new implementations.
 * This wrapper is maintained for backward compatibility with existing call sites.
 */
interface AddProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded?: (project: Project, needsInit: boolean) => void;
}

export function AddProjectModal({ open, onOpenChange, onProjectAdded }: AddProjectModalProps) {
  // Thin wrapper - just pass through to ProjectCreationWizard
  return (
    <ProjectCreationWizard
      open={open}
      onOpenChange={onOpenChange}
      onProjectAdded={onProjectAdded}
    />
  );
}
