/**
 * Ideation session CRUD operations
 */

import path from 'path';
import type { IpcMainInvokeEvent } from 'electron';
import { AUTO_BUILD_PATHS } from '../../../shared/constants';
import type { IPCResult, IdeationSession } from '../../../shared/types';
import { projectStore } from '../../project-store';
import { transformIdeaFromSnakeCase } from './transformers';
import { readIdeationFile } from './file-utils';

/**
 * Get ideation session for a project
 */
export async function getIdeationSession(
  _event: IpcMainInvokeEvent,
  projectId: string
): Promise<IPCResult<IdeationSession | null>> {
  const project = projectStore.getProject(projectId);
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  const ideationPath = path.join(
    project.path,
    AUTO_BUILD_PATHS.IDEATION_DIR,
    AUTO_BUILD_PATHS.IDEATION_FILE
  );

  const rawIdeation = readIdeationFile(ideationPath);
  if (!rawIdeation) {
    return { success: true, data: null };
  }

  try {
    // Transform snake_case to camelCase for frontend
    const enabledTypes = (rawIdeation.config?.enabled_types || rawIdeation.config?.enabledTypes || []) as unknown[];

    const session: IdeationSession = {
      id: rawIdeation.id || `ideation-${Date.now()}`,
      projectId,
      config: {
        enabledTypes: enabledTypes as IdeationSession['config']['enabledTypes'],
        includeRoadmapContext: rawIdeation.config?.include_roadmap_context ?? rawIdeation.config?.includeRoadmapContext ?? true,
        includeKanbanContext: rawIdeation.config?.include_kanban_context ?? rawIdeation.config?.includeKanbanContext ?? true,
        maxIdeasPerType: rawIdeation.config?.max_ideas_per_type || rawIdeation.config?.maxIdeasPerType || 5
      },
      ideas: (rawIdeation.ideas || []).map(idea => transformIdeaFromSnakeCase(idea)),
      projectContext: {
        existingFeatures: rawIdeation.project_context?.existing_features || rawIdeation.projectContext?.existingFeatures || [],
        techStack: rawIdeation.project_context?.tech_stack || rawIdeation.projectContext?.techStack || [],
        targetAudience: rawIdeation.project_context?.target_audience || rawIdeation.projectContext?.targetAudience,
        plannedFeatures: rawIdeation.project_context?.planned_features || rawIdeation.projectContext?.plannedFeatures || []
      },
      generatedAt: rawIdeation.generated_at ? new Date(rawIdeation.generated_at) : new Date(),
      updatedAt: rawIdeation.updated_at ? new Date(rawIdeation.updated_at) : new Date()
    };

    return { success: true, data: session };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read ideation'
    };
  }
}
